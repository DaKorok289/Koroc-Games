import { useEffect, useRef, useState } from "react";
import { SOCKET_EVENTS, type HideSeekState } from "@koroc/shared";
import { useSocket } from "../../context/SocketContext";
import { useAuth } from "../../context/AuthContext";
import { useResizableCanvas } from "../../hooks/useResizableCanvas";
import { useArenaMovement } from "../../hooks/useArenaMovement";

const BG = "#0f1020";
const SEEKER_COLOR = "#ff6b6b";
const HIDER_COLOR = "#7ce0ff";
const TAGGED_COLOR = "#3a3d6b";
const YOU_RING = "#ffd166";

export function HideAndSeek() {
  const socket = useSocket();
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<HideSeekState | null>(null);
  const [displayState, setDisplayState] = useState<HideSeekState | null>(null);

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
    const onState = (state: HideSeekState) => {
      const prevStatus = stateRef.current?.status;
      stateRef.current = state;
      const now = performance.now();
      if (now - lastUiSync > 200 || state.status !== prevStatus) {
        lastUiSync = now;
        setDisplayState(state);
      }
    };
    socket.on(SOCKET_EVENTS.HIDE_SEEK_STATE, onState);
    return () => {
      socket.off(SOCKET_EVENTS.HIDE_SEEK_STATE, onState);
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

        ctx.fillStyle = player.isSeeker ? SEEKER_COLOR : player.tagged ? TAGGED_COLOR : HIDER_COLOR;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#f2f3ff";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(player.username, px, py - r - 8);
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
        <span>{displayState ? `${displayState.players.length} playing` : "waiting…"}</span>
        <span className="score">{status === "playing" ? `${displayState?.timeRemaining}s` : ""}</span>
        <span>{me ? (me.isSeeker ? "You're the seeker!" : me.tagged ? "Tagged!" : "You're hiding!") : ""}</span>
      </div>

      <div className="arena-canvas-container" ref={containerRef}>
        <canvas ref={canvasRef} className="arena-canvas" />
        {status === "waiting" && <div className="pong-overlay">Waiting for at least 2 players…</div>}
        {status === "countdown" && <div className="pong-overlay big">{displayState?.countdown}</div>}
        {status === "finished" && (
          <div className="pong-overlay">{displayState?.winner === "seeker" ? "Seeker wins!" : "Hiders win!"}</div>
        )}
      </div>

      <p className="pong-role">
        Drag on the arena or use WASD / Arrow keys to move. The seeker (red) tags hiders (blue) by getting close —
        hiders win by surviving the clock.
      </p>
    </div>
  );
}
