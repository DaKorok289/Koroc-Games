import { useRef } from "react";
import type { Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@koroc/shared";

type Direction = "up" | "down" | "left" | "right";

// On-screen movement buttons — supplements drag/WASD so touch-device players (iPad
// especially) always have an explicit, discoverable way to move, not just an implied
// "drag on the arena" gesture.
export function DPad({ socket, eventId }: { socket: Socket | null; eventId: string }) {
  const pressed = useRef<Record<Direction, boolean>>({ up: false, down: false, left: false, right: false });

  const send = () => {
    let dx = 0;
    let dy = 0;
    if (pressed.current.up) dy -= 1;
    if (pressed.current.down) dy += 1;
    if (pressed.current.left) dx -= 1;
    if (pressed.current.right) dx += 1;
    const len = Math.hypot(dx, dy) || 1;
    socket?.emit(SOCKET_EVENTS.ARENA_INPUT, { eventId, dx: dx / len, dy: dy / len });
  };

  const handlers = (dir: Direction) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      pressed.current[dir] = true;
      send();
    },
    onPointerUp: () => {
      pressed.current[dir] = false;
      send();
    },
    onPointerLeave: () => {
      pressed.current[dir] = false;
      send();
    },
    onPointerCancel: () => {
      pressed.current[dir] = false;
      send();
    },
  });

  return (
    <div className="dpad" aria-label="Movement controls">
      <button className="dpad-btn dpad-up" type="button" {...handlers("up")} aria-label="Move up">
        ▲
      </button>
      <button className="dpad-btn dpad-left" type="button" {...handlers("left")} aria-label="Move left">
        ◀
      </button>
      <button className="dpad-btn dpad-right" type="button" {...handlers("right")} aria-label="Move right">
        ▶
      </button>
      <button className="dpad-btn dpad-down" type="button" {...handlers("down")} aria-label="Move down">
        ▼
      </button>
    </div>
  );
}
