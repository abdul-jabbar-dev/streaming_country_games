/**
 * High-Precision Geometric Line-Crossing & Intersection Utilities
 * Zero-allocation continuous collision detection (CCD) for moving flag balls
 * crossing static/moving connection line segments.
 */

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Checks whether two 2D line segments (p1->p2) and (q1->q2) intersect.
 */
export function doSegmentsIntersect(
  p1: Point2D,
  p2: Point2D,
  q1: Point2D,
  q2: Point2D
): boolean {
  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  const dx2 = q2.x - q1.x;
  const dy2 = q2.y - q1.y;

  const denominator = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denominator) < 1e-9) {
    return false;
  }

  const s = ((q1.x - p1.x) * dy2 - (q1.y - p1.y) * dx2) / denominator;
  const t = ((q1.x - p1.x) * dy1 - (q1.y - p1.y) * dx1) / denominator;

  return s >= 0 && s <= 1 && t >= 0 && t <= 1;
}

/**
 * Computes shortest distance from point P to line segment (A->B)
 */
export function pointToSegmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;

  const abLenSq = abx * abx + aby * aby;
  if (abLenSq < 1e-9) {
    return Math.sqrt(apx * apx + apy * apy);
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  const projX = a.x + t * abx;
  const projY = a.y + t * aby;

  const dx = p.x - projX;
  const dy = p.y - projY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Zero-allocation continuous collision check using coordinate scalars.
 * Avoids any heap allocation during 60 FPS physics loops.
 */
export function checkBallCrossesSegmentCoords(
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  ballRadius: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): boolean {
  // 1. Fast AABB bounding box rejection
  const ballMinX = Math.min(p0x, p1x) - ballRadius;
  const ballMaxX = Math.max(p0x, p1x) + ballRadius;
  const ballMinY = Math.min(p0y, p1y) - ballRadius;
  const ballMaxY = Math.max(p0y, p1y) + ballRadius;

  const segMinX = Math.min(ax, bx);
  const segMaxX = Math.max(ax, bx);
  const segMinY = Math.min(ay, by);
  const segMaxY = Math.max(ay, by);

  if (
    ballMaxX < segMinX ||
    ballMinX > segMaxX ||
    ballMaxY < segMinY ||
    ballMinY > segMaxY
  ) {
    return false;
  }

  // 2. Direct segment crossing check (swept center line)
  const dx1 = p1x - p0x;
  const dy1 = p1y - p0y;
  const dx2 = bx - ax;
  const dy2 = by - ay;

  const denominator = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denominator) >= 1e-9) {
    const s = ((ax - p0x) * dy2 - (ay - p0y) * dx2) / denominator;
    const t = ((ax - p0x) * dy1 - (ay - p0y) * dx1) / denominator;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
      return true;
    }
  }

  // 3. Proximity check at current position and midpoint (squared distance to avoid Math.sqrt)
  const abLenSq = dx2 * dx2 + dy2 * dy2;
  if (abLenSq > 1e-9) {
    const radSq = ballRadius * ballRadius;

    // Current position
    const apx1 = p1x - ax;
    const apy1 = p1y - ay;
    const t1 = Math.max(0, Math.min(1, (apx1 * dx2 + apy1 * dy2) / abLenSq));
    const projX1 = ax + t1 * dx2;
    const projY1 = ay + t1 * dy2;
    const distSq1 = (p1x - projX1) * (p1x - projX1) + (p1y - projY1) * (p1y - projY1);
    if (distSq1 <= radSq) {
      return true;
    }

    // Midpoint position (handles high-speed hops)
    const midX = (p0x + p1x) * 0.5;
    const midY = (p0y + p1y) * 0.5;
    const apxMid = midX - ax;
    const apyMid = midY - ay;
    const tMid = Math.max(0, Math.min(1, (apxMid * dx2 + apyMid * dy2) / abLenSq));
    const projXMid = ax + tMid * dx2;
    const projYMid = ay + tMid * dy2;
    const distSqMid = (midX - projXMid) * (midX - projXMid) + (midY - projYMid) * (midY - projYMid);
    if (distSqMid <= radSq) {
      return true;
    }
  }

  return false;
}

/**
 * Point2D wrapper for checkBallCrossesSegmentCoords
 */
export function checkBallCrossesSegment(
  p0: Point2D,
  p1: Point2D,
  ballRadius: number,
  a: Point2D,
  b: Point2D
): boolean {
  return checkBallCrossesSegmentCoords(p0.x, p0.y, p1.x, p1.y, ballRadius, a.x, a.y, b.x, b.y);
}
