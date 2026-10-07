const express = require("express");
const { Pool } = require("pg");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const ADMIN_PIN = process.env.HOUSE_POINTS_ADMIN_PIN || "1234";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const HOUSE_NAMES = ["Ambrosius", "Valerius", "Nicostratus", "Sapientia"];

// Secret used to hash teacher PINs. Falls back to the admin PIN so existing
// deployments keep working, but PIN_SECRET should be set to a long random value.
const PIN_SECRET = process.env.PIN_SECRET || `house-points:${ADMIN_PIN}`;

function hashPin(pin) {
    return crypto.createHmac("sha256", PIN_SECRET).update(String(pin)).digest("hex");
}

function isValidPinFormat(pin) {
    return /^\d{4,8}$/.test(pin);
}

function generatePin() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Simple in-memory brute-force protection: after too many wrong PINs from one
// device/IP, lock it out for a while so students can't guess teacher PINs.
const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;
const failedAttempts = new Map();

function clientKey(req) {
    return req.ip || req.socket.remoteAddress || "unknown";
}

function isLockedOut(req) {
    const entry = failedAttempts.get(clientKey(req));
    if (!entry) return false;
    if (Date.now() - entry.first > LOCKOUT_MS) {
        failedAttempts.delete(clientKey(req));
        return false;
    }
    return entry.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailure(req) {
    const key = clientKey(req);
    const entry = failedAttempts.get(key);
    if (!entry || Date.now() - entry.first > LOCKOUT_MS) {
        failedAttempts.set(key, { count: 1, first: Date.now() });
    } else {
        entry.count += 1;
    }
}

function clearFailures(req) {
    failedAttempts.delete(clientKey(req));
}

const LOCKOUT_MESSAGE = "Too many incorrect PIN attempts. Please wait 15 minutes and try again.";

async function findTeacherByPin(pin) {
    if (!isValidPinFormat(pin)) return null;
    const result = await pool.query(
        `SELECT id, name FROM teachers WHERE pin_hash = $1 AND active = TRUE LIMIT 1;`,
        [hashPin(pin)]
    );
    return result.rows[0] || null;
}

function checkAdminPin(req, res) {
    if (isLockedOut(req)) {
        res.status(429).json({ error: LOCKOUT_MESSAGE });
        return false;
    }
    const pin = sanitizeText(req.get("x-admin-pin") || (req.body && req.body.pin), 40);
    if (!pin) {
        res.status(400).json({ error: "Admin PIN is required" });
        return false;
    }
    if (!safeEqual(pin, ADMIN_PIN)) {
        recordFailure(req);
        res.status(403).json({ error: "Invalid admin PIN" });
        return false;
    }
    clearFailures(req);
    return true;
}

function sanitizeText(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
}

function toInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

async function initializeDatabase() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS submissions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                house TEXT NOT NULL CHECK (house IN ('Ambrosius', 'Valerius', 'Nicostratus', 'Sapientia')),
                student_name TEXT NOT NULL,
                points INTEGER NOT NULL CHECK (points >= -200 AND points <= 200),
                teacher TEXT NOT NULL,
                reason TEXT NOT NULL
            );
        `);

        await client.query(`CREATE INDEX IF NOT EXISTS idx_submissions_house ON submissions(house);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_submissions_timestamp ON submissions(timestamp);`);

        await client.query(`
            CREATE TABLE IF NOT EXISTS teachers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                pin_hash TEXT NOT NULL UNIQUE,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } finally {
        client.release();
    }
}

async function getHousePointTotals() {
    const result = await pool.query(`
        SELECT house, COALESCE(SUM(points), 0) as total
        FROM submissions
        GROUP BY house
        ORDER BY total DESC;
    `);

    const totals = HOUSE_NAMES.reduce((acc, house) => {
        acc[house] = 0;
        return acc;
    }, {});

    for (const row of result.rows) {
        totals[row.house] = row.total;
    }

    return totals;
}

function standingsFromPoints(points) {
    return Object.entries(points)
        .map(([house, total]) => ({ house, total }))
        .sort((a, b) => b.total - a.total);
}

initializeDatabase().catch(err => {
    console.error("Database initialization failed (server will still start):", err.message);
});

// Render (and most hosts) sit behind a proxy; trust it so req.ip is the real client.
app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Pin");

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    return next();
});

app.use(express.static(__dirname));

app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/standings", async (_req, res) => {
    try {
        const housePoints = await getHousePointTotals();
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM submissions;`);
        const lastResult = await pool.query(`
            SELECT id, timestamp, house, student_name, points, teacher, reason
            FROM submissions
            ORDER BY timestamp DESC
            LIMIT 1;
        `);

        const lastSubmission = lastResult.rows[0] ? {
            id: lastResult.rows[0].id,
            timestamp: lastResult.rows[0].timestamp,
            house: lastResult.rows[0].house,
            studentName: lastResult.rows[0].student_name,
            points: lastResult.rows[0].points,
            teacher: lastResult.rows[0].teacher,
            reason: lastResult.rows[0].reason,
        } : null;

        res.json({
            housePoints,
            standings: standingsFromPoints(housePoints),
            submissionCount: Number(countResult.rows[0].count),
            lastSubmission,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Unable to load standings" });
    }
});

app.get("/api/submissions", async (req, res) => {
    try {
        const house = sanitizeText(req.query.house, 40);
        const teacher = sanitizeText(req.query.teacher, 120);
        const q = sanitizeText(req.query.q, 200);
        const limit = Math.min(Math.max(toInteger(req.query.limit) || 200, 1), 1000);

        let query = `SELECT id, timestamp, house, student_name, points, teacher, reason FROM submissions WHERE 1=1`;
        const params = [];

        if (house && HOUSE_NAMES.includes(house)) {
            query += ` AND house = $${params.length + 1}`;
            params.push(house);
        }

        if (teacher) {
            query += ` AND LOWER(teacher) LIKE LOWER($${params.length + 1})`;
            params.push(`%${teacher}%`);
        }

        if (q) {
            query += ` AND (LOWER(student_name) LIKE LOWER($${params.length + 1}) OR LOWER(teacher) LIKE LOWER($${params.length + 1}) OR LOWER(reason) LIKE LOWER($${params.length + 1}) OR house = $${params.length + 1})`;
            params.push(`%${q}%`);
            params.push(`%${q}%`);
            params.push(`%${q}%`);
            params.push(q);
        }

        query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await pool.query(query, params);

        const submissions = result.rows.map(row => ({
            id: row.id,
            timestamp: row.timestamp,
            house: row.house,
            studentName: row.student_name,
            points: row.points,
            teacher: row.teacher,
            reason: row.reason,
        }));

        res.json({
            total: submissions.length,
            submissions,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Unable to load submissions" });
    }
});

app.post("/api/submissions", async (req, res) => {
    try {
        if (isLockedOut(req)) {
            return res.status(429).json({ error: LOCKOUT_MESSAGE });
        }

        const pin = sanitizeText(req.body.pin, 20);
        if (!pin) {
            return res.status(401).json({ error: "Teacher PIN is required" });
        }

        const teacherRecord = await findTeacherByPin(pin);
        if (!teacherRecord) {
            recordFailure(req);
            return res.status(403).json({ error: "Invalid teacher PIN" });
        }
        clearFailures(req);

        // The teacher name always comes from the PIN, never from the form.
        const teacher = teacherRecord.name;
        const house = sanitizeText(req.body.house, 40);
        const studentName = sanitizeText(req.body.studentName, 120);
        const reason = sanitizeText(req.body.reason, 500);
        const points = toInteger(req.body.points);

        if (!HOUSE_NAMES.includes(house)) {
            return res.status(400).json({ error: "Invalid house" });
        }

        if (!studentName || !reason) {
            return res.status(400).json({ error: "Student name and reason are required" });
        }

        if (points === null || points < -200 || points > 200) {
            return res.status(400).json({ error: "Points must be an integer between -200 and 200" });
        }

        const result = await pool.query(`
            INSERT INTO submissions (house, student_name, points, teacher, reason)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, timestamp, house, student_name, points, teacher, reason;
        `, [house, studentName, points, teacher, reason]);

        const row = result.rows[0];
        const submission = {
            id: row.id,
            timestamp: row.timestamp,
            house: row.house,
            studentName: row.student_name,
            points: row.points,
            teacher: row.teacher,
            reason: row.reason,
        };

        const housePoints = await getHousePointTotals();

        return res.status(201).json({
            message: "Submission saved",
            submission,
            housePoints,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Unable to save submission" });
    }
});

// Teachers check their PIN before submitting; returns their name only.
app.post("/api/teachers/verify-pin", async (req, res) => {
    try {
        if (isLockedOut(req)) {
            return res.status(429).json({ error: LOCKOUT_MESSAGE });
        }
        const pin = sanitizeText(req.body.pin, 20);
        const teacherRecord = await findTeacherByPin(pin);
        if (!teacherRecord) {
            recordFailure(req);
            return res.status(403).json({ error: "Invalid teacher PIN" });
        }
        clearFailures(req);
        return res.json({ ok: true, name: teacherRecord.name });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Unable to verify PIN" });
    }
});

app.post("/api/admin/verify-pin", (req, res) => {
    if (!checkAdminPin(req, res)) return;
    return res.json({ ok: true });
});

// ---- Teacher management (admin PIN required, sent as X-Admin-Pin header) ----

app.get("/api/admin/teachers", async (req, res) => {
    if (!checkAdminPin(req, res)) return;
    try {
        const result = await pool.query(`
            SELECT t.id, t.name, t.active, t.created_at,
                   COUNT(s.id)::int AS submission_count
            FROM teachers t
            LEFT JOIN submissions s ON s.teacher = t.name
            GROUP BY t.id
            ORDER BY t.active DESC, LOWER(t.name);
        `);
        return res.json({
            teachers: result.rows.map(row => ({
                id: row.id,
                name: row.name,
                active: row.active,
                createdAt: row.created_at,
                submissionCount: row.submission_count,
            })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Unable to load teachers" });
    }
});

app.post("/api/admin/teachers", async (req, res) => {
    if (!checkAdminPin(req, res)) return;
    try {
        const name = sanitizeText(req.body.name, 120);
        let pin = sanitizeText(req.body.teacherPin, 20);

        if (!name) {
            return res.status(400).json({ error: "Teacher name is required" });
        }
        if (pin && !isValidPinFormat(pin)) {
            return res.status(400).json({ error: "PIN must be 4 to 8 digits" });
        }
        if (pin && safeEqual(pin, ADMIN_PIN)) {
            return res.status(400).json({ error: "Teacher PIN cannot match the admin PIN" });
        }

        // Generate a unique 6-digit PIN if one wasn't provided.
        for (let attempt = 0; !pin && attempt < 20; attempt += 1) {
            const candidate = generatePin();
            const existing = await pool.query(`SELECT 1 FROM teachers WHERE pin_hash = $1;`, [hashPin(candidate)]);
            if (existing.rows.length === 0 && candidate !== ADMIN_PIN) pin = candidate;
        }

        const result = await pool.query(
            `INSERT INTO teachers (name, pin_hash) VALUES ($1, $2) RETURNING id, name, active, created_at;`,
            [name, hashPin(pin)]
        );
        const row = result.rows[0];
        // The plain PIN is returned only once, right now. It is never stored.
        return res.status(201).json({
            teacher: { id: row.id, name: row.name, active: row.active, createdAt: row.created_at },
            pin,
        });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({ error: "That PIN is already in use. Choose a different one." });
        }
        console.error(error);
        return res.status(500).json({ error: "Unable to add teacher" });
    }
});

// Reset a teacher's PIN, rename them, or activate/deactivate them.
app.patch("/api/admin/teachers/:id", async (req, res) => {
    if (!checkAdminPin(req, res)) return;
    try {
        const id = sanitizeText(req.params.id, 64);
        const existing = await pool.query(`SELECT id, name FROM teachers WHERE id = $1;`, [id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: "Teacher not found" });
        }

        let newPin = null;
        if (req.body.resetPin) {
            newPin = sanitizeText(req.body.teacherPin, 20);
            if (newPin && !isValidPinFormat(newPin)) {
                return res.status(400).json({ error: "PIN must be 4 to 8 digits" });
            }
            for (let attempt = 0; !newPin && attempt < 20; attempt += 1) {
                const candidate = generatePin();
                const clash = await pool.query(`SELECT 1 FROM teachers WHERE pin_hash = $1;`, [hashPin(candidate)]);
                if (clash.rows.length === 0 && candidate !== ADMIN_PIN) newPin = candidate;
            }
            await pool.query(`UPDATE teachers SET pin_hash = $1 WHERE id = $2;`, [hashPin(newPin), id]);
        }

        if (typeof req.body.active === "boolean") {
            await pool.query(`UPDATE teachers SET active = $1 WHERE id = $2;`, [req.body.active, id]);
        }

        const name = sanitizeText(req.body.name, 120);
        if (name) {
            await pool.query(`UPDATE teachers SET name = $1 WHERE id = $2;`, [name, id]);
        }

        const updated = await pool.query(`SELECT id, name, active, created_at FROM teachers WHERE id = $1;`, [id]);
        const row = updated.rows[0];
        return res.json({
            teacher: { id: row.id, name: row.name, active: row.active, createdAt: row.created_at },
            pin: newPin,
        });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({ error: "That PIN is already in use. Choose a different one." });
        }
        console.error(error);
        return res.status(500).json({ error: "Unable to update teacher" });
    }
});

app.delete("/api/admin/teachers/:id", async (req, res) => {
    if (!checkAdminPin(req, res)) return;
    try {
        const id = sanitizeText(req.params.id, 64);
        const result = await pool.query(`DELETE FROM teachers WHERE id = $1 RETURNING id;`, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Teacher not found" });
        }
        // Past submissions keep the teacher's name; only their PIN stops working.
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Unable to remove teacher" });
    }
});

app.delete("/api/submissions/:id", async (req, res) => {
    try {
        const id = sanitizeText(req.params.id, 64);

        if (!id) {
            return res.status(400).json({ error: "Submission id is required" });
        }

        if (!checkAdminPin(req, res)) return;

        const getResult = await pool.query(`SELECT * FROM submissions WHERE id = $1;`, [id]);

        if (getResult.rows.length === 0) {
            return res.status(404).json({ error: "Submission not found" });
        }

        const submission = getResult.rows[0];
        await pool.query(`DELETE FROM submissions WHERE id = $1;`, [id]);
        const housePoints = await getHousePointTotals();

        return res.json({
            message: "Submission removed",
            removedSubmission: {
                id: submission.id,
                timestamp: submission.timestamp,
                house: submission.house,
                studentName: submission.student_name,
                points: submission.points,
                teacher: submission.teacher,
                reason: submission.reason,
            },
            housePoints,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Unable to delete submission" });
    }
});

app.get("*", (_req, res) => {
    res.sendFile(__dirname + "/index.html");
});

async function startServer(port, retriesLeft = 10) {
    const server = app.listen(port);

    server.on("listening", () => {
        console.log(`House Points Tracker running on http://localhost:${port}`);
    });

    server.on("error", (error) => {
        if (error.code === "EADDRINUSE" && retriesLeft > 0) {
            const nextPort = port + 1;
            console.warn(`Port ${port} is in use, retrying on ${nextPort}...`);
            startServer(nextPort, retriesLeft - 1);
            return;
        }

        console.error("Failed to start server:", error);
        process.exit(1);
    });
}

if (ADMIN_PIN === "1234") {
    console.warn("Using default admin PIN. Set HOUSE_POINTS_ADMIN_PIN for production use.");
}

startServer(PORT);
