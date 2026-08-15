import { useEffect, useRef, type RefObject } from "react";
import { PONG_PADDLE_HEIGHT, SOCKET_EVENTS, type PongSide, type PongState } from "@koroc/shared";
import type { Socket } from "socket.io-client";
import { useResizableCanvas } from "../../hooks/useResizableCanvas";

const BG = "#0f1020";
const NET = "rgba(255,255,255,0.25)";
const PADDLE_COLOR = "#7ce0ff";
const BALL_COLOR = "#ffd166";

// Renders one live Pong match. Reused both when it's your match (paddle control active)
// and when you're spectating someone else's bracket match (read-only). `liveRef` is
// updated by the parent on every server tick so the draw loop stays smooth without the
// parent re-rendering 60x/sec.
export function PongMatchView({
  socket,
  liveRef,
  live,
  youId,
}: {
  socket: Socket | null;
  liveRef: RefObject<PongState | null>;
  live: PongState;
  youId?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const role: PongSide | "spectator" =
    live.players.left?.id === youId ? "left" : live.players.right?.id === youId ? "right" : "spectator";
  const roleRef = useRef(role);
  roleRef.current = role;

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const state = liveRef.current;
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
  }, [liveRef]);

  useResizableCanvas(canvasRef, containerRef, 5 / 3);

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

  useEffect(() => {
    if (!socket) return;
    const keys = new Set<string>();
    let raf = 0;
    let paddleY = 0.5;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (roleRef.current !== "left" && roleRef.current !== "right") return;
      const current = liveRef.current?.paddles[roleRef.current] ?? paddleY;
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
  }, [socket, liveRef]);

  return (
    <div className="pong-wrap">
      <div className="pong-scoreboard">
        <span>{live.players.left?.username ?? "waiting…"}</span>
        <span className="score">
          {live.score.left} : {live.score.right}
        </span>
        <span>{live.players.right?.username ?? "waiting…"}</span>
      </div>

      <div className="pong-canvas-container" ref={containerRef}>
        <canvas ref={canvasRef} className="pong-canvas" />
        {live.status === "countdown" && <div className="pong-overlay big">{live.countdown}</div>}
        {live.status === "finished" && (
          <div className="pong-overlay">
            {live.winner === "left" ? live.players.left?.username : live.players.right?.username} wins!
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
