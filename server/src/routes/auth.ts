import { Router } from "express";
import {
  AUTH_COOKIE,
  generateSalt,
  hashPassword,
  isValidUsername,
  requireAuth,
  signToken,
  toPublicUser,
  verifyPassword,
  type AuthedRequest,
} from "../auth";
import { createUser, findUserByUsername, getUserCount, grantAllCosmeticsToAdmins } from "../db";

export const authRouter = Router();

const COOKIE_OPTIONS = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: "/",
};

authRouter.post("/register", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Username and password are required" });
  }
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: "Username must be 3-20 characters: letters, numbers, underscore" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  if (await findUserByUsername(username)) {
    return res.status(409).json({ error: "That username is taken" });
  }

  const isFirstUser = (await getUserCount()) === 0;
  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);
  const user = await createUser(username, passwordHash, salt, isFirstUser);
  if (isFirstUser) await grantAllCosmeticsToAdmins();

  const token = signToken(user.id);
  res.cookie(AUTH_COOKIE, token, COOKIE_OPTIONS);
  res.json({ user: toPublicUser(user) });
});

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Username and password are required" });
  }
  const user = await findUserByUsername(username);
  if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  const token = signToken(user.id);
  res.cookie(AUTH_COOKIE, token, COOKIE_OPTIONS);
  res.json({ user: toPublicUser(user) });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});
