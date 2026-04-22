import sqlite3 from 'sqlite3';

const userDB = new sqlite3.Database('./Users.db');

userDB.run('DELETE FROM users WHERE username = ?', ['dev'], function (err) {
  if (err) {
    console.error('❌ Error deleting dev user:', err);
  } else {
    console.log(`🗑️ Deleted ${this.changes} user(s) named 'dev'`);
  }
  userDB.close();
});
