import sqlite3 from "sqlite3";
import { open } from "sqlite";

// Initialize or connect to the database
export async function initDB() {
  const db = await open({
    filename: "./lighthouse.db",
    driver: sqlite3.Database,
  });

  // Create the users table if it doesn't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT,
      password_base64 TEXT
    );
  `);

  // Migration: ensure password_base64 column exists
  try {
    const info = await db.all("PRAGMA table_info(users)");
    const colNames = new Set((info || []).map(c => c.name));
    if (!colNames.has('password_base64')) {
      await db.exec("ALTER TABLE users ADD COLUMN password_base64 TEXT");
    }
    // Migration: add profile_picture column for storing base64-encoded profile images
    if (!colNames.has('profile_picture')) {
      await db.exec("ALTER TABLE users ADD COLUMN profile_picture TEXT");
    }
    // Migration: add avatar_style column for storing user colour/gradient settings (JSON string)
    if (!colNames.has('avatar_style')) {
      await db.exec("ALTER TABLE users ADD COLUMN avatar_style TEXT");
    }
  } catch (e) {
    // ignore - table missing or other issue; PRAGMA may fail if table absent
  }

  return db;
}
