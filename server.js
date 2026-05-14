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

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
    const requestedOrigin = req.headers.origin;

    if (CORS_ORIGIN === "*") {
        res.setHeader("Access-Control-Allow-Origin", "*");
    } else if (requestedOrigin) {
        res.setHeader("Access-Control-Allow-Origin", requestedOrigin);
    } else if (CORS_ORIGIN && CORS_ORIGIN !== "*") {
        res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
    }

    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Vary", "Origin");

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
        const house = sanitizeText(req.body.house, 40);
        const studentName = sanitizeText(req.body.studentName, 120);
        const teacher = sanitizeText(req.body.teacher, 120);
        const reason = sanitizeText(req.body.reason, 500);
        const points = toInteger(req.body.points);

        if (!HOUSE_NAMES.includes(house)) {
            return res.status(400).json({ error: "Invalid house" });
        }

        if (!studentName || !teacher || !reason) {
            return res.status(400).json({ error: "Student name, teacher, and reason are required" });
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

app.post("/api/admin/verify-pin", (req, res) => {
    const pin = sanitizeText(req.body.pin, 40);

    if (!pin) {
        return res.status(400).json({ error: "PIN code is required" });
    }

    if (pin !== ADMIN_PIN) {
        return res.status(403).json({ error: "Invalid PIN code" });
    }

    return res.json({ ok: true });
});

app.delete("/api/submissions/:id", async (req, res) => {
    try {
        const id = sanitizeText(req.params.id, 64);
        const pin = sanitizeText(req.body.pin, 40);

        if (!id) {
            return res.status(400).json({ error: "Submission id is required" });
        }

        if (!pin) {
            return res.status(400).json({ error: "PIN code is required" });
        }

        if (pin !== ADMIN_PIN) {
            return res.status(403).json({ error: "Invalid PIN code" });
        }

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
