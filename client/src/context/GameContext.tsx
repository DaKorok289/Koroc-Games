import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  PLAYER_COLOR_PRESETS,
  SOCKET_EVENTS,
  defaultColorForUser,
  type ActiveEvent,
  type GameType,
  type LeaderboardEntry,
  type PublicUser,
  type ShopState,
} from "@koroc/shared";
import { useAuth } from "./AuthContext";
import { useSocket } from "./SocketContext";

const COLOR_STORAGE_KEY = "koroc_player_color";

interface GameContextValue {
  users: PublicUser[];
  events: ActiveEvent[];
  myEventId: string | null;
  errorMessage: string | null;
  myColor: string;
  setMyColor: (color: string) => void;
  leaderboard: LeaderboardEntry[];
  shop: ShopState;
  purchaseCosmetic: (cosmeticId: string) => void;
  startEvent: (gameType: GameType) => void;
  joinEvent: (eventId: string) => void;
  leaveEvent: () => void;
  endEvent: (eventId: string) => void;
  startMatch: (eventId: string) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

// Note: high-frequency game state (e.g. wizard:state at 30fps) is intentionally NOT
// stored here — subscribing to it directly in the game component avoids re-rendering
// the whole app tree on every physics tick.
export function GameProvider({ children }: { children: ReactNode }) {
  const socket = useSocket();
  const { user } = useAuth();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [events, setEvents] = useState<ActiveEvent[]>([]);
  const [myEventId, setMyEventId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [shop, setShop] = useState<ShopState>({ coins: 0, owned: [] });
  const [myColor, setMyColorState] = useState<string>(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(COLOR_STORAGE_KEY) : null;
    if (stored && (PLAYER_COLOR_PRESETS as readonly string[]).includes(stored)) return stored;
    return user ? defaultColorForUser(user.id) : PLAYER_COLOR_PRESETS[0];
  });

  useEffect(() => {
    if (!socket) return;

    const onLobbyState = (state: { users: PublicUser[]; events: ActiveEvent[] }) => {
      setUsers(state.users);
      setEvents(state.events);
    };
    const onEventEnded = (payload: { eventId: string }) => {
      setMyEventId((current) => (current === payload.eventId ? null : current));
    };
    const onError = (payload: { message: string }) => {
      setErrorMessage(payload.message);
      setTimeout(() => setErrorMessage(null), 4000);
    };
    const onLeaderboard = (entries: LeaderboardEntry[]) => setLeaderboard(entries);
    const onShop = (state: ShopState) => setShop(state);

    socket.on(SOCKET_EVENTS.LOBBY_STATE, onLobbyState);
    socket.on(SOCKET_EVENTS.EVENT_ENDED, onEventEnded);
    socket.on(SOCKET_EVENTS.ERROR, onError);
    socket.on(SOCKET_EVENTS.LEADERBOARD_STATE, onLeaderboard);
    socket.on(SOCKET_EVENTS.SHOP_STATE, onShop);

    return () => {
      socket.off(SOCKET_EVENTS.LOBBY_STATE, onLobbyState);
      socket.off(SOCKET_EVENTS.EVENT_ENDED, onEventEnded);
      socket.off(SOCKET_EVENTS.ERROR, onError);
      socket.off(SOCKET_EVENTS.LEADERBOARD_STATE, onLeaderboard);
      socket.off(SOCKET_EVENTS.SHOP_STATE, onShop);
    };
  }, [socket]);

  // Reset local "which game am I in" state on a fresh connection (e.g. reconnect after
  // a dropped connection) so the UI doesn't get stuck showing a game screen for an
  // event the server no longer has us registered in.
  useEffect(() => {
    if (!socket) setMyEventId(null);
  }, [socket]);

  // The server keeps colors in memory only, so re-send on every (re)connect.
  useEffect(() => {
    socket?.emit(SOCKET_EVENTS.SET_COLOR, { color: myColor });
  }, [socket, myColor]);

  const setMyColor = (color: string) => {
    setMyColorState(color);
    window.localStorage.setItem(COLOR_STORAGE_KEY, color);
  };

  const value = useMemo<GameContextValue>(
    () => ({
      users,
      events,
      myEventId,
      errorMessage,
      myColor,
      setMyColor,
      leaderboard,
      shop,
      purchaseCosmetic: (cosmeticId) => socket?.emit(SOCKET_EVENTS.PURCHASE_COSMETIC, { cosmeticId }),
      startEvent: (gameType) => socket?.emit(SOCKET_EVENTS.ADMIN_START_EVENT, { gameType }),
      joinEvent: (eventId) => {
        socket?.emit(SOCKET_EVENTS.GAME_JOIN, { eventId }, () => setMyEventId(eventId));
      },
      leaveEvent: () => {
        if (!myEventId) return;
        socket?.emit(SOCKET_EVENTS.GAME_LEAVE, { eventId: myEventId });
        setMyEventId(null);
      },
      endEvent: (eventId) => socket?.emit(SOCKET_EVENTS.ADMIN_END_EVENT, { eventId }),
      startMatch: (eventId) => socket?.emit(SOCKET_EVENTS.ADMIN_START_MATCH, { eventId }),
    }),
    [users, events, myEventId, errorMessage, myColor, leaderboard, shop, socket],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}
