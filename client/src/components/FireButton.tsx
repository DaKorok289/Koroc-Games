import type { Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@koroc/shared";

// Pairs with DPad for touch devices: D-pad occupies one thumb for movement, this button
// gives the other thumb an explicit way to fire (aim still follows facing direction).
export function FireButton({ socket, eventId, label }: { socket: Socket | null; eventId: string; label: string }) {
  const setFiring = (firing: boolean) => socket?.emit(SOCKET_EVENTS.ARENA_FIRE, { eventId, firing });

  return (
    <button
      className="fire-btn"
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        setFiring(true);
      }}
      onPointerUp={() => setFiring(false)}
      onPointerLeave={() => setFiring(false)}
      onPointerCancel={() => setFiring(false)}
      aria-label={label}
    >
      {label}
    </button>
  );
}
