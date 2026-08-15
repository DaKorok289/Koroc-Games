import {
  ARENA_MIN_PLAYERS,
  ARENA_MOVE_SPEED,
  ARENA_PLAYER_RADIUS,
  HIDE_SEEK_ROUND_SECONDS,
  HIDE_SEEK_SEEKER_SPEED_BONUS,
  HIDE_SEEK_TAG_RADIUS,
  type HideSeekState,
  type PublicUser,
} from "@koroc/shared";

const COUNTDOWN_SECONDS = 3;
const TICK_MS = 1000 / 30;

interface InternalPlayer {
  socketId: string;
  id: number;
  username: string;
  x: number;
  y: number;
  isSeeker: boolean;
  tagged: boolean;
  dx: number;
  dy: number;
}

type OnUpdate = (state: HideSeekState) => void;
type OnEnd = () => void;

function randomSpawn(): { x: number; y: number } {
  return { x: Math.random() * 0.8 + 0.1, y: Math.random() * 0.8 + 0.1 };
}

export class HideAndSeekGame {
  private players = new Map<string, InternalPlayer>();
  private status: HideSeekState["status"] = "waiting";
  private countdown = COUNTDOWN_SECONDS;
  private timeRemaining = HIDE_SEEK_ROUND_SECONDS;
  private winner: HideSeekState["winner"] = null;
  private countdownHandle: ReturnType<typeof setInterval> | null = null;
  private loopHandle: ReturnType<typeof setInterval> | null = null;
  private lastTick = Date.now();
  private readonly onUpdate: OnUpdate;
  private readonly onEnd: OnEnd;

  constructor(onUpdate: OnUpdate, onEnd: OnEnd) {
    this.onUpdate = onUpdate;
    this.onEnd = onEnd;
  }

  addParticipant(user: PublicUser, socketId: string): void {
    if (!this.players.has(socketId)) {
      const spawn = randomSpawn();
      this.players.set(socketId, {
        socketId,
        id: user.id,
        username: user.username,
        x: spawn.x,
        y: spawn.y,
        isSeeker: false,
        tagged: false,
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
    if (!player || this.status !== "playing" || player.tagged) return;
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
    const socketIds = Array.from(this.players.keys());
    const seekerSocketId = socketIds[Math.floor(Math.random() * socketIds.length)];
    for (const [socketId, player] of this.players) {
      const spawn = randomSpawn();
      player.isSeeker = socketId === seekerSocketId;
      player.tagged = false;
      player.x = spawn.x;
      player.y = spawn.y;
      player.dx = 0;
      player.dy = 0;
    }
    this.timeRemaining = HIDE_SEEK_ROUND_SECONDS;
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

    for (const player of this.players.values()) {
      if (player.tagged) continue;
      const speed = ARENA_MOVE_SPEED * (player.isSeeker ? HIDE_SEEK_SEEKER_SPEED_BONUS : 1);
      player.x = Math.min(1 - ARENA_PLAYER_RADIUS, Math.max(ARENA_PLAYER_RADIUS, player.x + player.dx * speed * dt));
      player.y = Math.min(1 - ARENA_PLAYER_RADIUS, Math.max(ARENA_PLAYER_RADIUS, player.y + player.dy * speed * dt));
    }

    const seeker = Array.from(this.players.values()).find((p) => p.isSeeker);
    if (seeker) {
      for (const player of this.players.values()) {
        if (player.isSeeker || player.tagged) continue;
        const dist = Math.hypot(player.x - seeker.x, player.y - seeker.y);
        if (dist <= HIDE_SEEK_TAG_RADIUS) {
          player.tagged = true;
        }
      }
    }

    this.timeRemaining -= dt;
    const allTagged = Array.from(this.players.values()).every((p) => p.isSeeker || p.tagged);

    if (this.timeRemaining <= 0 || allTagged) {
      this.status = "finished";
      this.winner = allTagged ? "seeker" : "hiders";
      this.timeRemaining = 0;
      this.stopLoop();
      this.onUpdate(this.getState());
      setTimeout(() => this.onEnd(), 5000);
      return;
    }

    this.onUpdate(this.getState());
  }

  getState(): HideSeekState {
    return {
      status: this.status,
      countdown: this.countdown,
      timeRemaining: Math.ceil(this.timeRemaining),
      roundSeconds: HIDE_SEEK_ROUND_SECONDS,
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        username: p.username,
        x: p.x,
        y: p.y,
        isSeeker: p.isSeeker,
        tagged: p.tagged,
      })),
      winner: this.winner,
    };
  }

  destroy(): void {
    this.stopLoop();
    this.stopCountdown();
  }
}
