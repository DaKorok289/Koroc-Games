import { useEffect, useRef, useState } from "react";
import { ARENA_BUSHES, ARENA_WALLS, SOCKET_EVENTS, type WizardBattleState } from "@koroc/shared";
import { useSocket } from "../../context/SocketContext";
import { useAuth } from "../../context/AuthContext";
import { useResizableCanvas } from "../../hooks/useResizableCanvas";
import { useArenaMovement } from "../../hooks/useArenaMovement";
import { PlayerRoster } from "../../components/PlayerRoster";
import { StartMatchControl } from "../../components/StartMatchControl";

const BG = "#0f1020";
const WALL_COLOR = "#4a4d7a";
const BUSH_COLOR = "rgba(92, 232, 122, 0.18)";
const BUSH_BORDER = "rgba(92, 232, 122, 0.5)";
const WIZARD_COLOR = "#b48bff";
const BOLT_COLOR = "#ffd166";
const YOU_RING = "#7ce0ff";
const HP_BAR_BG = "#2c2f5c";
const HP_BAR_FILL = "#5ce87a";

export function WizardBattles() {
  const socket = useSocket();
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<WizardBattleState | null>(null);
  const [displayState, setDisplayState] = useState<WizardBattleState | null>(null);

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
    const onState = (state: WizardBattleState) => {
      const prevStatus = stateRef.current?.status;
      stateRef.current = state;
      const now = performance.now();
      if (now - lastUiSync > 200 || state.status !== prevStatus) {
        lastUiSync = now;
        setDisplayState(state);
      }
    };
    socket.on(SOCKET_EVENTS.WIZARD_STATE, onState);
    return () => {
      socket.off(SOCKET_EVENTS.WIZARD_STATE, onState);
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

      ctx.fillStyle = BUSH_COLOR;
      ctx.strokeStyle = BUSH_BORDER;
      for (const bush of ARENA_BUSHES) {
        ctx.fillRect(bush.x * width, bush.y * height, bush.w * width, bush.h * height);
        ctx.strokeRect(bush.x * width, bush.y * height, bush.w * width, bush.h * height);
      }

      ctx.fillStyle = WALL_COLOR;
      for (const wall of ARENA_WALLS) {
        ctx.fillRect(wall.x * width, wall.y * height, wall.w * width, wall.h * height);
      }

      ctx.fillStyle = BOLT_COLOR;
      for (const bolt of state.bolts) {
        ctx.beginPath();
        ctx.arc(bolt.x * width, bolt.y * height, width * 0.008, 0, Math.PI * 2);
        ctx.fill();
      }

      const r = width * 0.025;
      for (const player of state.players) {
        if (!player.alive) continue;
        const px = player.x * width;
        const py = player.y * height;
        const isYou = player.id === user?.id;

        if (isYou) {
          ctx.strokeStyle = YOU_RING;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px, py, r + 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.globalAlpha = isYou && player.inBush ? 0.45 : 1;
        ctx.fillStyle = WIZARD_COLOR;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        const barW = r * 2.4;
        const barX = px - barW / 2;
        const barY = py - r - 16;
        ctx.fillStyle = HP_BAR_BG;
        ctx.fillRect(barX, barY, barW, 4);
        ctx.fillStyle = HP_BAR_FILL;
        ctx.fillRect(barX, barY, barW * (player.hp / 100), 4);

        ctx.fillStyle = "#f2f3ff";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(player.username, px, py - r - 20);
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
        <span>{displayState ? `${displayState.players.filter((p) => p.alive).length} alive` : "waiting…"}</span>
        <span className="score">{me ? `${me.hp} HP` : ""}</span>
        <span>{me && !me.alive ? "Eliminated — spectating" : ""}</span>
      </div>

      {status === "waiting" && displayState && (
        <>
          <PlayerRoster players={displayState.players} youId={user?.id} title="Wizards joining" />
          <StartMatchControl
            canStart={displayState.players.length >= 2}
            notEnoughHint="Need at least 2 wizards to start"
          />
        </>
      )}

      <div className="arena-canvas-container" ref={containerRef}>
        <canvas ref={canvasRef} className="arena-canvas" />
        {status === "waiting" && <div className="pong-overlay">Waiting for the host to start…</div>}
        {status === "countdown" && <div className="pong-overlay big">{displayState?.countdown}</div>}
        {status === "finished" && (
          <div className="pong-overlay">{displayState?.winner ? `${displayState.winner.username} wins!` : "Draw!"}</div>
        )}
      </div>

      <p className="pong-role">
        Drag on the arena or use WASD / Arrow keys to move. Your wizard auto-casts at the nearest
        <strong> visible</strong> opponent — walls block line of sight, and the green bushes hide you
        from anyone not standing in the same one. Last wizard standing wins.
      </p>
    </div>
  );
}
