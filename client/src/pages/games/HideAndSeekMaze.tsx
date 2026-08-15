import { useEffect, useRef, useState } from "react";
import { HIDE_SEEK_MAZE_WALLS, SOCKET_EVENTS, type HideSeekState } from "@koroc/shared";
import { useSocket } from "../../context/SocketContext";
import { useAuth } from "../../context/AuthContext";
import { useGame } from "../../context/GameContext";
import { useResizableCanvas } from "../../hooks/useResizableCanvas";
import { useArenaMovement } from "../../hooks/useArenaMovement";
import { PlayerRoster } from "../../components/PlayerRoster";
import { StartMatchControl } from "../../components/StartMatchControl";
import { DPad } from "../../components/DPad";

const BG = "#0f1020";
const WALL_COLOR = "#4a4d7a";
const IT_COLOR = "#ff6b6b";
const IT_RING = "#ff2020";
const YOU_RING = "#ffd166";

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function HideAndSeekMaze({ eventId }: { eventId: string }) {
  const socket = useSocket();
  const { user } = useAuth();
  const { myColor } = useGame();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<HideSeekState | null>(null);
  const [displayState, setDisplayState] = useState<HideSeekState | null>(null);

  useEffect(() => {
    if (!socket) return;
    socket.emit(SOCKET_EVENTS.GAME_JOIN, { eventId });
    return () => {
      socket.emit(SOCKET_EVENTS.GAME_LEAVE, { eventId });
    };
  }, [socket, eventId]);

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
    socket.on(SOCKET_EVENTS.MAZE_HIDE_SEEK_STATE, onState);
    return () => {
      socket.off(SOCKET_EVENTS.MAZE_HIDE_SEEK_STATE, onState);
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

      ctx.fillStyle = WALL_COLOR;
      for (const wall of HIDE_SEEK_MAZE_WALLS) {
        ctx.fillRect(wall.x * width, wall.y * height, wall.w * width, wall.h * height);
      }

      const r = width * 0.022;
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

        if (player.isIt) {
          ctx.strokeStyle = IT_RING;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px, py, r + 9, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = player.isIt ? IT_COLOR : player.color;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#f2f3ff";
        ctx.font = "bold 15px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(player.username, px, py - r - 11);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [user?.id]);

  useResizableCanvas(canvasRef, containerRef, 1.6);
  useArenaMovement(socket, canvasRef, eventId);

  const status = displayState?.status ?? "waiting";
  const me = displayState?.players.find((p) => p.id === user?.id);
  const itPlayer = displayState?.seeker;

  return (
    <div className="arena-wrap">
      {status === "playing" && itPlayer && (
        <div className="tagger-banner">
          🔴 <strong>{itPlayer.id === user?.id ? "You are" : `${itPlayer.username} is`}</strong> seeking!
        </div>
      )}

      <div className="arena-scoreboard">
        <span>{displayState ? `${displayState.players.length} playing` : "waiting…"}</span>
        <span className="score">{status === "playing" ? formatClock(displayState?.timeRemaining ?? 0) : ""}</span>
        <span>{me?.isIt ? "Find someone!" : ""}</span>
      </div>

      {status === "waiting" && displayState && (
        <>
          <PlayerRoster players={displayState.players} youId={user?.id} title="Players joining" />
          <StartMatchControl
            eventId={eventId}
            canStart={displayState.players.length >= 2}
            notEnoughHint="Need at least 2 players to start"
          />
        </>
      )}

      <div className="arena-canvas-container" ref={containerRef}>
        <canvas ref={canvasRef} className="arena-canvas" />
        {status === "waiting" && <div className="pong-overlay">Waiting for the host to start…</div>}
        {status === "countdown" && <div className="pong-overlay big">{displayState?.countdown}</div>}
        {status === "finished" && (
          <div className="pong-overlay">
            {displayState?.loser ? `${displayState.loser.username} was seeking and loses!` : "Everyone survived!"}
          </div>
        )}
        {status === "playing" && <DPad socket={socket} eventId={eventId} />}
      </div>

      <p className="pong-role">
        Move: drag/WASD/on-screen arrows. Get found and you become the new seeker,
        teleported to the center of the maze. Whoever's seeking when the 3-minute clock
        runs out loses. <span style={{ color: myColor }}>●</span>
      </p>
    </div>
  );
}
