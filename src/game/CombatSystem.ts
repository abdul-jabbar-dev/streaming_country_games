/**
 * Combat System
 * Handles physical collisions, damage calculations, cooldowns, and elimination logic
 */

import Matter from 'matter-js';
const { Body } = Matter;
import type { CountryBall } from './CountryBall';
import type { ParticleSystem } from './ParticleSystem';
import { soundSynth } from '../audio/SoundSynthesizer.ts';

export interface CombatConfig {
  baseDamage: number;
  damageMultiplier: number;
  collisionCooldownMs: number;
}

export class CombatSystem {
  public config: CombatConfig;
  private particles?: ParticleSystem;
  private onEliminationCallback?: (victim: CountryBall, killer: CountryBall) => void;

  constructor(
    config: CombatConfig,
    particles?: ParticleSystem,
    onEliminationCallback?: (victim: CountryBall, killer: CountryBall) => void
  ) {
    this.config = config;
    this.particles = particles;
    this.onEliminationCallback = onEliminationCallback;
  }

  /**
   * Pure deterministic damage formula based on relative impact velocity
   */
  public calculateDamage(relativeVelocity: number, durationSec: number = 0): number {
    const timeScale = durationSec > 25 ? 1.0 + (durationSec - 25) * 0.05 : 1.0;
    return Math.max(1, Math.round((this.config.baseDamage + this.config.damageMultiplier * relativeVelocity) * timeScale));
  }

  /**
   * Handles collision between two country balls
   */
  public handleCollision(
    ballA: CountryBall,
    ballB: CountryBall,
    contactPoint: { x: number; y: number },
    timestamp: number,
    roundStartTime: number = 0
  ): boolean {
    if (!ballA.isAlive || !ballB.isAlive) {
      return false;
    }

    // Cooldown check
    if (
      !ballA.canCollideWith(ballB.id, timestamp, this.config.collisionCooldownMs) ||
      !ballB.canCollideWith(ballA.id, timestamp, this.config.collisionCooldownMs)
    ) {
      return false;
    }

    // Register cooldown
    ballA.registerCollision(ballB.id, timestamp);
    ballB.registerCollision(ballA.id, timestamp);

    // Compute relative velocity magnitude
    const dvx = ballA.body.velocity.x - ballB.body.velocity.x;
    const dvy = ballA.body.velocity.y - ballB.body.velocity.y;
    const relSpeed = Math.sqrt(dvx * dvx + dvy * dvy);

    const durationSec = roundStartTime > 0 ? Math.max(0, (timestamp - roundStartTime) / 1000) : 0;
    const baseDamage = this.calculateDamage(relSpeed, durationSec);

    // Apply dynamic kinetic momentum transfer based on relative velocity and mass traits
    const dx = ballB.body.position.x - ballA.body.position.x;
    const dy = ballB.body.position.y - ballA.body.position.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    // Relative speed drives rebound impulse magnitude
    const impulse = Math.min(Math.max(relSpeed * 0.15, 0.4), 2.5);
    const impulseA = impulse * (ballB.massMultiplier || 1.0);
    const impulseB = impulse * (ballA.massMultiplier || 1.0);

    Body.setVelocity(ballA.body, {
      x: ballA.body.velocity.x - nx * impulseA,
      y: ballA.body.velocity.y - ny * impulseA,
    });
    Body.setVelocity(ballB.body, {
      x: ballB.body.velocity.x + nx * impulseB,
      y: ballB.body.velocity.y + ny * impulseB,
    });

    // Tactile kinetic impact sound with stereo panning based on stadium contact location
    const panX = Math.max(-0.9, Math.min(0.9, (contactPoint.x - 480) / 400));
    soundSynth.playImpact(relSpeed, panX);

    // Grab & Throw Ability execution on contact
    if (ballA.isGrabActive(timestamp)) {
      ballA.consumeGrab();
      const throwSpeed = 9.5;
      Body.setVelocity(ballB.body, {
        x: nx * throwSpeed,
        y: ny * throwSpeed,
      });
      ballB.takeDamage(16, timestamp);
      soundSynth.playGrab(panX);
      soundSynth.playAbilityImpact(panX);
      this.particles?.spawnSparks(contactPoint.x, contactPoint.y, '#ef4444', 16);
    } else if (ballB.isGrabActive(timestamp)) {
      ballB.consumeGrab();
      const throwSpeed = 9.5;
      Body.setVelocity(ballA.body, {
        x: -nx * throwSpeed,
        y: -ny * throwSpeed,
      });
      ballA.takeDamage(16, timestamp);
      soundSynth.playGrab(panX);
      soundSynth.playAbilityImpact(panX);
      this.particles?.spawnSparks(contactPoint.x, contactPoint.y, '#ef4444', 16);
    }

    // Friendly duplicates do not damage each other
    if (ballA.id === ballB.id) {
      return true;
    }

    // Apply outgoing damage boost multiplier if attacker has active boost
    const damageFromA = ballA.isDamageBoostActive(timestamp)
      ? Math.round(baseDamage * ballA.damageMultiplier)
      : baseDamage;
    const damageFromB = ballB.isDamageBoostActive(timestamp)
      ? Math.round(baseDamage * ballB.damageMultiplier)
      : baseDamage;

    // Track damage dealt
    ballA.damageDealt += damageFromA;
    ballB.damageDealt += damageFromB;

    // Apply damage to opponents (shield absorbs incoming damage)
    const resA = ballA.takeDamage(damageFromB, timestamp);
    const resB = ballB.takeDamage(damageFromA, timestamp);

    // Spawn sparks
    if (this.particles) {
      this.particles.spawnSparks(contactPoint.x, contactPoint.y, '#00d9ff', 6);
    }

    // Check eliminations
    if (resA.eliminated) {
      ballB.kills++;
      if (this.particles) {
        this.particles.spawnElimination(
          ballA.body.position.x,
          ballA.body.position.y,
          ballA.country.color,
          20
        );
      }
      this.onEliminationCallback?.(ballA, ballB);
    }

    if (resB.eliminated) {
      ballA.kills++;
      if (this.particles) {
        this.particles.spawnElimination(
          ballB.body.position.x,
          ballB.body.position.y,
          ballB.country.color,
          20
        );
      }
      this.onEliminationCallback?.(ballB, ballA);
    }

    return true;
  }
}
