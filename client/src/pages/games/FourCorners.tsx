import { useEffect, useRef, useState } from "react";
import { FOUR_CORNERS_ZONES, SOCKET_EVENTS, type FourCornersState } from "@koroc/shared";
import { useSocket } from "../../context/SocketContext";
import { useAuth } from "../../context/AuthContext";
import { useGame } from "../../context/GameContext";
import { useResizableCanvas } from "../../hooks/useResizableCanvas";
import { useArenaMovement } from "../../hooks/useArenaMovement";
import { PlayerRoster } from "../../components/PlayerRoster";
import { StartMatchControl } from "../../components/StartMatchControl";
import { DPad } from "../../components/DPad";

const BG = "#0f1020";
const ZONE_COLOR = "rgba(124, 155, 255, 0.12)";
const ZONE_CALLED_COLOR = "rgba(255, 32, 32, 0.55)";
const DEAD_COLOR = "#4a4d6a";
const YOU_RING = "#ffd166";

export function FourCorners({ eventId }: { eventId: string }) {
  const socket = useSocket();
  const { user } = useAuth();
  const { myColor } = useGame();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<FourCornersState | null>(null);
  const [displayState, setDisplayState] = useState<FourCornersState | null>(null);

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
    const onState = (state: FourCornersState) => {
      const prevStatus = stateRef.current?.status;
      stateRef.current = state;
      const now = performance.now();
      if (now - lastUiSync > 200 || state.status !== prevStatus) {
        lastUiSync = now;
        setDisplayState(state);
      }
    };
    socket.on(SOCKET_EVENTS.FOUR_CORNERS_STATE, onState);
    return () => {
      socket.off(SOCKET_EVENTS.FOUR_CORNERS_STATE, onState);
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

      FOUR_CORNERS_ZONES.forEach((zone, i) => {
        ctx.fillStyle = state.calledCorner === i ? ZONE_CALLED_COLOR : ZONE_COLOR;
        ctx.fillRect(zone.x * width, zone.y * height, zone.w * width, zone.h * height);
      });

      const r = width * 0.025;
      for (const player of state.players) {
        const px = player.x * width;
        const py = player.y * height;

        if (player.id === user?.id && player.alive) {
          ctx.strokeStyle = YOU_RING;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px, py, r + 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.globalAlpha = player.alive ? 1 : 0.4;
        ctx.fillStyle = player.alive ? player.color : DEAD_COLOR;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#f2f3ff";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(player.alive ? player.username : `${player.username} (out)`, px, py - r - 12);
        ctx.globalAlpha = 1;
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [user?.id]);

  useResizableCanvas(canvasRef, containerRef);
  useArenaMovement(socket, canvasRef, eventId);

  const status = displayState?.status ?? "waiting";
  const me = displayState?.players.find((p) => p.id === user?.id);
  const aliveCount = displayState?.players.filter((p) => p.alive).length ?? 0;
  const nextCallSeconds = Math.ceil((displayState?.nextCallMs ?? 0) / 1000);

  return (
    <div className="arena-wrap">
      {status === "playing" && (
        <div className="tagger-banner">
          {displayState?.calledCorner !== null ? "🔴 A corner was just called!" : `⏱️ Next corner in ${nextCallSeconds}s`}
        </div>
      )}

      <div className="arena-scoreboard">
        <span>{displayState ? `${aliveCount} / ${displayState.players.length} standing` : "waiting…"}</span>
        <span className="score"></span>
        <span>{me && !me.alive ? "You're out — spectating" : ""}</span>
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
            {displayState?.winner ? `${displayState.winner.username} wins!` : "No one survived the last call!"}
          </div>
        )}
        {status === "playing" && <DPad socket={socket} eventId={eventId} />}
      </div>

      <p className="pong-role">
        Move: drag/WASD/on-screen arrows. Every 10 seconds a corner is called — anyone
        standing in it is out. Last one standing wins.{" "}
        <span style={{ color: myColor }}>●</span>
      </p>
    </div>
  );
}
