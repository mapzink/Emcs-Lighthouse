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
import profilePageRoutes from "./routes/profilePage.js";
import { preventPrivateCaching } from "./middleware/jwtAuth.js";
import { buildPublicArticleLayout, ensureArticleLayoutSchema } from "./utils/articleLayout.js";

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

siteDB.run(`
  CREATE TABLE IF NOT EXISTS video_views (
    filename TEXT PRIMARY KEY,
    view_count INTEGER NOT NULL DEFAULT 0,
    updatedAt TEXT
  )
`, (err) => {
  if (err) console.warn('Could not initialize video views table:', err.message);
});

// Ensure pending articles folder exists
fs.mkdir(path.join(__dirname, 'views', 'pending'), { recursive: true })
  .then(() => console.log('✅ Pending articles folder ready'))
  .catch(err => console.warn('⚠️ Could not create pending folder:', err.message));

// Express app setup
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "defaultsecret"; // fallback
app.disable('x-powered-by');

// The homepage and its carousel use the same layout data. Share this lookup
// briefly so one page load does not perform the same SQLite queries twice.
const PUBLIC_LAYOUT_CACHE_TTL = 30_000;
let publicLayoutCache = null;
let publicLayoutRequest = null;

async function getPublicArticleLayout() {
  const now = Date.now();
  if (publicLayoutCache && publicLayoutCache.expiresAt > now) return publicLayoutCache.value;
  if (publicLayoutRequest) return publicLayoutRequest;

  publicLayoutRequest = buildPublicArticleLayout(articlesDB)
    .then(value => {
      publicLayoutCache = { value, expiresAt: Date.now() + PUBLIC_LAYOUT_CACHE_TTL };
      return value;
    })
    .finally(() => {
      publicLayoutRequest = null;
    });

  return publicLayoutRequest;
}

// Register this page before the public static middleware. The video library
// directory also exists under public/, and static middleware would otherwise
// redirect /videos to /videos/ as a directory.
app.get('/videos', (req, res) => {
  res.render('podcasts');
});

// Configure EJS view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', process.env.NODE_ENV === 'production');

// Middleware
function setStaticAssetHeaders(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const optimizedAsset = /-\d+\.(webp|avif|png|jpe?g)$/i.test(filePath);
  const longLived = new Set(['.webp', '.avif', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2']);
  const shortLived = new Set(['.css', '.js']);

  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (optimizedAsset || ext === '.woff2' || ext === '.woff') {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (longLived.has(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=604800');
  } else if (shortLived.has(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}

// Image uploads can be large base64 JSON payloads; keep that limit scoped to upload traffic.
app.use('/articles/upload-image', express.json({ limit: '100mb' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  lastModified: true,
  setHeaders: setStaticAssetHeaders
}));

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
app.get("/", async (req, res) => {
  try {
    const articleLayout = await getPublicArticleLayout();
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    res.render('index', { articleLayout });
  } catch (err) {
    console.warn('Could not load article layout for homepage:', err.message);
    res.render('index', { articleLayout: null });
  }
});

// Editor page (served as route for iframe embedding in dashboard)
app.get('/editor', preventPrivateCaching, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'editor.html'));
});

app.get("/login", (req, res) => {
  res.render('login');
});

app.get("/index-fallback", (req, res) => {
  res.render('index-fallback');
});

// app.get("/about", (req, res) => {
//   res.render('about');
// });

app.get("/contact", (req, res) => {
  res.render('contact');
});

app.get("/help", (req, res) => {
  res.render('help');
});

// Public, read-only video catalog. Video files themselves are served by the
// public static middleware above; this endpoint validates the manifest and
// filters out entries whose files are missing or unsupported.
app.get('/api/videos', async (req, res) => {
  const videosDirectory = path.join(__dirname, 'public', 'videos');
  const manifestPath = path.join(videosDirectory, 'videos.json');
  const supportedExtensions = new Set(['.mp4', '.webm', '.ogg', '.ogv', '.mov']);
  const contentTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.mov': 'video/quicktime'
  };

  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const entries = Array.isArray(manifest) ? manifest : manifest.videos;

    if (!Array.isArray(entries)) return res.status(200).json({ videos: [] });

    const viewRows = await new Promise((resolve, reject) => {
      siteDB.all('SELECT filename, view_count FROM video_views', (error, rows) => {
        if (error) return reject(error);
        resolve(rows || []);
      });
    });
    const viewCounts = new Map(viewRows.map(row => [row.filename, Number(row.view_count) || 0]));

    const videos = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;

      const filename = typeof entry.filename === 'string' ? entry.filename.trim() : '';
      const extension = path.extname(filename).toLowerCase();
      if (!filename || path.basename(filename) !== filename || !supportedExtensions.has(extension)) continue;

      const absolutePath = path.join(videosDirectory, filename);
      try {
        const fileInfo = await fs.stat(absolutePath);
        if (!fileInfo.isFile()) continue;

        videos.push({
          title: typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : path.basename(filename, extension),
          description: typeof entry.description === 'string' ? entry.description.trim() : '',
          publishedAt: typeof entry.publishedAt === 'string' ? entry.publishedAt : null,
          order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : null,
          filename,
          source: `/videos/${encodeURIComponent(filename)}`,
          type: contentTypes[extension],
          views: viewCounts.get(filename) || 0
        });
      } catch (error) {
        if (error.code !== 'ENOENT') console.warn(`Could not inspect video ${filename}:`, error.message);
      }
    }

    videos.sort((a, b) => {
      if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order;
      if (a.order !== null) return -1;
      if (b.order !== null) return 1;
      return (b.publishedAt || '').localeCompare(a.publishedAt || '');
    });

    res.json({ videos });
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(200).json({ videos: [] });
    console.error('Could not load video catalog:', error.message);
    res.status(500).json({ error: 'Could not load video catalog', videos: [] });
  }
});

// Increment a video's persistent view count when playback begins.
app.post('/api/videos/:filename/view', async (req, res) => {
  const filename = typeof req.params.filename === 'string' ? req.params.filename.trim() : '';
  const supportedExtensions = new Set(['.mp4', '.webm', '.ogg', '.ogv', '.mov']);
  const extension = path.extname(filename).toLowerCase();
  const videoPath = path.join(__dirname, 'public', 'videos', filename);

  if (!filename || path.basename(filename) !== filename || !supportedExtensions.has(extension)) {
    return res.status(400).json({ error: 'Invalid video filename' });
  }

  try {
    const fileInfo = await fs.stat(videoPath);
    if (!fileInfo.isFile()) return res.status(404).json({ error: 'Video not found' });

    const updatedAt = new Date().toISOString();
    await new Promise((resolve, reject) => {
      siteDB.run(
        `INSERT INTO video_views (filename, view_count, updatedAt)
         VALUES (?, 1, ?)
         ON CONFLICT(filename) DO UPDATE SET view_count = view_count + 1, updatedAt = excluded.updatedAt`,
        [filename, updatedAt],
        error => error ? reject(error) : resolve()
      );
    });

    const row = await new Promise((resolve, reject) => {
      siteDB.get('SELECT view_count FROM video_views WHERE filename = ?', [filename], (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
    });

    res.json({ filename, views: Number(row?.view_count) || 0 });
  } catch (error) {
    console.error(`Could not record video view for ${filename}:`, error.message);
    res.status(500).json({ error: 'Could not record video view' });
  }
});

// Redirect old /podcasts to /videos (permanent)
app.get('/podcasts', (req, res) => {
  res.redirect(301, '/videos');
});

// Blog page
app.get('/blog', (req, res) => {
  res.render('blog');
});

//Carousel page
app.get('/carousel', async (req, res) => {
  try {
    const articleLayout = await getPublicArticleLayout();
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    res.render('carousel', { carouselSlides: articleLayout.carouselSlides });
  } catch (err) {
    console.warn('Could not load article layout for carousel:', err.message);
    res.render('carousel', { carouselSlides: null });
  }
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
    if (!cols.has('profile_bio')) {
      userDB.run('ALTER TABLE users ADD COLUMN profile_bio TEXT', (aErr) => { if (aErr) console.warn('Could not add profile_bio column:', aErr.message); });
    }
    if (!cols.has('profile_featured_article_id')) {
      userDB.run('ALTER TABLE users ADD COLUMN profile_featured_article_id INTEGER', (aErr) => { if (aErr) console.warn('Could not add profile_featured_article_id column:', aErr.message); });
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
    if (!cols.has('profile_bio')) {
      siteDB.run('ALTER TABLE users ADD COLUMN profile_bio TEXT', (aErr) => { if (aErr) console.warn('Could not add profile_bio to lighthouse.db:', aErr.message); });
    }
    if (!cols.has('profile_featured_article_id')) {
      siteDB.run('ALTER TABLE users ADD COLUMN profile_featured_article_id INTEGER', (aErr) => { if (aErr) console.warn('Could not add profile_featured_article_id to lighthouse.db:', aErr.message); });
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
      views INTEGER DEFAULT 0,
      FOREIGN KEY(authorId) REFERENCES users(id)
    );
  `, (err) => {
    if (err) console.warn('Could not create articles table:', err.message);
  });

  // Ensure articles table has views column (migration)
  articlesDB.all("PRAGMA table_info(articles)", (err, rows) => {
    if (err) return console.warn('Could not inspect articles schema:', err.message);
    const cols = new Set((rows || []).map(r => r.name));
    if (!cols.has('views')) {
      articlesDB.run('ALTER TABLE articles ADD COLUMN views INTEGER DEFAULT 0', (aErr) => { 
        if (aErr) console.warn('Could not add views column:', aErr.message);
        else console.log('✅ Added views column to articles table');
      });
    }
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

  articlesDB.run(
    'CREATE INDEX IF NOT EXISTS idx_articles_author_status_updated ON articles(authorId, status, updatedAt)',
    (err) => { if (err) console.warn('Could not create articles author/status index:', err.message); }
  );
  articlesDB.run(
    'CREATE INDEX IF NOT EXISTS idx_articles_status_updated ON articles(status, updatedAt)',
    (err) => { if (err) console.warn('Could not create articles status index:', err.message); }
  );
  articlesDB.run(
    'CREATE INDEX IF NOT EXISTS idx_revisions_article ON revisions(articleId)',
    (err) => { if (err) console.warn('Could not create revisions article index:', err.message); }
  );
  articlesDB.run(
    'CREATE INDEX IF NOT EXISTS idx_reviews_revision ON reviews(revisionId)',
    (err) => { if (err) console.warn('Could not create reviews revision index:', err.message); }
  );

  ensureArticleLayoutSchema(articlesDB)
    .catch((err) => console.warn('Could not initialize article layout schema:', err.message));
});

// API Routes
app.use("/auth", preventPrivateCaching, authRoutes);
app.use("/users", preventPrivateCaching, userRoutes);
app.use("/dashboard", preventPrivateCaching, dashboardRoutes);
app.use("/profile-page", profilePageRoutes);
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
