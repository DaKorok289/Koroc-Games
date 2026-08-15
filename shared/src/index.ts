// Types and constants shared between the server and client.

export type GameType = "ping-pong" | "hide-and-seek" | "wizard-battles" | "shooters";

export const GAME_TYPES: GameType[] = ["ping-pong", "hide-and-seek", "wizard-battles", "shooters"];

export const GAME_INFO: Record<GameType, { label: string; description: string; implemented: boolean }> = {
  "ping-pong": {
    label: "Ping Pong",
    description: "Classic 2-player paddle battle. First to 7 wins.",
    implemented: true,
  },
  "hide-and-seek": {
    label: "Hide & Seek",
    description: "One seeker, everyone else hides. Survive the clock to win.",
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
};

export interface PublicUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

export interface LobbyState {
  users: PublicUser[];
  activeEvent: ActiveEvent | null;
}

export interface ActiveEvent {
  id: string;
  gameType: GameType;
  startedBy: string;
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

// -- Hide & Seek --

export interface HideSeekPlayer {
  id: number;
  username: string;
  x: number;
  y: number;
  isSeeker: boolean;
  tagged: boolean;
}

export interface HideSeekState {
  status: ArenaStatus;
  countdown: number;
  timeRemaining: number;
  roundSeconds: number;
  players: HideSeekPlayer[];
  winner: "seeker" | "hiders" | null;
}

export const HIDE_SEEK_ROUND_SECONDS = 45;
export const HIDE_SEEK_TAG_RADIUS = 0.045;
export const HIDE_SEEK_SEEKER_SPEED_BONUS = 1.15; // seeker moves slightly faster

// -- Wizard Battles --

export interface WizardPlayer {
  id: number;
  username: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  inBush: boolean;
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
export const WIZARD_CAST_COOLDOWN_MS = 900;
export const WIZARD_CAST_RANGE = 0.7; // won't auto-cast at targets farther than this

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
export const SHOOTER_FIRE_COOLDOWN_MS = 450;
export const SHOOTER_FIRE_RANGE = 0.55;
export const SHOOTER_RESPAWN_MS = 2500;
export const SHOOTER_KILL_TARGET = 5;

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
  HIDE_SEEK_STATE: "hideSeek:state",
  WIZARD_STATE: "wizard:state",
  SHOOTER_STATE: "shooter:state",
  ERROR: "server:error",
} as const;
