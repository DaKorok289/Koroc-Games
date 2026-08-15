import { useRef } from "react";
import { GAME_INFO } from "@koroc/shared";
import { useAuth } from "../context/AuthContext";
import { useGame } from "../context/GameContext";
import { useFullscreen } from "../hooks/useFullscreen";
import { PongGame } from "./games/PongGame";
import { HideAndSeek } from "./games/HideAndSeek";
import { WizardBattles } from "./games/WizardBattles";
import { Shooters } from "./games/Shooters";

export function GameRouter() {
  const { user } = useAuth();
  const { activeEvent, endEvent } = useGame();
  const screenRef = useRef<HTMLDivElement | null>(null);
  const { isFullscreen, supported, toggle } = useFullscreen(screenRef);
  if (!activeEvent) return null;

  const info = GAME_INFO[activeEvent.gameType];

  return (
    <div className="game-screen" ref={screenRef}>
      <header className="game-header">
        <div>
          <h1>{info.label}</h1>
          <span className="started-by">started by {activeEvent.startedBy}</span>
        </div>
        <div className="header-actions">
          {supported && (
            <button className="icon-btn" onClick={toggle} type="button" title="Toggle fullscreen">
              {isFullscreen ? "⤦" : "⛶"}
            </button>
          )}
          {user?.isAdmin && (
            <button className="danger-btn" onClick={() => endEvent()} type="button">
              End Event
            </button>
          )}
        </div>
      </header>

      {activeEvent.gameType === "ping-pong" && <PongGame />}
      {activeEvent.gameType === "hide-and-seek" && <HideAndSeek />}
      {activeEvent.gameType === "wizard-battles" && <WizardBattles />}
      {activeEvent.gameType === "shooters" && <Shooters />}
    </div>
  );
}
