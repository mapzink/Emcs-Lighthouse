// routes/dashboard.js
import express from "express";
import path from "path";
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

// Provide dashboard data (simulated for now)
router.get("/data", ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user; // set by ensureAuthenticated
    // simulated data
    const allArticles = [
      { id: 1, title: "How to build a mini N64", author: "digenis", author_id: 1, status: "published" },
      { id: 2, title: "Robotics club recap", author: "alice", author_id: 3, status: "pending" }
    ];
    const allPodcasts = [
      { id: 10, title: "Intro to Sound Design", host: "podcaster", host_id: 4, status: "published" },
      { id: 11, title: "Interview with Teacher", host: "bob", host_id: 5, status: "pending" }
    ];
    const pendingReviews = [
      { id: 2, title: "Robotics club recap", author: "alice", type: "article", submittedAt: "2025-10-22" },
      { id: 11, title: "Interview with Teacher", author: "bob", type: "podcast", submittedAt: "2025-10-22" }
    ];
    // hierarchical roles: dev > admin > publisher > podcaster > user
    const role = (user.role || "").toLowerCase();

    const response = {
      user,
      articles: [],
      podcasts: [],
      users: [],      // only for admin/dev
      toReview: []    // only for admin/dev
    };

    if (role === "dev" || role === "admin") {
      // admin/dev see everything (simulate)
      response.articles = allArticles;
      response.podcasts = allPodcasts;
      // users list (simulate minimal)
      response.users = [
        { id: 1, username: "digenis", role: "dev" },
        { id: 2, username: "admin", role: "admin" },
        { id: 3, username: "alice", role: "publisher" },
        { id: 4, username: "podcaster", role: "podcaster" }
      ];
      response.toReview = pendingReviews;
    } else {
      // publishers see their articles; podcasters see their podcasts; others see their own items (simulate by username)
      response.articles = allArticles.filter(a => a.author_id === user.id || role === "publisher");
      response.podcasts = allPodcasts.filter(p => p.host_id === user.id || role === "podcaster");
    }

    res.json(response);
  } catch (err) {
    console.error("Dashboard data error:", err);
    res.status(500).json({ error: "Error fetching dashboard data" });
  }
});

export default router;
