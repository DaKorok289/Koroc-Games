import { useAuth } from "../context/AuthContext";
import { useGame } from "../context/GameContext";

// Only the admin who created this event can start it — gives them control over timing
// (e.g. waiting for more people to join) instead of auto-starting the moment enough
// players are present.
export function StartMatchControl({ canStart, notEnoughHint }: { canStart: boolean; notEnoughHint: string }) {
  const { user } = useAuth();
  const { activeEvent, startMatch } = useGame();
  const isCreator = !!activeEvent && !!user && activeEvent.startedBy === user.username;

  if (!isCreator) {
    return <p className="hint start-match-hint">Waiting for {activeEvent?.startedBy} to start the game…</p>;
  }

  return (
    <div className="start-match-control">
      <button className="primary-btn" onClick={() => startMatch()} type="button" disabled={!canStart}>
        Start
      </button>
      {!canStart && <span className="hint">{notEnoughHint}</span>}
    </div>
  );
}
