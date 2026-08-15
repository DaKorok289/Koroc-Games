import { useEffect, useRef, useState } from "react";
import { PONG_PADDLE_HEIGHT, SOCKET_EVENTS, type PongSide, type PongState } from "@koroc/shared";
import { useSocket } from "../../context/SocketContext";

type Role = PongSide | "spectator" | null;

const BG = "#0f1020";
const NET = "rgba(255,255,255,0.25)";
const PADDLE_COLOR = "#7ce0ff";
const BALL_COLOR = "#ffd166";

export function PongGame() {
  const socket = useSocket();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<PongState | null>(null);
  const roleRef = useRef<Role>(null);
  const [role, setRole] = useState<Role>(null);
  const [displayState, setDisplayState] = useState<PongState | null>(null);

  // Join on mount, leave on unmount.
  useEffect(() => {
    if (!socket) return;
    socket.emit(SOCKET_EVENTS.GAME_JOIN, {}, (res: { role: Role }) => {
      roleRef.current = res.role;
      setRole(res.role);
    });
    return () => {
      socket.emit(SOCKET_EVENTS.GAME_LEAVE);
    };
  }, [socket]);

  // Raw high-frequency state goes straight into a ref (drawn via rAF), not React state,
  // to avoid re-rendering on every physics tick. A throttled copy powers the score/status UI.
  useEffect(() => {
    if (!socket) return;
    let lastUiSync = 0;
    const onState = (state: PongState) => {
      stateRef.current = state;
      const now = performance.now();
      if (now - lastUiSync > 150 || state.status !== stateRef.current?.status) {
        lastUiSync = now;
        setDisplayState(state);
      }
    };
    socket.on(SOCKET_EVENTS.PONG_STATE, onState);
    return () => {
      socket.off(SOCKET_EVENTS.PONG_STATE, onState);
    };
  }, [socket]);

  // Draw loop.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const state = stateRef.current;
      if (!canvas || !state) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { width, height } = canvas;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = NET;
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();
      ctx.setLineDash([]);

      const paddleW = width * 0.018;
      const paddleH = height * PONG_PADDLE_HEIGHT;
      ctx.fillStyle = PADDLE_COLOR;
      ctx.fillRect(width * 0.03 - paddleW / 2, state.paddles.left * height - paddleH / 2, paddleW, paddleH);
      ctx.fillRect(width * 0.97 - paddleW / 2, state.paddles.right * height - paddleH / 2, paddleW, paddleH);

      ctx.fillStyle = BALL_COLOR;
      const r = width * 0.015;
      ctx.beginPath();
      ctx.arc(state.ball.x * width, state.ball.y * height, r, 0, Math.PI * 2);
      ctx.fill();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keep the canvas sized to its container (responsive across phone/tablet/desktop).
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Pointer (mouse + touch) control: drag anywhere on your half to move your paddle.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !socket) return;

    const sendPaddleY = (clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      socket.emit(SOCKET_EVENTS.PONG_INPUT, { paddleY: y });
    };

    let dragging = false;
    const onPointerDown = (e: PointerEvent) => {
      if (roleRef.current !== "left" && roleRef.current !== "right") return;
      dragging = true;
      sendPaddleY(e.clientY);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      sendPaddleY(e.clientY);
    };
    const onPointerUp = () => {
      dragging = false;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [socket]);

  // Keyboard control (desktop): Arrow Up/Down or W/S move your paddle.
  useEffect(() => {
    if (!socket) return;
    const keys = new Set<string>();
    let raf = 0;
    let paddleY = 0.5;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (roleRef.current !== "left" && roleRef.current !== "right") return;
      const current = stateRef.current?.paddles[roleRef.current] ?? paddleY;
      let target = current;
      if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) target -= 0.02;
      if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) target += 0.02;
      if (target !== current) {
        paddleY = Math.min(1, Math.max(0, target));
        socket.emit(SOCKET_EVENTS.PONG_INPUT, { paddleY });
      }
    };
    const onKeyDown = (e: KeyboardEvent) => keys.add(e.key);
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      cancelAnimationFrame(raf);
    };
  }, [socket]);

  const status = displayState?.status ?? "waiting";

  return (
    <div className="pong-wrap">
      <div className="pong-scoreboard">
        <span>{displayState?.players.left?.username ?? "waiting…"}</span>
        <span className="score">
          {displayState?.score.left ?? 0} : {displayState?.score.right ?? 0}
        </span>
        <span>{displayState?.players.right?.username ?? "waiting…"}</span>
      </div>

      <div className="pong-canvas-container" ref={containerRef}>
        <canvas ref={canvasRef} className="pong-canvas" />
        {status === "waiting" && <div className="pong-overlay">Waiting for a second player…</div>}
        {status === "countdown" && <div className="pong-overlay big">{displayState?.countdown}</div>}
        {status === "finished" && (
          <div className="pong-overlay">
            {displayState?.winner === "left" ? displayState?.players.left?.username : displayState?.players.right?.username}{" "}
            wins!
          </div>
        )}
      </div>

      <p className="pong-role">
        {role === "left" || role === "right"
          ? "You're playing! Drag on the canvas or use W/S / Arrow keys."
          : "You're spectating this match."}
      </p>
    </div>
  );
}
