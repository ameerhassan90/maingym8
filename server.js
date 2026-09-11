const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

// Enforce security guardrails for production environments
if (isProduction && !process.env.SESSION_SECRET) {
    throw new Error("FATAL: SESSION_SECRET environment variable is required in production.");
}

// =========================================================
// PATHS
// =========================================================

const DATA_FILE = path.join(__dirname, "data.json");
const PUBLIC_DIR = path.join(__dirname, "public");

// =========================================================
// MIDDLEWARE
// =========================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret: process.env.SESSION_SECRET || "hassan-fitness-local-secret-2026",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: isProduction,
            sameSite: "strict",
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);

// =========================================================
// ASYNCHRONOUS DATA FUNCTIONS
// =========================================================

async function readData() {
    try {
        const raw = await fs.readFile(DATA_FILE, "utf8");
        return JSON.parse(raw);
    } catch (error) {
        if (error.code === "ENOENT") {
            throw new Error("data.json not found");
        }
        throw error;
    }
}

async function writeData(data) {
    await fs.writeFile(
        DATA_FILE,
        JSON.stringify(data, null, 2),
        "utf8"
    );
}

// =========================================================
// STATIC ROUTES & VIEWS
// =========================================================

app.get("/", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

app.get("/admin.html", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

app.use(express.static(PUBLIC_DIR));

// =========================================================
// AUTHENTICATION ROUTES
// =========================================================

app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required."
            });
        }

        const data = await readData();

        if (!data.admin) {
            return res.status(500).json({
                success: false,
                message: "Admin account not found in data.json"
            });
        }

        const usernameOk = username === data.admin.username;
        const passwordOk = password === data.admin.password;

        if (usernameOk && passwordOk) {
            req.session.isAdmin = true;
            return res.json({
                success: true,
                message: "Login successful."
            });
        }

        return res.status(401).json({
            success: false,
            message: "Invalid username or password."
        });

    } catch (error) {
        console.error("LOGIN ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
});

app.get("/api/auth", (req, res) => {
    res.json({
        authenticated: req.session.isAdmin === true
    });
});

app.post("/api/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("LOGOUT ERROR:", error);
            return res.status(500).json({
                success: false,
                message: "Logout failed."
            });
        }

        res.clearCookie("connect.sid");
        res.json({
            success: true,
            message: "Logged out successfully."
        });
    });
});

// =========================================================
// ADMIN AUTH MIDDLEWARE
// =========================================================

function requireAdmin(req, res, next) {
    if (req.session.isAdmin === true) {
        return next();
    }

    return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login first."
    });
}

// =========================================================
// GET PUBLIC WEBSITE DATA
// =========================================================

app.get("/api/data", async (req, res) => {
    try {
        const data = await readData();
        const safeData = { ...data };
        delete safeData.admin; // Never expose admin credentials to frontend

        res.json(safeData);
    } catch (error) {
        console.error("GET DATA ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Could not load website data."
        });
    }
});

// =========================================================
// SITE INFO MANAGEMENT
// =========================================================

app.put("/api/site", requireAdmin, async (req, res) => {
    try {
        const data = await readData();
        data.site = {
            ...data.site,
            ...req.body
        };

        await writeData(data);
        res.json({ success: true, message: "Site info updated successfully.", site: data.site });
    } catch (error) {
        console.error("UPDATE SITE ERROR:", error);
        res.status(500).json({ success: false, message: "Could not update site info." });
    }
});

// =========================================================
// TRAINERS CRUD
// =========================================================

app.post("/api/trainers", requireAdmin, async (req, res) => {
    try {
        const { name, role, image, bio } = req.body;
        if (!name || !role) {
            return res.status(400).json({ success: false, message: "Name and role are required." });
        }

        const data = await readData();
        if (!Array.isArray(data.trainers)) data.trainers = [];

        const trainer = {
            id: crypto.randomUUID(),
            name: String(name).trim(),
            role: String(role).trim(),
            image: image ? String(image).trim() : "",
            bio: bio ? String(bio).trim() : ""
        };

        data.trainers.push(trainer);
        await writeData(data);
        res.json({ success: true, message: "Trainer added successfully.", trainer });
    } catch (error) {
        console.error("ADD TRAINER ERROR:", error);
        res.status(500).json({ success: false, message: "Could not add trainer." });
    }
});

app.put("/api/trainers/:id", requireAdmin, async (req, res) => {
    try {
        const data = await readData();
        const index = (data.trainers || []).findIndex(t => String(t.id) === String(req.params.id));

        if (index === -1) return res.status(404).json({ success: false, message: "Trainer not found." });

        data.trainers[index] = {
            ...data.trainers[index],
            name: req.body.name ?? data.trainers[index].name,
            role: req.body.role ?? data.trainers[index].role,
            image: req.body.image ?? data.trainers[index].image,
            bio: req.body.bio ?? data.trainers[index].bio
        };

        await writeData(data);
        res.json({ success: true, message: "Trainer updated successfully.", trainer: data.trainers[index] });
    } catch (error) {
        console.error("UPDATE TRAINER ERROR:", error);
        res.status(500).json({ success: false, message: "Could not update trainer." });
    }
});

app.delete("/api/trainers/:id", requireAdmin, async (req, res) => {
    try {
        const data = await readData();
        const initialLength = (data.trainers || []).length;
        data.trainers = data.trainers.filter(t => String(t.id) !== String(req.params.id));

        if (data.trainers.length === initialLength) {
            return res.status(404).json({ success: false, message: "Trainer not found." });
        }

        await writeData(data);
        res.json({ success: true, message: "Trainer deleted successfully." });
    } catch (error) {
        console.error("DELETE TRAINER ERROR:", error);
        res.status(500).json({ success: false, message: "Could not delete trainer." });
    }
});

// =========================================================
// PROGRAMS CRUD
// =========================================================

app.post("/api/programs", requireAdmin, async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ success: false, message: "Program name is required." });

        const data = await readData();
        if (!Array.isArray(data.programs)) data.programs = [];

        const program = {
            id: crypto.randomUUID(),
            name: String(name).trim(),
            description: description ? String(description).trim() : ""
        };

        data.programs.push(program);
        await writeData(data);
        res.json({ success: true, message: "Program added successfully.", program });
    } catch (error) {
        console.error("ADD PROGRAM ERROR:", error);
        res.status(500).json({ success: false, message: "Could not add program." });
    }
});

app.put("/api/programs/:id", requireAdmin, async (req, res) => {
    try {
        const data = await readData();
        const index = (data.programs || []).findIndex(p => String(p.id) === String(req.params.id));

        if (index === -1) return res.status(404).json({ success: false, message: "Program not found." });

        data.programs[index] = {
            ...data.programs[index],
            name: req.body.name ?? data.programs[index].name,
            description: req.body.description ?? data.programs[index].description
        };

        await writeData(data);
        res.json({ success: true, message: "Program updated successfully.", program: data.programs[index] });
    } catch (error) {
        console.error("UPDATE PROGRAM ERROR:", error);
        res.status(500).json({ success: false, message: "Could not update program." });
    }
});

app.delete("/api/programs/:id", requireAdmin, async (req, res) => {
    try {
        const data = await readData();
        const initialLength = (data.programs || []).length;
        data.programs = data.programs.filter(p => String(p.id) !== String(req.params.id));

        if (data.programs.length === initialLength) {
            return res.status(404).json({ success: false, message: "Program not found." });
        }

        await writeData(data);
        res.json({ success: true, message: "Program deleted successfully." });
    } catch (error) {
        console.error("DELETE PROGRAM ERROR:", error);
        res.status(500).json({ success: false, message: "Could not delete program." });
    }
});

// =========================================================
// SCHEDULE CRUD
// =========================================================

app.post("/api/schedule", requireAdmin, async (req, res) => {
    try {
        const { day, time, className, coach } = req.body;
        if (!day || !time || !className) {
            return res.status(400).json({ success: false, message: "Day, time, and class name are required." });
        }

        const data = await readData();
        if (!Array.isArray(data.schedule)) data.schedule = [];

        const scheduleItem = {
            id: crypto.randomUUID(),
            day: String(day).trim(),
            time: String(time).trim(),
            className: String(className).trim(),
            coach: coach ? String(coach).trim() : ""
        };

        data.schedule.push(scheduleItem);
        await writeData(data);
        res.json({ success: true, message: "Schedule added successfully.", scheduleItem });
    } catch (error) {
        console.error("ADD SCHEDULE ERROR:", error);
        res.status(500).json({ success: false, message: "Could not add schedule." });
    }
});

app.put("/api/schedule/:id", requireAdmin, async (req, res) => {
    try {
        const data = await readData();
        const index = (data.schedule || []).findIndex(s => String(s.id) === String(req.params.id));

        if (index === -1) return res.status(404).json({ success: false, message: "Schedule item not found." });

        data.schedule[index] = {
            ...data.schedule[index],
            day: req.body.day ?? data.schedule[index].day,
            time: req.body.time ?? data.schedule[index].time,
            className: req.body.className ?? data.schedule[index].className,
            coach: req.body.coach ?? data.schedule[index].coach
        };

        await writeData(data);
        res.json({ success: true, message: "Schedule updated successfully.", scheduleItem: data.schedule[index] });
    } catch (error) {
        console.error("UPDATE SCHEDULE ERROR:", error);
        res.status(500).json({ success: false, message: "Could not update schedule." });
    }
});

app.delete("/api/schedule/:id", requireAdmin, async (req, res) => {
    try {
        const data = await readData();
        const initialLength = (data.schedule || []).length;
        data.schedule = data.schedule.filter(s => String(s.id) !== String(req.params.id));

        if (data.schedule.length === initialLength) {
            return res.status(404).json({ success: false, message: "Schedule item not found." });
        }

        await writeData(data);
        res.json({ success: true, message: "Schedule item deleted successfully." });
    } catch (error) {
        console.error("DELETE SCHEDULE ERROR:", error);
        res.status(500).json({ success: false, message: "Could not delete schedule item." });
    }
});

// =========================================================
// PRICING CRUD
// =========================================================

app.post("/api/pricing", requireAdmin, async (req, res) => {
    try {
        const { title, price, features } = req.body;
        if (!title || !price) {
            return res.status(400).json({ success: false, message: "Title and price are required." });
        }

        const data = await readData();
        if (!Array.isArray(data.pricing)) data.pricing = [];

        const plan = {
            id: crypto.randomUUID(),
            title: String(title).trim(),
            price: String(price).trim(),
            features: Array.isArray(features) ? features : []
        };

        data.pricing.push(plan);
        await writeData(data);
        res.json({ success: true, message: "Pricing plan added successfully.", plan });
    } catch (error) {
        console.error("ADD PRICING ERROR:", error);
        res.status(500).json({ success: false, message: "Could not add pricing plan." });
    }
});

app.put("/api/pricing/:id", requireAdmin, async (req, res) => {
    try {
        const data = await readData();
        const index = (data.pricing || []).findIndex(p => String(p.id) === String(req.params.id));

        if (index === -1) return res.status(404).json({ success: false, message: "Pricing plan not found." });

        data.pricing[index] = {
            ...data.pricing[index],
            title: req.body.title ?? data.pricing[index].title,
            price: req.body.price ?? data.pricing[index].price,
            features: req.body.features ?? data.pricing[index].features
        };

        await writeData(data);
        res.json({ success: true, message: "Pricing plan updated successfully.", plan: data.pricing[index] });
    } catch (error) {
        console.error("UPDATE PRICING ERROR:", error);
        res.status(500).json({ success: false, message: "Could not update pricing plan." });
    }
});

app.delete("/api/pricing/:id", requireAdmin, async (req, res) => {
    try {
        const data = await readData();
        const initialLength = (data.pricing || []).length;
        data.pricing = data.pricing.filter(p => String(p.id) !== String(req.params.id));

        if (data.pricing.length === initialLength) {
            return res.status(404).json({ success: false, message: "Pricing plan not found." });
        }

        await writeData(data);
        res.json({ success: true, message: "Pricing plan deleted successfully." });
    } catch (error) {
        console.error("DELETE PRICING ERROR:", error);
        res.status(500).json({ success: false, message: "Could not delete pricing plan." });
    }
});

// =========================================================
// TESTIMONIALS CRUD
// =========================================================

app.post("/api/testimonials", requireAdmin, async (req, res) => {
    try {
        const { author, text } = req.body;
        if (!author || !text) {
            return res.status(400).json({ success: false, message: "Author and text are required." });
        }

        const data = await readData();
        if (!Array.isArray(data.testimonials)) data.testimonials = [];

        const testimonial = {
            id: crypto.randomUUID(),
            author: String(author).trim(),
            text: String(text).trim()
        };

        data.testimonials.push(testimonial);
        await writeData(data);
        res.json({ success: true, message: "Testimonial added successfully.", testimonial });
    } catch (error) {
        console.error("ADD TESTIMONIAL ERROR:", error);
        res.status(500).json({ success: false, message: "Could not add testimonial." });
    }
});

app.delete("/api/testimonials/:id", requireAdmin, async (req, res) => {
    try {
        const data = await readData();
        const initialLength = (data.testimonials || []).length;
        data.testimonials = data.testimonials.filter(t => String(t.id) !== String(req.params.id));

        if (data.testimonials.length === initialLength) {
            return res.status(404).json({ success: false, message: "Testimonial not found." });
        }

        await writeData(data);
        res.json({ success: true, message: "Testimonial deleted successfully." });
    } catch (error) {
        console.error("DELETE TESTIMONIAL ERROR:", error);
        res.status(500).json({ success: false, message: "Could not delete testimonial." });
    }
});

// =========================================================
// 404 HANDLER
// =========================================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found."
    });
});

// =========================================================
// GLOBAL ERROR HANDLER
// =========================================================

app.use((err, req, res, next) => {
    console.error("SERVER ERROR:", err);
    res.status(500).json({
        success: false,
        message: "Internal server error."
    });
});

// =========================================================
// START SERVER
// =========================================================

app.listen(PORT, () => {
    console.log("");
    console.log("==========================================");
    console.log("    HASSAN FITNESS CLUB ENTERPRISE SERVER");
    console.log("==========================================");
    console.log(`Server:  http://localhost:${PORT}`);
    console.log(`Website: http://localhost:${PORT}/`);
    console.log(`Admin:   http://localhost:${PORT}/admin`);
    console.log("==========================================");
    console.log("");
});