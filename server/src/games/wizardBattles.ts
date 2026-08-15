import type { Server } from "socket.io";
import {
  ARENA_MIN_PLAYERS,
  ARENA_MOVE_SPEED,
  ARENA_PLAYER_RADIUS,
  WIZARD_BOLT_DAMAGE,
  WIZARD_BOLT_SPEED,
  WIZARD_CAST_COOLDOWN_MS,
  WIZARD_HP_START,
  WIZARD_MAX_CHARGES,
  WIZARD_RECHARGE_MS,
  type PublicUser,
  type WizardBattleState,
  type WizardBolt,
} from "@koroc/shared";
import { bushAt, hasLineOfSight, isVisible, resolveWallCollision } from "./arenaPhysics";

const COUNTDOWN_SECONDS = 3;
const TICK_MS = 1000 / 30;

interface InternalPlayer {
  socketId: string;
  id: number;
  username: string;
  color: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  dx: number;
  dy: number;
  facingDx: number;
  facingDy: number;
  firing: boolean;
  lastCastAt: number;
  charges: number;
  reloading: boolean;
  reloadEndsAt: number;
}

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
  private readonly io: Server;
  private readonly event: string;
  private readonly onEnd: OnEnd;

  constructor(io: Server, event: string, onEnd: OnEnd) {
    this.io = io;
    this.event = event;
    this.onEnd = onEnd;
  }

  addParticipant(user: PublicUser, socketId: string, color: string): void {
    if (!this.players.has(socketId)) {
      const spawn = randomSpawn();
      this.players.set(socketId, {
        socketId,
        id: user.id,
        username: user.username,
        color,
        x: spawn.x,
        y: spawn.y,
        hp: WIZARD_HP_START,
        alive: true,
        dx: 0,
        dy: 0,
        facingDx: 1,
        facingDy: 0,
        firing: false,
        lastCastAt: 0,
        charges: WIZARD_MAX_CHARGES,
        reloading: false,
        reloadEndsAt: 0,
      });
    }
    this.broadcast();
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
    this.broadcast();
  }

  handleInput(socketId: string, dx: number, dy: number): void {
    const player = this.players.get(socketId);
    if (!player || this.status !== "playing" || !player.alive) return;
    const len = Math.hypot(dx, dy) || 1;
    player.dx = len > 1 ? dx / len : dx;
    player.dy = len > 1 ? dy / len : dy;
    if (dx !== 0 || dy !== 0) {
      player.facingDx = player.dx;
      player.facingDy = player.dy;
    }
  }

  /** Tap/hold to cast toward wherever you're currently facing — aim is directional, not automatic. */
  setFiring(socketId: string, firing: boolean): void {
    const player = this.players.get(socketId);
    if (!player) return;
    player.firing = firing;
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
      this.broadcast();
    }, 1000);
    return true;
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
      player.facingDx = 1;
      player.facingDy = 0;
      player.firing = false;
      player.lastCastAt = 0;
      player.charges = WIZARD_MAX_CHARGES;
      player.reloading = false;
      player.reloadEndsAt = 0;
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
      const targetX = player.x + player.dx * ARENA_MOVE_SPEED * dt;
      const targetY = player.y + player.dy * ARENA_MOVE_SPEED * dt;
      const resolved = resolveWallCollision(player.x, player.y, targetX, targetY, ARENA_PLAYER_RADIUS);
      player.x = Math.min(1 - ARENA_PLAYER_RADIUS, Math.max(ARENA_PLAYER_RADIUS, resolved.x));
      player.y = Math.min(1 - ARENA_PLAYER_RADIUS, Math.max(ARENA_PLAYER_RADIUS, resolved.y));

      if (player.reloading && now >= player.reloadEndsAt) {
        player.reloading = false;
        player.charges = WIZARD_MAX_CHARGES;
      }
    }

    // Casts toward the player's current facing direction, only while actively holding
    // (tap/click), with limited charges before a recharge pause.
    for (const player of this.players.values()) {
      if (!player.alive || !player.firing || player.reloading) continue;
      if (now - player.lastCastAt < WIZARD_CAST_COOLDOWN_MS) continue;
      player.lastCastAt = now;
      player.charges -= 1;
      this.boltCounter += 1;
      this.bolts.push({
        id: this.boltCounter,
        x: player.x,
        y: player.y,
        vx: player.facingDx * WIZARD_BOLT_SPEED,
        vy: player.facingDy * WIZARD_BOLT_SPEED,
        ownerId: player.id,
      });
      if (player.charges <= 0) {
        player.reloading = true;
        player.reloadEndsAt = now + WIZARD_RECHARGE_MS;
      }
    }

    const survivingBolts: WizardBolt[] = [];
    for (const bolt of this.bolts) {
      const prevX = bolt.x;
      const prevY = bolt.y;
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      if (bolt.x < 0 || bolt.x > 1 || bolt.y < 0 || bolt.y > 1) continue;
      if (!hasLineOfSight(prevX, prevY, bolt.x, bolt.y)) continue; // blocked by a wall

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
      this.broadcast();
      setTimeout(() => this.onEnd(), 5000);
      return;
    }

    this.broadcast();
  }

  private getStateFor(viewerId: number): WizardBattleState {
    const viewer = Array.from(this.players.values()).find((p) => p.id === viewerId);
    return {
      status: this.status,
      countdown: this.countdown,
      players: Array.from(this.players.values())
        .filter((p) => !viewer || isVisible(viewer, p))
        .map((p) => ({
          id: p.id,
          username: p.username,
          color: p.color,
          x: p.x,
          y: p.y,
          hp: p.hp,
          alive: p.alive,
          inBush: !!bushAt(p.x, p.y),
          charges: p.charges,
          reloading: p.reloading,
        })),
      bolts: this.bolts,
      winner: this.winner,
    };
  }

  /** Emits each participant their own personalized (visibility-filtered) view. */
  private broadcast(): void {
    for (const player of this.players.values()) {
      this.io.to(player.socketId).emit(this.event, this.getStateFor(player.id));
    }
  }

  destroy(): void {
    this.stopLoop();
    this.stopCountdown();
  }
}
