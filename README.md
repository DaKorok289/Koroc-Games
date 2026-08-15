# Koroc Games

A browser-based party game hub: sign in, land in a lobby, and an admin can kick off
minigame events that everyone gets pulled into. Built with TypeScript end to end.

- **Ping Pong** — fully playable, 2 players + spectators, server-authoritative physics
- **Hide & Seek** — one random seeker (slightly faster) tags hiders by proximity; hiders win
  by surviving the clock
- **Wizard Battles** — free movement, auto-casts at the nearest opponent; last wizard standing
  wins
- **Shooters** — free movement, hitscan auto-fire with respawns; first to 5 kills wins

## Stack

- `shared/` — TypeScript types & constants used by both client and server
- `server/` — Node + Express (auth REST API) + Socket.io (realtime lobby & game state) + SQLite
- `client/` — React + Vite, touch/mouse/keyboard controls, responsive layout for phone/iPad/desktop

## Running it

Requires Node 20+.

```bash
npm install
npm run build --workspace=shared   # shared types must be built once before first run
npm run dev                        # starts server (:4000) and client (:5173) together
```

Open **http://localhost:5173**. The first account you register becomes admin automatically
(no manual setup needed) — every account after that is a regular player.

## Playing on iPad / phone / other computers (same WiFi)

The client talks to whatever host you loaded the page from, on port 4000 — so:

1. Find your computer's local IP (macOS: `ipconfig getifaddr en0`).
2. On the other device (same WiFi network), open `http://<that-ip>:5173` in the browser.
3. Sign in and you're in the same lobby as everyone else.

Vite's dev server already listens on all network interfaces (`host: true`), so no extra
config is needed for LAN play.

## How it works

- **Auth**: username/password, salted+hashed (scrypt) in SQLite, session via httpOnly cookie.
- **Lobby**: every signed-in socket joins presence; admins see "Start Event" on each game card.
- **Events**: only one event runs at a time server-wide. Starting one broadcasts to every
  connected client, which switches everyone's screen to that game. Admins can end it early;
  Ping Pong also ends itself automatically once someone reaches 7 points.
- **Ping Pong**: server runs the physics loop (ball, paddles, scoring) at 60fps and broadcasts
  state; clients just render and send paddle position. First two joiners become players,
  everyone else spectates. Controls: drag/touch on your half, or arrow keys / W-S.
- **Hide & Seek / Wizard Battles / Shooters**: all three share a normalized 0..1 x 0..1 arena
  and the same movement model (server-authoritative, 30fps tick) — drag anywhere on the arena
  or use WASD/arrow keys to move; combat (tagging, spell casts, gunfire) is all automatic based
  on proximity, so the only input needed is positioning. Everyone who joins becomes a player
  (no spectator role); a round needs at least 2 players to start.
- **Granting admin on a deployed instance**: set an `ADMIN_USERNAMES` env var (comma-separated
  usernames) on the host. Promotion runs on every server startup, so it takes effect on the
  next deploy/restart — no direct database access needed.

## Scripts

- `npm run dev` — run server + client together
- `npm run build` — production build of all three workspaces
- `npm run typecheck` — typecheck all three workspaces

## Adding a new minigame

1. Add the type to `GAME_TYPES` / `GAME_INFO` in `shared/src/index.ts` (set `implemented: true`
   once it has real gameplay).
2. Server-side game logic goes in `server/src/games/<name>.ts`, wired up in
   `server/src/realtime.ts` next to the Ping Pong example.
3. Client-side screen goes in `client/src/pages/games/<Name>.tsx`, added to the switch in
   `client/src/pages/GameRouter.tsx`. For an arena-style game (free 2D movement), reuse the
   `useArenaMovement` and `useResizableCanvas` hooks in `client/src/hooks/` rather than
   reimplementing input/resize handling.
