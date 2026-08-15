import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import type { PublicUser } from "@koroc/shared";
import { findUserById, type UserRow } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
export const AUTH_COOKIE = "koroc_session";

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actual = hashPassword(password, salt);
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function signToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

export function toPublicUser(row: UserRow): PublicUser {
  return { id: row.id, username: row.username, isAdmin: !!row.is_admin };
}

export interface AuthedRequest extends Request {
  user?: PublicUser;
}

export async function parseUserFromToken(token: string | undefined): Promise<PublicUser | null> {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    const row = await findUserById(payload.userId);
    if (!row) return null;
    return toPublicUser(row);
  } catch {
    return null;
  }
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[AUTH_COOKIE];
  const user = await parseUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  req.user = user;
  next();
}

export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}
