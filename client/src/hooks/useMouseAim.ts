import { useEffect, type RefObject } from "react";
import type { Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@koroc/shared";

interface AimablePlayer {
  id: number;
  x: number;
  y: number;
}

interface AimableState {
  players: AimablePlayer[];
}

// Desktop-only: continuously points your character toward the mouse cursor, independent
// of movement (which stays on WASD/drag). Only reacts to real mouse input — touch
// devices don't fire `mousemove` from touch alone, so this is a no-op there and the
// unified drag-direction aim in useArenaMovement covers touch instead.
export function useMouseAim(
  socket: Socket | null,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  eventId: string,
  stateRef: RefObject<AimableState | null>,
  myId: number | undefined,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !socket || myId === undefined) return;

    let lastDx = 0;
    let lastDy = 0;

    const onMouseMove = (e: MouseEvent) => {
      const me = stateRef.current?.players.find((p) => p.id === myId);
      if (!me) return;
      const rect = canvas.getBoundingClientRect();
      const px = rect.left + me.x * rect.width;
      const py = rect.top + me.y * rect.height;
      const dx = e.clientX - px;
      const dy = e.clientY - py;
      const len = Math.hypot(dx, dy);
      if (len < 1) return; // cursor essentially on top of the player — keep last aim
      const ndx = dx / len;
      const ndy = dy / len;
      if (Math.abs(ndx - lastDx) < 0.02 && Math.abs(ndy - lastDy) < 0.02) return;
      lastDx = ndx;
      lastDy = ndy;
      socket.emit(SOCKET_EVENTS.ARENA_AIM, { eventId, dx: ndx, dy: ndy });
    };

    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [socket, canvasRef, eventId, stateRef, myId]);
}
