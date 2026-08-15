import { useAuth } from "../context/AuthContext";
import { useGame } from "../context/GameContext";

// Only the admin who created this event can start it — gives them control over timing
// (e.g. waiting for more people to join) instead of auto-starting the moment enough
// players are present.
export function StartMatchControl({
  eventId,
  canStart,
  notEnoughHint,
}: {
  eventId: string;
  canStart: boolean;
  notEnoughHint: string;
}) {
  const { user } = useAuth();
  const { events, startMatch } = useGame();
  const event = events.find((e) => e.id === eventId);
  const isCreator = !!event && !!user && event.startedBy === user.username;

  if (!isCreator) {
    return <p className="hint start-match-hint">Waiting for {event?.startedBy} to start the game…</p>;
  }

  return (
    <div className="start-match-control">
      <button className="primary-btn" onClick={() => startMatch(eventId)} type="button" disabled={!canStart}>
        Start
      </button>
      {!canStart && <span className="hint">{notEnoughHint}</span>}
    </div>
  );
}
