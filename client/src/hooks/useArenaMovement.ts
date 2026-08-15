import { useEffect, type RefObject } from "react";
import type { Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@koroc/shared";

// Drag (touch/mouse) or WASD/arrow keys to move — shared by every arena-style game
// (Hide & Seek, Wizard Battles, Shooters). Emits a normalized direction vector;
// the server is authoritative about actually moving the player.
export function useArenaMovement(socket: Socket | null, canvasRef: RefObject<HTMLCanvasElement | null>): void {
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
      socket.emit(SOCKET_EVENTS.ARENA_INPUT, { dx, dy });
    };

    const vectorFrom = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const dx = (clientX - originX) / (rect.width / 4);
      const dy = (clientY - originY) / (rect.height / 4);
      return { dx, dy };
    };

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      originX = e.clientX;
      originY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const { dx, dy } = vectorFrom(e.clientX, e.clientY);
      send(dx, dy);
    };
    const onPointerUp = () => {
      dragging = false;
      send(0, 0);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    const keys = new Set<string>();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
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
      socket.emit(SOCKET_EVENTS.ARENA_INPUT, { dx: 0, dy: 0 });
    };
  }, [socket, canvasRef]);
}
