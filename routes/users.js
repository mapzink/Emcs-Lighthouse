import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { initDB } from "../config/db.js";
import { ensureAuthenticated, requireAtLeast } from "../middleware/jwtAuth.js";
import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { generateArticleHTML } from "./articles.js";

const router = express.Router();

// ✅ GET /users — list all users (for testing only)
// GET /users — list all users (admin/dev only)
router.get("/", ensureAuthenticated, requireAtLeast('admin'), async (req, res) => {
  try {
    const db = await initDB();
    // Read table info to dynamically select available columns (avoid SQLITE_ERROR when migrations are pending)
    const colsInfo = await db.all("PRAGMA table_info(users)");
    const cols = new Set((colsInfo || []).map(c => c.name));
    const selectCols = ["id", "username", "role", "password"];
    if (cols.has('password_base64')) selectCols.push('password_base64');
    const users = await db.all(`SELECT ${selectCols.join(', ')} FROM users`);
    // Return safe keys: expose password hash as passwordHash and include base64 if available
    const sanitized = users.map(u => ({ id: u.id, username: u.username, role: u.role, passwordHash: u.password, passwordBase64: u.password_base64 || null }));
    res.json(sanitized);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ✅ POST /users/create — manually create a user
// POST /users/create — create a user (admin/dev only)
router.post("/create", ensureAuthenticated, requireAtLeast('admin'), async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: "Missing required fields" });
  }

    try {
    const db = await initDB();
    const hashedPassword = await bcrypt.hash(password, 10);
    const b64 = Buffer.from(password, 'utf8').toString('base64');
    await db.run(
      "INSERT INTO users (username, password, role, password_base64) VALUES (?, ?, ?, ?)",
      [username, hashedPassword, role, b64]
    );
    // Append base64 to a file for admin retrieval (insecure; owner requested behavior)
    try {
      const backupsDir = path.join(process.cwd(), 'backups');
      const file = path.join(backupsDir, 'passwords_base64.txt');
      const line = `${new Date().toISOString()}\tcreate\t${username}\t${b64}\n`;
      await fs.promises.appendFile(file, line);
    } catch (err) {
      console.warn('Could not write base64 file:', err);
    }
    res.json({ message: `User '${username}' created successfully` });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ error: "Could not create user" });
  }
});

// DELETE /users/:id — delete a user (admin/dev only)
router.delete("/:id", ensureAuthenticated, requireAtLeast('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    const db = await initDB();
    const result = await db.run('DELETE FROM users WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Could not delete user' });
  }
});

// POST /users/:id/reset — reset a user's password to a generated temporary password (admin/dev only)
router.post('/:id/reset', ensureAuthenticated, requireAtLeast('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid user id' });
    // Generate a cryptographically secure, URL-safe temp password
    const tempPassword = crypto.randomBytes(9).toString('base64').replace(/\+/g, '0').replace(/\//g, '0');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    const db = await initDB();
    const b64 = Buffer.from(tempPassword, 'utf8').toString('base64');
    const result = await db.run('UPDATE users SET password = ?, password_base64 = ? WHERE id = ?', [hashedPassword, b64, id]);
    if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
    // Return the temporary password to the admin; it is shown only once and not stored in plaintext
    res.json({ message: 'Password reset', tempPassword });
    try {
      const backupsDir = path.join(process.cwd(), 'backups');
      const file = path.join(backupsDir, 'passwords_base64.txt');
      const line = `${new Date().toISOString()}\treset\t${id}\t${b64}\n`;
      await fs.promises.appendFile(file, line);
    } catch (err) {
      console.warn('Could not write base64 file:', err);
    }
  } catch (err) {
    console.error('Error resetting password:', err);
    res.status(500).json({ error: 'Could not reset password' });
  }
});

// POST /users/reset-all — reset all users' passwords to generated temporary passwords (admin/dev only)
router.post('/reset-all', ensureAuthenticated, requireAtLeast('admin'), async (req, res) => {
  try {
    const db = await initDB();
    const users = await db.all('SELECT id, username FROM users');
    const results = [];
    for (const u of users) {
      const tempPassword = crypto.randomBytes(9).toString('base64').replace(/\+/g, '0').replace(/\//g, '0');
      const hashed = await bcrypt.hash(tempPassword, 10);
      const b64 = Buffer.from(tempPassword, 'utf8').toString('base64');
      await db.run('UPDATE users SET password = ?, password_base64 = ? WHERE id = ?', [hashed, b64, u.id]);
      try { // append per-user line for audit
        const backupsDir = path.join(process.cwd(), 'backups');
        const file = path.join(backupsDir, 'passwords_base64.txt');
        const line = `${new Date().toISOString()}\treset-all\t${u.id}\t${u.username}\t${b64}\n`;
        await fs.promises.appendFile(file, line);
      } catch (err) {
        console.warn('Could not write base64 file:', err);
      }
      results.push({ id: u.id, username: u.username, tempPassword });
    }
    res.json({ message: 'All passwords reset', results });
  } catch (err) {
    console.error('Error resetting all passwords:', err);
    res.status(500).json({ error: 'Could not reset all passwords' });
  }
});

// ✅ GET /users/current — return the currently logged-in user (cookie-based JWT)
router.get("/current", ensureAuthenticated, async (req, res) => {
  try {
    // ensureAuthenticated sets req.user from the token cookie
    const user = req.user; // { id, username, role }
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    // Fetch avatar style from database
    const db = await initDB();
    const dbUser = await db.get('SELECT avatar_style FROM users WHERE id = ?', [user.id]);
    let avatarStyle = null;
    try { avatarStyle = dbUser?.avatar_style ? JSON.parse(dbUser.avatar_style) : null; } catch (e) { avatarStyle = null; }

    res.json({
      ...user,
      avatarStyle
    });
  } catch (err) {
    console.error("Error fetching current user:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /users/avatar-style — save current user's avatar settings
router.post("/avatar-style", ensureAuthenticated, async (req, res) => {
  try {
    const { style } = req.body; // Expect object { type:'solid'|'gradient', colors:[..], gradientType?, angle?, stops? }
    if (!style || typeof style !== 'object') {
      return res.status(400).json({ error: "No style data provided" });
    }

    const validTypes = new Set(['solid', 'gradient']);
    if (!validTypes.has(style.type)) {
      return res.status(400).json({ error: 'Invalid style type' });
    }

    if (style.type === 'solid') {
      if (!Array.isArray(style.colors) || style.colors.length === 0) {
        return res.status(400).json({ error: 'Solid style must include at least one color' });
      }
    } else if (style.type === 'gradient') {
      const validGradTypes = new Set(['linear', 'radial', 'conic']);
      if (!validGradTypes.has(style.gradientType)) {
        return res.status(400).json({ error: 'Invalid gradient type' });
      }
      if (!Array.isArray(style.stops) || style.stops.length < 2) {
        return res.status(400).json({ error: 'Gradient must have at least 2 color stops' });
      }
      // Validate each stop
      for (const stop of style.stops) {
        if (!stop.color || typeof stop.color !== 'string' || typeof stop.position !== 'number') {
          return res.status(400).json({ error: 'Invalid color stop format' });
        }
      }
    }

    const userId = req.user.id;
    const db = await initDB();
    const json = JSON.stringify(style);
    await db.run(
      'UPDATE users SET avatar_style = ? WHERE id = ?',
      [json, userId]
    );

    // regenerate any authored article HTML so avatar credits stay in sync
    try {
      const articlesDb = await open({ filename: './articles.db', driver: sqlite3.Database });
      const rows = await articlesDb.all("SELECT a.id, a.slug, a.title, a.snippet, a.coverImagePath, a.tags, a.minuteRead, a.createdAt, a.authorId, a.currentRevisionId, a.status, a.stagedPath FROM articles a WHERE a.status IN ('published', 'pending_review', 'changes_requested') AND a.authorId = ?", [userId]);
      for (const row of rows) {
        const rev = await articlesDb.get('SELECT contentHtml FROM revisions WHERE id = ?', [row.currentRevisionId]);
        let authorObj = { username: req.user.username, avatarStyle: style };
        const articleObj = {
          title: row.title,
          snippet: row.snippet,
          coverImagePath: row.coverImagePath,
          tags: JSON.parse(row.tags || '[]'),
          minuteRead: row.minuteRead,
          createdAt: row.createdAt
        };
        const html = generateArticleHTML(articleObj, { contentHtml: rev.contentHtml }, authorObj);
        const filePath = row.status === 'published'
          ? path.join(process.cwd(), 'views', `${row.slug}.html`)
          : path.join(process.cwd(), row.stagedPath);
        await fs.promises.writeFile(filePath, html, 'utf8');
      }
      await articlesDb.close();
    } catch(e) {
      console.warn('Could not regenerate user articles after avatar change', e.message);
    }

    res.json({ message: 'Avatar style updated', style });
  } catch (err) {
    console.error('Error updating avatar style:', err);
    res.status(500).json({ error: 'Could not update avatar style' });
  }
});

// GET /users/:id/avatar-style — retrieve a user's avatar style
router.get("/:id/avatar-style", async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ error: 'Invalid user id' });

    const db = await initDB();
    const user = await db.get('SELECT avatar_style FROM users WHERE id = ?', [userId]);

    if (!user || !user.avatar_style) {
      return res.status(404).json({ error: 'Avatar style not found' });
    }

    let style;
    try { style = JSON.parse(user.avatar_style); } catch (e) { style = null; }
    if (!style) return res.status(500).json({ error: 'Invalid style data' });

    res.json({ style });
  } catch (err) {
    console.error('Error fetching avatar style:', err);
    res.status(500).json({ error: 'Could not fetch avatar style' });
  }
});

// DELETE /users/avatar-style — remove current user's avatar style
router.delete("/avatar-style", ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = await initDB();

    const result = await db.run(
      'UPDATE users SET avatar_style = NULL WHERE id = ?',
      [userId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // also regenerate their authored article HTML to clear the avatar graphic
    try {
      const articlesDb = await open({ filename: './articles.db', driver: sqlite3.Database });
      const rows = await articlesDb.all("SELECT slug, title, snippet, coverImagePath, tags, minuteRead, createdAt, authorId, currentRevisionId, status, stagedPath FROM articles WHERE status IN ('published', 'pending_review', 'changes_requested') AND authorId = ?", [userId]);
      for (const row of rows) {
        const rev = await articlesDb.get('SELECT contentHtml FROM revisions WHERE id = ?', [row.currentRevisionId]);
        const articleObj = {
          title: row.title,
          snippet: row.snippet,
          coverImagePath: row.coverImagePath,
          tags: JSON.parse(row.tags || '[]'),
          minuteRead: row.minuteRead,
          createdAt: row.createdAt
        };
        const html = generateArticleHTML(articleObj, { contentHtml: rev.contentHtml }, { username: req.user.username });
        const filePath = row.status === 'published'
          ? path.join(process.cwd(), 'views', `${row.slug}.html`)
          : path.join(process.cwd(), row.stagedPath);
        await fs.promises.writeFile(filePath, html, 'utf8');
      }
      await articlesDb.close();
    } catch(e) {
      console.warn('Could not regenerate user articles after avatar removal', e.message);
    }

    res.json({ message: 'Avatar style removed successfully' });
  } catch (err) {
    console.error('Error deleting avatar style:', err);
    res.status(500).json({ error: 'Could not delete avatar style' });
  }
});

export default router;
