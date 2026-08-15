import { ARENA_BUSHES, ARENA_WALLS, type ArenaRect } from "@koroc/shared";

function circleIntersectsRect(cx: number, cy: number, radius: number, rect: ArenaRect): boolean {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < radius * radius;
}

/** Axis-separated sliding collision: try the full move, then X-only, then Y-only. */
export function resolveWallCollision(
  x: number,
  y: number,
  newX: number,
  newY: number,
  radius: number,
): { x: number; y: number } {
  const blocked = (cx: number, cy: number) => ARENA_WALLS.some((wall) => circleIntersectsRect(cx, cy, radius, wall));
  if (!blocked(newX, newY)) return { x: newX, y: newY };
  if (!blocked(newX, y)) return { x: newX, y };
  if (!blocked(x, newY)) return { x, y: newY };
  return { x, y };
}

// Segment-vs-segment intersection (standard orientation test).
function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function segmentIntersectsRect(ax: number, ay: number, bx: number, by: number, rect: ArenaRect): boolean {
  const x0 = rect.x;
  const y0 = rect.y;
  const x1 = rect.x + rect.w;
  const y1 = rect.y + rect.h;
  // Either endpoint inside the rect counts as blocked (covers the fully-contained segment case).
  if (ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1) return true;
  if (bx >= x0 && bx <= x1 && by >= y0 && by <= y1) return true;
  return (
    segmentsIntersect(ax, ay, bx, by, x0, y0, x1, y0) ||
    segmentsIntersect(ax, ay, bx, by, x1, y0, x1, y1) ||
    segmentsIntersect(ax, ay, bx, by, x1, y1, x0, y1) ||
    segmentsIntersect(ax, ay, bx, by, x0, y1, x0, y0)
  );
}

export function hasLineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
  return !ARENA_WALLS.some((wall) => segmentIntersectsRect(ax, ay, bx, by, wall));
}

export function bushAt(x: number, y: number): ArenaRect | null {
  return ARENA_BUSHES.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) ?? null;
}

/** Can the viewer currently see the target? Always true for yourself. */
export function isVisible(
  viewer: { id: number; x: number; y: number },
  target: { id: number; x: number; y: number },
): boolean {
  if (viewer.id === target.id) return true;
  if (!hasLineOfSight(viewer.x, viewer.y, target.x, target.y)) return false;
  const targetBush = bushAt(target.x, target.y);
  if (targetBush) {
    const viewerBush = bushAt(viewer.x, viewer.y);
    if (viewerBush !== targetBush) return false;
  }
  return true;
}
