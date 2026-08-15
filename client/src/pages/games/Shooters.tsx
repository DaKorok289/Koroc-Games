import { useEffect, useRef, useState } from "react";
import { SOCKET_EVENTS, type ShooterState } from "@koroc/shared";
import { useSocket } from "../../context/SocketContext";
import { useAuth } from "../../context/AuthContext";
import { useResizableCanvas } from "../../hooks/useResizableCanvas";
import { useArenaMovement } from "../../hooks/useArenaMovement";

const BG = "#0f1020";
const PLAYER_COLOR = "#7ce0ff";
const DEAD_COLOR = "#3a3d6b";
const TRACER_COLOR = "#ffd166";
const YOU_RING = "#ff6b6b";
const HP_BAR_BG = "#2c2f5c";
const HP_BAR_FILL = "#5ce87a";

export function Shooters() {
  const socket = useSocket();
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<ShooterState | null>(null);
  const [displayState, setDisplayState] = useState<ShooterState | null>(null);

  useEffect(() => {
    if (!socket) return;
    socket.emit(SOCKET_EVENTS.GAME_JOIN, {});
    return () => {
      socket.emit(SOCKET_EVENTS.GAME_LEAVE);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    let lastUiSync = 0;
    const onState = (state: ShooterState) => {
      const prevStatus = stateRef.current?.status;
      stateRef.current = state;
      const now = performance.now();
      if (now - lastUiSync > 200 || state.status !== prevStatus) {
        lastUiSync = now;
        setDisplayState(state);
      }
    };
    socket.on(SOCKET_EVENTS.SHOOTER_STATE, onState);
    return () => {
      socket.off(SOCKET_EVENTS.SHOOTER_STATE, onState);
    };
  }, [socket]);

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

      ctx.strokeStyle = TRACER_COLOR;
      ctx.lineWidth = 2;
      for (const tracer of state.tracers) {
        ctx.beginPath();
        ctx.moveTo(tracer.fromX * width, tracer.fromY * height);
        ctx.lineTo(tracer.toX * width, tracer.toY * height);
        ctx.stroke();
      }

      const r = width * 0.025;
      for (const player of state.players) {
        const px = player.x * width;
        const py = player.y * height;

        if (player.id === user?.id) {
          ctx.strokeStyle = YOU_RING;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px, py, r + 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = player.alive ? PLAYER_COLOR : DEAD_COLOR;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();

        if (player.alive) {
          const barW = r * 2.4;
          const barX = px - barW / 2;
          const barY = py - r - 16;
          ctx.fillStyle = HP_BAR_BG;
          ctx.fillRect(barX, barY, barW, 4);
          ctx.fillStyle = HP_BAR_FILL;
          ctx.fillRect(barX, barY, barW * (player.hp / 100), 4);
        }

        ctx.fillStyle = "#f2f3ff";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${player.username} (${player.kills})`, px, py - r - 20);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [user?.id]);

  useResizableCanvas(canvasRef, containerRef);
  useArenaMovement(socket, canvasRef);

  const status = displayState?.status ?? "waiting";
  const me = displayState?.players.find((p) => p.id === user?.id);

  return (
    <div className="arena-wrap">
      <div className="arena-scoreboard">
        <span>{me ? `${me.kills} / ${displayState?.killTarget} kills` : "waiting…"}</span>
        <span className="score">{me ? `${me.hp} HP` : ""}</span>
        <span>{me && !me.alive ? "Respawning…" : ""}</span>
      </div>

      <div className="arena-canvas-container" ref={containerRef}>
        <canvas ref={canvasRef} className="arena-canvas" />
        {status === "waiting" && <div className="pong-overlay">Waiting for at least 2 players…</div>}
        {status === "countdown" && <div className="pong-overlay big">{displayState?.countdown}</div>}
        {status === "finished" && (
          <div className="pong-overlay">{displayState?.winner ? `${displayState.winner.username} wins!` : "Draw!"}</div>
        )}
      </div>

      <p className="pong-role">
        Drag on the arena or use WASD / Arrow keys to move. You auto-fire at the nearest opponent in
        range — reposition to land shots and dodge theirs. Respawns on death. First to {displayState?.killTarget ?? 5}{" "}
        kills wins.
      </p>
    </div>
  );
}
