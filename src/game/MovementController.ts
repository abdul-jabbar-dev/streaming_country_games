/**
 * Controlled Movement and Steering Controller
 * Manages natural physical motion, kinetic energy maintenance, and velocity clamping
 * without abruptly forcing velocities every frame.
 */

import Matter from 'matter-js';
const { Body } = Matter;
import type { CountryBall } from './CountryBall.ts';

export interface MovementConfig {
  minDesiredSpeed: number; // Minimum desired kinetic speed
  maxSpeed: number;        // Maximum clamped velocity
  steeringStrength: number;// Force magnitude applied during steering nudges
  steeringIntervalMs: number; // Interval between periodic steering adjustments
}

export class MovementController {
  public config: MovementConfig;
  private lastSteerTime: number = 0;

  constructor(config: Partial<MovementConfig>) {
    this.config = {
      minDesiredSpeed: config.minDesiredSpeed ?? 3.5,
      maxSpeed: config.maxSpeed ?? 9.0,
      steeringStrength: config.steeringStrength ?? 0.0008,
      steeringIntervalMs: config.steeringIntervalMs ?? 250,
    };
  }

  /**
   * Applies physical motion regulation to active balls:
   * 1. Velocity clamping (only when exceeding maxSpeed to prevent tunneling).
   * 2. Standstill impulse (only if ball is virtually stopped).
   * 3. Periodic steering force at controlled intervals to maintain kinetic energy naturally.
   */
  public update(balls: CountryBall[], arenaCenter: { x: number; y: number }, timestamp: number): void {
    const isSteeringTick = timestamp - this.lastSteerTime >= this.config.steeringIntervalMs;
    if (isSteeringTick) {
      this.lastSteerTime = timestamp;
    }

    const aliveBalls = balls.filter((b) => b.isAlive);
    const aliveCount = aliveBalls.length;
    const count = balls.length;

    for (let i = 0; i < count; i++) {
      const ball = balls[i];
      if (!ball.isAlive) continue;

      const body = ball.body;
      const vx = body.velocity.x;
      const vy = body.velocity.y;
      const speed = Math.sqrt(vx * vx + vy * vy);

      const multiplier = (ball as any).getEffectiveSpeedMultiplier
        ? (ball as any).getEffectiveSpeedMultiplier()
        : (ball.speedMultiplier ?? 1.0);
      const ballMinSpeed = this.config.minDesiredSpeed * multiplier;
      const ballMaxSpeed = this.config.maxSpeed * multiplier;

      // 1. Clamp excessive velocity (prevents physics tunneling)
      if (speed > ballMaxSpeed) {
        const scale = ballMaxSpeed / speed;
        Body.setVelocity(body, {
          x: vx * scale,
          y: vy * scale,
        });
        continue;
      }

      // 2. Standstill protection (if a ball is completely dead in the water)
      if (speed < 0.05) {
        // Apply impulse toward arena center or random direction
        const toCenterX = arenaCenter.x - body.position.x;
        const toCenterY = arenaCenter.y - body.position.y;
        const dist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
        const angle = dist > 10 ? Math.atan2(toCenterY, toCenterX) : Math.random() * Math.PI * 2;

        Body.setVelocity(body, {
          x: Math.cos(angle) * ballMinSpeed,
          y: Math.sin(angle) * ballMinSpeed,
        });
        continue;
      }

      // 3. Periodic controlled steering force (runs every steeringIntervalMs, NOT every frame)
      if (isSteeringTick) {
        const mass = body.mass || 1;

        // If speed is drifting below minimum desired speed, apply forward physical force
        if (speed < ballMinSpeed) {
          const dirX = vx / speed;
          const dirY = vy / speed;
          const forceMagnitude = this.config.steeringStrength * mass;

          Body.applyForce(body, body.position, {
            x: dirX * forceMagnitude,
            y: dirY * forceMagnitude,
          });
        }

        // Apply subtle organic steering nudge toward center to keep contestants crossing paths
        const dx = arenaCenter.x - body.position.x;
        const dy = arenaCenter.y - body.position.y;
        const centerDist = Math.sqrt(dx * dx + dy * dy);

        if (centerDist > 40) {
          const gentleCenterForce = (this.config.steeringStrength * 0.35) * mass;
          Body.applyForce(body, body.position, {
            x: (dx / centerDist) * gentleCenterForce,
            y: (dy / centerDist) * gentleCenterForce,
          });
        }

        // 4. Anti-Wall Orbiting Safeguard & Decisive Combat Pursuit
        // When few countries survive (<= 5), actively hunt nearest opponent and prevent looping around perimeter
        if (aliveCount <= 5) {
          let nearestOpponent: CountryBall | null = null;
          let minOppDistSq = Infinity;

          for (let j = 0; j < aliveCount; j++) {
            const opp = aliveBalls[j];
            if (opp.id === ball.id) continue;
            const odx = opp.body.position.x - body.position.x;
            const ody = opp.body.position.y - body.position.y;
            const dSq = odx * odx + ody * ody;
            if (dSq < minOppDistSq) {
              minOppDistSq = dSq;
              nearestOpponent = opp;
            }
          }

          if (nearestOpponent) {
            const oppDist = Math.sqrt(minOppDistSq);
            if (oppDist > 10) {
              const huntMultiplier = aliveCount <= 2 ? 1.4 : aliveCount <= 3 ? 0.95 : 0.65;
              const huntForce = this.config.steeringStrength * huntMultiplier * mass;
              Body.applyForce(body, body.position, {
                x: ((nearestOpponent.body.position.x - body.position.x) / oppDist) * huntForce,
                y: ((nearestOpponent.body.position.y - body.position.y) / oppDist) * huntForce,
              });
            }
          }

          // Anti-orbiting rim kick: If running along outer perimeter, kick directly toward arena center
          if (centerDist > 240) {
            const kickStrength = this.config.steeringStrength * 0.8 * mass;
            Body.applyForce(body, body.position, {
              x: (dx / centerDist) * kickStrength,
              y: (dy / centerDist) * kickStrength,
            });
          }
        }
      }
    }
  }
}
