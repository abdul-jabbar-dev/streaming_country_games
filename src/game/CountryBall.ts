/**
 * CountryBall Entity
 * Encapsulates Matter.js physics body, combat stats, health, and boundary constraints
 */

import Matter from 'matter-js';
const { Body, Composite } = Matter;
import type { Body as MatterBody, Engine } from 'matter-js';
import type { CountryData } from '../config/countries.ts';

export class CountryBall {
  public id: string;
  public country: CountryData;
  public body: MatterBody;
  public maxHealth: number;
  public health: number;
  public isAlive: boolean = true;
  public eliminationRank: number = 0;
  public kills: number = 0;
  public damageDealt: number = 0;

  public hitFlashTimer: number = 0; // Frames remaining for hit flash
  public speedMultiplier: number = 1.0;
  public massMultiplier: number = 1.0;
  private collisionCooldowns = new Map<string, number>();

  // Collectible Ability States
  public shieldUntilMs: number = 0;
  public damageBoostUntilMs: number = 0;
  public damageMultiplier: number = 1.0;
  public speedBoostUntilMs: number = 0;
  public grabUntilMs: number = 0;
  public vortexUntilMs: number = 0;
  public isDuplicate: boolean = false;

  constructor(
    country: CountryData,
    body: MatterBody,
    initialHealth: number = 100
  ) {
    this.id = country.id;
    this.country = country;
    this.body = body;
    this.maxHealth = initialHealth;
    this.health = initialHealth;

    // Physics traits based on country ID
    const hash = (country.id.charCodeAt(0) * 31 + (country.id.charCodeAt(1) || 0)) % 100;
    this.speedMultiplier = 0.88 + (hash / 100) * 0.28; // 0.88 to 1.16
    this.massMultiplier = 0.85 + ((100 - hash) / 100) * 0.35; // 0.85 to 1.20
  }

  public canCollideWith(otherId: string, currentTime: number, cooldownMs: number): boolean {
    const lastTime = this.collisionCooldowns.get(otherId) || 0;
    return currentTime - lastTime >= cooldownMs;
  }

  public registerCollision(otherId: string, currentTime: number): void {
    this.collisionCooldowns.set(otherId, currentTime);
  }

  public isShieldActive(now: number): boolean {
    return now < this.shieldUntilMs;
  }

  public isDamageBoostActive(now: number): boolean {
    return now < this.damageBoostUntilMs;
  }

  public isSpeedBoostActive(now: number): boolean {
    return now < this.speedBoostUntilMs;
  }

  public isGrabActive(now: number): boolean {
    return now < this.grabUntilMs;
  }

  public isVortexActive(now: number): boolean {
    return now < this.vortexUntilMs;
  }

  public applyShield(durationMs: number, now: number): void {
    this.shieldUntilMs = Math.max(this.shieldUntilMs, now + durationMs);
  }

  public applyDamageBoost(durationMs: number, multiplier: number = 2.0, now: number = 0): void {
    this.damageBoostUntilMs = Math.max(this.damageBoostUntilMs, now + durationMs);
    this.damageMultiplier = multiplier;
  }

  public applySpeedBoost(durationMs: number, now: number): void {
    this.speedBoostUntilMs = Math.max(this.speedBoostUntilMs, now + durationMs);
  }

  public applyGrab(durationMs: number, now: number): void {
    this.grabUntilMs = Math.max(this.grabUntilMs, now + durationMs);
  }

  public consumeGrab(): void {
    this.grabUntilMs = 0;
  }

  public applyVortex(durationMs: number, now: number): void {
    this.vortexUntilMs = Math.max(this.vortexUntilMs, now + durationMs);
  }

  public heal(amount: number): number {
    const prev = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return this.health - prev;
  }

  public takeDamage(amount: number, now: number = 0): { currentHealth: number; eliminated: boolean } {
    if (!this.isAlive) {
      return { currentHealth: 0, eliminated: false };
    }

    // Shield negates all incoming damage
    if (now > 0 && this.isShieldActive(now)) {
      return { currentHealth: this.health, eliminated: false };
    }

    const actualDamage = Math.max(1, Math.round(amount));
    this.health = Math.max(0, this.health - actualDamage);
    this.hitFlashTimer = 6; // Flash for 6 frames (~100ms at 60fps)

    if (this.health <= 0) {
      this.isAlive = false;
      return { currentHealth: 0, eliminated: true };
    }

    return { currentHealth: this.health, eliminated: false };
  }

  /**
   * Enforces velocity limits to:
   * 1. Prevent balls from losing kinetic energy and grinding to a halt.
   * 2. Prevent balls from reaching extreme velocities that cause tunneling.
   */
  public enforceVelocityLimits(minSpeed: number, maxSpeed: number, now: number = 0): void {
    if (!this.isAlive) return;

    const vx = this.body.velocity.x;
    const vy = this.body.velocity.y;
    const currentSpeed = Math.sqrt(vx * vx + vy * vy);

    const effectiveMax = (now > 0 && this.isSpeedBoostActive(now)) ? maxSpeed * 1.6 : maxSpeed;

    if (currentSpeed < 0.001) {
      // Ball is virtually stationary: give gentle random kick
      const randomAngle = Math.random() * Math.PI * 2;
      Body.setVelocity(this.body, {
        x: Math.cos(randomAngle) * minSpeed,
        y: Math.sin(randomAngle) * minSpeed,
      });
      return;
    }

    if (currentSpeed < minSpeed) {
      const scale = minSpeed / currentSpeed;
      Body.setVelocity(this.body, {
        x: vx * scale,
        y: vy * scale,
      });
    } else if (currentSpeed > effectiveMax) {
      const scale = effectiveMax / currentSpeed;
      Body.setVelocity(this.body, {
        x: vx * scale,
        y: vy * scale,
      });
    }
  }

  /**
   * Hard mathematical radial clamp: guarantees ball never escapes the circular arena
   */
  public enforceRadialBoundary(
    centerX: number,
    centerY: number,
    arenaRadius: number,
    ballRadius: number
  ): void {
    if (!this.isAlive) return;

    const dx = this.body.position.x - centerX;
    const dy = this.body.position.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = arenaRadius - ballRadius;

    if (dist > maxDist && dist > 0) {
      // Normal vector pointing inward
      const nx = dx / dist;
      const ny = dy / dist;

      // Reposition ball safely inside
      Body.setPosition(this.body, {
        x: centerX + nx * maxDist,
        y: centerY + ny * maxDist,
      });

      // Reflect radial component of velocity
      const vx = this.body.velocity.x;
      const vy = this.body.velocity.y;
      const dot = vx * nx + vy * ny;

      if (dot > 0) {
        // Moving outward: reflect velocity vector inward
        Body.setVelocity(this.body, {
          x: (vx - 2 * dot * nx) * 0.95,
          y: (vy - 2 * dot * ny) * 0.95,
        });
      }
    }
  }

  public updateVisualTimers(): void {
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer--;
    }
  }

  public destroy(engine: Engine): void {
    try {
      Composite.remove(engine.world, this.body);
    } catch {
      // Ignored if already removed
    }
  }
}
