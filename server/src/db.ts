import Database from "better-sqlite3";
import path from "path";

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
`);

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
