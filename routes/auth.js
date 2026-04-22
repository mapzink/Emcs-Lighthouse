/// routes/auth.js
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { initDB } from "../config/db.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "lighthouse_jwt_secret";
const TOKEN_NAME = "token";
const TOKEN_EXPIRES_IN = "2h"; // adjust as needed

// Note: cookie-parser must be mounted in server.js (we'll add it there)

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Missing username or password" });

    const db = await initDB();
    const user = await db.get("SELECT id, username, password, role FROM users WHERE username = ?", [username]);

    if (!user) return res.status(401).json({ error: "Invalid username or password" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid username or password" });

    // Create JWT payload
    const payload = { id: user.id, username: user.username, role: user.role };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });

    // Set HttpOnly cookie — client cannot read it
    res.cookie(TOKEN_NAME, token, {
      httpOnly: true,
      secure: false, // set true when using HTTPS
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 2, // 2h in ms
    });

    // respond with minimal user info (not the token)
    res.json({ message: "Login successful", user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /auth/current — server reads token cookie and returns user info (or 401)
router.get("/current", async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });
    const payload = jwt.verify(token, JWT_SECRET);
    // return safe info
    res.json({ id: payload.id, username: payload.username, role: payload.role });
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});

// POST /auth/logout — clear cookie
router.post("/logout", (req, res) => {
  res.clearCookie(TOKEN_NAME, { httpOnly: true, sameSite: "lax" });
  res.json({ message: "Logged out" });
});

export default router;
