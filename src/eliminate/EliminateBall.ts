/**
 * Ball Entity for Country Eliminate Arena
 * Enhanced with Health System, Collision Damage Cooldowns, and Collectible Ability States
 */

import type { CountryData } from '../config/countries.ts';

export class EliminateBall {
  public instanceId: string;
  public id: string; // Country ID (shared between original and duplicates)
  public country: CountryData;
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public radius: number;
  public isAlive: boolean = true;
  public eliminationRank: number = 0;
  public escaped: boolean = false;
  public escapeTime: number = 0;
  public speedMultiplier: number = 1.0;
  public massMultiplier: number = 1.0;

  // Health System
  public maxHealth: number;
  public health: number;
  public isDuplicate: boolean = false;

  // Temporary Ability States
  public shieldUntilMs: number = 0;
  public damageBoostUntilMs: number = 0;
  public damageMultiplier: number = 1.0;

  // Collision cooldown to prevent multi-frame damage grinding
  private lastCollisionTimes = new Map<string, number>();

  constructor(
    country: CountryData,
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number = 22,
    maxHealth: number = 100,
    isDuplicate: boolean = false,
    instanceId?: string
  ) {
    this.country = country;
    this.id = country.id;
    this.instanceId = instanceId || `${country.id}_${Math.random().toString(36).slice(2, 7)}`;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = radius;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.isDuplicate = isDuplicate;

    // Distinct physical agility and mass traits based on country ID
    const hash = (country.id.charCodeAt(0) * 37 + (country.id.charCodeAt(1) || 0)) % 100;
    this.speedMultiplier = 0.88 + (hash / 100) * 0.28; // 0.88 to 1.16
    this.massMultiplier = 0.85 + ((100 - hash) / 100) * 0.35; // 0.85 to 1.20
  }

  public isShieldActive(now: number): boolean {
    return now < this.shieldUntilMs;
  }

  public isDamageBoostActive(now: number): boolean {
    return now < this.damageBoostUntilMs;
  }

  public applyShield(durationMs: number, now: number): void {
    this.shieldUntilMs = Math.max(this.shieldUntilMs, now + durationMs);
  }

  public applyDamageBoost(multiplier: number, durationMs: number, now: number): void {
    this.damageMultiplier = multiplier;
    this.damageBoostUntilMs = Math.max(this.damageBoostUntilMs, now + durationMs);
  }

  /**
   * Applies damage to this ball.
   * If shield is active, absorbs 100% of damage.
   * Health cannot drop below zero.
   */
  public takeDamage(
    amount: number,
    now: number
  ): { currentHealth: number; eliminated: boolean; absorbed: boolean } {
    if (!this.isAlive) {
      return { currentHealth: 0, eliminated: false, absorbed: false };
    }

    if (this.isShieldActive(now)) {
      return { currentHealth: this.health, eliminated: false, absorbed: true };
    }

    const actualDamage = Math.max(1, Math.round(amount));
    this.health = Math.max(0, this.health - actualDamage);

    if (this.health <= 0) {
      this.isAlive = false;
      return { currentHealth: 0, eliminated: true, absorbed: false };
    }

    return { currentHealth: this.health, eliminated: false, absorbed: false };
  }

  /**
   * Heals the ball up to maxHealth
   */
  public heal(amount: number): number {
    if (!this.isAlive) return this.health;
    const oldHealth = this.health;
    this.health = Math.min(this.maxHealth, this.health + Math.round(amount));
    return this.health - oldHealth;
  }

  public canDamageWith(otherInstanceId: string, now: number, cooldownMs: number): boolean {
    const lastTime = this.lastCollisionTimes.get(otherInstanceId) || 0;
    return now - lastTime >= cooldownMs;
  }

  public registerDamageCollision(otherInstanceId: string, now: number): void {
    this.lastCollisionTimes.set(otherInstanceId, now);
  }

  public update(minSpeed: number, maxSpeed: number): void {
    if (!this.isAlive) return;

    this.x += this.vx;
    this.y += this.vy;

    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const ballMinSpeed = minSpeed * this.speedMultiplier;
    const ballMaxSpeed = maxSpeed * this.speedMultiplier;

    if (currentSpeed < 0.001) {
      const angle = Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle) * ballMinSpeed;
      this.vy = Math.sin(angle) * ballMinSpeed;
      return;
    }

    if (currentSpeed < ballMinSpeed) {
      const scale = ballMinSpeed / currentSpeed;
      this.vx *= scale;
      this.vy *= scale;
    } else if (currentSpeed > ballMaxSpeed) {
      const scale = ballMaxSpeed / currentSpeed;
      this.vx *= scale;
      this.vy *= scale;
    }
  }
}
