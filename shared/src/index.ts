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
    description: "One seeker, everyone else hides. Coming soon.",
    implemented: false,
  },
  "wizard-battles": {
    label: "Wizard Battles",
    description: "Cast spells, dodge, last wizard standing. Coming soon.",
    implemented: false,
  },
  shooters: {
    label: "Shooters",
    description: "Fast-paced arena shooter. Coming soon.",
    implemented: false,
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

// Normalized playfield: width 1, height 1, paddle height fraction, etc.
export const PONG_PADDLE_HEIGHT = 0.22;
export const PONG_PADDLE_SPEED = 1.6; // fraction of field height per second (client-predicted, server-authoritative)

// ---- Socket event name constants (avoid typos across client/server) ----

export const SOCKET_EVENTS = {
  LOBBY_STATE: "lobby:state",
  ADMIN_START_EVENT: "admin:startEvent",
  ADMIN_END_EVENT: "admin:endEvent",
  EVENT_STARTED: "event:started",
  EVENT_ENDED: "event:ended",
  GAME_JOIN: "game:join",
  GAME_LEAVE: "game:leave",
  PONG_INPUT: "pong:input",
  PONG_STATE: "pong:state",
  ERROR: "server:error",
} as const;
