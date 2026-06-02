import express from "express";

const router = express.Router();

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return resolve(null);
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return resolve([]);
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function parseAvatarStyle(rawStyle) {
  if (!rawStyle) return null;
  if (typeof rawStyle === "object") return rawStyle;

  try {
    return JSON.parse(rawStyle);
  } catch {
    return null;
  }
}

function cleanColor(value) {
  const color = String(value || "").trim();
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) return color;
  if (/^hsla?\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) return color;
  return null;
}

function avatarCss(style) {
  const parsed = parseAvatarStyle(style);
  if (!parsed) return "#ff4b2b";

  const type = parsed.type || parsed.kind;
  if (type === "solid") {
    const color = Array.isArray(parsed.colors) ? parsed.colors[0] : parsed.color;
    return cleanColor(color) || "#ff4b2b";
  }

  if (type !== "gradient") return "#ff4b2b";

  const stops = Array.isArray(parsed.stops)
    ? parsed.stops
        .map((stop) => {
          const color = cleanColor(stop?.color);
          const position = Number(stop?.position);
          if (!color || !Number.isFinite(position)) return null;
          return `${color} ${Math.max(0, Math.min(100, position))}%`;
        })
        .filter(Boolean)
    : [];

  if (stops.length < 2) return "#ff4b2b";

  const angle = Number.isFinite(Number(parsed.angle)) ? Number(parsed.angle) : 135;
  if (parsed.gradientType === "radial") return `radial-gradient(circle, ${stops.join(", ")})`;
  if (parsed.gradientType === "conic") return `conic-gradient(from ${angle}deg, ${stops.join(", ")})`;
  return `linear-gradient(${angle}deg, ${stops.join(", ")})`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function readTags(rawTags) {
  if (!rawTags) return [];
  if (Array.isArray(rawTags)) return rawTags;

  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(rawTags)
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
}

function roleKey(role) {
  const normalized = String(role || "member").toLowerCase().trim();
  if (["dev", "admin", "publisher", "podcaster", "user"].includes(normalized)) return normalized;
  return "member";
}

function displayRole(role) {
  if (!role) return "Member";
  return String(role)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

async function findUserByUsername(db, username) {
  return dbGet(db, "SELECT * FROM users WHERE LOWER(username) = LOWER(?)", [username]);
}

router.get("/:username", async (req, res) => {
  const username = String(req.params.username || "").trim();
  if (!username || username.length > 64) {
    return res.status(404).render("profile-page", {
      found: false,
      requestedUsername: username || "Unknown",
    });
  }

  try {
    let user = await findUserByUsername(req.siteDB, username);

    if (!user) {
      user = await findUserByUsername(req.userDB, username);
    }

    if (!user) {
      return res.status(404).render("profile-page", {
        found: false,
        requestedUsername: username,
      });
    }

    const articles = await dbAll(
      req.articlesDB,
      `SELECT id, slug, title, snippet, coverImagePath, tags, minuteRead, views, publishedAt, updatedAt, createdAt
       FROM articles
       WHERE authorId = ? AND status = 'published'
       ORDER BY COALESCE(publishedAt, updatedAt, createdAt) DESC`,
      [user.id]
    );

    const totalViews = articles.reduce((sum, article) => sum + (Number(article.views) || 0), 0);
    const pinnedArticle = articles.find((article) => Number(article.id) === Number(user.profile_featured_article_id));
    const selectedArticle = pinnedArticle || articles[0];
    const featuredArticle = selectedArticle
      ? {
          ...selectedArticle,
          tags: readTags(selectedArticle.tags),
          coverImagePath: selectedArticle.coverImagePath || "/images/1.png",
          url: `/articles/${selectedArticle.slug}`,
          publishedLabel: formatDate(selectedArticle.publishedAt || selectedArticle.updatedAt || selectedArticle.createdAt),
          sourceLabel: pinnedArticle ? "Pinned by user" : "Newest article",
        }
      : null;
    const mostViewedArticle = articles.reduce((top, article) => {
      if (!top) return article;
      return (Number(article.views) || 0) > (Number(top.views) || 0) ? article : top;
    }, null);
    const averageViews = articles.length ? Math.round(totalViews / articles.length) : 0;
    const publishedArticles = articles.map((article) => ({
      ...article,
      tags: readTags(article.tags),
      coverImagePath: article.coverImagePath || "/images/1.png",
      url: `/articles/${article.slug}`,
      viewsLabel: formatNumber(article.views || 0),
      publishedLabel: formatDate(article.publishedAt || article.updatedAt || article.createdAt),
    }));
    const userRoleKey = roleKey(user.role);

    const profile = {
      username: user.username,
      role: displayRole(user.role),
      roleKey: userRoleKey,
      avatarCss: avatarCss(user.avatar_style),
      profilePicture: user.profile_picture || "",
      bio: user.profile_bio || "No bio yet.",
      hasBio: Boolean(user.profile_bio),
      shareUrl: `/profile-page/${encodeURIComponent(user.username)}`,
      stats: {
        articles: articles.length,
        totalViews,
        articlesLabel: formatNumber(articles.length),
        viewsLabel: formatNumber(totalViews),
        averageViewsLabel: formatNumber(averageViews),
        mostViewedTitle: mostViewedArticle?.title || "No articles yet",
        mostViewedViewsLabel: mostViewedArticle ? formatNumber(mostViewedArticle.views || 0) : "0",
      },
      featuredArticle,
      publishedArticles,
    };

    return res.render("profile-page", {
      found: true,
      profile,
      requestedUsername: username,
    });
  } catch (err) {
    console.error("Profile page error:", err);
    return res.status(500).send("Could not load profile");
  }
});

export default router;
