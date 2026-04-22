import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

(async()=>{
  const db = await open({ filename: './Users.db', driver: sqlite3.Database });
  const usr = await db.get('SELECT * FROM users WHERE id=?', [8]);
  console.log('user8', usr);
  await db.close();
})();
