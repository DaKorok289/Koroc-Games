import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SOCKET_EVENTS, type ActiveEvent, type GameType, type PublicUser } from "@koroc/shared";
import { useSocket } from "./SocketContext";

interface GameContextValue {
  users: PublicUser[];
  activeEvent: ActiveEvent | null;
  errorMessage: string | null;
  startEvent: (gameType: GameType) => void;
  endEvent: () => void;
  startMatch: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

// Note: high-frequency game state (e.g. pong:state at 60fps) is intentionally NOT
// stored here — subscribing to it directly in the game component avoids re-rendering
// the whole app tree on every physics tick.
export function GameProvider({ children }: { children: ReactNode }) {
  const socket = useSocket();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    const onLobbyState = (state: { users: PublicUser[]; activeEvent: ActiveEvent | null }) => {
      setUsers(state.users);
      setActiveEvent(state.activeEvent);
    };
    const onEventStarted = (event: ActiveEvent) => setActiveEvent(event);
    const onEventEnded = () => setActiveEvent(null);
    const onError = (payload: { message: string }) => {
      setErrorMessage(payload.message);
      setTimeout(() => setErrorMessage(null), 4000);
    };

    socket.on(SOCKET_EVENTS.LOBBY_STATE, onLobbyState);
    socket.on(SOCKET_EVENTS.EVENT_STARTED, onEventStarted);
    socket.on(SOCKET_EVENTS.EVENT_ENDED, onEventEnded);
    socket.on(SOCKET_EVENTS.ERROR, onError);

    return () => {
      socket.off(SOCKET_EVENTS.LOBBY_STATE, onLobbyState);
      socket.off(SOCKET_EVENTS.EVENT_STARTED, onEventStarted);
      socket.off(SOCKET_EVENTS.EVENT_ENDED, onEventEnded);
      socket.off(SOCKET_EVENTS.ERROR, onError);
    };
  }, [socket]);

  const value = useMemo<GameContextValue>(
    () => ({
      users,
      activeEvent,
      errorMessage,
      startEvent: (gameType) => socket?.emit(SOCKET_EVENTS.ADMIN_START_EVENT, { gameType }),
      endEvent: () => socket?.emit(SOCKET_EVENTS.ADMIN_END_EVENT),
      startMatch: () => socket?.emit(SOCKET_EVENTS.ADMIN_START_MATCH),
    }),
    [users, activeEvent, errorMessage, socket],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}
