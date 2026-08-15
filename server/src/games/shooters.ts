import type { Server } from "socket.io";
import {
  ARENA_MIN_PLAYERS,
  ARENA_MOVE_SPEED,
  ARENA_PLAYER_RADIUS,
  SHOOTER_FIRE_COOLDOWN_MS,
  SHOOTER_FIRE_RANGE,
  SHOOTER_HIT_RADIUS_BONUS,
  SHOOTER_HP_START,
  SHOOTER_KILL_TARGET,
  SHOOTER_MAX_AMMO,
  SHOOTER_RELOAD_MS,
  SHOOTER_RESPAWN_MS,
  SHOOTER_SHOT_DAMAGE,
  type PublicUser,
  type ShooterState,
  type ShooterTracer,
} from "@koroc/shared";
import { bushAt, isVisible, raycastHit, resolveWallCollision } from "./arenaPhysics";

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
  kills: number;
  alive: boolean;
  dx: number;
  dy: number;
  facingDx: number;
  facingDy: number;
  firing: boolean;
  lastFiredAt: number;
  respawnAt: number;
  ammo: number;
  reloading: boolean;
  reloadEndsAt: number;
}

type OnEnd = () => void;

function randomSpawn(): { x: number; y: number } {
  return { x: Math.random() * 0.8 + 0.1, y: Math.random() * 0.8 + 0.1 };
}

export class ShooterGame {
  private players = new Map<string, InternalPlayer>();
  private tracers: ShooterTracer[] = [];
  private status: ShooterState["status"] = "waiting";
  private countdown = COUNTDOWN_SECONDS;
  private winner: ShooterState["winner"] = null;
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
        hp: SHOOTER_HP_START,
        kills: 0,
        alive: true,
        dx: 0,
        dy: 0,
        facingDx: 1,
        facingDy: 0,
        firing: false,
        lastFiredAt: 0,
        respawnAt: 0,
        ammo: SHOOTER_MAX_AMMO,
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
      this.tracers = [];
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

  /** Tap/hold to shoot toward wherever you're currently facing — aim is directional, not automatic. */
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
      player.hp = SHOOTER_HP_START;
      player.kills = 0;
      player.alive = true;
      player.x = spawn.x;
      player.y = spawn.y;
      player.dx = 0;
      player.dy = 0;
      player.facingDx = 1;
      player.facingDy = 0;
      player.firing = false;
      player.lastFiredAt = 0;
      player.respawnAt = 0;
      player.ammo = SHOOTER_MAX_AMMO;
      player.reloading = false;
      player.reloadEndsAt = 0;
    }
    this.tracers = [];
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
      if (!player.alive && now >= player.respawnAt) {
        const spawn = randomSpawn();
        player.alive = true;
        player.hp = SHOOTER_HP_START;
        player.x = spawn.x;
        player.y = spawn.y;
        player.dx = 0;
        player.dy = 0;
        player.ammo = SHOOTER_MAX_AMMO;
        player.reloading = false;
      }
    }

    for (const player of this.players.values()) {
      if (!player.alive) continue;
      const targetX = player.x + player.dx * ARENA_MOVE_SPEED * dt;
      const targetY = player.y + player.dy * ARENA_MOVE_SPEED * dt;
      const resolved = resolveWallCollision(player.x, player.y, targetX, targetY, ARENA_PLAYER_RADIUS);
      player.x = Math.min(1 - ARENA_PLAYER_RADIUS, Math.max(ARENA_PLAYER_RADIUS, resolved.x));
      player.y = Math.min(1 - ARENA_PLAYER_RADIUS, Math.max(ARENA_PLAYER_RADIUS, resolved.y));

      if (player.reloading && now >= player.reloadEndsAt) {
        player.reloading = false;
        player.ammo = SHOOTER_MAX_AMMO;
      }
    }

    // Hitscan toward the player's current facing direction, only while actively holding
    // (tap/click), with limited ammo before a reload pause.
    this.tracers = [];
    const alivePlayers = Array.from(this.players.values()).filter((p) => p.alive);
    let winningShooter: InternalPlayer | null = null;
    for (const player of alivePlayers) {
      if (!player.firing || player.reloading) continue;
      if (now - player.lastFiredAt < SHOOTER_FIRE_COOLDOWN_MS) continue;
      player.lastFiredAt = now;
      player.ammo -= 1;

      const target = raycastHit(
        player,
        player.facingDx,
        player.facingDy,
        SHOOTER_FIRE_RANGE,
        ARENA_PLAYER_RADIUS + SHOOTER_HIT_RADIUS_BONUS,
        alivePlayers,
      );
      const rangeX = player.x + player.facingDx * SHOOTER_FIRE_RANGE;
      const rangeY = player.y + player.facingDy * SHOOTER_FIRE_RANGE;
      this.tracers.push({
        fromX: player.x,
        fromY: player.y,
        toX: target?.x ?? rangeX,
        toY: target?.y ?? rangeY,
      });

      if (target) {
        target.hp -= SHOOTER_SHOT_DAMAGE;
        if (target.hp <= 0) {
          target.hp = 0;
          target.alive = false;
          target.respawnAt = now + SHOOTER_RESPAWN_MS;
          player.kills += 1;
          if (player.kills >= SHOOTER_KILL_TARGET) {
            winningShooter = player;
          }
        }
      }

      if (player.ammo <= 0) {
        player.reloading = true;
        player.reloadEndsAt = now + SHOOTER_RELOAD_MS;
      }
    }

    if (winningShooter) {
      this.status = "finished";
      this.winner = { id: winningShooter.id, username: winningShooter.username };
      this.stopLoop();
      this.broadcast();
      setTimeout(() => this.onEnd(), 5000);
      return;
    }

    this.broadcast();
  }

  private getStateFor(viewerId: number): ShooterState {
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
          kills: p.kills,
          alive: p.alive,
          inBush: !!bushAt(p.x, p.y),
          ammo: p.ammo,
          reloading: p.reloading,
        })),
      tracers: this.tracers,
      winner: this.winner,
      killTarget: SHOOTER_KILL_TARGET,
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
