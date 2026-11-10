/**
 * Line Battle Ball Entity
 * Wraps Matter.js physics body with Line Battle gameplay mechanics,
 * connection line collection, previous-position tracking for CCD, and collision cooldowns.
 */

import Matter from 'matter-js';
const { Body, Composite } = Matter;
import type { Body as MatterBody, Engine } from 'matter-js';
import type { CountryData } from '../config/countries.ts';
import type { ConnectionLine } from './ConnectionLine.ts';

export class LineBattleBall {
  public readonly id: string;
  public readonly country: CountryData;
  public readonly body: MatterBody;

  public isAlive: boolean = true;
  public eliminationRank: number = 0;
  public linesCreated: number = 0;
  public linesCut: number = 0;

  // Active lines owned by this country
  public lines: ConnectionLine[] = [];

  // Continuous collision detection previous position
  public prevX: number;
  public prevY: number;

  // Cooldown to prevent duplicate line creation on continuous contact
  public lastBoundaryHitTime: number = -9999;
  public hitFlashTimer: number = 0;

  public speedMultiplier: number = 1.0;
  public massMultiplier: number = 1.0;
  public shieldUntilMs: number = 0;

  constructor(country: CountryData, body: MatterBody) {
    this.id = country.id;
    this.country = country;
    this.body = body;
    this.prevX = body.position.x;
    this.prevY = body.position.y;

    // Distinct physical agility and mass traits based on country ID
    const hash = (country.id.charCodeAt(0) * 43 + (country.id.charCodeAt(1) || 0)) % 100;
    this.speedMultiplier = 0.88 + (hash / 100) * 0.28; // 0.88 to 1.16
    this.massMultiplier = 0.85 + ((100 - hash) / 100) * 0.35; // 0.85 to 1.20
  }

  /**
   * Effective speed multiplier accounting for country traits and attached tether drag.
   * Active lines create physical tether resistance: balls with fewer lines move faster and more agilely.
   */
  public getEffectiveSpeedMultiplier(): number {
    const activeLines = this.getActiveLineCount();
    const lineDrag = Math.max(0.72, 1.05 - activeLines * 0.015);
    return this.speedMultiplier * lineDrag;
  }

  /**
   * Records position at the start of a physics step for continuous intersection checks
   */
  public recordPreviousPosition(): void {
    this.prevX = this.body.position.x;
    this.prevY = this.body.position.y;
  }

  public isShieldActive(now: number): boolean {
    return now < this.shieldUntilMs;
  }

  public applyShield(durationMs: number, now: number): void {
    this.shieldUntilMs = Math.max(this.shieldUntilMs, now + durationMs);
  }

  /**
   * Removes oldest active connection lines up to count.
   * Returns array of removed lines.
   */
  public removeOldestActiveLines(count: number, now: number): ConnectionLine[] {
    const active = this.lines.filter((l) => l.isActive);
    active.sort((a, b) => a.createdAt - b.createdAt);
    const toRemove = active.slice(0, count);

    for (let i = 0; i < toRemove.length; i++) {
      toRemove[i].cut(this.id, now, 350);
    }

    return toRemove;
  }

  /**
   * Returns previously cut lines that can potentially be repaired
   */
  public getCutLines(): ConnectionLine[] {
    return this.lines.filter((l) => !l.isActive);
  }

  /**
   * Checks if enough time has passed since the last boundary collision
   */
  public canCreateBoundaryLine(currentTime: number, cooldownMs: number): boolean {
    return this.isAlive && currentTime - this.lastBoundaryHitTime >= cooldownMs;
  }

  /**
   * Registers a boundary impact timestamp
   */
  public registerBoundaryHit(currentTime: number): void {
    this.lastBoundaryHitTime = currentTime;
    this.hitFlashTimer = 6;
  }

  /**
   * Adds a newly created connection line
   */
  public addLine(line: ConnectionLine): void {
    this.lines.push(line);
    this.linesCreated++;
  }

  /**
   * Returns count of lines currently active
   */
  public getActiveLineCount(): number {
    let count = 0;
    for (let i = 0; i < this.lines.length; i++) {
      if (this.lines[i].isActive) {
        count++;
      }
    }
    return count;
  }

  /**
   * Clamps position inside the arena circle and safely reflects outward velocity
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
      const nx = dx / dist;
      const ny = dy / dist;

      Body.setPosition(this.body, {
        x: centerX + nx * maxDist,
        y: centerY + ny * maxDist,
      });

      const vx = this.body.velocity.x;
      const vy = this.body.velocity.y;
      const dot = vx * nx + vy * ny;

      if (dot > 0) {
        Body.setVelocity(this.body, {
          x: (vx - 2 * dot * nx) * 0.98,
          y: (vy - 2 * dot * ny) * 0.98,
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
