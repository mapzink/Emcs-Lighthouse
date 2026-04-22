import bcrypt from 'bcrypt';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

async function main() {
  const password = 'admin123';
  const username = 'digenis';
  const role = 'dev';

  const hash = await bcrypt.hash(password, 10);
  const b64 = Buffer.from(password, 'utf8').toString('base64');

  // open lighthouse DB via sqlite open
  const siteDB = await open({ filename: './lighthouse.db', driver: sqlite3.Database });
  // open Users.db
  const usersDb = await open({ filename: './Users.db', driver: sqlite3.Database });

  try {
    // Ensure table exists
    await siteDB.exec(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT,
      password_base64 TEXT
    );`);
    await usersDb.exec(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT,
      password_base64 TEXT
    );`);

    // Clear all rows in both databases
    await siteDB.exec('DELETE FROM users');
    await usersDb.exec('DELETE FROM users');
    console.log('✅ Cleared all users from both DBs');

    // Insert single dev user to both DBs; store hash and base64 only
    await siteDB.run('INSERT INTO users (username, password, role, password_base64) VALUES (?, ?, ?, ?)', [username, hash, role, b64]);
    await usersDb.run('INSERT INTO users (username, password, role, password_base64) VALUES (?, ?, ?, ?)', [username, hash, role, b64]);

    // write to backups file if it exists or create it
    const backupsDir = path.join(process.cwd(), 'backups');
    try { fs.mkdirSync(backupsDir, { recursive: true }); } catch (e) {}
    const file = path.join(backupsDir, 'passwords_base64.txt');
    const line = `${new Date().toISOString()}\tcreate\t${username}\t${b64}\n`;
    await fs.promises.appendFile(file, line);

    console.log('✅ Created user:', username, 'with role', role);

  } finally {
    await siteDB.close();
    await usersDb.close();
  }
}

main().catch(err => {
  console.error('❌ Error in reset script:', err);
  process.exit(1);
});
