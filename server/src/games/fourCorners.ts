import {
  ARENA_MIN_PLAYERS,
  ARENA_MOVE_SPEED,
  ARENA_PLAYER_RADIUS,
  FOUR_CORNERS_CALL_INTERVAL_MS,
  FOUR_CORNERS_ZONES,
  type ArenaWinner,
  type FourCornersState,
  type PublicUser,
} from "@koroc/shared";

const COUNTDOWN_SECONDS = 3;
const TICK_MS = 1000 / 30;
const CALL_FLASH_MS = 1500; // how long calledCorner stays non-null so the client can flash it

interface InternalPlayer {
  socketId: string;
  id: number;
  username: string;
  color: string;
  x: number;
  y: number;
  alive: boolean;
  dx: number;
  dy: number;
}

type OnUpdate = (state: FourCornersState) => void;
type OnEnd = () => void;

function randomOpenSpawn(): { x: number; y: number } {
  return { x: Math.random() * 0.8 + 0.1, y: Math.random() * 0.8 + 0.1 };
}

/** Open arena, no walls: every FOUR_CORNERS_CALL_INTERVAL_MS a corner is called and
 * anyone standing in it is eliminated. Last player left standing wins. */
export class FourCornersGame {
  private players = new Map<string, InternalPlayer>();
  private status: FourCornersState["status"] = "waiting";
  private countdown = COUNTDOWN_SECONDS;
  private msUntilCall = FOUR_CORNERS_CALL_INTERVAL_MS;
  private calledCorner: number | null = null;
  private calledFlashUntil = 0;
  private winner: ArenaWinner | null = null;
  private countdownHandle: ReturnType<typeof setInterval> | null = null;
  private loopHandle: ReturnType<typeof setInterval> | null = null;
  private lastTick = Date.now();
  private readonly onUpdate: OnUpdate;
  private readonly onEnd: OnEnd;

  constructor(onUpdate: OnUpdate, onEnd: OnEnd) {
    this.onUpdate = onUpdate;
    this.onEnd = onEnd;
  }

  addParticipant(user: PublicUser, socketId: string, color: string): void {
    if (!this.players.has(socketId)) {
      const spawn = randomOpenSpawn();
      this.players.set(socketId, {
        socketId,
        id: user.id,
        username: user.username,
        color,
        x: spawn.x,
        y: spawn.y,
        alive: true,
        dx: 0,
        dy: 0,
      });
    }
    this.onUpdate(this.getState());
  }

  removeParticipant(socketId: string): void {
    this.players.delete(socketId);
    if ((this.status === "playing" || this.status === "countdown") && this.players.size < ARENA_MIN_PLAYERS) {
      this.stopLoop();
      this.stopCountdown();
      this.status = "waiting";
      this.winner = null;
    }
    this.onUpdate(this.getState());
  }

  handleInput(socketId: string, dx: number, dy: number): void {
    const player = this.players.get(socketId);
    if (!player || this.status !== "playing" || !player.alive) return;
    const len = Math.hypot(dx, dy) || 1;
    player.dx = len > 1 ? dx / len : dx;
    player.dy = len > 1 ? dy / len : dy;
  }

  /** Admin-triggered: begins the countdown once enough players have joined. */
  requestStart(): boolean {
    if (this.status !== "waiting" || this.players.size < ARENA_MIN_PLAYERS) return false;
    this.status = "countdown";
    this.countdown = COUNTDOWN_SECONDS;
    this.stopCountdown();
    this.countdownHandle = setInterval(() => {
      this.countdown -= 1;
      if (this.countdown <= 0) {
        this.stopCountdown();
        this.beginRound();
      }
      this.onUpdate(this.getState());
    }, 1000);
    return true;
  }

  private beginRound(): void {
    for (const player of this.players.values()) {
      const spawn = randomOpenSpawn();
      player.alive = true;
      player.x = spawn.x;
      player.y = spawn.y;
      player.dx = 0;
      player.dy = 0;
    }
    this.calledCorner = null;
    this.msUntilCall = FOUR_CORNERS_CALL_INTERVAL_MS;
    this.winner = null;
    this.status = "playing";
    this.startLoop();
  }

  private startLoop(): void {
    if (this.loopHandle) return;
    this.lastTick = Date.now();
    this.loopHandle = setInterval(() => this.tick(), TICK_MS);
  }

  private stopLoop(): void {
    if (this.loopHandle) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
  }

  private stopCountdown(): void {
    if (this.countdownHandle) {
      clearInterval(this.countdownHandle);
      this.countdownHandle = null;
    }
  }

  private tick(): void {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    if (this.status !== "playing") return;

    if (this.calledCorner !== null && now > this.calledFlashUntil) {
      this.calledCorner = null;
    }

    for (const player of this.players.values()) {
      if (!player.alive) continue;
      const targetX = player.x + player.dx * ARENA_MOVE_SPEED * dt;
      const targetY = player.y + player.dy * ARENA_MOVE_SPEED * dt;
      player.x = Math.min(1 - ARENA_PLAYER_RADIUS, Math.max(ARENA_PLAYER_RADIUS, targetX));
      player.y = Math.min(1 - ARENA_PLAYER_RADIUS, Math.max(ARENA_PLAYER_RADIUS, targetY));
    }

    this.msUntilCall -= dt * 1000;
    if (this.msUntilCall <= 0) {
      this.callCorner(now);
      this.msUntilCall = FOUR_CORNERS_CALL_INTERVAL_MS;
    }

    if (this.status === "playing") this.onUpdate(this.getState());
  }

  private callCorner(now: number): void {
    const idx = Math.floor(Math.random() * FOUR_CORNERS_ZONES.length);
    this.calledCorner = idx;
    this.calledFlashUntil = now + CALL_FLASH_MS;
    const zone = FOUR_CORNERS_ZONES[idx];
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      if (player.x >= zone.x && player.x <= zone.x + zone.w && player.y >= zone.y && player.y <= zone.y + zone.h) {
        player.alive = false;
      }
    }

    const survivors = Array.from(this.players.values()).filter((p) => p.alive);
    if (survivors.length <= 1) {
      this.status = "finished";
      this.winner = survivors.length === 1 ? { id: survivors[0].id, username: survivors[0].username } : null;
      this.stopLoop();
      this.onUpdate(this.getState());
      setTimeout(() => this.onEnd(), 5000);
    }
  }

  getState(): FourCornersState {
    return {
      status: this.status,
      countdown: this.countdown,
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        username: p.username,
        color: p.color,
        x: p.x,
        y: p.y,
        alive: p.alive,
      })),
      calledCorner: this.calledCorner,
      nextCallMs: Math.max(0, Math.ceil(this.msUntilCall)),
      winner: this.winner,
    };
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  getWinnerUserIds(): number[] {
    return this.winner ? [this.winner.id] : [];
  }

  destroy(): void {
    this.stopLoop();
    this.stopCountdown();
  }
}
