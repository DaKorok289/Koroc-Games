# Koroc Games

A browser-based party game hub: sign in, land in a lobby, browse a "Join Games" tab of
whatever's currently open, and jump in. Admins can start any number of games at once —
players choose which to join rather than getting yanked into one automatically. Built with
TypeScript end to end.

- **Ping Pong** — single-elimination bracket tournament (any number of players, byes handled
  automatically), matches play one at a time with a live bracket view
- **Hide & Seek** — one random seeker (slightly faster) tags hiders by proximity; hiders win
  by surviving the clock
- **Wizard Battles** — free movement, cast toward wherever you're facing (aim is directional,
  not automatic); walls block sight and bushes hide you; limited charges before a recharge
  pause; last wizard standing wins
- **Shooters** — free movement, hitscan fire toward wherever you're facing, respawns on death;
  walls and bushes work the same as Wizard Battles; limited ammo before a reload pause; first
  to 5 kills wins

Every game is admin-controlled: the admin who started it decides when it actually begins (so
they can wait for more sign-ups), every game screen supports a fullscreen toggle plus canvases
that scale to fill the available screen without ever needing to scroll, and players can pick
their own character color from the lobby.

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
- **Lobby**: every signed-in socket joins presence. Admins start events from the "Minigames"
  tab; everyone (including the admin) then joins from the "Join Games" tab, which lists every
  currently open event across all game types. Any number of events can run concurrently —
  each gets its own Socket.io room (`event:<id>`), so state, movement, and combat for one
  event never crosses into another.
- **Events**: starting one does *not* pull anyone into it — it just appears in "Join Games".
  Only the admin who created an event can actually start it (`admin:startMatch`, checked
  against that event's `startedBy`), so they control timing instead of it auto-starting the
  moment enough people join. Admins can end an event early; each game ends itself
  automatically once it has a winner. Players can also voluntarily leave back to the lobby
  mid-game.
- **Ping Pong**: a `PongTournament` orchestrator wraps the original 1v1 `PongGame` physics
  engine — on start it shuffles the roster into a single-elimination bracket (byes are paired
  against a "phantom" opponent so they never collide with each other, guaranteeing every match
  from round 2 onward gets two real players) and plays matches sequentially, advancing winners
  up the bracket automatically. Non-current-match players see a live bracket tree; the two
  current players get full paddle control, matching Ping Pong's original controls.
- **Hide & Seek / Wizard Battles / Shooters**: all three share a normalized 0..1 x 0..1 arena
  and the same movement model (server-authoritative, 30fps tick) — drag anywhere on the arena
  or use WASD/arrow keys to move. Everyone who joins becomes a player (no spectator role); a
  round needs at least 2 players before the admin can start it.
- **Combat (Wizard Battles / Shooters)**: aim is directional, not automatic — whichever way
  you're currently moving/facing is where you cast or fire. Nothing fires on its own: you must
  actively hold down (touch, left-click, or Space) to attack, and each hit consumes one
  charge/ammo from a small limit (`WIZARD_MAX_CHARGES` / `SHOOTER_MAX_AMMO`) before a forced
  recharge/reload pause. Wizard bolts are simulated projectiles (travel + collide each tick);
  Shooters use an instant closest-hit raycast (`raycastHit` in `arenaPhysics.ts`) along the
  facing direction.
- **Walls, bushes & line of sight (Wizard Battles / Shooters)**: `ARENA_WALLS`/`ARENA_BUSHES` in
  `shared/src/index.ts` define a shared map. Walls block movement (axis-separated sliding
  collision — you slide along a wall instead of stopping dead), sight (segment-vs-rectangle
  intersection), and hits (you can't hit — or be auto-considered a valid target behind — a
  wall). Bushes hide whoever's standing in them from anyone who isn't standing in that *same*
  bush — you can always see yourself. This is enforced server-side: each client receives its
  own personalized, visibility-filtered player list (`io.to(socketId).emit(...)` per
  participant, not a single broadcast), so a hidden player can't be found by inspecting
  network traffic either.
- **Character color**: pick from a small preset palette via the swatch button in the lobby
  header. Persisted in `localStorage` and re-sent to the server on every connect (colors are
  tracked in memory only), then shown on your character in every arena game.
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
