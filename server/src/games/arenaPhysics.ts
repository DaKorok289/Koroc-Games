import { ARENA_BUSHES, ARENA_WALLS, type ArenaRect } from "@koroc/shared";

function circleIntersectsRect(cx: number, cy: number, radius: number, rect: ArenaRect): boolean {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < radius * radius;
}

/** Random spawn point that never lands inside (or overlapping) a wall. */
export function randomSpawn(radius: number, walls: ArenaRect[] = ARENA_WALLS): { x: number; y: number } {
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = Math.random() * 0.8 + 0.1;
    const y = Math.random() * 0.8 + 0.1;
    if (!walls.some((wall) => circleIntersectsRect(x, y, radius, wall))) {
      return { x, y };
    }
  }
  return { x: 0.5, y: 0.5 }; // fallback — center is clear in every current layout
}

/** Axis-separated sliding collision: try the full move, then X-only, then Y-only. */
export function resolveWallCollision(
  x: number,
  y: number,
  newX: number,
  newY: number,
  radius: number,
  walls: ArenaRect[] = ARENA_WALLS,
): { x: number; y: number } {
  const blocked = (cx: number, cy: number) => walls.some((wall) => circleIntersectsRect(cx, cy, radius, wall));
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

export function hasLineOfSight(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  walls: ArenaRect[] = ARENA_WALLS,
): boolean {
  return !walls.some((wall) => segmentIntersectsRect(ax, ay, bx, by, wall));
}

export function bushAt(x: number, y: number, bushes: ArenaRect[] = ARENA_BUSHES): ArenaRect | null {
  return bushes.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) ?? null;
}

/** Can the viewer currently see the target? Always true for yourself. */
export function isVisible(
  viewer: { id: number; x: number; y: number },
  target: { id: number; x: number; y: number },
  walls: ArenaRect[] = ARENA_WALLS,
  bushes: ArenaRect[] = ARENA_BUSHES,
): boolean {
  if (viewer.id === target.id) return true;
  if (!hasLineOfSight(viewer.x, viewer.y, target.x, target.y, walls)) return false;
  const targetBush = bushAt(target.x, target.y, bushes);
  if (targetBush) {
    const viewerBush = bushAt(viewer.x, viewer.y, bushes);
    if (viewerBush !== targetBush) return false;
  }
  return true;
}

/**
 * Closest-hit raycast: fires from (px,py) along the normalized (dx,dy) direction out to
 * `range`, and returns whichever candidate it hits first (closest-point-on-ray-to-circle
 * test), or null. A candidate only counts if the shooter can currently see it (walls,
 * bushes) — you can't hit what you can't see, even if it's technically in the ray path.
 */
export function raycastHit<T extends { id: number; x: number; y: number }>(
  shooter: { id: number; x: number; y: number },
  dx: number,
  dy: number,
  range: number,
  hitRadius: number,
  candidates: T[],
): T | null {
  const len = Math.hypot(dx, dy) || 1;
  const ndx = dx / len;
  const ndy = dy / len;

  let closest: T | null = null;
  let closestT = Infinity;
  for (const candidate of candidates) {
    if (candidate.id === shooter.id) continue;
    const toX = candidate.x - shooter.x;
    const toY = candidate.y - shooter.y;
    const t = toX * ndx + toY * ndy;
    if (t < 0 || t > range || t >= closestT) continue;
    const closestX = shooter.x + ndx * t;
    const closestY = shooter.y + ndy * t;
    const distSq = (candidate.x - closestX) ** 2 + (candidate.y - closestY) ** 2;
    if (distSq > hitRadius * hitRadius) continue;
    if (!isVisible(shooter, candidate)) continue;
    closest = candidate;
    closestT = t;
  }
  return closest;
}
