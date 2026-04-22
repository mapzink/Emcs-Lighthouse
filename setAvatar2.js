import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

(async()=>{
  const db = await open({ filename:'./Users.db', driver: sqlite3.Database });
  await db.run('UPDATE users SET avatar_style=? WHERE id=?', [
    JSON.stringify({ type:'solid', colors:['#ff00ff'] }),
    2
  ]);
  console.log('user after update', await db.get('SELECT * FROM users WHERE id=?',[2]));
  await db.close();
})();
