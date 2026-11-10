/**
 * Rotating Boundary Physics for Country Eliminate Arena
 * Models rotating circular perimeter, open gap pass-through, and tip bounce
 */

import type { EliminateBall } from './EliminateBall.ts';

export class RotatingBoundary {
  public currentAngleRad: number = 0; // Current gap center orientation
  public lastRotationSpeedRad: number = 0.016;
  public readonly centerX: number;
  public readonly centerY: number;
  public readonly radius: number;
  public readonly gapAngleWidthRad: number;
  public readonly escapeThreshold: number;

  constructor(
    centerX: number,
    centerY: number,
    radius: number,
    gapAngleWidthRad: number,
    escapeThreshold: number
  ) {
    this.centerX = centerX;
    this.centerY = centerY;
    this.radius = radius;
    this.gapAngleWidthRad = gapAngleWidthRad;
    this.escapeThreshold = escapeThreshold;
  }

  public update(rotationSpeedRad: number): void {
    this.lastRotationSpeedRad = rotationSpeedRad;
    this.currentAngleRad = (this.currentAngleRad + rotationSpeedRad) % (Math.PI * 2);
    if (this.currentAngleRad < 0) {
      this.currentAngleRad += Math.PI * 2;
    }
  }

  /**
   * Resolves collisions between balls and the rotating boundary
   * Returns balls that successfully passed through the gap past escapeThreshold
   */
  public resolveCollisions(balls: EliminateBall[]): EliminateBall[] {
    const escapedBalls: EliminateBall[] = [];
    const halfGap = this.gapAngleWidthRad / 2;

    const tip1Angle = (this.currentAngleRad - halfGap + Math.PI * 2) % (Math.PI * 2);
    const tip2Angle = (this.currentAngleRad + halfGap) % (Math.PI * 2);

    const tip1X = this.centerX + Math.cos(tip1Angle) * this.radius;
    const tip1Y = this.centerY + Math.sin(tip1Angle) * this.radius;
    const tip2X = this.centerX + Math.cos(tip2Angle) * this.radius;
    const tip2Y = this.centerY + Math.sin(tip2Angle) * this.radius;

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      if (!ball.isAlive || ball.escaped) continue;

      const dx = ball.x - this.centerX;
      const dy = ball.y - this.centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.0001) continue;

      const ballAngle = Math.atan2(dy, dx);
      const angleDiff = this.normalizeAngle(ballAngle - this.currentAngleRad);

      const inGap = Math.abs(angleDiff) <= halfGap;

      if (inGap) {
        // Ball is passing through the open gap!
        if (dist >= this.escapeThreshold) {
          ball.escaped = true;
          ball.isAlive = false;
          escapedBalls.push(ball);
        }
      } else {
        // Solid wall collision
        const maxDist = this.radius - ball.radius;
        if (dist > maxDist) {
          const nx = dx / dist;
          const ny = dy / dist;

          // Clamp position safely inside the arena perimeter
          ball.x = this.centerX + nx * (maxDist - 0.3);
          ball.y = this.centerY + ny * (maxDist - 0.3);

          // Inward normal vector pointing straight to arena center
          const inx = -nx;
          const iny = -ny;

          // Outward velocity dot product
          const dot = ball.vx * nx + ball.vy * ny;
          if (dot > 0) {
            // Standard radial reflection
            let rvx = ball.vx - 2 * dot * nx;
            let rvy = ball.vy - 2 * dot * ny;

            // Tangential surface slip friction with rotating wall
            const tx = -ny;
            const ty = nx;
            const vWall = this.lastRotationSpeedRad * this.radius;
            const currentVt = ball.vx * tx + ball.vy * ty;
            const slip = vWall - currentVt;
            const frictionKick = slip * 0.12 * (ball.speedMultiplier || 1.0);
            rvx += tx * frictionKick;
            rvy += ty * frictionKick;

            // Inward component of reflected velocity
            const inwardSpeed = rvx * inx + rvy * iny;
            const newSpeed = Math.sqrt(rvx * rvx + rvy * rvy);
            const inwardRatio = newSpeed > 0.001 ? inwardSpeed / newSpeed : 1.0;

            // Prevent grazing/skimming wall orbits: enforce guaranteed inward bounce angle (32° to 45°)
            // If the incoming angle was grazing (inwardRatio < 0.45)
            if (inwardRatio < 0.45 && newSpeed > 0.001) {
              const vt = rvx * tx + rvy * ty;
              const tSign = vt >= 0 ? 1 : -1;

              const bounceAngle = (34 + (Math.random() - 0.5) * 12) * (Math.PI / 180);
              const sinA = Math.sin(bounceAngle);
              const cosA = Math.cos(bounceAngle);

              rvx = (inx * sinA + tx * (tSign * cosA)) * newSpeed;
              rvy = (iny * sinA + ty * (tSign * cosA)) * newSpeed;
            }

            ball.vx = rvx * 0.98;
            ball.vy = rvy * 0.98;
          } else {
            // Ball is near the boundary without outward velocity: kick firmly inward into arena
            ball.vx += inx * 1.6;
            ball.vy += iny * 1.6;
          }
        }
      }

      // Check gap tip vertex collisions to avoid edge glitching
      this.resolveTipBounce(ball, tip1X, tip1Y);
      this.resolveTipBounce(ball, tip2X, tip2Y);
    }

    return escapedBalls;
  }

  private resolveTipBounce(ball: EliminateBall, tipX: number, tipY: number): void {
    const dx = ball.x - tipX;
    const dy = ball.y - tipY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ball.radius && dist > 0.0001) {
      const nx = dx / dist;
      const ny = dy / dist;

      // Push ball out of tip vertex
      ball.x = tipX + nx * ball.radius;
      ball.y = tipY + ny * ball.radius;

      // Reflect velocity
      const dot = ball.vx * nx + ball.vy * ny;
      if (dot < 0) {
        ball.vx = (ball.vx - 2 * dot * nx) * 0.95;
        ball.vy = (ball.vy - 2 * dot * ny) * 0.95;
      }
    }
  }

  /**
   * Resolves pairwise elastic collisions between all active balls,
   * optionally notifying listeners of valid physical impacts
   */
  public resolveBallToBall(
    balls: EliminateBall[],
    onCollision?: (b1: EliminateBall, b2: EliminateBall, relSpeed: number, contactX: number, contactY: number) => void
  ): void {
    for (let i = 0; i < balls.length; i++) {
      const b1 = balls[i];
      if (!b1.isAlive) continue;

      for (let j = i + 1; j < balls.length; j++) {
        const b2 = balls[j];
        if (!b2.isAlive) continue;

        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const distSq = dx * dx + dy * dy;
        const minDist = b1.radius + b2.radius;

        if (distSq < minDist * minDist && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;

          // Relative velocity along collision normal
          const kx = b1.vx - b2.vx;
          const ky = b1.vy - b2.vy;
          const velAlongNormal = nx * kx + ny * ky;

          // Separate balls so they do not overlap
          const overlap = (minDist - dist) * 0.5 + 0.3;
          b1.x -= nx * overlap;
          b1.y -= ny * overlap;
          b2.x += nx * overlap;
          b2.y += ny * overlap;

          const m1 = b1.massMultiplier || 1.0;
          const m2 = b2.massMultiplier || 1.0;
          const totalM = m1 + m2;
          const restitution = 1.06;

          // Only apply collision impulse if balls are moving towards each other
          if (velAlongNormal > 0) {
            const impulse = ((1 + restitution) * velAlongNormal) / totalM;

            b1.vx -= impulse * m2 * nx;
            b1.vy -= impulse * m2 * ny;
            b2.vx += impulse * m1 * nx;
            b2.vy += impulse * m1 * ny;
          } else {
            // Grazing/parallel contact: apply separation impulse so balls never stick together
            const sepKick = 1.4;
            b1.vx -= (nx * sepKick * m2) / totalM;
            b1.vy -= (ny * sepKick * m2) / totalM;
            b2.vx += (nx * sepKick * m1) / totalM;
            b2.vy += (ny * sepKick * m1) / totalM;
          }

          const relSpeed = Math.sqrt(kx * kx + ky * ky);
          const contactX = (b1.x + b2.x) * 0.5;
          const contactY = (b1.y + b2.y) * 0.5;
          onCollision?.(b1, b2, Math.max(relSpeed, 2.0), contactX, contactY);
        }
      }
    }
  }

  private normalizeAngle(angle: number): number {
    let a = angle % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
}
