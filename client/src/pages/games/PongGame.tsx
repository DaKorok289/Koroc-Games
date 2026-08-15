import { useEffect, useRef, useState } from "react";
import { SOCKET_EVENTS, type PongState, type PongTournamentState } from "@koroc/shared";
import { useSocket } from "../../context/SocketContext";
import { useAuth } from "../../context/AuthContext";
import { PlayerRoster } from "../../components/PlayerRoster";
import { StartMatchControl } from "../../components/StartMatchControl";
import { PongMatchView } from "./PongMatchView";
import { PongBracketTree } from "./PongBracketTree";

export function PongGame({ eventId }: { eventId: string }) {
  const socket = useSocket();
  const { user } = useAuth();
  const liveRef = useRef<PongState | null>(null);
  const [displayState, setDisplayState] = useState<PongTournamentState | null>(null);

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
    const onState = (state: PongTournamentState) => {
      liveRef.current = state.live;
      setDisplayState((prev) => {
        const now = performance.now();
        const changedPhaseOrMatch = !prev || prev.phase !== state.phase || prev.currentMatchId !== state.currentMatchId;
        const changedLiveStatus = prev?.live?.status !== state.live?.status;
        if (now - lastUiSync > 150 || changedPhaseOrMatch || changedLiveStatus) {
          lastUiSync = now;
          return state;
        }
        return prev;
      });
    };
    socket.on(SOCKET_EVENTS.PONG_TOURNAMENT_STATE, onState);
    return () => {
      socket.off(SOCKET_EVENTS.PONG_TOURNAMENT_STATE, onState);
    };
  }, [socket]);

  if (!displayState) {
    return (
      <div className="arena-wrap">
        <p className="hint">Loading…</p>
      </div>
    );
  }

  if (displayState.phase === "registration") {
    return (
      <div className="arena-wrap">
        <PlayerRoster players={displayState.roster} youId={user?.id} title="Players joining the tournament" />
        <StartMatchControl
          eventId={eventId}
          canStart={displayState.roster.length >= 2}
          notEnoughHint="Need at least 2 players to start"
        />
        <p className="pong-role">
          The bracket is generated the moment the host starts it — everyone who's joined by then is entered.
        </p>
      </div>
    );
  }

  if (displayState.phase === "finished") {
    return (
      <div className="arena-wrap">
        <div className="pong-overlay-standalone">🏆 {displayState.champion?.username} wins the tournament!</div>
        <PongBracketTree rounds={displayState.rounds} currentMatchId={null} youId={user?.id} />
      </div>
    );
  }

  return (
    <div className="arena-wrap">
      {displayState.live ? (
        <PongMatchView socket={socket} eventId={eventId} liveRef={liveRef} live={displayState.live} youId={user?.id} />
      ) : (
        <p className="pong-role">Waiting for the next match…</p>
      )}
      <PongBracketTree rounds={displayState.rounds} currentMatchId={displayState.currentMatchId} youId={user?.id} />
    </div>
  );
}
