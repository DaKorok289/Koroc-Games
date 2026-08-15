import { createClient } from "@libsql/client";
import path from "path";
import { COINS_PER_WIN, SHOP_COLORS } from "@koroc/shared";

// Local dev / no config: SQLite file on disk (via libSQL's local-file mode, same file
// format as plain SQLite). Production: point DATABASE_URL at a Turso database (a hosted,
// SQLite-compatible libSQL instance with real persistent storage — unlike Render's free
// tier disk, which is wiped on every redeploy) so leaderboard/coin/cosmetic progress
// survives across versions.
const dbPath = path.join(__dirname, "..", "data.sqlite3");
const url = process.env.DATABASE_URL || `file:${dbPath}`;
const authToken = process.env.DATABASE_AUTH_TOKEN;
const isLocalFile = url.startsWith("file:");

export const db = createClient(authToken ? { url, authToken } : { url });

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  salt: string;
  is_admin: number;
  created_at: string;
}

export async function initDb(): Promise<void> {
  if (isLocalFile) {
    // Not supported/needed against a remote Turso database (it manages this itself).
    await db.execute("PRAGMA journal_mode = WAL");
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS wins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      game_type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_cosmetics (
      user_id INTEGER NOT NULL REFERENCES users(id),
      cosmetic_id TEXT NOT NULL,
      purchased_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, cosmetic_id)
    )
  `);

  // SQLite has no "ADD COLUMN IF NOT EXISTS" — check first so this stays safe to run on
  // every startup against a database that already has the column.
  const userColumns = await db.execute("PRAGMA table_info(users)");
  const hasCoins = userColumns.rows.some((c) => c.name === "coins");
  if (!hasCoins) {
    await db.execute("ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 0");
  }
}

export async function getUserCount(): Promise<number> {
  const result = await db.execute("SELECT COUNT(*) as count FROM users");
  return Number(result.rows[0]?.count ?? 0);
}

export async function findUserByUsername(username: string): Promise<UserRow | undefined> {
  const result = await db.execute({ sql: "SELECT * FROM users WHERE username = ?", args: [username] });
  return (result.rows[0] as unknown as UserRow | undefined) ?? undefined;
}

export async function findUserById(id: number): Promise<UserRow | undefined> {
  const result = await db.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] });
  return (result.rows[0] as unknown as UserRow | undefined) ?? undefined;
}

export async function createUser(
  username: string,
  passwordHash: string,
  salt: string,
  isAdmin: boolean,
): Promise<UserRow> {
  const result = await db.execute({
    sql: "INSERT INTO users (username, password_hash, salt, is_admin) VALUES (?, ?, ?, ?)",
    args: [username, passwordHash, salt, isAdmin ? 1 : 0],
  });
  const row = await findUserById(Number(result.lastInsertRowid));
  return row!;
}

export async function recordWin(userId: number, gameType: string): Promise<void> {
  await db.execute({ sql: "INSERT INTO wins (user_id, game_type) VALUES (?, ?)", args: [userId, gameType] });
  await addCoins(userId, COINS_PER_WIN);
}

export async function addCoins(userId: number, amount: number): Promise<void> {
  await db.execute({ sql: "UPDATE users SET coins = coins + ? WHERE id = ?", args: [amount, userId] });
}

export async function getCoins(userId: number): Promise<number> {
  const result = await db.execute({ sql: "SELECT coins FROM users WHERE id = ?", args: [userId] });
  return result.rows[0] ? Number(result.rows[0].coins) : 0;
}

export async function getOwnedCosmetics(userId: number): Promise<string[]> {
  const result = await db.execute({
    sql: "SELECT cosmetic_id FROM user_cosmetics WHERE user_id = ?",
    args: [userId],
  });
  return result.rows.map((r) => String(r.cosmetic_id));
}

/** Atomically deducts coins and grants ownership. Returns false on insufficient funds
 * or if already owned — never partially applies. */
export async function purchaseCosmetic(userId: number, cosmeticId: string, price: number): Promise<boolean> {
  const already = await db.execute({
    sql: "SELECT 1 FROM user_cosmetics WHERE user_id = ? AND cosmetic_id = ?",
    args: [userId, cosmeticId],
  });
  if (already.rows.length > 0) return false;

  const tx = await db.transaction("write");
  try {
    const result = await tx.execute({
      sql: "UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?",
      args: [price, userId, price],
    });
    if (result.rowsAffected === 0) {
      await tx.rollback();
      return false;
    }
    await tx.execute({
      sql: "INSERT INTO user_cosmetics (user_id, cosmetic_id) VALUES (?, ?)",
      args: [userId, cosmeticId],
    });
    await tx.commit();
    return true;
  } catch {
    await tx.rollback();
    return false;
  }
}

export interface LeaderboardRow {
  userId: number;
  username: string;
  wins: number;
}

export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const result = await db.execute(
    `SELECT users.id as userId, users.username as username, COUNT(wins.id) as wins
     FROM users
     LEFT JOIN wins ON wins.user_id = users.id
     GROUP BY users.id
     HAVING wins > 0
     ORDER BY wins DESC, users.username ASC`,
  );
  return result.rows.map((r) => ({
    userId: Number(r.userId),
    username: String(r.username),
    wins: Number(r.wins),
  }));
}

// Promotes usernames listed in ADMIN_USERNAMES (comma-separated) to admin on every
// startup. Lets us grant admin on a deployed instance via an env var, without needing
// direct database/shell access. No-op for names that haven't registered yet.
export async function promoteAdminsFromEnv(): Promise<void> {
  const raw = process.env.ADMIN_USERNAMES;
  if (!raw) return;
  const usernames = raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  for (const username of usernames) {
    const result = await db.execute({ sql: "UPDATE users SET is_admin = 1 WHERE username = ?", args: [username] });
    if (result.rowsAffected > 0) {
      console.log(`Promoted "${username}" to admin via ADMIN_USERNAMES`);
    }
  }
}

async function grantAllCosmeticsToUser(userId: number, username: string): Promise<void> {
  let grantedAny = false;
  for (const item of SHOP_COLORS) {
    const result = await db.execute({
      sql: "INSERT OR IGNORE INTO user_cosmetics (user_id, cosmetic_id) VALUES (?, ?)",
      args: [userId, item.id],
    });
    if (result.rowsAffected > 0) grantedAny = true;
  }
  if (grantedAny) {
    console.log(`Granted all shop cosmetics to "${username}"`);
  }
}

// Grants every SHOP_COLORS cosmetic (for free, no coin deduction) to usernames listed in
// GRANT_ALL_COSMETICS_USERNAMES (comma-separated). Same env-var-driven pattern as
// promoteAdminsFromEnv — runs on every startup, idempotent, no-op for names that haven't
// registered yet.
export async function grantAllCosmeticsFromEnv(): Promise<void> {
  const raw = process.env.GRANT_ALL_COSMETICS_USERNAMES;
  if (!raw) return;
  const usernames = raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  for (const username of usernames) {
    const user = await findUserByUsername(username);
    if (!user) continue;
    await grantAllCosmeticsToUser(user.id, user.username);
  }
}

// Admins get every shop cosmetic for free, automatically — re-applied on every startup
// (and right after a new admin is created) so it stays true as new admins are promoted,
// without needing a per-username env var.
export async function grantAllCosmeticsToAdmins(): Promise<void> {
  const result = await db.execute("SELECT id, username FROM users WHERE is_admin = 1");
  for (const row of result.rows) {
    await grantAllCosmeticsToUser(Number(row.id), String(row.username));
  }
}
