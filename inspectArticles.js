import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

(async () => {
  const db = await open({ filename: './articles.db', driver: sqlite3.Database });
  const rows = await db.all("SELECT id, slug, title, authorId, status FROM articles");
  console.log(rows);
  await db.close();
})();
