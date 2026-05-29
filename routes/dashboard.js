// routes/dashboard.js
import express from "express";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { ensureAuthenticated } from "../middleware/jwtAuth.js"; // we'll use cookie-based JWT verify
import { initDB } from "../config/db.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve the single dashboard HTML for authenticated users
router.get("/", ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "../views/dashboard.html"));
});

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

function formatUptime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildActivityItems(rows) {
  return rows
    .map(row => {
      const timestamp = row.activityAt || row.updatedAt || row.createdAt || row.publishedAt;
      if (!timestamp) return null;
      return {
        type: row.activityType || "article",
        label: row.activityLabel || "Article update",
        title: row.title || "Untitled",
        status: row.status || null,
        timestamp
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 8);
}

// Provide live dashboard data from safe server-side sources.
router.get("/data", ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user;
    const role = (user.role || "").toLowerCase();
    const isAdmin = role === "dev" || role === "admin";
    const articlesDb = req.articlesDB;
    const siteDb = await initDB();

    const scopeWhere = isAdmin ? "1 = 1" : "authorId = ?";
    const scopeParams = isAdmin ? [] : [user.id];
    const now = new Date();

    const components = {
      auth: true,
      articlesDb: false,
      usersDb: false,
      activity: false,
      memory: true
    };

    const articleTotals = await dbGet(
      articlesDb,
      `SELECT
        COUNT(*) AS totalArticles,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS publishedArticles,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draftArticles,
        SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) AS pendingReviews,
        SUM(CASE WHEN status = 'changes_requested' THEN 1 ELSE 0 END) AS changesRequested,
        SUM(CASE WHEN status = 'published' AND authorId = ? THEN COALESCE(views, 0) ELSE 0 END) AS totalViews
       FROM articles
       WHERE ${scopeWhere}`,
      [user.id, ...scopeParams]
    );
    components.articlesDb = true;

    const reviewTotals = await dbGet(
      articlesDb,
      `SELECT COUNT(rv.id) AS reviewCount
       FROM reviews rv
       JOIN revisions r ON r.id = rv.revisionId
       JOIN articles a ON a.id = r.articleId
       WHERE ${isAdmin ? "1 = 1" : "a.authorId = ?"}`,
      scopeParams
    );

    const activityRows = await dbAll(
      articlesDb,
      `SELECT title, status, updatedAt AS activityAt,
              CASE
                WHEN status = 'published' THEN 'Published'
                WHEN status = 'pending_review' THEN 'Submitted'
                WHEN status = 'changes_requested' THEN 'Changes requested'
                WHEN status = 'draft' THEN 'Draft saved'
                ELSE 'Article update'
              END AS activityLabel,
              'article' AS activityType
       FROM articles
       WHERE ${scopeWhere}
       ORDER BY datetime(updatedAt) DESC
       LIMIT 8`,
      scopeParams
    );

    const reviewRows = await dbAll(
      articlesDb,
      `SELECT a.title, a.status, rv.createdAt AS activityAt,
              CASE
                WHEN rv.action = 'approved' THEN 'Review approved'
                WHEN rv.action = 'changes_requested' THEN 'Review requested changes'
                ELSE 'Review update'
              END AS activityLabel,
              'review' AS activityType
       FROM reviews rv
       JOIN revisions r ON r.id = rv.revisionId
       JOIN articles a ON a.id = r.articleId
       WHERE ${isAdmin ? "1 = 1" : "a.authorId = ?"}
       ORDER BY datetime(rv.createdAt) DESC
       LIMIT 8`,
      scopeParams
    );

    const recentActivity = buildActivityItems([...activityRows, ...reviewRows]);
    components.activity = true;

    const userTotals = await siteDb.get(
      "SELECT COUNT(*) AS totalUsers, SUM(CASE WHEN role IN ('admin', 'dev') THEN 1 ELSE 0 END) AS elevatedUsers FROM users"
    );
    components.usersDb = true;

    const componentValues = Object.values(components);
    const signalStrength = Math.round((componentValues.filter(Boolean).length / componentValues.length) * 100);
    const memory = process.memoryUsage();
    const systemMemoryTotal = os.totalmem();
    const systemMemoryFree = os.freemem();
    const systemMemoryUsed = systemMemoryTotal - systemMemoryFree;
    const systemMemoryPercent = systemMemoryTotal ? Math.round((systemMemoryUsed / systemMemoryTotal) * 100) : 0;

    const response = {
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      },
      stats: {
        totalArticles: safeNumber(articleTotals.totalArticles),
        publishedArticles: safeNumber(articleTotals.publishedArticles),
        draftArticles: safeNumber(articleTotals.draftArticles),
        pendingReviews: safeNumber(articleTotals.pendingReviews),
        changesRequested: safeNumber(articleTotals.changesRequested),
        totalViews: safeNumber(articleTotals.totalViews),
        reviewCount: safeNumber(reviewTotals.reviewCount)
      },
      signal: {
        strength: signalStrength,
        status: signalStrength >= 90 ? "Strong" : signalStrength >= 70 ? "Stable" : "Degraded",
        components
      },
      recentActivity,
      debug: null
    };

    if (isAdmin) {
      response.debug = {
        uptime: formatUptime(process.uptime()),
        nodeVersion: process.version,
        platform: `${os.type()} ${os.release()}`,
        memory: {
          heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
          systemUsedPercent: systemMemoryPercent
        },
        database: {
          articlesReadable: components.articlesDb,
          usersReadable: components.usersDb,
          totalUsers: safeNumber(userTotals.totalUsers),
          elevatedUsers: safeNumber(userTotals.elevatedUsers)
        },
        generatedAt: now.toISOString()
      };
    }

    res.json(response);
  } catch (err) {
    console.error("Dashboard data error:", err);
    res.status(500).json({ error: "Error fetching dashboard data" });
  }
});

export default router;
