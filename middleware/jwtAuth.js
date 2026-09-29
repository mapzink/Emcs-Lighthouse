// middleware/jwtAuth.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "lighthouse_jwt_secret"; // change in production

// role priority (higher index => higher privilege)
export const ROLE_ORDER = ["user", "videographer", "publisher", "admin", "dev"];
const LEGACY_ROLE_ALIASES = { podcaster: "videographer" };

export function normalizeRole(role) {
  const value = String(role || "user").toLowerCase().trim();
  if (LEGACY_ROLE_ALIASES[value]) return LEGACY_ROLE_ALIASES[value];
  return ROLE_ORDER.includes(value) ? value : "user";
}

export function verifyTokenFromCookie(req) {
  const token = req.cookies?.token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload;
  } catch (err) {
    return null;
  }
}

export function ensureAuthenticated(req, res, next) {
  const payload = verifyTokenFromCookie(req);
  if (!payload) {
    // unauthorized -> redirect to login (for pages) or 401 for API
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    return res.redirect("/login");
  }
  req.user = { ...payload, role: normalizeRole(payload.role) }; // { id, username, role }
  next();
}

export function preventPrivateCaching(req, res, next) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
}

// require role at least as high as requiredRole
export function requireAtLeast(requiredRole) {
  return (req, res, next) => {
    const payload = verifyTokenFromCookie(req);
    if (!payload) return res.status(401).json({ error: "Not authenticated" });
    const normalizedRole = normalizeRole(payload.role);
    req.user = { ...payload, role: normalizedRole };
    const currentRank = ROLE_ORDER.indexOf(normalizedRole);
    const requiredRank = ROLE_ORDER.indexOf(normalizeRole(requiredRole));
    if (currentRank < requiredRank) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
