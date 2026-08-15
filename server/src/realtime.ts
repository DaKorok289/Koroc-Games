import type { Server, Socket } from "socket.io";
import { parse as parseCookie } from "cookie";
import {
  GAME_TYPES,
  PLAYER_COLOR_PRESETS,
  SOCKET_EVENTS,
  defaultColorForUser,
  type ActiveEvent,
  type GameType,
  type LobbyState,
  type PublicUser,
} from "@koroc/shared";
import { AUTH_COOKIE, parseUserFromToken } from "./auth";
import { getLeaderboard, recordWin } from "./db";
import { PongTournament } from "./games/pongTournament";
import { HideAndSeekGame } from "./games/hideAndSeek";
import { WizardBattleGame } from "./games/wizardBattles";
import { ShooterGame } from "./games/shooters";

interface AuthedSocket extends Socket {
  data: { user: PublicUser };
}

type GameInstance = PongTournament | HideAndSeekGame | WizardBattleGame | ShooterGame;

interface EventEntry {
  meta: ActiveEvent;
  game: GameInstance;
}

const connectedUsers = new Map<string, PublicUser>();
const events = new Map<string, EventEntry>();
// Tracks which event each socket has actually joined (as opposed to just seeing it
// listed), so disconnect/cleanup knows which game instance to remove it from.
const socketEventId = new Map<string, string>();
const userColors = new Map<number, string>();
let eventCounter = 0;

function room(eventId: string): string {
  return `event:${eventId}`;
}

function colorFor(userId: number): string {
  return userColors.get(userId) ?? defaultColorForUser(userId);
}

function distinctUsers(): PublicUser[] {
  const byId = new Map<number, PublicUser>();
  for (const u of connectedUsers.values()) byId.set(u.id, u);
  return Array.from(byId.values());
}

function lobbyState(): LobbyState {
  return {
    users: distinctUsers(),
    events: Array.from(events.values()).map((e) => ({ ...e.meta, playerCount: e.game.getPlayerCount() })),
  };
}

export function registerRealtime(io: Server): void {
  io.use((socket, next) => {
    const raw = socket.request.headers.cookie;
    const cookies = raw ? parseCookie(raw) : {};
    const user = parseUserFromToken(cookies[AUTH_COOKIE]);
    if (!user) {
      next(new Error("unauthorized"));
      return;
    }
    (socket as AuthedSocket).data.user = user;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const s = socket as AuthedSocket;
    const user = s.data.user;
    connectedUsers.set(socket.id, user);
    io.emit(SOCKET_EVENTS.LOBBY_STATE, lobbyState());
    socket.emit(SOCKET_EVENTS.LEADERBOARD_STATE, getLeaderboard());

    socket.on(SOCKET_EVENTS.ADMIN_START_EVENT, (payload: { gameType: GameType }) => {
      if (!user.isAdmin) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Only admins can start events" });
        return;
      }
      if (!GAME_TYPES.includes(payload?.gameType)) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Unknown game type" });
        return;
      }
      const duplicate = Array.from(events.values()).some((e) => e.meta.gameType === payload.gameType);
      if (duplicate) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          message: `A ${payload.gameType} event is already open — join it from the Join Games tab instead of starting another.`,
        });
        return;
      }

      eventCounter += 1;
      const id = `evt-${eventCounter}`;
      const meta: ActiveEvent = { id, gameType: payload.gameType, startedBy: user.username, playerCount: 0 };
      const onEnd = () => endEvent(io, id);

      let game: GameInstance;
      switch (payload.gameType) {
        case "ping-pong":
          game = new PongTournament((state) => io.to(room(id)).emit(SOCKET_EVENTS.PONG_TOURNAMENT_STATE, state), onEnd);
          break;
        case "hide-and-seek":
          game = new HideAndSeekGame((state) => io.to(room(id)).emit(SOCKET_EVENTS.HIDE_SEEK_STATE, state), onEnd);
          break;
        case "wizard-battles":
          game = new WizardBattleGame(io, SOCKET_EVENTS.WIZARD_STATE, onEnd);
          break;
        case "shooters":
          game = new ShooterGame(io, SOCKET_EVENTS.SHOOTER_STATE, onEnd);
          break;
      }

      events.set(id, { meta, game });
      io.emit(SOCKET_EVENTS.LOBBY_STATE, lobbyState());
    });

    socket.on(SOCKET_EVENTS.ADMIN_END_EVENT, (payload: { eventId: string }) => {
      if (!user.isAdmin) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Only admins can end events" });
        return;
      }
      if (!events.has(payload?.eventId)) return;
      endEvent(io, payload.eventId);
    });

    // Only the specific admin who created an event can start it — everyone else just
    // waits, so the creator controls timing (e.g. waiting for more sign-ups).
    socket.on(SOCKET_EVENTS.ADMIN_START_MATCH, (payload: { eventId: string }) => {
      const entry = events.get(payload?.eventId);
      if (!entry || entry.meta.startedBy !== user.username) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Only the event's creator can start it" });
        return;
      }
      const ok = entry.game.requestStart();
      if (!ok) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Need at least 2 players joined to start" });
      }
    });

    socket.on(SOCKET_EVENTS.SET_COLOR, (payload: { color: string }) => {
      if (typeof payload?.color === "string" && (PLAYER_COLOR_PRESETS as readonly string[]).includes(payload.color)) {
        userColors.set(user.id, payload.color);
      }
    });

    socket.on(
      SOCKET_EVENTS.GAME_JOIN,
      (payload: { eventId: string }, ack?: (res: { role: string; gameType?: GameType }) => void) => {
        const entry = events.get(payload?.eventId);
        if (!entry) {
          ack?.({ role: "spectator" });
          return;
        }
        socket.join(room(entry.meta.id));
        socketEventId.set(socket.id, entry.meta.id);
        if (entry.game instanceof PongTournament) {
          entry.game.addParticipant(user, socket.id);
        } else {
          entry.game.addParticipant(user, socket.id, colorFor(user.id));
        }
        ack?.({ role: "player", gameType: entry.meta.gameType });
        io.emit(SOCKET_EVENTS.LOBBY_STATE, lobbyState());
      },
    );

    socket.on(SOCKET_EVENTS.GAME_LEAVE, (payload: { eventId: string }) => {
      const eventId = payload?.eventId ?? socketEventId.get(socket.id);
      const entry = eventId ? events.get(eventId) : undefined;
      entry?.game.removeParticipant(socket.id);
      if (eventId) {
        socket.leave(room(eventId));
        socketEventId.delete(socket.id);
      }
      io.emit(SOCKET_EVENTS.LOBBY_STATE, lobbyState());
    });

    socket.on(SOCKET_EVENTS.PONG_INPUT, (payload: { eventId: string; paddleY: number }) => {
      const entry = events.get(payload?.eventId);
      if (entry?.game instanceof PongTournament && typeof payload?.paddleY === "number") {
        entry.game.handleInput(socket.id, payload.paddleY);
      }
    });

    socket.on(SOCKET_EVENTS.ARENA_INPUT, (payload: { eventId: string; dx: number; dy: number }) => {
      const entry = events.get(payload?.eventId);
      if (!entry || typeof payload?.dx !== "number" || typeof payload?.dy !== "number") return;
      if (entry.game instanceof HideAndSeekGame || entry.game instanceof WizardBattleGame || entry.game instanceof ShooterGame) {
        entry.game.handleInput(socket.id, payload.dx, payload.dy);
      }
    });

    socket.on(SOCKET_EVENTS.ARENA_FIRE, (payload: { eventId: string; firing: boolean }) => {
      const entry = events.get(payload?.eventId);
      if (!entry || typeof payload?.firing !== "boolean") return;
      if (entry.game instanceof WizardBattleGame || entry.game instanceof ShooterGame) {
        entry.game.setFiring(socket.id, payload.firing);
      }
    });

    // Explicit aim override (e.g. mouse cursor direction on desktop) — independent of
    // movement, which is why it's a separate event from ARENA_INPUT.
    socket.on(SOCKET_EVENTS.ARENA_AIM, (payload: { eventId: string; dx: number; dy: number }) => {
      const entry = events.get(payload?.eventId);
      if (!entry || typeof payload?.dx !== "number" || typeof payload?.dy !== "number") return;
      if (entry.game instanceof WizardBattleGame || entry.game instanceof ShooterGame) {
        entry.game.setAim(socket.id, payload.dx, payload.dy);
      }
    });

    socket.on("disconnect", () => {
      connectedUsers.delete(socket.id);
      const eventId = socketEventId.get(socket.id);
      if (eventId) {
        events.get(eventId)?.game.removeParticipant(socket.id);
        socketEventId.delete(socket.id);
      }
      io.emit(SOCKET_EVENTS.LOBBY_STATE, lobbyState());
    });
  });
}

function endEvent(io: Server, eventId: string): void {
  const entry = events.get(eventId);
  if (!entry) return;
  const winnerIds = entry.game.getWinnerUserIds();
  for (const userId of winnerIds) recordWin(userId, entry.meta.gameType);
  if (winnerIds.length > 0) io.emit(SOCKET_EVENTS.LEADERBOARD_STATE, getLeaderboard());
  entry.game.destroy();
  events.delete(eventId);
  io.to(room(eventId)).emit(SOCKET_EVENTS.EVENT_ENDED, { eventId });
  io.in(room(eventId)).socketsLeave(room(eventId));
  for (const [socketId, id] of socketEventId) {
    if (id === eventId) socketEventId.delete(socketId);
  }
  io.emit(SOCKET_EVENTS.LOBBY_STATE, lobbyState());
}
