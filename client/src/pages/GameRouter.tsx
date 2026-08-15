import { GAME_INFO } from "@koroc/shared";
import { useAuth } from "../context/AuthContext";
import { useGame } from "../context/GameContext";
import { PongGame } from "./games/PongGame";
import { HideAndSeek } from "./games/HideAndSeek";
import { WizardBattles } from "./games/WizardBattles";
import { Shooters } from "./games/Shooters";

export function GameRouter() {
  const { user } = useAuth();
  const { activeEvent, endEvent } = useGame();
  if (!activeEvent) return null;

  const info = GAME_INFO[activeEvent.gameType];

  return (
    <div className="game-screen">
      <header className="game-header">
        <div>
          <h1>{info.label}</h1>
          <span className="started-by">started by {activeEvent.startedBy}</span>
        </div>
        {user?.isAdmin && (
          <button className="danger-btn" onClick={() => endEvent()} type="button">
            End Event
          </button>
        )}
      </header>

      {activeEvent.gameType === "ping-pong" && <PongGame />}
      {activeEvent.gameType === "hide-and-seek" && <HideAndSeek />}
      {activeEvent.gameType === "wizard-battles" && <WizardBattles />}
      {activeEvent.gameType === "shooters" && <Shooters />}
    </div>
  );
}
