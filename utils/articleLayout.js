const ARTICLE_LAYOUT_SLOT_DEFINITIONS = [
  { key: 'hero', label: 'Hero Article', group: 'Homepage Hero' },
  { key: 'carousel_1', label: 'Carousel Position 1', group: 'Carousel' },
  { key: 'carousel_2', label: 'Carousel Position 2', group: 'Carousel' },
  { key: 'carousel_3', label: 'Carousel Position 3', group: 'Carousel' },
  { key: 'carousel_4', label: 'Carousel Position 4', group: 'Carousel' },
  { key: 'carousel_5', label: 'Carousel Position 5', group: 'Carousel' },
  { key: 'carousel_6', label: 'Carousel Position 6', group: 'Carousel' },
  { key: 'featured_1', label: 'Featured Article 1', group: 'Featured' },
  { key: 'featured_2', label: 'Featured Article 2', group: 'Featured' },
  { key: 'featured_3', label: 'Featured Article 3', group: 'Featured' }
];

const SLOT_KEYS = new Set(ARTICLE_LAYOUT_SLOT_DEFINITIONS.map(slot => slot.key));

const DEFAULT_HERO = {
  title: 'Creative work, school news, and student perspective.',
  category: 'Default layout',
  snippet: 'A clear place to find what is happening, what matters, and what deserves a closer look.',
  href: '/articles',
  icon: 'fa-lightbulb',
  isPlaceholder: true
};

const DEFAULT_CAROUSEL_SLIDES = [
  {
    slotKey: 'carousel_1',
    title: 'Why The Lighthouse Exists',
    href: '/articles/1/',
    image: '/images/articles/article1/1.jpg',
    alt: 'Article 1',
    objectPosition: '60% 0%',
    isPlaceholder: true
  },
  {
    slotKey: 'carousel_2',
    title: 'Student Voices Matter',
    href: '/articles/2/',
    image: '/images/articles/article2/1.jpg',
    alt: 'Article 2',
    objectPosition: '50% 60%',
    isPlaceholder: true
  },
  {
    slotKey: 'carousel_3',
    title: 'Genesis: Beginnings and Meaning',
    href: '/articles/3/',
    image: '/images/articles/article3/1.jpg',
    alt: 'Article 3',
    objectPosition: '50% 50%',
    isPlaceholder: true
  },
  {
    slotKey: 'carousel_4',
    title: 'Technology and the Shape of Tomorrow',
    href: '/articles/4/',
    image: '/images/articles/article4/2.jpg',
    sources: [{ srcset: '/images/articles/article4/2-1800.webp', type: 'image/webp' }],
    alt: 'Article 4',
    objectPosition: '50% 50%',
    isPlaceholder: true
  },
  {
    slotKey: 'carousel_5',
    title: 'Science and the Pursuit of Understanding',
    href: '/articles/5/',
    image: '/images/articles/article%205/1.jpg',
    alt: 'Article 5',
    objectPosition: '50% 50%',
    isPlaceholder: true
  },
  {
    slotKey: 'carousel_6',
    title: 'The French Language and the Discipline of Grammar',
    href: '/articles/6/',
    image: '/images/articles/article6/1.jpg',
    alt: 'Article 6',
    objectPosition: '70% 50%',
    isPlaceholder: true
  }
];

const SEEDED_ARTICLES = DEFAULT_CAROUSEL_SLIDES.map((slide, index) => ({
  id: -(index + 1),
  slug: `article${index + 1}`,
  title: slide.title,
  snippet: 'Built-in Lighthouse article available for homepage placement.',
  category: 'Seeded article',
  tags: ['Seeded article'],
  coverImagePath: slide.image,
  image: slide.image,
  href: slide.href,
  status: 'seeded',
  minuteRead: null,
  publishedAt: null,
  updatedAt: null,
  source: 'seeded',
  isPlaceholder: false
}));

const SEEDED_ARTICLE_IDS = new Set(SEEDED_ARTICLES.map(article => article.id));

const DEFAULT_FEATURED_CARDS = [
  {
    slotKey: 'featured_1',
    icon: 'fa-newspaper',
    title: 'Featured posts',
    snippet: 'Editorial picks and timely stories curated for quick discovery.',
    href: null,
    category: 'Default layout',
    isPlaceholder: true
  },
  {
    slotKey: 'featured_2',
    icon: 'fa-microphone-lines',
    title: 'Audio voices',
    snippet: 'Podcast episodes and spoken pieces from students across the community.',
    href: null,
    category: 'Default layout',
    isPlaceholder: true
  },
  {
    slotKey: 'featured_3',
    icon: 'fa-palette',
    title: 'Creative showcases',
    snippet: 'Art, essays, and projects that make the school feel alive on the page.',
    href: null,
    category: 'Default layout',
    isPlaceholder: true
  }
];

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Articles database is not available'));
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve({ changes: this.changes || 0, lastID: this.lastID || null });
    });
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Articles database is not available'));
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

function parseTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String).map(tag => tag.trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(tags);
    if (Array.isArray(parsed)) return parseTags(parsed);
  } catch {
    // Older/static entries may keep plain comma-separated tags.
  }
  return String(tags)
    .split(',')
    .map(tag => tag.trim().replace(/^["'\[]+|["'\]]+$/g, ''))
    .filter(Boolean);
}

function normalizeArticle(row) {
  if (!row?.id) return null;
  const tags = parseTags(row.tags);
  const category = tags[0] || 'Article';
  return {
    id: row.id,
    slug: row.slug,
    title: row.title || 'Untitled article',
    snippet: row.snippet || 'Read the full article.',
    category,
    tags,
    coverImagePath: row.coverImagePath || null,
    image: row.coverImagePath || '/images/1.png',
    href: row.slug ? `/articles/${encodeURIComponent(row.slug)}` : `/articles/${row.id}`,
    status: row.status,
    minuteRead: row.minuteRead || null,
    publishedAt: row.publishedAt || null,
    updatedAt: row.updatedAt || null,
    isPlaceholder: false
  };
}

function mergeArticleIntoFallback(article, fallback) {
  if (!article) return { ...fallback };
  return {
    ...fallback,
    ...article,
    alt: article.title,
    image: article.image || fallback.image || '/images/1.png',
    href: article.href,
    icon: fallback.icon || 'fa-newspaper',
    sources: null,
    objectPosition: fallback.objectPosition || '50% 50%',
    isPlaceholder: false
  };
}

export function getArticleLayoutSlots() {
  return ARTICLE_LAYOUT_SLOT_DEFINITIONS.map(slot => ({ ...slot }));
}

export async function ensureArticleLayoutSchema(db) {
  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS article_layout_slots (
      slot_key TEXT PRIMARY KEY,
      article_id INTEGER,
      updated_by_user_id INTEGER,
      updated_at TEXT,
      FOREIGN KEY(article_id) REFERENCES articles(id)
    )
  `);
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_article_layout_article ON article_layout_slots(article_id)');
}

export async function getPublishedArticleOptions(db) {
  await ensureArticleLayoutSchema(db);
  const rows = await dbAll(
    db,
    `SELECT id, slug, title, snippet, coverImagePath, tags, status, minuteRead, publishedAt, updatedAt
     FROM articles
     WHERE status = 'published'
     ORDER BY datetime(COALESCE(publishedAt, updatedAt)) DESC, id DESC`
  );
  return [
    ...SEEDED_ARTICLES.map(article => ({ ...article })),
    ...rows.map(normalizeArticle).filter(Boolean).map(article => ({ ...article, source: 'database' }))
  ];
}

export async function getAssignedArticleMap(db) {
  await ensureArticleLayoutSchema(db);
  const rows = await dbAll(
    db,
    `SELECT s.slot_key, s.article_id AS selectedArticleId, s.updated_by_user_id AS updatedByUserId,
            s.updated_at AS updatedAt,
            a.id, a.slug, a.title, a.snippet, a.coverImagePath, a.tags, a.status, a.minuteRead,
            a.publishedAt, a.updatedAt AS articleUpdatedAt
     FROM article_layout_slots s
     LEFT JOIN articles a ON a.id = s.article_id AND a.status = 'published'
     WHERE s.slot_key IN (${ARTICLE_LAYOUT_SLOT_DEFINITIONS.map(() => '?').join(',')})`,
    ARTICLE_LAYOUT_SLOT_DEFINITIONS.map(slot => slot.key)
  );

  const map = new Map();
  rows.forEach(row => {
    const seededArticle = SEEDED_ARTICLE_IDS.has(row.selectedArticleId)
      ? SEEDED_ARTICLES.find(article => article.id === row.selectedArticleId)
      : null;
    const databaseArticle = normalizeArticle({
      id: row.id,
      slug: row.slug,
      title: row.title,
      snippet: row.snippet,
      coverImagePath: row.coverImagePath,
      tags: row.tags,
      status: row.status,
      minuteRead: row.minuteRead,
      publishedAt: row.publishedAt,
      updatedAt: row.articleUpdatedAt
    });
    const article = seededArticle ? { ...seededArticle } : databaseArticle;

    map.set(row.slot_key, {
      selectedArticleId: article ? row.selectedArticleId : null,
      updatedByUserId: row.updatedByUserId || null,
      updatedAt: row.updatedAt || null,
      article
    });
  });
  return map;
}

export async function getDashboardArticleLayoutPayload(db) {
  const [publishedArticles, assignedMap] = await Promise.all([
    getPublishedArticleOptions(db),
    getAssignedArticleMap(db)
  ]);

  const slots = ARTICLE_LAYOUT_SLOT_DEFINITIONS.map(slot => {
    const assignment = assignedMap.get(slot.key) || {};
    return {
      ...slot,
      selectedArticleId: assignment.selectedArticleId || null,
      selectedArticle: assignment.article || null,
      updatedByUserId: assignment.updatedByUserId || null,
      updatedAt: assignment.updatedAt || null
    };
  });

  return { slots, publishedArticles };
}

function normalizeAssignmentsInput(input) {
  const source = input && typeof input === 'object' ? input : {};
  const keys = Object.keys(source);
  const unknownKeys = keys.filter(key => !SLOT_KEYS.has(key));
  if (unknownKeys.length) {
    const error = new Error(`Unknown layout slot: ${unknownKeys.join(', ')}`);
    error.status = 400;
    throw error;
  }

  const requestedKeys = new Set(keys);
  return ARTICLE_LAYOUT_SLOT_DEFINITIONS
    .filter(slot => requestedKeys.has(slot.key))
    .map(slot => {
      const raw = Object.prototype.hasOwnProperty.call(source, slot.key) ? source[slot.key] : null;
      if (raw === null || raw === undefined || raw === '') {
        return { slotKey: slot.key, articleId: null };
      }

      const articleId = Number(raw);
      if (!Number.isInteger(articleId) || articleId === 0 || articleId < -SEEDED_ARTICLES.length) {
        const error = new Error(`Invalid article id for ${slot.label}`);
        error.status = 400;
        throw error;
      }

      return { slotKey: slot.key, articleId };
    });
}

async function validatePublishedArticleIds(db, assignments) {
  const requestedIds = [...new Set(assignments.map(item => item.articleId).filter(Boolean))];
  if (!requestedIds.length) return;
  const databaseIds = requestedIds.filter(id => id > 0);
  const invalidSeededIds = requestedIds.filter(id => id < 0 && !SEEDED_ARTICLE_IDS.has(id));
  if (invalidSeededIds.length) {
    const error = new Error('Selected seeded articles must be one of article 1-6');
    error.status = 400;
    throw error;
  }

  if (!databaseIds.length) return;

  const rows = await dbAll(
    db,
    `SELECT id FROM articles WHERE status = 'published' AND id IN (${databaseIds.map(() => '?').join(',')})`,
    databaseIds
  );
  const validIds = new Set(rows.map(row => row.id));
  const missingIds = databaseIds.filter(id => !validIds.has(id));
  if (missingIds.length) {
    const error = new Error('Selected database articles must exist and be published');
    error.status = 400;
    throw error;
  }
}

export async function saveArticleLayoutAssignments(db, input, userId) {
  await ensureArticleLayoutSchema(db);
  const assignments = normalizeAssignmentsInput(input);
  await validatePublishedArticleIds(db, assignments);

  const now = new Date().toISOString();
  await dbRun(db, 'BEGIN');
  try {
    for (const assignment of assignments) {
      await dbRun(
        db,
        `INSERT OR REPLACE INTO article_layout_slots (slot_key, article_id, updated_by_user_id, updated_at)
         VALUES (?, ?, ?, ?)`,
        [assignment.slotKey, assignment.articleId, userId || null, now]
      );
    }
    await dbRun(db, 'COMMIT');
  } catch (err) {
    await dbRun(db, 'ROLLBACK').catch(() => {});
    throw err;
  }

  return getDashboardArticleLayoutPayload(db);
}

export async function resetArticleLayout(db, userId) {
  await ensureArticleLayoutSchema(db);
  await dbRun(db, 'BEGIN');
  try {
    const now = new Date().toISOString();
    for (const slot of ARTICLE_LAYOUT_SLOT_DEFINITIONS) {
      await dbRun(
        db,
        `INSERT OR REPLACE INTO article_layout_slots (slot_key, article_id, updated_by_user_id, updated_at)
         VALUES (?, NULL, ?, ?)`,
        [slot.key, userId || null, now]
      );
    }
    await dbRun(db, 'COMMIT');
  } catch (err) {
    await dbRun(db, 'ROLLBACK').catch(() => {});
    throw err;
  }

  return getDashboardArticleLayoutPayload(db);
}

export async function buildPublicArticleLayout(db) {
  const assignedMap = await getAssignedArticleMap(db);

  const heroArticle = mergeArticleIntoFallback(
    assignedMap.get('hero')?.article,
    DEFAULT_HERO
  );

  const carouselSlides = DEFAULT_CAROUSEL_SLIDES.map(fallback => mergeArticleIntoFallback(
    assignedMap.get(fallback.slotKey)?.article,
    fallback
  ));

  const featuredArticles = DEFAULT_FEATURED_CARDS.map(fallback => mergeArticleIntoFallback(
    assignedMap.get(fallback.slotKey)?.article,
    fallback
  ));

  return {
    heroArticle,
    carouselSlides,
    featuredArticles
  };
}
