import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

(async () => {
  const db = await open({ filename: './Users.db', driver: sqlite3.Database });
  const cols = await db.all("PRAGMA table_info(users)");
  console.log('columns:', cols.map(c=>c.name));
  const rows = await db.all("SELECT id, username, avatar_style FROM users");
  console.log('users:', rows);
  await db.close();
})();
