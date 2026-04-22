// middleware/jwtAuth.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "lighthouse_jwt_secret"; // change in production

// role priority (higher index => higher privilege)
export const ROLE_ORDER = ["user", "podcaster", "publisher", "admin", "dev"];

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
  req.user = payload; // { id, username, role }
  next();
}

// require role at least as high as requiredRole
export function requireAtLeast(requiredRole) {
  return (req, res, next) => {
    const payload = verifyTokenFromCookie(req);
    if (!payload) return res.status(401).json({ error: "Not authenticated" });
    req.user = payload;
    const currentRank = ROLE_ORDER.indexOf(payload.role || "user");
    const requiredRank = ROLE_ORDER.indexOf(requiredRole);
    if (currentRank < requiredRank) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
