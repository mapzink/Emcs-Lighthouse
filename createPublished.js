import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs/promises';
import path from 'path';

(async()=>{
  const db = await open({ filename:'./articles.db', driver: sqlite3.Database });
  const now = new Date().toISOString();
  // insert article
  const slug = 'test2';
  await db.run(`INSERT INTO articles (slug,title,coverImagePath,tags,authorId,status,createdAt,updatedAt,publishedAt,minuteRead,snippet)
    VALUES (?,?,?,?,?, 'published',?,?,?,?,?)`,
    [slug, 'Gradient test', null, JSON.stringify(['Test']), 2, now, now, now, 1, 'snippet']
  );
  const art = await db.get('SELECT id FROM articles WHERE slug=?',[slug]);
  const artId = art.id;
  // add revision
  await db.run(`INSERT INTO revisions (articleId,authorId,contentHtml,createdAt)
    VALUES (?,?,?,?)`,
    [artId, 2, '<p>gradient content</p>', now]
  );
  const rev = await db.get('SELECT id FROM revisions WHERE articleId=? ORDER BY id DESC LIMIT 1',[artId]);
  await db.run('UPDATE articles SET currentRevisionId=? WHERE id=?',[rev.id, artId]);

  console.log('Created published article', artId);
  await db.close();
})();
