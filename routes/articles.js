import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { ensureAuthenticated, requireAtLeast } from '../middleware/jwtAuth.js';
// note: generateArticleHTML defined later in this module

const router = express.Router();

// POST /articles/upload-image
// Accepts JSON { filename, data } where data is a data URL or base64 string.
// Only accepts image MIME types (jpg, png, gif, webp, svg, etc.)
router.post('/upload-image', ensureAuthenticated, async (req, res) => {
  try {
    const { filename, data } = req.body || {};
    if (!filename || !data) return res.status(400).json({ error: 'filename and data required' });

    // Validate MIME type from data URL
    const mimeMatch = String(data).match(/^data:([^;]+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : '';
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff'];
    
    if (mimeType && !allowedMimes.includes(mimeType)) {
      return res.status(400).json({ error: `Invalid file type. Allowed: ${allowedMimes.join(', ')}` });
    }

    // Strip data URL prefix if present
    const match = String(data).match(/^data:(.+);base64,(.+)$/);
    const base64 = match ? match[2] : data;

    const buffer = Buffer.from(base64, 'base64');
    const imagesDir = path.join(process.cwd(), 'public', 'images');
    await fs.mkdir(imagesDir, { recursive: true });
    const safeName = path.basename(filename.replace(/[^a-zA-Z0-9._-]/g, '_'));
    const savePath = path.join(imagesDir, safeName);
    await fs.writeFile(savePath, buffer);

    return res.json({ success: true, path: `/images/${safeName}` });
  } catch (err) {
    console.error('Upload image error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ============= HELPER FUNCTIONS =============

// Generate URL-friendly slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

// Generate a unique slug by appending random suffix if needed
function generateUniqueSlug(baseSlug, db, callback) {
  // Check if slug exists
  db.get('SELECT id FROM articles WHERE slug = ?', [baseSlug], (err, row) => {
    if (err) return callback(null); // fallback to base slug on error
    if (!row) return callback(baseSlug); // slug is unique
    // Slug exists, append random suffix
    const random = Math.random().toString(36).substr(2, 6);
    const uniqueSlug = `${baseSlug}-${random}`;
    // Recursively check the new slug
    generateUniqueSlug(uniqueSlug, db, callback);
  });
}

// Extract snippet from first 2 sentences of HTML content (strip tags)
function extractSnippet(htmlContent) {
  const text = htmlContent.replace(/<[^>]*>/g, '').trim();
  const sentences = text.match(/[^.!?]*[.!?]+/g) || [];
  const snippet = sentences.slice(0, 2).join('').trim();
  return snippet.slice(0, 200);
}

// Estimate read time (200 words per minute)
function estimateReadTime(htmlContent) {
  const text = htmlContent.replace(/<[^>]*>/g, '').trim();
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

// Find the next available article number (e.g., 7 if article1-6 exist)
async function getNextArticleNumber() {
  const viewsDir = path.join(process.cwd(), 'views');
  try {
    const files = await fs.readdir(viewsDir);
    // Match files like article1.html, article2.html, etc.
    const articleNums = files
      .map(f => {
        const match = f.match(/^article(\d+)\.html$/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter(n => n !== null);
    // Return max + 1 or 7 if none exist
    return articleNums.length > 0 ? Math.max(...articleNums) + 1 : 7;
  } catch (err) {
    console.warn('Could not scan views folder:', err.message);
    return 7; // fallback
  }
}

async function getAuthorInfo(req, authorId, fallbackUsername = 'Students') {
  const authorObj = { username: fallbackUsername };

  const getRow = (db, sql, params) => new Promise((resolve, reject) => {
    if (!db) return resolve(null);
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });

  try {
    const siteRow = await getRow(
      req.siteDB,
      'SELECT username, avatar_style FROM users WHERE id = ?',
      [authorId]
    );
    if (siteRow) {
      authorObj.username = siteRow.username || fallbackUsername;
      if (siteRow.avatar_style) {
        try { authorObj.avatarStyle = JSON.parse(siteRow.avatar_style); } catch (e) { /* ignore */ }
      }
      return authorObj;
    }
  } catch (err) {
    console.warn('Could not load author info from site DB', err.message);
  }

  try {
    const userRow = await getRow(
      req.userDB,
      'SELECT username, avatar_style FROM users WHERE id = ?',
      [authorId]
    );
    if (userRow) {
      authorObj.username = userRow.username || fallbackUsername;
      if (userRow.avatar_style) {
        try { authorObj.avatarStyle = JSON.parse(userRow.avatar_style); } catch (e) { /* ignore */ }
      }
    }
  } catch (err) {
    console.warn('Could not load author info from user DB', err.message);
  }

  return authorObj;
}

// Generate static article HTML from template
// `author` is optional and may include { username, avatarStyle }
export function generateArticleHTML(article, revision, author = {}) {
  const { title, snippet, coverImagePath, tags, minuteRead, createdAt } = article;
  const { contentHtml } = revision;
  const tagsStr = Array.isArray(tags) ? tags.join('</span>\n      <span>') : tags;
  
  // Parse date if possible, otherwise use createdAt
  const pubDate = new Date(createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // helper for avatar background css
  function avatarCss(style) {
    if (!style) return '';
    // older versions used `kind` instead of `type`
    const type = style.type || style.kind;
    if (type === 'solid') {
      // colors array used in current format; older hue also stored in `color`
      if (Array.isArray(style.colors) && style.colors.length) {
        return style.colors[0];
      }
      return style.color || '';
    }
    if (type === 'gradient') {
      const stops = (style.stops || []).map(s => `${s.color} ${s.position}%`).join(', ');
      const gradType = style.gradientType || style.kind /* legacy */;
      if (gradType === 'linear') {
        return `linear-gradient(${style.angle || 0}deg, ${stops})`;
      }
      if (gradType === 'radial') {
        return `radial-gradient(circle, ${stops})`;
      }
      if (gradType === 'conic') {
        return `conic-gradient(from ${style.angle || 0}deg, ${stops})`;
      }
    }
    return '';
  }

  const authorName = author.username || 'Students';
  const avatarStyle = author.avatarStyle ? avatarCss(author.avatarStyle) : '';
  // include "By" before the name for published articles
  const displayName = `By ${authorName}`;
  const authorHtml = avatarStyle
    ? `<span class="author-info"><span class="author-avatar" style="background: ${avatarStyle};"></span> ${displayName}</span>`
    : `<span>By <i class="fa-regular fa-user"></i> ${authorName}</span>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>The Lighthouse — ${title}</title>
  <link rel="icon" type="image/x-icon" href="/images/lighthouse-logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/css/emoji.css">
  <link rel="stylesheet" href="/css/content.css">

  <style>
    :root {
      --accent: #ff4b2b;
      --bg-gradient: radial-gradient(circle at top, #0a0e27 0%, #020411 100%);
      --text: #f0f3ff;
      --muted: #9ba1c2;
      --radius: 18px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Noto Serif', 'Apple Color Emoji Web', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', serif;
      color: var(--text);
      background: var(--bg-gradient);
      min-height: 100vh;
      overflow-x: hidden;
    }

    header {
      width: 100%;
      padding: 24px 60px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(10, 14, 39, 0.5);
      backdrop-filter: blur(10px);
      position: fixed;
      top: 0;
      z-index: 1000;
    }

    header img {
      height: 70px;
      border-radius: var(--radius);
      cursor: pointer;
    }

    nav a {
      text-decoration: none;
      color: var(--text);
      font-weight: 600;
      font-size: 1.05rem;
      margin: 0 18px;
      transition: 0.3s ease;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    nav a:hover {
      color: var(--accent);
      text-shadow: 0 0 8px var(--accent);
    }

    .article-hero {
      padding-top: 160px;
      padding-bottom: 80px;
      text-align: center;
      position: relative;
    }

    .article-hero h1 {
      font-size: 3.2rem;
      line-height: 1.15;
      background: linear-gradient(90deg, #ff7e5f, #feb47b);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 18px;
    }

    .article-meta {
      color: var(--muted);
      font-size: 0.95rem;
      display: flex;
      justify-content: center;
      gap: 20px;
      flex-wrap: wrap;
    }

    .article-meta i { color: var(--accent); }

    /* author avatar circle */
    .author-info {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
    }
    .author-avatar {
      display: inline-block;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.2);
      background-size: cover;
      background-position: center;
    }

    .article-container {
      max-width: 900px;
      margin: 0 auto 120px;
      padding: 0 20px;
    }

    .article-cover {
      width: 100%;
      height: 420px;
      border-radius: var(--radius);
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      background-image: url('${coverImagePath || '/images/1.png'}');
      margin-bottom: 60px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.45);
    }

    article p {
      font-size: 1.15rem;
      line-height: 1.8;
      color: #e4e7ff;
      margin-bottom: 28px;
    }

    article h2 {
      font-size: 2rem;
      margin: 70px 0 20px;
      color: #ffffff;
    }

    article blockquote {
      margin: 60px 0;
      padding: 30px 36px;
      background: rgba(255,255,255,0.05);
      border-left: 4px solid var(--accent);
      border-radius: 12px;
      font-size: 1.2rem;
      color: var(--muted);
    }

    .article-footer {
      margin-top: 100px;
      padding-top: 40px;
      border-top: 1px solid rgba(255,255,255,0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 20px;
    }

    .tags span {
      background: rgba(255,255,255,0.08);
      padding: 8px 14px;
      border-radius: 999px;
      font-size: 0.85rem;
      color: var(--muted);
      margin-right: 8px;
    }

    .share a {
      color: var(--text);
      margin-left: 14px;
      font-size: 1.1rem;
      transition: 0.3s ease;
    }

    .share a:hover { color: var(--accent); }

    footer {
      padding: 40px 20px;
      text-align: center;
      color: var(--muted);
      background: rgba(10, 14, 39, 0.6);
    }

    footer a {
      color: var(--accent);
      text-decoration: none;
    }

    footer a:hover {
      text-shadow: 0 0 8px var(--accent);
    }

    @media (max-width: 768px) {
      .article-hero h1 { font-size: 2.4rem; }
      .article-cover { height: 260px; }
    }
  </style>
</head>
<body>
<div class="reading-progress" aria-hidden="true">
  <div class="reading-progress-bar" id="readingProgressBar"></div>
</div>

<header>
  <img src="/images/lighthouse-logo.png" alt="The Lighthouse Logo" onclick="window.location.href='/'">
  <nav>
    <a href="/articles"><i class="fa-solid fa-file-lines"></i> Articles</a>
    <a href="/blog"><i class="fa-solid fa-newspaper"></i> Blog</a>
    <a href="/podcasts"><i class="fa-solid fa-podcast"></i> Podcasts</a>
    <a href="/help"><i class="fa-solid fa-circle-question"></i> Help</a>
    <a href="/login"><i class="fa-solid fa-right-to-bracket"></i> Login</a>
  </nav>
</header>

<section class="article-hero">
  <h1>${title}</h1>
  <div class="article-meta">
    ${authorHtml}
    <span><i class="fa-regular fa-calendar"></i> ${pubDate}</span>
    <span><i class="fa-regular fa-clock"></i> ${minuteRead} min read</span>
  </div>
</section>

<main class="article-container">
  <div class="article-cover"></div>

  <article>
    ${contentHtml}
  </article>

  <div class="article-footer">
    <div class="tags">
      <span>${tagsStr}</span>
    </div>

    <div class="share">
      Share:
      <a href="#"><i class="fa-brands fa-x-twitter"></i></a>
      <a href="#"><i class="fa-brands fa-facebook"></i></a>
      <a href="#"><i class="fa-solid fa-link"></i></a>
    </div>
  </div>
</main>

<footer>
  <p><a href="/contact">Contact</a> | <a href="https://emmanuelcs.ca/" target="_blank">EMCS Website</a></p>
  <p>© <span id="year"></span> The Lighthouse — Built by students, for students.</p>
</footer>

<script>
  document.getElementById('year').textContent = new Date().getFullYear();

  (() => {
    const bar = document.getElementById('readingProgressBar');
    if (!bar) return;

    const updateProgress = () => {
      const scrollTop = window.scrollY || window.pageYOffset || 0;
      const doc = document.documentElement;
      const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
      const progress = Math.max(0, Math.min(1, scrollTop / scrollable));
      bar.style.transform = \`scaleX(\${progress})\`;
      bar.style.opacity = progress > 0.01 ? '1' : '0.72';
    };

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
  })();
</script>

</body>
</html>`;
  return html;
}

// ============= PUBLIC ROUTES =============

// Serve articles index page: /articles/
router.get('/', (req, res) => {
  const file = path.join(process.cwd(), 'views', 'articles.html');
  res.sendFile(file);
});

// Live list of article metadata (merge static + DB published)
router.get('/list', async (req, res) => {
  try {
    const viewsDir = path.join(process.cwd(), 'views');
    const files = await fs.readdir(viewsDir);
    const articleFiles = files.filter(f => /^article\d+\.html$/i.test(f));

    const results = await Promise.all(articleFiles.map(async (file) => {
      const idMatch = file.match(/^article(\d+)\.html/i);
      const id = idMatch ? Number(idMatch[1]) : null;
      const content = await fs.readFile(path.join(viewsDir, file), 'utf8');

      const titleMatch = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : 'Untitled';

      const dateMatch = content.match(/<span[^>]*>\s*<i[^>]*fa-regular[^>]*fa-calendar[^>]*><\/i>\s*([^<]+)<\/span>/i);
      const date = dateMatch ? dateMatch[1].trim() : 'Unknown';

      const tagsBlockMatch = content.match(/<div[^>]*class=["']?tags["']?[^>]*>([\s\S]*?)<\/div>/i);
      let tags = [];
      if (tagsBlockMatch) {
        const tagMatches = Array.from(tagsBlockMatch[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)).map(m => m[1].trim()).filter(Boolean);
        if (tagMatches.length) tags = tagMatches;
      }

      let image = 'err1';
      const coverBlockMatch = content.match(/\.article-cover[^}]*\{([\s\S]*?)\}/i);
      let bgMatch = null;
      if (coverBlockMatch) {
        bgMatch = coverBlockMatch[1].match(/background-image\s*:\s*url\((['"]?)(.*?)\1\)/i);
      }
      if (!bgMatch) {
        bgMatch = content.match(/background-image\s*:\s*url\((['"]?)(.*?)\1\)/i);
      }
      if (bgMatch) {
        image = bgMatch[2].trim();
      }

      return { id, title, date, tags, views: 'err1', image };
    }));

    results.sort((a, b) => (a.id || 0) - (b.id || 0));
    res.json(results);
  } catch (err) {
    console.error('Failed to list articles:', err);
    res.status(500).json({ error: 'failed to list articles' });
  }
});

// NOTE: The public-serving slug route is intentionally placed at the end
// of this file (see below) so it does not conflict with other API routes
// such as '/pending', '/:id/submit', or '/:id/review'.

// ============= AUTHENTICATED ROUTES =============

// Draft + Save: Create or update article draft
// POST /articles/draft
router.post('/draft', ensureAuthenticated, (req, res) => {
  const { articleId, title, contentHtml, coverImagePath, tags } = req.body;
  const authorId = req.user.id;

  if (!title || !contentHtml) {
    return res.status(400).json({ error: 'title and contentHtml required' });
  }

  const db = req.articlesDB;
  const now = new Date().toISOString();
  const baseSlug = generateSlug(title);

  // Generate unique slug before proceeding
  generateUniqueSlug(baseSlug, db, (uniqueSlug) => {
    if (!uniqueSlug) {
      return res.status(500).json({ error: 'Could not generate unique slug' });
    }

    db.serialize(() => {
      if (articleId) {
        // Update existing draft: update article metadata, create new revision
        db.run(
          `UPDATE articles SET title = ?, coverImagePath = ?, tags = ?, updatedAt = ?
           WHERE id = ? AND authorId = ? AND status IN ('draft', 'changes_requested')`,
          [title, coverImagePath || null, JSON.stringify(tags || []), now, articleId, authorId],
          function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) {
              return res.status(403).json({ error: 'Not authorized to update this article' });
            }
            // Create new revision with the updated content
            db.run(
              `INSERT INTO revisions (articleId, authorId, contentHtml, createdAt)
               VALUES (?, ?, ?, ?)`,
              [articleId, authorId, contentHtml, now],
              function(err) {
                if (err) return res.status(500).json({ error: err.message });
                // Update currentRevisionId
                db.run(
                  `UPDATE articles SET currentRevisionId = ? WHERE id = ?`,
                  [this.lastID, articleId],
                  (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, articleId, slug: uniqueSlug, status: 'draft' });
                  }
                );
              }
            );
          }
        );
      } else {
        // Create new draft: insert article, then create initial revision
        db.run(
          `INSERT INTO articles (slug, title, coverImagePath, tags, authorId, status, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
          [uniqueSlug, title, coverImagePath || null, JSON.stringify(tags || []), authorId, now, now],
          function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const newArticleId = this.lastID;
            // Create initial revision
            db.run(
              `INSERT INTO revisions (articleId, authorId, contentHtml, createdAt)
               VALUES (?, ?, ?, ?)`,
              [newArticleId, authorId, contentHtml, now],
              function(err) {
                if (err) return res.status(500).json({ error: err.message });
                // Update currentRevisionId
                db.run(
                  `UPDATE articles SET currentRevisionId = ? WHERE id = ?`,
                  [this.lastID, newArticleId],
                  (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, articleId: newArticleId, slug: uniqueSlug, status: 'draft' });
                  }
                );
              }
            );
          }
        );
      }
    });
  });
});

// Get user's drafts
// GET /articles?authorId=<id>&status=draft
router.get('/user/drafts', ensureAuthenticated, (req, res) => {
  const db = req.articlesDB;
  const authorId = req.user.id;

  db.all(
    `SELECT a.id, a.slug, a.title, a.snippet, a.tags, a.status, a.updatedAt, a.coverImagePath, r.contentHtml
     FROM articles a
     LEFT JOIN revisions r ON r.id = a.currentRevisionId
     WHERE a.authorId = ? AND a.status IN ('draft', 'changes_requested')
     ORDER BY a.updatedAt DESC`,
    [authorId],
    (err, rows) => {
      if (err) {
        console.error('Error fetching drafts:', err);
        return res.status(500).json({ error: err.message });
      }
      try {
        const result = (rows || []).map(row => {
          let tags = [];
          try {
            tags = row.tags ? JSON.parse(row.tags) : [];
          } catch (parseErr) {
            console.warn('Could not parse tags for article', row.id, parseErr);
            tags = [];
          }
          return {
            id: row.id,
            slug: row.slug,
            title: row.title,
            snippet: row.snippet || '',
            tags,
            status: row.status,
            updatedAt: row.updatedAt,
            coverImagePath: row.coverImagePath || null,
            contentHtml: row.contentHtml || ''
          };
        });
        res.json(result);
      } catch (mapErr) {
        console.error('Error mapping drafts:', mapErr);
        return res.status(500).json({ error: mapErr.message });
      }
    }
  );
});

// Get user's articles (all statuses for dashboard "Your Articles")
// GET /articles/my
router.get('/my', ensureAuthenticated, async (req, res) => {
  const db = req.articlesDB;
  const authorId = req.user.id;

  db.all(
    `SELECT a.id, a.slug, a.title, a.snippet, a.tags, a.status, a.minuteRead, a.updatedAt, a.currentRevisionId,
            GROUP_CONCAT(rv.comment, ' | ') as latestComment
     FROM articles a
     LEFT JOIN revisions r ON r.id = a.currentRevisionId
     LEFT JOIN reviews rv ON rv.revisionId = r.id
     WHERE a.authorId = ?
     GROUP BY a.id
     ORDER BY a.updatedAt DESC`,
    [authorId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json((rows || []).map(row => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        snippet: row.snippet,
        tags: row.tags ? JSON.parse(row.tags) : [],
        status: row.status,
        minuteRead: row.minuteRead,
        updatedAt: row.updatedAt,
        comment: row.latestComment || ''
      })));
    }
  );
});

// GET /articles/:id/edit - Fetch article for editing (author + admin only)
router.get('/:id/edit', ensureAuthenticated, (req, res) => {
  const articleId = req.params.id;
  const db = req.articlesDB;

  db.get(
    `SELECT a.id, a.title, a.slug, a.authorId, r.contentHtml
     FROM articles a
     LEFT JOIN revisions r ON r.id = a.currentRevisionId
     WHERE a.id = ?`,
    [articleId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Article not found' });

      // Allow author or admin/dev
      const ROLE_ORDER = ["user","podcaster","publisher","admin","dev"];
      const isAuthor = req.user.id === row.authorId;
      const rank = ROLE_ORDER.indexOf(req.user.role || 'user');
      const isAdmin = rank >= ROLE_ORDER.indexOf('admin');

      if (!isAuthor && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      res.json({
        id: row.id,
        title: row.title,
        slug: row.slug,
        contentHtml: row.contentHtml || ''
      });
    }
  );
});

// Submit for review: Save title + minuteRead + tags, stage HTML, change status
// POST /articles/:id/submit
router.post('/:id/submit', ensureAuthenticated, async (req, res) => {
  const { minuteRead, tags, snippet } = req.body;
  const articleId = req.params.id;
  const authorId = req.user.id;

  if (!minuteRead || !tags || !Array.isArray(tags)) {
    return res.status(400).json({ error: 'minuteRead and tags array required' });
  }

  const db = req.articlesDB;

  // Get article and its current revision
  db.get(
    `SELECT a.*, r.contentHtml FROM articles a
     LEFT JOIN revisions r ON r.id = a.currentRevisionId
     WHERE a.id = ? AND a.authorId = ?`,
    [articleId, authorId],
    async (err, article) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!article) return res.status(404).json({ error: 'Article not found' });
      if (article.status !== 'draft' && article.status !== 'changes_requested') {
        return res.status(400).json({ error: 'Cannot submit article in current status' });
      }

      const now = new Date().toISOString();

      // Create revision
      db.run(
        `INSERT INTO revisions (articleId, authorId, contentHtml, createdAt, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [articleId, authorId, article.contentHtml, now, ''],
        async function(revErr) {
          if (revErr) return res.status(500).json({ error: revErr.message });
          const revisionId = this.lastID;

          // Update article with minuteRead, tags, snippet, revision, status
          const pendingSnippet = snippet || extractSnippet(article.contentHtml);
          const stagedPath = `views/pending/${article.slug}.html`;

          // Generate static HTML to staging folder
          try {
            const pendingDir = path.join(process.cwd(), 'views', 'pending');
            await fs.mkdir(pendingDir, { recursive: true });
            const authorObj = await getAuthorInfo(req, authorId, req.user.username);

            const html = generateArticleHTML(
              { ...article, minuteRead, tags, snippet: pendingSnippet },
              { contentHtml: article.contentHtml },
              authorObj
            );
            await fs.writeFile(path.join(process.cwd(), stagedPath), html, 'utf8');

            db.run(
              `UPDATE articles SET minuteRead = ?, tags = ?, snippet = ?, status = 'pending_review', 
               stagedPath = ?, currentRevisionId = ?, updatedAt = ?
               WHERE id = ?`,
              [minuteRead, JSON.stringify(tags), pendingSnippet, stagedPath, revisionId, now, articleId],
              (updErr) => {
                if (updErr) return res.status(500).json({ error: updErr.message });
                res.json({ success: true, articleId, status: 'pending_review', stagedPath });
              }
            );
          } catch (fsErr) {
            res.status(500).json({ error: `Failed to generate article: ${fsErr.message}` });
          }
        }
      );
    }
  );
});

// ============= ADMIN/REVIEWER ROUTES =============

// Get pending reviews
// GET /articles/pending
router.get('/pending', ensureAuthenticated, requireAtLeast('admin'), (req, res) => {
  const db = req.articlesDB;

  db.all(
    `SELECT a.id, a.slug, a.title, a.authorId, a.createdAt, a.stagedPath, r.id as revisionId
     FROM articles a
     LEFT JOIN revisions r ON r.id = a.currentRevisionId
     WHERE a.status = 'pending_review'
     ORDER BY a.createdAt DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// Preview staged article for author or admin
// GET /articles/:id/preview
router.get('/:id/preview', ensureAuthenticated, async (req, res) => {
  const articleId = req.params.id;
  const db = req.articlesDB;

  db.get(`SELECT stagedPath, authorId FROM articles WHERE id = ?`, [articleId], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Article not found' });
    if (!row.stagedPath) return res.status(404).json({ error: 'No staged preview available' });

    // Allow author or admin/dev to preview
    if (req.user.id !== row.authorId) {
      const ROLE_ORDER = ["user","podcaster","publisher","admin","dev"];
      const rank = ROLE_ORDER.indexOf(req.user.role || 'user');
      if (rank < ROLE_ORDER.indexOf('admin')) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const stagedFile = path.join(process.cwd(), row.stagedPath);
    try {
      await fs.access(stagedFile);
      return res.sendFile(stagedFile);
    } catch (fsErr) {
      return res.status(404).json({ error: 'Preview file not found' });
    }
  });
});

// Approve or request changes
// POST /articles/:id/review
router.post('/:id/review', ensureAuthenticated, requireAtLeast('admin'), async (req, res) => {
  const { action, comment } = req.body;
  const articleId = req.params.id;
  const reviewerId = req.user.id;

  if (!['approved', 'changes_requested'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  const db = req.articlesDB;

  db.get(
    `SELECT * FROM articles WHERE id = ? AND status = 'pending_review'`,
    [articleId],
    async (err, article) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!article) return res.status(404).json({ error: 'No pending article found' });

      const now = new Date().toISOString();
      const revisionId = article.currentRevisionId;

      // Record review
      db.run(
        `INSERT INTO reviews (revisionId, reviewerId, action, comment, createdAt)
         VALUES (?, ?, ?, ?, ?)`,
        [revisionId, reviewerId, action, comment || '', now],
        async (revErr) => {
          if (revErr) return res.status(500).json({ error: revErr.message });

          if (action === 'approved') {
            // Move staged file to public views folder with articleN.html naming
            try {
              const nextNum = await getNextArticleNumber();
              const stagedFile = path.join(process.cwd(), article.stagedPath);
              const publicFile = path.join(process.cwd(), 'views', `article${nextNum}.html`);

              // regenerate HTML using fresh author info (in case username/avatar changed)
              try {
                // fetch revision content
                const revRow = await new Promise((resolve, reject) => {
                  db.get(`SELECT contentHtml FROM revisions WHERE id = ?`, [article.currentRevisionId], (e, r) => e ? reject(e) : resolve(r));
                });
                const authorObj = await getAuthorInfo(req, article.authorId, req.user.username);
                // generate updated html
                const html = generateArticleHTML(article, { contentHtml: revRow.contentHtml }, authorObj);
                await fs.writeFile(publicFile, html, 'utf8');
                // remove original staged file so we don't have leftovers
                await fs.unlink(stagedFile).catch(() => {});
              } catch(genErr) {
                console.warn('Error regenerating article HTML on publish', genErr.message);
                // fallback to moving existing staged file
                await fs.rename(stagedFile, publicFile);
              }

              const newSlug = `article${nextNum}`;
              db.run(
                `UPDATE articles SET slug = ?, status = 'published', stagedPath = NULL, publishedAt = ?, updatedAt = ?
                 WHERE id = ?`,
                [newSlug, now, now, articleId],
                (updErr) => {
                  if (updErr) return res.status(500).json({ error: updErr.message });
                  res.json({ success: true, status: 'published', publicUrl: `/articles/${newSlug}` });
                }
              );
            } catch (fsErr) {
              res.status(500).json({ error: `Failed to publish: ${fsErr.message}` });
            }
          } else {
            // Changes requested: keep staged file, revert status
            db.run(
              `UPDATE articles SET status = 'changes_requested', updatedAt = ?
               WHERE id = ?`,
              [now, articleId],
              (updErr) => {
                if (updErr) return res.status(500).json({ error: updErr.message });
                res.json({ success: true, status: 'changes_requested' });
              }
            );
          }
        }
      );
    }
  );
});

// DELETE /articles/:id - Delete an article (author only, any status)
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  const articleId = parseInt(req.params.id, 10);
  const authorId = req.user.id;

  const db = req.articlesDB;
  
  // First fetch the article to get its slug and stagedPath for file cleanup
  db.get(
    `SELECT slug, stagedPath, coverImagePath FROM articles WHERE id = ? AND authorId = ?`,
    [articleId, authorId],
    async (err, article) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!article) return res.status(403).json({ error: 'Cannot delete this article or not authorized' });

      // Delete associated HTML files and cover image
      try {
        // Delete published file (views/{slug}.html or views/article{N}.html)
        if (article.slug) {
          const pubFile = path.join(process.cwd(), 'views', `${article.slug}.html`);
          try {
            await fs.unlink(pubFile);
          } catch (e) {
            // File doesn't exist or error; continue
          }
        }
        // Delete staged file if it exists
        if (article.stagedPath) {
          const stagFile = path.join(process.cwd(), article.stagedPath);
          try {
            await fs.unlink(stagFile);
          } catch (e) {
            // File doesn't exist or error; continue
          }
        }
        // Delete cover image if present (typically stored under public/images)
        if (article.coverImagePath) {
          // remove leading slash and ensure we point at public folder
          let coverPath = article.coverImagePath.startsWith('/') ? article.coverImagePath.slice(1) : article.coverImagePath;
          // if the path doesn't already start with 'public', prepend it
          if (!coverPath.toLowerCase().startsWith('public')) {
            coverPath = path.join('public', coverPath);
          }
          const coverFile = path.join(process.cwd(), coverPath);
          try {
            await fs.unlink(coverFile);
          } catch (e) {
            // ignore if missing
          }
        }
      } catch (fsErr) {
        console.warn('Error deleting article files:', fsErr.message);
      }

      // Now delete from database
      db.run(
        `DELETE FROM articles WHERE id = ? AND authorId = ?`,
        [articleId, authorId],
        (dbErr) => {
          if (dbErr) return res.status(500).json({ error: dbErr.message });
          // Also delete associated revisions and reviews
          db.run(
            `DELETE FROM revisions WHERE articleId = ?`,
            [articleId],
            (revErr) => {
              if (revErr) console.warn('Could not delete revisions:', revErr);
              db.run(
                `DELETE FROM reviews WHERE revisionId IN (SELECT id FROM revisions WHERE articleId = ?)`,
                [articleId],
                (reviewErr) => {
                  if (reviewErr) console.warn('Could not delete reviews:', reviewErr);
                  res.json({ success: true });
                }
              );
            }
          );
        }
      );
    }
  );
});

// Serve published article by slug or numeric id
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  
  // Try numeric ID first (serve article{N}.html for numeric ids)
  if (/^\d+$/.test(id)) {
    const file = path.join(process.cwd(), 'views', `article${id}.html`);
    try {
      await fs.access(file);
      return res.sendFile(file);
    } catch {
      // Fall through to slug lookup
    }
  }

  // Try slug lookup from published articles
  const file = path.join(process.cwd(), 'views', `${id}.html`);
  try {
    await fs.access(file);
    return res.sendFile(file);
  } catch {
    return res.status(404).send('Article not found');
  }
});

export default router;
