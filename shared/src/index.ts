// Types and constants shared between the server and client.

export type GameType =
  | "ping-pong"
  | "hide-and-seek"
  | "wizard-battles"
  | "shooters"
  | "four-corners"
  | "hide-and-seek-maze";

export const GAME_TYPES: GameType[] = [
  "ping-pong",
  "hide-and-seek",
  "wizard-battles",
  "shooters",
  "four-corners",
  "hide-and-seek-maze",
];

export const GAME_INFO: Record<GameType, { label: string; description: string; implemented: boolean }> = {
  "ping-pong": {
    label: "Ping Pong",
    description: "Classic 2-player paddle battle. First to 7 wins.",
    implemented: true,
  },
  "hide-and-seek": {
    label: "Tag",
    description: "Tag passes to whoever's touched. Whoever's it when the 3-minute clock runs out loses.",
    implemented: true,
  },
  "wizard-battles": {
    label: "Wizard Battles",
    description: "Auto-casting spells, dodge and outmaneuver. Last wizard standing wins.",
    implemented: true,
  },
  shooters: {
    label: "Shooters",
    description: "Fast-paced arena shooter with respawns. First to 5 kills wins.",
    implemented: true,
  },
  "four-corners": {
    label: "4 Corners",
    description: "A corner is called every 10 seconds — anyone caught there is out. Last one standing wins.",
    implemented: true,
  },
  "hide-and-seek-maze": {
    label: "Hide & Seek",
    description:
      "One seeker, a maze of walls. Get found and you become the new seeker — teleported to the center to start the hunt over. Whoever's seeking when the 3-minute clock runs out loses.",
    implemented: true,
  },
};

export interface PublicUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

export interface LobbyState {
  users: PublicUser[];
  events: ActiveEvent[];
}

export interface LeaderboardEntry {
  userId: number;
  username: string;
  wins: number;
}

export interface ActiveEvent {
  id: string;
  gameType: GameType;
  startedBy: string;
  playerCount: number;
}

// ---- Pong ----

export type PongSide = "left" | "right";

export type PongStatus = "waiting" | "countdown" | "playing" | "finished";

export interface PongState {
  status: PongStatus;
  countdown: number;
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { left: number; right: number };
  score: { left: number; right: number };
  players: { left: PublicUser | null; right: PublicUser | null };
  spectators: number;
  winner: PongSide | null;
}

export const PONG_WIN_SCORE = 7;

// ---- Ping Pong tournament bracket ----

export interface PongBracketMatch {
  id: string;
  round: number;
  slot: number;
  player1: PublicUser | null;
  player2: PublicUser | null;
  winner: PublicUser | null;
  score1: number;
  score2: number;
}

export type PongTournamentPhase = "registration" | "bracket" | "finished";

export interface PongTournamentState {
  phase: PongTournamentPhase;
  roster: PublicUser[];
  rounds: PongBracketMatch[][];
  currentMatchId: string | null;
  live: PongState | null;
  champion: PublicUser | null;
}

// Normalized playfield: width 1, height 1, paddle height fraction, etc.
export const PONG_PADDLE_HEIGHT = 0.22;
export const PONG_PADDLE_SPEED = 1.6; // fraction of field height per second (client-predicted, server-authoritative)

// ---- Arena games (Hide & Seek, Wizard Battles, Shooters) ----
// All three share a normalized 0..1 x 0..1 field and the same movement model:
// clients send a normalized direction vector, the server integrates position at a
// fixed speed each tick and clamps to the field bounds.

export type ArenaStatus = "waiting" | "countdown" | "playing" | "finished";

export const ARENA_PLAYER_RADIUS = 0.03;
export const ARENA_MOVE_SPEED = 0.35; // field fraction per second
export const ARENA_MIN_PLAYERS = 2;

export interface ArenaRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Shared map layout for Wizard Battles and Shooters: walls block movement, sight, and
// combat; bushes hide whoever's standing in them from anyone not also standing in that
// same bush. Hide & Seek uses the open arena (no walls/bushes) — a seeker with an
// obstructed view would need real raycasting-driven hide spots to feel fair, out of
// scope for now.
export const ARENA_WALLS: ArenaRect[] = [
  { x: 0.15, y: 0.42, w: 0.2, h: 0.07 },
  { x: 0.65, y: 0.42, w: 0.2, h: 0.07 },
  { x: 0.42, y: 0.15, w: 0.07, h: 0.22 },
  { x: 0.42, y: 0.63, w: 0.07, h: 0.22 },
];

// Flush with the arena edges (not inset) so a player clamped into the very corner —
// which is a reachable resting position, since ARENA_PLAYER_RADIUS keeps their center
// just off the true 0/1 boundary — still lands inside the bush zone.
export const ARENA_BUSHES: ArenaRect[] = [
  { x: 0, y: 0, w: 0.19, h: 0.19 },
  { x: 0.81, y: 0, w: 0.19, h: 0.19 },
  { x: 0, y: 0.81, w: 0.19, h: 0.19 },
  { x: 0.81, y: 0.81, w: 0.19, h: 0.19 },
];

// Player customization: a small preset palette (not a free color picker) so we never
// need to sanitize arbitrary strings — the server just validates against this list.
export const PLAYER_COLOR_PRESETS = [
  "#ff6b6b", // red
  "#ffa94d", // orange
  "#ffd166", // yellow
  "#5ce87a", // green
  "#4dd4d4", // teal
  "#7ce0ff", // cyan
  "#7c9bff", // blue
  "#b48bff", // purple
  "#ff8bcf", // pink
  "#f2f3ff", // white
] as const;

export function defaultColorForUser(userId: number): string {
  return PLAYER_COLOR_PRESETS[userId % PLAYER_COLOR_PRESETS.length];
}

// ---- Cosmetic shop ----

export const COINS_PER_WIN = 10;

export interface ShopColor {
  id: string;
  color: string;
  label: string;
  price: number;
}

// Purchasable colors — distinct from the free PLAYER_COLOR_PRESETS above. Validated the
// same way server-side: never trust an arbitrary color string, only these ids/hexes.
export const SHOP_COLORS: ShopColor[] = [
  { id: "gold", color: "#ffd700", label: "Gold", price: 30 },
  { id: "neon-green", color: "#39ff14", label: "Neon Green", price: 30 },
  { id: "hot-pink", color: "#ff1493", label: "Hot Pink", price: 40 },
  { id: "electric-blue", color: "#00e5ff", label: "Electric Blue", price: 40 },
  { id: "royal-purple", color: "#9400d3", label: "Royal Purple", price: 50 },
  { id: "crimson", color: "#dc143c", label: "Crimson", price: 50 },
];

export interface ShopState {
  coins: number;
  owned: string[]; // ShopColor ids this user has purchased
}

// -- Tag --
// One player starts "it"; tagging someone passes it to them (with brief immunity for
// the player who just stopped being it, so it can't be instantly passed straight back).
// Obstacles block movement. Whoever is it when the clock runs out loses.

export interface HideSeekPlayer {
  id: number;
  username: string;
  x: number;
  y: number;
  isIt: boolean;
  color: string;
}

export interface HideSeekState {
  status: ArenaStatus;
  countdown: number;
  timeRemaining: number;
  roundSeconds: number;
  players: HideSeekPlayer[];
  loser: ArenaWinner | null;
}

export const HIDE_SEEK_ROUND_SECONDS = 180; // 3 minutes
export const HIDE_SEEK_TAG_RADIUS = 0.045;
export const HIDE_SEEK_IT_SPEED_BONUS = 1.15; // "it" moves slightly faster
export const HIDE_SEEK_TAG_IMMUNITY_MS = 1500; // can't be immediately tagged back

// -- Wizard Battles --

export interface WizardPlayer {
  id: number;
  username: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  inBush: boolean;
  color: string;
  charges: number;
  reloading: boolean;
}

export interface WizardBolt {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: number;
}

export interface ArenaWinner {
  id: number;
  username: string;
}

export interface WizardBattleState {
  status: ArenaStatus;
  countdown: number;
  players: WizardPlayer[];
  bolts: WizardBolt[];
  winner: ArenaWinner | null;
}

export const WIZARD_HP_START = 100;
export const WIZARD_BOLT_DAMAGE = 20;
export const WIZARD_BOLT_SPEED = 0.5; // field fraction per second
export const WIZARD_CAST_COOLDOWN_MS = 350; // minimum time between individual casts
export const WIZARD_MAX_CHARGES = 3;
export const WIZARD_RECHARGE_MS = 1800; // full recharge once charges hit 0

// -- Shooters --

export interface ShooterPlayer {
  id: number;
  username: string;
  x: number;
  y: number;
  hp: number;
  kills: number;
  alive: boolean;
  inBush: boolean;
  color: string;
  ammo: number;
  reloading: boolean;
}

export interface ShooterTracer {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface ShooterState {
  status: ArenaStatus;
  countdown: number;
  players: ShooterPlayer[];
  tracers: ShooterTracer[];
  winner: ArenaWinner | null;
  killTarget: number;
}

export const SHOOTER_HP_START = 100;
export const SHOOTER_SHOT_DAMAGE = 34;
export const SHOOTER_FIRE_COOLDOWN_MS = 500; // minimum time between individual shots
export const SHOOTER_FIRE_RANGE = 0.55;
export const SHOOTER_RESPAWN_MS = 2500;
export const SHOOTER_KILL_TARGET = 5;
export const SHOOTER_MAX_AMMO = 6;
export const SHOOTER_RELOAD_MS = 1500; // full reload once ammo hits 0
export const SHOOTER_HIT_RADIUS_BONUS = 0.015; // forgiveness added to ARENA_PLAYER_RADIUS for hitscan

// -- 4 Corners --
// Every FOUR_CORNERS_CALL_INTERVAL_MS, the server randomly calls one of the 4 corner
// zones — anyone standing inside it at that instant is eliminated. Last player left
// standing wins (if the final call eliminates everyone still alive at once, no one wins).

export interface FourCornersPlayer {
  id: number;
  username: string;
  x: number;
  y: number;
  color: string;
  alive: boolean;
}

export interface FourCornersState {
  status: ArenaStatus;
  countdown: number;
  players: FourCornersPlayer[];
  calledCorner: number | null; // index into FOUR_CORNERS_ZONES, most recently called
  nextCallMs: number; // ms remaining until the next call, for a countdown display
  winner: ArenaWinner | null;
}

export const FOUR_CORNERS_CALL_INTERVAL_MS = 10000;

export const FOUR_CORNERS_ZONES: ArenaRect[] = [
  { x: 0, y: 0, w: 0.25, h: 0.25 },
  { x: 0.75, y: 0, w: 0.25, h: 0.25 },
  { x: 0, y: 0.75, w: 0.25, h: 0.25 },
  { x: 0.75, y: 0.75, w: 0.25, h: 0.25 },
];

// -- Hide & Seek (maze) --
// A distinct, much denser obstacle layout from ARENA_WALLS, used only by this game.
// Tag mechanics match Tag (`hide-and-seek`): touching whoever's seeking passes it to
// you — except here, becoming the new seeker also teleports you to the center of the
// map, so you have to re-navigate the maze from scratch each time. Reuses HideSeekPlayer
// / HideSeekState from Tag since the shape is identical; only the wall layout and the
// teleport-on-transfer behavior (server-side) differ.
export const HIDE_SEEK_MAZE_WALLS: ArenaRect[] = [
  { x: 0.0, y: 0.24, w: 0.22, h: 0.035 },
  { x: 0.3, y: 0.24, w: 0.22, h: 0.035 },
  { x: 0.6, y: 0.24, w: 0.22, h: 0.035 },
  { x: 0.86, y: 0.24, w: 0.14, h: 0.035 },

  { x: 0.0, y: 0.48, w: 0.14, h: 0.035 },
  { x: 0.22, y: 0.48, w: 0.22, h: 0.035 },
  { x: 0.6, y: 0.48, w: 0.22, h: 0.035 },
  { x: 0.86, y: 0.48, w: 0.14, h: 0.035 },

  { x: 0.08, y: 0.72, w: 0.22, h: 0.035 },
  { x: 0.38, y: 0.72, w: 0.22, h: 0.035 },
  { x: 0.68, y: 0.72, w: 0.24, h: 0.035 },

  { x: 0.2, y: 0.0, w: 0.035, h: 0.2 },
  { x: 0.46, y: 0.06, w: 0.035, h: 0.16 },
  { x: 0.68, y: 0.0, w: 0.035, h: 0.2 },

  { x: 0.14, y: 0.3, w: 0.035, h: 0.2 },
  { x: 0.34, y: 0.55, w: 0.035, h: 0.2 },
  { x: 0.58, y: 0.3, w: 0.035, h: 0.2 },
  { x: 0.8, y: 0.55, w: 0.035, h: 0.2 },

  { x: 0.26, y: 0.8, w: 0.035, h: 0.2 },
  { x: 0.5, y: 0.76, w: 0.035, h: 0.24 },
  { x: 0.72, y: 0.8, w: 0.035, h: 0.2 },
];

export const HIDE_SEEK_MAZE_CENTER = { x: 0.5, y: 0.5 };

// ---- Socket event name constants (avoid typos across client/server) ----

export const SOCKET_EVENTS = {
  LOBBY_STATE: "lobby:state",
  ADMIN_START_EVENT: "admin:startEvent",
  ADMIN_END_EVENT: "admin:endEvent",
  ADMIN_START_MATCH: "admin:startMatch",
  EVENT_STARTED: "event:started",
  EVENT_ENDED: "event:ended",
  GAME_JOIN: "game:join",
  GAME_LEAVE: "game:leave",
  PONG_INPUT: "pong:input",
  PONG_STATE: "pong:state",
  PONG_TOURNAMENT_STATE: "pong:tournamentState",
  ARENA_INPUT: "arena:input",
  ARENA_FIRE: "arena:fire",
  ARENA_AIM: "arena:aim",
  SET_COLOR: "player:setColor",
  SHOP_STATE: "shop:state",
  PURCHASE_COSMETIC: "shop:purchase",
  HIDE_SEEK_STATE: "hideSeek:state",
  WIZARD_STATE: "wizard:state",
  SHOOTER_STATE: "shooter:state",
  FOUR_CORNERS_STATE: "fourCorners:state",
  MAZE_HIDE_SEEK_STATE: "mazeHideSeek:state",
  LEADERBOARD_STATE: "leaderboard:state",
  ERROR: "server:error",
} as const;
