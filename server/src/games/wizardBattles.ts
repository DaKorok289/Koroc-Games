import {
  ARENA_MIN_PLAYERS,
  ARENA_MOVE_SPEED,
  ARENA_PLAYER_RADIUS,
  WIZARD_BOLT_DAMAGE,
  WIZARD_BOLT_SPEED,
  WIZARD_CAST_COOLDOWN_MS,
  WIZARD_CAST_RANGE,
  WIZARD_HP_START,
  type PublicUser,
  type WizardBattleState,
  type WizardBolt,
} from "@koroc/shared";

const COUNTDOWN_SECONDS = 3;
const TICK_MS = 1000 / 30;

interface InternalPlayer {
  socketId: string;
  id: number;
  username: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  dx: number;
  dy: number;
  lastCastAt: number;
}

type OnUpdate = (state: WizardBattleState) => void;
type OnEnd = () => void;

function randomSpawn(): { x: number; y: number } {
  return { x: Math.random() * 0.8 + 0.1, y: Math.random() * 0.8 + 0.1 };
}

export class WizardBattleGame {
  private players = new Map<string, InternalPlayer>();
  private bolts: WizardBolt[] = [];
  private boltCounter = 0;
  private status: WizardBattleState["status"] = "waiting";
  private countdown = COUNTDOWN_SECONDS;
  private winner: WizardBattleState["winner"] = null;
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
        hp: WIZARD_HP_START,
        alive: true,
        dx: 0,
        dy: 0,
        lastCastAt: 0,
      });
    }
    this.maybeStart();
    this.onUpdate(this.getState());
  }

  removeParticipant(socketId: string): void {
    this.players.delete(socketId);
    if ((this.status === "playing" || this.status === "countdown") && this.players.size < ARENA_MIN_PLAYERS) {
      this.stopLoop();
      this.stopCountdown();
      this.status = "waiting";
      this.winner = null;
      this.bolts = [];
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

  private maybeStart(): void {
    if (this.status === "waiting" && this.players.size >= ARENA_MIN_PLAYERS) {
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
    }
  }

  private beginRound(): void {
    for (const player of this.players.values()) {
      const spawn = randomSpawn();
      player.hp = WIZARD_HP_START;
      player.alive = true;
      player.x = spawn.x;
      player.y = spawn.y;
      player.dx = 0;
      player.dy = 0;
      player.lastCastAt = 0;
    }
    this.bolts = [];
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
      if (!player.alive) continue;
      player.x = Math.min(1 - ARENA_PLAYER_RADIUS, Math.max(ARENA_PLAYER_RADIUS, player.x + player.dx * ARENA_MOVE_SPEED * dt));
      player.y = Math.min(1 - ARENA_PLAYER_RADIUS, Math.max(ARENA_PLAYER_RADIUS, player.y + player.dy * ARENA_MOVE_SPEED * dt));
    }

    const alivePlayers = Array.from(this.players.values()).filter((p) => p.alive);
    for (const player of alivePlayers) {
      if (now - player.lastCastAt < WIZARD_CAST_COOLDOWN_MS) continue;
      let nearest: InternalPlayer | null = null;
      let nearestDist = Infinity;
      for (const other of alivePlayers) {
        if (other === player) continue;
        const dist = Math.hypot(other.x - player.x, other.y - player.y);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = other;
        }
      }
      if (nearest && nearestDist <= WIZARD_CAST_RANGE) {
        player.lastCastAt = now;
        const bdx = nearest.x - player.x;
        const bdy = nearest.y - player.y;
        const len = Math.hypot(bdx, bdy) || 1;
        this.boltCounter += 1;
        this.bolts.push({
          id: this.boltCounter,
          x: player.x,
          y: player.y,
          vx: (bdx / len) * WIZARD_BOLT_SPEED,
          vy: (bdy / len) * WIZARD_BOLT_SPEED,
          ownerId: player.id,
        });
      }
    }

    const survivingBolts: WizardBolt[] = [];
    for (const bolt of this.bolts) {
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      if (bolt.x < 0 || bolt.x > 1 || bolt.y < 0 || bolt.y > 1) continue;

      let hit = false;
      for (const player of this.players.values()) {
        if (!player.alive || player.id === bolt.ownerId) continue;
        const dist = Math.hypot(player.x - bolt.x, player.y - bolt.y);
        if (dist <= ARENA_PLAYER_RADIUS) {
          player.hp -= WIZARD_BOLT_DAMAGE;
          if (player.hp <= 0) {
            player.hp = 0;
            player.alive = false;
          }
          hit = true;
          break;
        }
      }
      if (!hit) survivingBolts.push(bolt);
    }
    this.bolts = survivingBolts;

    const survivors = Array.from(this.players.values()).filter((p) => p.alive);
    if (survivors.length <= 1 && this.players.size >= ARENA_MIN_PLAYERS) {
      this.status = "finished";
      this.winner = survivors.length === 1 ? { id: survivors[0].id, username: survivors[0].username } : null;
      this.stopLoop();
      this.onUpdate(this.getState());
      setTimeout(() => this.onEnd(), 5000);
      return;
    }

    this.onUpdate(this.getState());
  }

  getState(): WizardBattleState {
    return {
      status: this.status,
      countdown: this.countdown,
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        username: p.username,
        x: p.x,
        y: p.y,
        hp: p.hp,
        alive: p.alive,
      })),
      bolts: this.bolts,
      winner: this.winner,
    };
  }

  destroy(): void {
    this.stopLoop();
    this.stopCountdown();
  }
}
