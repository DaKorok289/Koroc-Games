import { GAME_INFO } from "@koroc/shared";
import { useAuth } from "../context/AuthContext";
import { useGame } from "../context/GameContext";
import { PongGame } from "./games/PongGame";
import { ComingSoon } from "./games/ComingSoon";

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

      {activeEvent.gameType === "ping-pong" ? <PongGame /> : <ComingSoon gameType={activeEvent.gameType} />}
    </div>
  );
}
