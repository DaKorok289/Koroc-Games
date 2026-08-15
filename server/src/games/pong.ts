import {
  PONG_PADDLE_HEIGHT,
  PONG_WIN_SCORE,
  type PongSide,
  type PongState,
  type PublicUser,
} from "@korok/shared";

const PADDLE_X_LEFT = 0.03;
const PADDLE_X_RIGHT = 0.97;
const BALL_RADIUS = 0.015;
const BASE_BALL_SPEED = 0.55; // fraction of field per second
const COUNTDOWN_SECONDS = 3;

type OnUpdate = (state: PongState) => void;
type OnEnd = () => void;

export class PongGame {
  private state: PongState;
  private playerSockets: { left: string | null; right: string | null } = { left: null, right: null };
  private spectatorSockets = new Set<string>();
  private loopHandle: ReturnType<typeof setInterval> | null = null;
  private countdownHandle: ReturnType<typeof setInterval> | null = null;
  private lastTick = Date.now();
  private readonly onUpdate: OnUpdate;
  private readonly onEnd: OnEnd;

  constructor(onUpdate: OnUpdate, onEnd: OnEnd) {
    this.onUpdate = onUpdate;
    this.onEnd = onEnd;
    this.state = this.freshState();
  }

  private freshState(): PongState {
    return {
      status: "waiting",
      countdown: COUNTDOWN_SECONDS,
      ball: { x: 0.5, y: 0.5, vx: 0, vy: 0 },
      paddles: { left: 0.5, right: 0.5 },
      score: { left: 0, right: 0 },
      players: { left: null, right: null },
      spectators: 0,
      winner: null,
    };
  }

  getState(): PongState {
    return this.state;
  }

  addParticipant(user: PublicUser, socketId: string): PongSide | "spectator" {
    let result: PongSide | "spectator";
    if (!this.playerSockets.left) {
      this.playerSockets.left = socketId;
      this.state.players.left = user;
      this.maybeStartCountdown();
      result = "left";
    } else if (!this.playerSockets.right) {
      this.playerSockets.right = socketId;
      this.state.players.right = user;
      this.maybeStartCountdown();
      result = "right";
    } else {
      this.spectatorSockets.add(socketId);
      this.state.spectators = this.spectatorSockets.size;
      result = "spectator";
    }
    this.onUpdate(this.state);
    return result;
  }

  removeParticipant(socketId: string): void {
    if (this.playerSockets.left === socketId) {
      this.playerSockets.left = null;
      this.state.players.left = null;
    }
    if (this.playerSockets.right === socketId) {
      this.playerSockets.right = null;
      this.state.players.right = null;
    }
    this.spectatorSockets.delete(socketId);
    this.state.spectators = this.spectatorSockets.size;

    if (!this.playerSockets.left || !this.playerSockets.right) {
      this.stopCountdown();
      if (this.state.status === "playing" || this.state.status === "countdown") {
        this.state.status = "waiting";
        this.stopLoop();
      }
    }
  }

  sideForSocket(socketId: string): PongSide | null {
    if (this.playerSockets.left === socketId) return "left";
    if (this.playerSockets.right === socketId) return "right";
    return null;
  }

  handleInput(socketId: string, paddleY: number): void {
    const side = this.sideForSocket(socketId);
    if (!side) return;
    const clamped = Math.min(1 - PONG_PADDLE_HEIGHT / 2, Math.max(PONG_PADDLE_HEIGHT / 2, paddleY));
    this.state.paddles[side] = clamped;
  }

  private maybeStartCountdown(): void {
    if (this.playerSockets.left && this.playerSockets.right && this.state.status === "waiting") {
      this.state.status = "countdown";
      this.state.countdown = COUNTDOWN_SECONDS;
      this.onUpdate(this.state);
      this.stopCountdown();
      this.countdownHandle = setInterval(() => {
        this.state.countdown -= 1;
        if (this.state.countdown <= 0) {
          this.stopCountdown();
          this.beginRally(Math.random() > 0.5 ? 1 : -1);
          this.state.status = "playing";
          this.startLoop();
        }
        this.onUpdate(this.state);
      }, 1000);
    }
  }

  private stopCountdown(): void {
    if (this.countdownHandle) {
      clearInterval(this.countdownHandle);
      this.countdownHandle = null;
    }
  }

  private beginRally(direction: 1 | -1): void {
    const angle = (Math.random() * 0.6 - 0.3) * Math.PI; // +-54deg
    this.state.ball.x = 0.5;
    this.state.ball.y = 0.5;
    this.state.ball.vx = Math.cos(angle) * BASE_BALL_SPEED * direction;
    this.state.ball.vy = Math.sin(angle) * BASE_BALL_SPEED;
  }

  private startLoop(): void {
    if (this.loopHandle) return;
    this.lastTick = Date.now();
    this.loopHandle = setInterval(() => this.tick(), 1000 / 60);
  }

  private stopLoop(): void {
    if (this.loopHandle) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
  }

  private tick(): void {
    const now = Date.now();
    const dt = Math.min(0.05, (now - this.lastTick) / 1000);
    this.lastTick = now;
    if (this.state.status !== "playing") return;

    const ball = this.state.ball;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.y - BALL_RADIUS <= 0) {
      ball.y = BALL_RADIUS;
      ball.vy *= -1;
    } else if (ball.y + BALL_RADIUS >= 1) {
      ball.y = 1 - BALL_RADIUS;
      ball.vy *= -1;
    }

    if (ball.vx < 0 && ball.x - BALL_RADIUS <= PADDLE_X_LEFT) {
      const paddleY = this.state.paddles.left;
      if (Math.abs(ball.y - paddleY) <= PONG_PADDLE_HEIGHT / 2 + BALL_RADIUS) {
        ball.x = PADDLE_X_LEFT + BALL_RADIUS;
        const offset = (ball.y - paddleY) / (PONG_PADDLE_HEIGHT / 2);
        const speed = Math.min(1.3, Math.hypot(ball.vx, ball.vy) * 1.06);
        const angle = offset * 0.7;
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
      }
    } else if (ball.vx > 0 && ball.x + BALL_RADIUS >= PADDLE_X_RIGHT) {
      const paddleY = this.state.paddles.right;
      if (Math.abs(ball.y - paddleY) <= PONG_PADDLE_HEIGHT / 2 + BALL_RADIUS) {
        ball.x = PADDLE_X_RIGHT - BALL_RADIUS;
        const offset = (ball.y - paddleY) / (PONG_PADDLE_HEIGHT / 2);
        const speed = Math.min(1.3, Math.hypot(ball.vx, ball.vy) * 1.06);
        const angle = Math.PI - offset * 0.7;
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
      }
    }

    if (ball.x < -0.05) {
      this.state.score.right += 1;
      this.afterPoint();
    } else if (ball.x > 1.05) {
      this.state.score.left += 1;
      this.afterPoint();
    }

    this.onUpdate(this.state);
  }

  private afterPoint(): void {
    if (this.state.score.left >= PONG_WIN_SCORE || this.state.score.right >= PONG_WIN_SCORE) {
      this.state.status = "finished";
      this.state.winner = this.state.score.left > this.state.score.right ? "left" : "right";
      this.stopLoop();
      this.onUpdate(this.state);
      setTimeout(() => this.onEnd(), 4000);
      return;
    }
    this.beginRally(Math.random() > 0.5 ? 1 : -1);
  }

  destroy(): void {
    this.stopLoop();
    this.stopCountdown();
  }
}
