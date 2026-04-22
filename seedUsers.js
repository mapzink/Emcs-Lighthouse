// seedUsers.js
import bcrypt from "bcrypt";
import { initDB } from "./config/db.js";

async function seedUsers() {
  const db = await initDB();

  // Create table if it doesn't exist
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT
    )
  `);

  const users = [
    { username: "digenis", password: "admin123", role: "dev" },
    { username: "admin", password: "admin123", role: "admin" },
    { username: "podcaster", password: "pod123", role: "podcaster" },
    { username: "publisher", password: "pub123", role: "publisher" }
  ];

  for (const user of users) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    try {
      const b64 = Buffer.from(user.password, 'utf8').toString('base64');
      // ensure password_base64 column exists; sqlite `ALTER TABLE ADD COLUMN` fails if it exists, so we wrap in try/catch
      try {
        await db.exec("ALTER TABLE users ADD COLUMN password_base64 TEXT");
      } catch (err) {
        // ignore if exists
      }
      await db.run(
        "INSERT OR IGNORE INTO users (username, password, role, password_base64) VALUES (?, ?, ?, ?)",
        [user.username, hashedPassword, user.role, b64]
      );
      console.log(`✅ Added ${user.username} (${user.role})`);
    } catch (err) {
      console.error(`❌ Error adding ${user.username}:`, err);
    }
  }

  console.log("✅ User seeding complete!");
  process.exit(0);
}

seedUsers();
