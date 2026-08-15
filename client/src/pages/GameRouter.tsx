import { useRef } from "react";
import { GAME_INFO } from "@koroc/shared";
import { useAuth } from "../context/AuthContext";
import { useGame } from "../context/GameContext";
import { useFullscreen } from "../hooks/useFullscreen";
import { PongGame } from "./games/PongGame";
import { HideAndSeek } from "./games/HideAndSeek";
import { WizardBattles } from "./games/WizardBattles";
import { Shooters } from "./games/Shooters";
import { FourCorners } from "./games/FourCorners";
import { HideAndSeekMaze } from "./games/HideAndSeekMaze";

export function GameRouter() {
  const { user } = useAuth();
  const { events, myEventId, endEvent, leaveEvent } = useGame();
  const screenRef = useRef<HTMLDivElement | null>(null);
  const { isFullscreen, supported, toggle } = useFullscreen(screenRef);
  const event = events.find((e) => e.id === myEventId);
  if (!event) return null;

  const info = GAME_INFO[event.gameType];

  return (
    <div className="game-screen" ref={screenRef}>
      <header className="game-header">
        <div>
          <h1>{info.label}</h1>
          <span className="started-by">started by {event.startedBy}</span>
        </div>
        <div className="header-actions">
          {supported && (
            <button className="icon-btn" onClick={toggle} type="button" title="Toggle fullscreen">
              {isFullscreen ? "⤦" : "⛶"}
            </button>
          )}
          <button className="icon-btn" onClick={() => leaveEvent()} type="button" title="Back to lobby">
            Leave
          </button>
          {user?.isAdmin && (
            <button className="danger-btn" onClick={() => endEvent(event.id)} type="button">
              End Event
            </button>
          )}
        </div>
      </header>

      {event.gameType === "ping-pong" && <PongGame eventId={event.id} />}
      {event.gameType === "hide-and-seek" && <HideAndSeek eventId={event.id} />}
      {event.gameType === "wizard-battles" && <WizardBattles eventId={event.id} />}
      {event.gameType === "shooters" && <Shooters eventId={event.id} />}
      {event.gameType === "four-corners" && <FourCorners eventId={event.id} />}
      {event.gameType === "hide-and-seek-maze" && <HideAndSeekMaze eventId={event.id} />}
    </div>
  );
}
