import type { Server } from "socket.io";
import {
  ARENA_MIN_PLAYERS,
  ARENA_MOVE_SPEED,
  ARENA_PLAYER_RADIUS,
  HIDE_SEEK_IT_SPEED_BONUS,
  HIDE_SEEK_MAZE_CENTER,
  HIDE_SEEK_MAZE_WALLS,
  HIDE_SEEK_ROUND_SECONDS,
  HIDE_SEEK_TAG_IMMUNITY_MS,
  HIDE_SEEK_TAG_RADIUS,
  type HideSeekState,
  type PublicUser,
} from "@koroc/shared";
import { isVisible, randomSpawn, resolveWallCollision } from "./arenaPhysics";

const COUNTDOWN_SECONDS = 3;
const TICK_MS = 1000 / 30;
const NO_BUSHES: never[] = []; // maze mode has no bush-hiding, only wall-blocked sight

interface InternalPlayer {
  socketId: string;
  id: number;
  username: string;
  color: string;
  x: number;
  y: number;
  isIt: boolean;
  immuneUntil: number;
  dx: number;
  dy: number;
}

type OnEnd = () => void;

/** Same tag-transfer rules as Tag (HideAndSeekGame), but on a much denser maze layout,
 * with two extras: whoever becomes the new seeker is teleported to the center of the
 * map (so every handoff means re-navigating from scratch), and — unlike Tag — walls
 * actually block sight here: each participant gets their own personalized, visibility-
 * filtered view (same mechanism as Wizard Battles/Shooters) instead of a single shared
 * broadcast, so you genuinely can't see a hider (or the seeker) through a wall. */
export class MazeHideAndSeekGame {
  private players = new Map<string, InternalPlayer>();
  private status: HideSeekState["status"] = "waiting";
  private countdown = COUNTDOWN_SECONDS;
  private timeRemaining = HIDE_SEEK_ROUND_SECONDS;
  private loser: HideSeekState["loser"] = null;
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
      const spawn = randomSpawn(ARENA_PLAYER_RADIUS, HIDE_SEEK_MAZE_WALLS);
      this.players.set(socketId, {
        socketId,
        id: user.id,
        username: user.username,
        color,
        x: spawn.x,
        y: spawn.y,
        isIt: false,
        immuneUntil: 0,
        dx: 0,
        dy: 0,
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
      this.loser = null;
    }
    this.broadcast();
  }

  handleInput(socketId: string, dx: number, dy: number): void {
    const player = this.players.get(socketId);
    if (!player || this.status !== "playing") return;
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
      this.broadcast();
    }, 1000);
    return true;
  }

  private beginRound(): void {
    const socketIds = Array.from(this.players.keys());
    const itSocketId = socketIds[Math.floor(Math.random() * socketIds.length)];
    for (const [socketId, player] of this.players) {
      const spawn = randomSpawn(ARENA_PLAYER_RADIUS, HIDE_SEEK_MAZE_WALLS);
      player.isIt = socketId === itSocketId;
      player.immuneUntil = 0;
      player.x = spawn.x;
      player.y = spawn.y;
      player.dx = 0;
      player.dy = 0;
    }
    this.timeRemaining = HIDE_SEEK_ROUND_SECONDS;
    this.loser = null;
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
      const speed = ARENA_MOVE_SPEED * (player.isIt ? HIDE_SEEK_IT_SPEED_BONUS : 1);
      const targetX = player.x + player.dx * speed * dt;
      const targetY = player.y + player.dy * speed * dt;
      const resolved = resolveWallCollision(player.x, player.y, targetX, targetY, ARENA_PLAYER_RADIUS, HIDE_SEEK_MAZE_WALLS);
      player.x = Math.min(1 - ARENA_PLAYER_RADIUS, Math.max(ARENA_PLAYER_RADIUS, resolved.x));
      player.y = Math.min(1 - ARENA_PLAYER_RADIUS, Math.max(ARENA_PLAYER_RADIUS, resolved.y));
    }

    // Tag transfer: whoever is "it" passes it to the first player they touch who isn't
    // currently immune. Unlike Tag, the newly-tagged seeker is teleported to the center
    // of the maze — they have to re-hunt from scratch instead of just continuing from
    // the tag spot, which is what makes this feel like real hide & seek rather than Tag
    // with more walls.
    const it = Array.from(this.players.values()).find((p) => p.isIt);
    if (it) {
      for (const player of this.players.values()) {
        if (player.isIt || now < player.immuneUntil) continue;
        const dist = Math.hypot(player.x - it.x, player.y - it.y);
        if (dist <= HIDE_SEEK_TAG_RADIUS) {
          it.isIt = false;
          it.immuneUntil = now + HIDE_SEEK_TAG_IMMUNITY_MS;
          player.isIt = true;
          player.x = HIDE_SEEK_MAZE_CENTER.x;
          player.y = HIDE_SEEK_MAZE_CENTER.y;
          player.dx = 0;
          player.dy = 0;
          player.immuneUntil = now + HIDE_SEEK_TAG_IMMUNITY_MS;
          break;
        }
      }
    }

    this.timeRemaining -= dt;
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0;
      this.status = "finished";
      const stillIt = Array.from(this.players.values()).find((p) => p.isIt);
      this.loser = stillIt ? { id: stillIt.id, username: stillIt.username } : null;
      this.stopLoop();
      this.broadcast();
      setTimeout(() => this.onEnd(), 5000);
      return;
    }

    this.broadcast();
  }

  private getStateFor(viewerId: number): HideSeekState {
    const viewer = Array.from(this.players.values()).find((p) => p.id === viewerId);
    const it = Array.from(this.players.values()).find((p) => p.isIt);
    return {
      status: this.status,
      countdown: this.countdown,
      timeRemaining: Math.ceil(this.timeRemaining),
      roundSeconds: HIDE_SEEK_ROUND_SECONDS,
      // Visibility (walls block sight) only applies once the round is actually playing —
      // the pre-game roster and post-game results always show everyone. No bushes in
      // this mode, so it's purely wall-blocked line of sight.
      players: Array.from(this.players.values())
        .filter((p) => this.status !== "playing" || !viewer || isVisible(viewer, p, HIDE_SEEK_MAZE_WALLS, NO_BUSHES))
        .map((p) => ({
          id: p.id,
          username: p.username,
          color: p.color,
          x: p.x,
          y: p.y,
          isIt: p.isIt,
        })),
      // Always known by identity (even if their position is currently hidden) — you know
      // who's seeking in real hide & seek, you just don't always know where they are.
      seeker: it ? { id: it.id, username: it.username } : null,
      loser: this.loser,
    };
  }

  /** Emits each participant their own personalized (visibility-filtered) view. */
  private broadcast(): void {
    for (const player of this.players.values()) {
      this.io.to(player.socketId).emit(this.event, this.getStateFor(player.id));
    }
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  /** Everyone except whoever was seeking when time ran out gets credit for the win. */
  getWinnerUserIds(): number[] {
    if (!this.loser) return [];
    return Array.from(this.players.values())
      .filter((p) => p.id !== this.loser!.id)
      .map((p) => p.id);
  }

  destroy(): void {
    this.stopLoop();
    this.stopCountdown();
  }
}
