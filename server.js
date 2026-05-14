const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const ADMIN_PIN = process.env.HOUSE_POINTS_ADMIN_PIN || "1234";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "house-points.json");

const HOUSE_NAMES = ["Ambrosius", "Valerius", "Nicostratus", "Sapientia"];

let writeQueue = Promise.resolve();

function emptyPoints() {
    return HOUSE_NAMES.reduce((acc, house) => {
        acc[house] = 0;
        return acc;
    }, {});
}

function defaultStore() {
    return {
        housePoints: emptyPoints(),
        submissions: [],
    };
}

function sanitizeText(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
}

function toInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

async function ensureDataFile() {
    await fs.mkdir(DATA_DIR, { recursive: true });

    try {
        await fs.access(DATA_FILE);
    } catch {
        await fs.writeFile(DATA_FILE, JSON.stringify(defaultStore(), null, 2));
    }
}

function normalizeStore(raw) {
    const safe = defaultStore();

    if (raw && typeof raw === "object") {
        if (raw.housePoints && typeof raw.housePoints === "object") {
            for (const house of HOUSE_NAMES) {
                const value = toInteger(raw.housePoints[house]);
                safe.housePoints[house] = value === null ? 0 : value;
            }
        }

        if (Array.isArray(raw.submissions)) {
            safe.submissions = raw.submissions
                .map((item) => ({
                    id: sanitizeText(item.id, 64),
                    timestamp: sanitizeText(item.timestamp, 64),
                    house: HOUSE_NAMES.includes(item.house) ? item.house : null,
                    studentName: sanitizeText(item.studentName, 120),
                    points: toInteger(item.points),
                    teacher: sanitizeText(item.teacher, 120),
                    reason: sanitizeText(item.reason, 500),
                }))
                .filter(
                    (item) =>
                        item.id &&
                        item.timestamp &&
                        item.house &&
                        item.studentName &&
                        item.teacher &&
                        item.reason &&
                        item.points !== null
                );
        }
    }

    return safe;
}

function recalculateTotals(store) {
    const totals = emptyPoints();

    for (const submission of store.submissions) {
        totals[submission.house] += submission.points;
    }

    store.housePoints = totals;
    return store;
}

async function readStore() {
    await ensureDataFile();
    const content = await fs.readFile(DATA_FILE, "utf-8");
    const parsed = JSON.parse(content);
    const normalized = recalculateTotals(normalizeStore(parsed));
    return normalized;
}

async function writeStore(data) {
    writeQueue = writeQueue.then(async () => {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    });

    await writeQueue;
}

function standingsFromPoints(points) {
    return Object.entries(points)
        .map(([house, total]) => ({ house, total }))
        .sort((a, b) => b.total - a.total);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/standings", async (_req, res) => {
    try {
        const store = await readStore();
        res.json({
            housePoints: store.housePoints,
            standings: standingsFromPoints(store.housePoints),
            submissionCount: store.submissions.length,
            lastSubmission: store.submissions.at(-1) || null,
        });
    } catch (error) {
        res.status(500).json({ error: "Unable to load standings" });
    }
});

app.get("/api/submissions", async (req, res) => {
    try {
        const store = await readStore();
        const house = sanitizeText(req.query.house, 40);
        const teacher = sanitizeText(req.query.teacher, 120).toLowerCase();
        const q = sanitizeText(req.query.q, 200).toLowerCase();
        const limit = Math.min(Math.max(toInteger(req.query.limit) || 200, 1), 1000);

        let items = [...store.submissions].sort((a, b) =>
            a.timestamp < b.timestamp ? 1 : -1
        );

        if (house && HOUSE_NAMES.includes(house)) {
            items = items.filter((item) => item.house === house);
        }

        if (teacher) {
            items = items.filter((item) => item.teacher.toLowerCase().includes(teacher));
        }

        if (q) {
            items = items.filter((item) => {
                const haystack = `${item.studentName} ${item.teacher} ${item.reason} ${item.house}`.toLowerCase();
                return haystack.includes(q);
            });
        }

        res.json({
            total: items.length,
            submissions: items.slice(0, limit),
        });
    } catch {
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

        const store = await readStore();

        const submission = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            house,
            studentName,
            points,
            teacher,
            reason,
        };

        store.submissions.push(submission);
        store.housePoints[house] += points;

        await writeStore(store);

        return res.status(201).json({
            message: "Submission saved",
            submission,
            housePoints: store.housePoints,
        });
    } catch {
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

        const store = await readStore();
        const index = store.submissions.findIndex((submission) => submission.id === id);

        if (index === -1) {
            return res.status(404).json({ error: "Submission not found" });
        }

        const [removedSubmission] = store.submissions.splice(index, 1);
        const updated = recalculateTotals(store);

        await writeStore(updated);

        return res.json({
            message: "Submission removed",
            removedSubmission,
            housePoints: updated.housePoints,
        });
    } catch {
        return res.status(500).json({ error: "Unable to delete submission" });
    }
});

app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

function startServer(port, retriesLeft = 10) {
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

ensureDataFile()
    .then(() => {
        if (ADMIN_PIN === "1234") {
            console.warn("Using default admin PIN. Set HOUSE_POINTS_ADMIN_PIN for production use.");
        }

        startServer(PORT);
    })
    .catch((error) => {
        console.error("Failed to initialize app:", error);
        process.exit(1);
    });
