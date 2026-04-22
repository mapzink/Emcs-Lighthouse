import * as sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';

const userDB = new sqlite3.Database('./Users.db');

const username = 'dev';
const password = 'password123';

userDB.serialize(async () => {
  userDB.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT,
      password_base64 TEXT
    )
  `);

  try {
    const hash = await bcrypt.hash(password, 10);
    const b64 = Buffer.from(password, 'utf8').toString('base64');
    userDB.run(
      'INSERT INTO users (username, password, role, password_base64) VALUES (?, ?, ?, ?)',
      [username, hash, 'dev', b64],
      function (err) {
        if (err) {
          console.error('❌ Error creating dev user:', err);
        } else {
          console.log(`✅ Dev user created: ${username} / ${password}`);
        }
      }
    );
  } catch (error) {
    console.error('❌ Error hashing password:', error);
  }

  userDB.all("PRAGMA table_info(users)", (err, rows) => {
    if (err) return console.warn('Error checking users table info:', err.message);
    const cols = new Set(rows.map(r => r.name));
    if (!cols.has('role')) {
      userDB.run('ALTER TABLE users ADD COLUMN role TEXT');
    }
    if (!cols.has('password_base64')) {
      userDB.run('ALTER TABLE users ADD COLUMN password_base64 TEXT');
    }
  });
});
