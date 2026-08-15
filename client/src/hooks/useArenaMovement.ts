import { useEffect, type RefObject } from "react";
import type { Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@koroc/shared";

// Drag (touch/mouse) or WASD/arrow keys to move — shared by every arena-style game
// (Hide & Seek, Wizard Battles, Shooters). Emits a normalized direction vector;
// the server is authoritative about actually moving the player.
//
// When hasFireAction is set (Wizard Battles, Shooters), the same press also toggles
// firing: aim is automatic (nearest visible opponent), but nothing fires unless you're
// actively holding down (touch, left-click, or Space).
//
// When mouseDragMovesPlayer is false, a mouse press only fires (doesn't also drag-move).
// Any fire-capable game on desktop should set this: without it, holding the mouse down
// to fire also flips on drag-movement, which then takes priority over WASD (see the
// `dragging` check in the loop below) and drifts the player toward wherever the cursor
// happens to sit relative to the click origin — keyboard movement looks broken/one-
// directional until the mouse button is released. Games with a separate desktop aim
// scheme (useMouseAim, e.g. Shooters) need this for that reason too. Touch is unaffected
// either way, since there's no separate "hover" input to give aim its own channel there.
export function useArenaMovement(
  socket: Socket | null,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  eventId: string,
  hasFireAction = false,
  mouseDragMovesPlayer = true,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !socket) return;

    let dragging = false;
    let originX = 0;
    let originY = 0;
    let lastSentDx = 0;
    let lastSentDy = 0;

    const send = (dx: number, dy: number) => {
      if (dx === lastSentDx && dy === lastSentDy) return;
      lastSentDx = dx;
      lastSentDy = dy;
      socket.emit(SOCKET_EVENTS.ARENA_INPUT, { eventId, dx, dy });
    };

    const sendFiring = (firing: boolean) => {
      if (hasFireAction) socket.emit(SOCKET_EVENTS.ARENA_FIRE, { eventId, firing });
    };

    const vectorFrom = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const dx = (clientX - originX) / (rect.width / 4);
      const dy = (clientY - originY) / (rect.height / 4);
      return { dx, dy };
    };

    const onPointerDown = (e: PointerEvent) => {
      sendFiring(true);
      if (e.pointerType === "mouse" && !mouseDragMovesPlayer) return; // fire only, don't drag-move
      dragging = true;
      originX = e.clientX;
      originY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const { dx, dy } = vectorFrom(e.clientX, e.clientY);
      send(dx, dy);
    };
    const onPointerUp = (e: PointerEvent) => {
      sendFiring(false);
      if (e.pointerType === "mouse" && !mouseDragMovesPlayer) return; // this pointer never drove movement
      dragging = false;
      send(0, 0);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    const keys = new Set<string>();
    let raf = 0;
    let spaceFiring = false;
    const loop = () => {
      raf = requestAnimationFrame(loop);

      if (hasFireAction) {
        const spaceHeld = keys.has(" ") || keys.has("Spacebar");
        if (spaceHeld !== spaceFiring) {
          spaceFiring = spaceHeld;
          sendFiring(spaceFiring || dragging);
        }
      }

      if (dragging) return; // pointer drag takes priority over keyboard
      let dx = 0;
      let dy = 0;
      if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) dy -= 1;
      if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) dy += 1;
      if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) dx -= 1;
      if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) dx += 1;
      send(dx, dy);
    };
    const onKeyDown = (e: KeyboardEvent) => keys.add(e.key);
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    raf = requestAnimationFrame(loop);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      cancelAnimationFrame(raf);
      socket.emit(SOCKET_EVENTS.ARENA_INPUT, { eventId, dx: 0, dy: 0 });
      sendFiring(false);
    };
  }, [socket, canvasRef, eventId, hasFireAction, mouseDragMovesPlayer]);
}
