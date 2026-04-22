import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs/promises';
import path from 'path';
import { generateArticleHTML } from './routes/articles.js';

async function main() {
  const db = await open({ filename: './articles.db', driver: sqlite3.Database });
  // open user db for author info
  const userDB = await open({ filename: './Users.db', driver: sqlite3.Database });

  const rows = await db.all("SELECT id, slug, title, snippet, coverImagePath, tags, minuteRead, createdAt, authorId, currentRevisionId FROM articles WHERE status = 'published'");
  for (const row of rows) {
    try {
      const rev = await db.get('SELECT contentHtml FROM revisions WHERE id = ?', [row.currentRevisionId]);
      let authorObj = {};
      try {
        let ur = await userDB.get('SELECT username, avatar_style FROM users WHERE id = ?', [row.authorId]);
        if (!ur) {
          // author id no longer exists: choose a sensible fallback
          console.warn('article', row.slug, 'has missing authorId', row.authorId, '- using first dev/admin user as fallback');
          const fallback = await userDB.get("SELECT id, username, avatar_style FROM users WHERE role IN ('dev','admin') ORDER BY id LIMIT 1");
          if (fallback) {
            // update article record so future regenerations don't hit the same missing id
            await db.run('UPDATE articles SET authorId = ? WHERE id = ?', [fallback.id, row.id]);
            ur = fallback;
          }
        }

        if (ur) {
          authorObj.username = ur.username;
          if (ur.avatar_style) {
            try { authorObj.avatarStyle = JSON.parse(ur.avatar_style); } catch(e) {}
          }
        }
      } catch(e) {
        console.warn('could not load user', row.authorId, e.message);
      }
      const article = {
        title: row.title,
        snippet: row.snippet,
        coverImagePath: row.coverImagePath,
        tags: JSON.parse(row.tags || '[]'),
        minuteRead: row.minuteRead,
        createdAt: row.createdAt
      };
      const html = generateArticleHTML(article, { contentHtml: rev.contentHtml }, authorObj);
      const filePath = path.join(process.cwd(), 'views', `${row.slug}.html`);
      await fs.writeFile(filePath, html, 'utf8');
      console.log('rewrote', row.slug);
    } catch(err) {
      console.error('failed regenerating', row.slug, err.message);
    }
  }
  await db.close();
  await userDB.close();
}

main().catch(err => {
  console.error('regeneration script error', err);
  process.exit(1);
});