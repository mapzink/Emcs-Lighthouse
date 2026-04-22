import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

(async()=>{
  const db = await open({ filename:'./Users.db', driver: sqlite3.Database });
  const gradient = {
    type: 'gradient',
    gradientType: 'linear',
    angle: 90,
    stops: [
      { color: '#ff0000', position: 0 },
      { color: '#00ff00', position: 50 },
      { color: '#0000ff', position: 100 }
    ]
  };
  await db.run('UPDATE users SET avatar_style=? WHERE id=?', [JSON.stringify(gradient), 2]);
  console.log('updated user', await db.get('SELECT id,username,avatar_style FROM users WHERE id=?',[2]));
  await db.close();
})();
