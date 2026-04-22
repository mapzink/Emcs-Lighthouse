// server.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import os from "os";
import { exec } from "child_process";
import sqlite3 from "sqlite3";
import cookieParser from "cookie-parser";
import fs from "fs/promises";

// Route imports
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import dashboardRoutes from "./routes/dashboard.js";
import articlesRoutes from "./routes/articles.js";

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// ✅ Initialize Databases
const userDB = new sqlite3.Database("./Users.db", (err) => {
  if (err) console.error("❌ Error opening Users.db:", err.message);
  else console.log("✅ Connected to Users.db (User Database)");
});

const siteDB = new sqlite3.Database("./lighthouse.db", (err) => {
  if (err) console.error("❌ Error opening lighthouse.db:", err.message);
  else console.log("✅ Connected to lighthouse.db (Site Database)");
});

const articlesDB = new sqlite3.Database("./articles.db", (err) => {
  if (err) console.error("❌ Error opening articles.db:", err.message);
  else console.log("✅ Connected to articles.db (Articles Database)");
});

// Ensure pending articles folder exists
fs.mkdir(path.join(__dirname, 'views', 'pending'), { recursive: true })
  .then(() => console.log('✅ Pending articles folder ready'))
  .catch(err => console.warn('⚠️ Could not create pending folder:', err.message));

// Express app setup
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "defaultsecret"; // fallback

// Middleware
// Allow larger JSON payloads (image uploads can be big base64 strings)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.static(path.join(__dirname, "public")));

// Mount cookie parser so `req.cookies` is available for auth
app.use(cookieParser());

// NOTE: We prefer cookie-based JWT auth for page requests and `ensureAuthenticated` from middleware.
// Keep `verifyToken` for Authorization header-based API usage if needed by external API clients.
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

// ✅ Public pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// Editor page (served as route for iframe embedding in dashboard)
app.get('/editor', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'editor.html'));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "login.html"));
});

app.get("/index-testing", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index-testing.html"));
});

app.get("/about", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "about.html"));
});

app.get("/contact", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "contact.html"));
});

app.get("/help", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "help.html"));
});

// Podcasts page
app.get('/podcasts', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'podcasts.html'));
});

// Blog page
app.get('/blog', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'blog.html'));
});

// ✅ Protected dashboard — accessible only with a valid token
// The dashboard HTML is served by `routes/dashboard.js` with cookie-based JWT verification.
// Old Authorization header-based route removed to avoid mixed auth mechanisms.

// ✅ Inject DBs into routes via middleware (for cleaner route files)
app.use((req, res, next) => {
  req.userDB = userDB;
  req.siteDB = siteDB;
  req.articlesDB = articlesDB;
  next();
});

// Ensure Users.db has schema columns added (role, password_base64)
userDB.serialize(() => {
  userDB.all("PRAGMA table_info(users)", (err, rows) => {
    if (err) return console.warn('Could not inspect Users.db schema:', err.message);
    const cols = new Set((rows || []).map(r => r.name));
    if (!cols.has('role')) {
      userDB.run('ALTER TABLE users ADD COLUMN role TEXT', (aErr) => { if (aErr) console.warn('Could not add role column:', aErr.message); });
    }
    if (!cols.has('password_base64')) {
      userDB.run('ALTER TABLE users ADD COLUMN password_base64 TEXT', (aErr) => { if (aErr) console.warn('Could not add password_base64 column:', aErr.message); });
    }
    if (!cols.has('avatar_style')) {
      userDB.run('ALTER TABLE users ADD COLUMN avatar_style TEXT', (aErr) => { if (aErr) console.warn('Could not add avatar_style column:', aErr.message); });
    }
    if (!cols.has('profile_picture')) {
      userDB.run('ALTER TABLE users ADD COLUMN profile_picture TEXT', (aErr) => { if (aErr) console.warn('Could not add profile_picture column:', aErr.message); });
    }
  });
});

// Ensure lighthouse.db has schema columns added (password_base64)
siteDB.serialize(() => {
  siteDB.all("PRAGMA table_info(users)", (err, rows) => {
    if (err) return console.warn('Could not inspect lighthouse.db schema:', err.message);
    const cols = new Set((rows || []).map(r => r.name));
    if (!cols.has('password_base64')) {
      siteDB.run('ALTER TABLE users ADD COLUMN password_base64 TEXT', (aErr) => { if (aErr) console.warn('Could not add password_base64 to lighthouse.db:', aErr.message); });
    }
    if (!cols.has('avatar_style')) {
      siteDB.run('ALTER TABLE users ADD COLUMN avatar_style TEXT', (aErr) => { if (aErr) console.warn('Could not add avatar_style to lighthouse.db:', aErr.message); });
    }
    if (!cols.has('profile_picture')) {
      siteDB.run('ALTER TABLE users ADD COLUMN profile_picture TEXT', (aErr) => { if (aErr) console.warn('Could not add profile_picture to lighthouse.db:', aErr.message); });
    }
  });
});

// Initialize articles.db schema
articlesDB.serialize(() => {
  // Create articles table
  articlesDB.run(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      snippet TEXT,
      coverImagePath TEXT,
      tags TEXT,
      minuteRead INTEGER,
      authorId INTEGER NOT NULL,
      status TEXT DEFAULT 'draft',
      stagedPath TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      publishedAt TEXT,
      currentRevisionId INTEGER,
      FOREIGN KEY(authorId) REFERENCES users(id)
    );
  `, (err) => {
    if (err) console.warn('Could not create articles table:', err.message);
  });

  // Create revisions table
  articlesDB.run(`
    CREATE TABLE IF NOT EXISTS revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      articleId INTEGER NOT NULL,
      authorId INTEGER NOT NULL,
      contentHtml TEXT NOT NULL,
      createdAt TEXT,
      notes TEXT,
      FOREIGN KEY(articleId) REFERENCES articles(id),
      FOREIGN KEY(authorId) REFERENCES users(id)
    );
  `, (err) => {
    if (err) console.warn('Could not create revisions table:', err.message);
  });

  // Create reviews table
  articlesDB.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      revisionId INTEGER NOT NULL,
      reviewerId INTEGER NOT NULL,
      action TEXT NOT NULL,
      comment TEXT,
      createdAt TEXT,
      FOREIGN KEY(revisionId) REFERENCES revisions(id),
      FOREIGN KEY(reviewerId) REFERENCES users(id)
    );
  `, (err) => {
    if (err) console.warn('Could not create reviews table:', err.message);
  });
});

// API Routes
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/articles", articlesRoutes);

// Memory probe endpoint (returns RAM metrics in GB and percent)
app.get("/api/memory", (req, res) => {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;

  res.json({
    totalGB: (total / 1024 ** 3),
    usedGB: (used / 1024 ** 3),
    usedPercent: (used / total) * 100
  });
});

// Return top processes (by memory) using ps (Linux/macOS). On systems without ps this may fail.
app.get("/api/processes", (req, res) => {
  exec(
    "ps -eo pid,comm,%cpu,%mem --sort=-%mem | head -n 21",
    (err, stdout) => {
      if (err) {
        res.status(500).json({ error: "Failed to fetch processes" });
        return;
      }

      const lines = stdout.trim().split("\n").slice(1);
      const processes = lines.map(line => {
        const parts = line.trim().split(/\s+/);
        return {
          pid: parts[0],
          name: parts[1],
          cpu: parts[2],
          mem: parts[3]
        };
      });

      res.json(processes);
    }
  );
});

// Expose the administrative panel page
app.get('/securepanel', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'panel.html'));
});

// 404 Fallback
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "views", "404.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
