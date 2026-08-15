import Database from "better-sqlite3";
import path from "path";
import { COINS_PER_WIN } from "@koroc/shared";

const dbPath = path.join(__dirname, "..", "data.sqlite3");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    game_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_cosmetics (
    user_id INTEGER NOT NULL REFERENCES users(id),
    cosmetic_id TEXT NOT NULL,
    purchased_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, cosmetic_id)
  );
`);

// SQLite has no "ADD COLUMN IF NOT EXISTS" — check first so this stays safe to run on
// every startup against a database that already has the column.
const userColumns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
if (!userColumns.some((c) => c.name === "coins")) {
  db.exec("ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 0");
}

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  salt: string;
  is_admin: number;
  created_at: string;
}

export function getUserCount(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  return row.count;
}

export function findUserByUsername(username: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
}

export function findUserById(id: number): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function createUser(username: string, passwordHash: string, salt: string, isAdmin: boolean): UserRow {
  const info = db
    .prepare("INSERT INTO users (username, password_hash, salt, is_admin) VALUES (?, ?, ?, ?)")
    .run(username, passwordHash, salt, isAdmin ? 1 : 0);
  return findUserById(Number(info.lastInsertRowid))!;
}

export function recordWin(userId: number, gameType: string): void {
  db.prepare("INSERT INTO wins (user_id, game_type) VALUES (?, ?)").run(userId, gameType);
  addCoins(userId, COINS_PER_WIN);
}

export function addCoins(userId: number, amount: number): void {
  db.prepare("UPDATE users SET coins = coins + ? WHERE id = ?").run(amount, userId);
}

export function getCoins(userId: number): number {
  const row = db.prepare("SELECT coins FROM users WHERE id = ?").get(userId) as { coins: number } | undefined;
  return row?.coins ?? 0;
}

export function getOwnedCosmetics(userId: number): string[] {
  const rows = db.prepare("SELECT cosmetic_id FROM user_cosmetics WHERE user_id = ?").all(userId) as {
    cosmetic_id: string;
  }[];
  return rows.map((r) => r.cosmetic_id);
}

/** Atomically deducts coins and grants ownership. Returns false on insufficient funds
 * or if already owned — never partially applies. */
export function purchaseCosmetic(userId: number, cosmeticId: string, price: number): boolean {
  const alreadyOwned = db
    .prepare("SELECT 1 FROM user_cosmetics WHERE user_id = ? AND cosmetic_id = ?")
    .get(userId, cosmeticId);
  if (alreadyOwned) return false;

  const purchase = db.transaction(() => {
    const result = db.prepare("UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?").run(price, userId, price);
    if (result.changes === 0) throw new Error("insufficient funds");
    db.prepare("INSERT INTO user_cosmetics (user_id, cosmetic_id) VALUES (?, ?)").run(userId, cosmeticId);
  });

  try {
    purchase();
    return true;
  } catch {
    return false;
  }
}

export interface LeaderboardRow {
  userId: number;
  username: string;
  wins: number;
}

export function getLeaderboard(): LeaderboardRow[] {
  return db
    .prepare(
      `SELECT users.id as userId, users.username as username, COUNT(wins.id) as wins
       FROM users
       LEFT JOIN wins ON wins.user_id = users.id
       GROUP BY users.id
       HAVING wins > 0
       ORDER BY wins DESC, users.username ASC`,
    )
    .all() as LeaderboardRow[];
}

// Promotes usernames listed in ADMIN_USERNAMES (comma-separated) to admin on every
// startup. Lets us grant admin on a deployed instance via an env var, without needing
// direct database/shell access. No-op for names that haven't registered yet.
export function promoteAdminsFromEnv(): void {
  const raw = process.env.ADMIN_USERNAMES;
  if (!raw) return;
  const usernames = raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const promote = db.prepare("UPDATE users SET is_admin = 1 WHERE username = ?");
  for (const username of usernames) {
    const result = promote.run(username);
    if (result.changes > 0) {
      console.log(`Promoted "${username}" to admin via ADMIN_USERNAMES`);
    }
  }
}
