import type { Server, Socket } from "socket.io";
import { parse as parseCookie } from "cookie";
import {
  GAME_TYPES,
  SOCKET_EVENTS,
  type ActiveEvent,
  type GameType,
  type LobbyState,
  type PublicUser,
} from "@koroc/shared";
import { AUTH_COOKIE, parseUserFromToken } from "./auth";
import { PongGame } from "./games/pong";
import { HideAndSeekGame } from "./games/hideAndSeek";
import { WizardBattleGame } from "./games/wizardBattles";
import { ShooterGame } from "./games/shooters";

interface AuthedSocket extends Socket {
  data: { user: PublicUser };
}

const connectedUsers = new Map<string, PublicUser>();
let activeEvent: ActiveEvent | null = null;
let pongGame: PongGame | null = null;
let hideAndSeekGame: HideAndSeekGame | null = null;
let wizardBattleGame: WizardBattleGame | null = null;
let shooterGame: ShooterGame | null = null;
let eventCounter = 0;

function distinctUsers(): PublicUser[] {
  const byId = new Map<number, PublicUser>();
  for (const u of connectedUsers.values()) byId.set(u.id, u);
  return Array.from(byId.values());
}

function lobbyState(): LobbyState {
  return { users: distinctUsers(), activeEvent };
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
    if (activeEvent) {
      socket.emit(SOCKET_EVENTS.EVENT_STARTED, activeEvent);
      if (pongGame) socket.emit(SOCKET_EVENTS.PONG_STATE, pongGame.getState());
      if (hideAndSeekGame) socket.emit(SOCKET_EVENTS.HIDE_SEEK_STATE, hideAndSeekGame.getState());
      if (wizardBattleGame) socket.emit(SOCKET_EVENTS.WIZARD_STATE, wizardBattleGame.getState());
      if (shooterGame) socket.emit(SOCKET_EVENTS.SHOOTER_STATE, shooterGame.getState());
    }

    socket.on(SOCKET_EVENTS.ADMIN_START_EVENT, (payload: { gameType: GameType }) => {
      if (!user.isAdmin) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Only admins can start events" });
        return;
      }
      if (activeEvent) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "An event is already running" });
        return;
      }
      if (!GAME_TYPES.includes(payload?.gameType)) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Unknown game type" });
        return;
      }

      eventCounter += 1;
      activeEvent = { id: `evt-${eventCounter}`, gameType: payload.gameType, startedBy: user.username };

      switch (payload.gameType) {
        case "ping-pong":
          pongGame = new PongGame(
            (state) => io.emit(SOCKET_EVENTS.PONG_STATE, state),
            () => endActiveEvent(io),
          );
          break;
        case "hide-and-seek":
          hideAndSeekGame = new HideAndSeekGame(
            (state) => io.emit(SOCKET_EVENTS.HIDE_SEEK_STATE, state),
            () => endActiveEvent(io),
          );
          break;
        case "wizard-battles":
          wizardBattleGame = new WizardBattleGame(
            (state) => io.emit(SOCKET_EVENTS.WIZARD_STATE, state),
            () => endActiveEvent(io),
          );
          break;
        case "shooters":
          shooterGame = new ShooterGame(
            (state) => io.emit(SOCKET_EVENTS.SHOOTER_STATE, state),
            () => endActiveEvent(io),
          );
          break;
      }

      io.emit(SOCKET_EVENTS.EVENT_STARTED, activeEvent);
      io.emit(SOCKET_EVENTS.LOBBY_STATE, lobbyState());
    });

    socket.on(SOCKET_EVENTS.ADMIN_END_EVENT, () => {
      if (!user.isAdmin) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Only admins can end events" });
        return;
      }
      endActiveEvent(io);
    });

    socket.on(SOCKET_EVENTS.GAME_JOIN, (_payload: unknown, ack?: (res: { role: string }) => void) => {
      if (activeEvent?.gameType === "ping-pong" && pongGame) {
        const role = pongGame.addParticipant(user, socket.id);
        ack?.({ role });
      } else if (activeEvent?.gameType === "hide-and-seek" && hideAndSeekGame) {
        hideAndSeekGame.addParticipant(user, socket.id);
        ack?.({ role: "player" });
      } else if (activeEvent?.gameType === "wizard-battles" && wizardBattleGame) {
        wizardBattleGame.addParticipant(user, socket.id);
        ack?.({ role: "player" });
      } else if (activeEvent?.gameType === "shooters" && shooterGame) {
        shooterGame.addParticipant(user, socket.id);
        ack?.({ role: "player" });
      } else {
        ack?.({ role: "spectator" });
      }
    });

    socket.on(SOCKET_EVENTS.GAME_LEAVE, () => {
      pongGame?.removeParticipant(socket.id);
      hideAndSeekGame?.removeParticipant(socket.id);
      wizardBattleGame?.removeParticipant(socket.id);
      shooterGame?.removeParticipant(socket.id);
    });

    socket.on(SOCKET_EVENTS.PONG_INPUT, (payload: { paddleY: number }) => {
      if (typeof payload?.paddleY === "number") {
        pongGame?.handleInput(socket.id, payload.paddleY);
      }
    });

    socket.on(SOCKET_EVENTS.ARENA_INPUT, (payload: { dx: number; dy: number }) => {
      if (typeof payload?.dx !== "number" || typeof payload?.dy !== "number") return;
      hideAndSeekGame?.handleInput(socket.id, payload.dx, payload.dy);
      wizardBattleGame?.handleInput(socket.id, payload.dx, payload.dy);
      shooterGame?.handleInput(socket.id, payload.dx, payload.dy);
    });

    socket.on("disconnect", () => {
      connectedUsers.delete(socket.id);
      pongGame?.removeParticipant(socket.id);
      hideAndSeekGame?.removeParticipant(socket.id);
      wizardBattleGame?.removeParticipant(socket.id);
      shooterGame?.removeParticipant(socket.id);
      io.emit(SOCKET_EVENTS.LOBBY_STATE, lobbyState());
    });
  });
}

function endActiveEvent(io: Server): void {
  if (!activeEvent) return;
  pongGame?.destroy();
  pongGame = null;
  hideAndSeekGame?.destroy();
  hideAndSeekGame = null;
  wizardBattleGame?.destroy();
  wizardBattleGame = null;
  shooterGame?.destroy();
  shooterGame = null;
  activeEvent = null;
  io.emit(SOCKET_EVENTS.EVENT_ENDED);
  io.emit(SOCKET_EVENTS.LOBBY_STATE, lobbyState());
}
