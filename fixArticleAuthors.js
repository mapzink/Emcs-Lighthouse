import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

(async()=>{
  const db = await open({ filename: './articles.db', driver: sqlite3.Database });
  console.log('Before update:', await db.all('SELECT * FROM articles'));
  await db.run('UPDATE articles SET authorId=? WHERE authorId=?', [2,8]);
  console.log('After update:', await db.all('SELECT * FROM articles'));
  await db.close();
})();
