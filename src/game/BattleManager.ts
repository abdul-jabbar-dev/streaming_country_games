/**
 * Battle Manager & State Machine
 * Oversees automated 24/7 battle lifecycle, country spawn/cleanup, winner detection, and rankings
 */

import Matter from 'matter-js';
const { Bodies, Body, Composite, Events } = Matter;
import type { IEventCollision, Engine } from 'matter-js';
import type { GameConfig } from '../config/game.config.ts';
import type { CountryData } from '../config/countries.ts';
import { getRoundParticipants } from '../config/countries.ts';
import { CountryBall } from './CountryBall.ts';
import { Arena } from './Arena.ts';
import { CombatSystem } from './CombatSystem.ts';
import { MovementController } from './MovementController.ts';
import { ParticleSystem } from './ParticleSystem.ts';
import { CollectibleManager } from '../collectibles/CollectibleManager.ts';
import type { CollectibleDefinition, CollectibleItem } from '../collectibles/CollectibleItem.ts';
import type { BattleResults, BattleState, EliminationEvent, ParticipantScore } from './GameState.ts';
import { logger } from '../utils/logger.ts';

const BATTLE_ABILITY_DEFINITIONS: CollectibleDefinition[] = [
  {
    type: 'HEALTH_BOOST',
    label: '+35 HP',
    sublabel: 'HEAL',
    icon: '❤️',
    color: '#10b981',
    accentColor: 'rgba(16, 185, 129, 0.45)',
    weight: 30,
  },
  {
    type: 'DAMAGE_BOOST',
    label: '2x DMG',
    sublabel: 'BOOST',
    icon: '⚔️',
    color: '#f97316',
    accentColor: 'rgba(249, 115, 22, 0.45)',
    weight: 25,
  },
  {
    type: 'SHIELD',
    label: 'SHIELD',
    sublabel: 'ARMOR',
    icon: '🛡️',
    color: '#06b6d4',
    accentColor: 'rgba(6, 182, 212, 0.45)',
    weight: 25,
  },
  {
    type: 'DUPLICATE',
    label: 'CLONE',
    sublabel: 'DUPLICATE',
    icon: '👥',
    color: '#a855f7',
    accentColor: 'rgba(168, 85, 247, 0.45)',
    weight: 20,
  },
];

export class BattleManager {
  public state: BattleState = 'INITIALIZING';
  public roundNumber: number = 0;
  public balls: CountryBall[] = [];
  public eliminationLog: EliminationEvent[] = [];
  public winner: CountryBall | null = null;
  public arena: Arena;
  public combatSystem: CombatSystem;
  public movementController: MovementController;
  public particles: ParticleSystem;
  public collectibleManager: CollectibleManager;

  public customParticipants: CountryData[] | null = null;
  public autoLoop: boolean = true;

  public stateTimerMs: number = 0;
  private roundStartTime: number = 0;
  private currentTimestamp: number = 0;
  private collisionHandlerBound: (event: IEventCollision<Engine>) => void;

  public readonly config: GameConfig;
  public readonly engine: Engine;

  // Listeners for UI updates
  public onStateChange?: (state: BattleState, countdownVal?: number) => void;
  public onElimination?: (event: EliminationEvent) => void;
  public onRoundEnd?: (results: BattleResults) => void;

  constructor(
    config: GameConfig,
    engine: Engine
  ) {
    this.config = config;
    this.engine = engine;
    this.arena = new Arena(
      config.arenaCenterX,
      config.arenaCenterY,
      config.arenaRadius,
      config.arenaSegments
    );

    this.particles = new ParticleSystem(300);

    this.collectibleManager = new CollectibleManager(
      {
        minSpawnIntervalMs: config.collectibleMinSpawnIntervalMs || 3500,
        maxSpawnIntervalMs: config.collectibleMaxSpawnIntervalMs || 8000,
        itemLifetimeMs: config.collectibleLifetimeMs || 10000,
        maxSimultaneousItems: config.collectibleMaxSimultaneous || 3,
        itemRadius: 13,
        spawnMargin: 75,
        minDistanceBetweenItems: 50,
        minDistanceFromBalls: 40,
      },
      BATTLE_ABILITY_DEFINITIONS
    );

    this.movementController = new MovementController({
      minDesiredSpeed: config.minDesiredSpeed,
      maxSpeed: config.maxSpeed,
      steeringStrength: config.steeringStrength,
      steeringIntervalMs: config.steeringIntervalMs,
    });

    this.combatSystem = new CombatSystem(
      {
        baseDamage: config.baseDamage,
        damageMultiplier: config.damageMultiplier,
        collisionCooldownMs: config.collisionCooldownMs,
      },
      this.particles,
      (victim, killer) => this.handleBallEliminated(victim, killer)
    );

    this.collisionHandlerBound = (event) => this.onMatterCollision(event);
    Events.on(this.engine, 'collisionStart', this.collisionHandlerBound);
  }

  public start(): void {
    logger.info('BattleManager started. Preparing round 1.');
    this.prepareNextRound();
  }

  public setParticipants(countries: CountryData[]): void {
    this.customParticipants = countries;
  }

  /**
   * Cleans up all previous round bodies and initializes a fresh arena and participants
   */
  public prepareNextRound(): void {
    try {
      this.state = 'INITIALIZING';
      this.roundNumber++;
      this.winner = null;
      this.eliminationLog = [];
      this.particles.reset();
      this.collectibleManager.reset();

      // Clean old ball physics bodies
      for (const ball of this.balls) {
        ball.destroy(this.engine);
      }
      this.balls = [];

      // Rebuild arena
      this.arena.build(this.engine, this.config.wallRestitution);

      // Select participants
      const participants =
        this.customParticipants && this.customParticipants.length >= 2
          ? [...this.customParticipants]
          : getRoundParticipants(this.config.countryCount, true);
      this.spawnParticipants(participants);

      this.state = 'COUNTDOWN';
      this.stateTimerMs = this.config.countdownDurationMs;
      this.onStateChange?.(this.state, Math.ceil(this.stateTimerMs / 1000));
      logger.info(`Round ${this.roundNumber} prepared with ${participants.length} countries.`);
    } catch (err) {
      logger.error('Failed to prepare round, recovering...', err);
      this.scheduleRecovery();
    }
  }

  private spawnParticipants(countries: CountryData[]): void {
    const count = countries.length;
    const spawnRadius = this.config.arenaRadius * 0.65;

    for (let i = 0; i < count; i++) {
      const country = countries[i];
      const angle = (i / count) * Math.PI * 2;

      const x = this.config.arenaCenterX + Math.cos(angle) * spawnRadius;
      const y = this.config.arenaCenterY + Math.sin(angle) * spawnRadius;

      const body = Bodies.circle(x, y, this.config.ballRadius, {
        restitution: this.config.ballRestitution,
        friction: this.config.ballFriction,
        frictionAir: this.config.ballFrictionAir,
        density: this.config.ballDensity,
        label: country.id,
      });

      const ball = new CountryBall(country, body, this.config.initialHealth);
      // Set physical mass based on ball's individual trait
      Body.setMass(body, body.mass * ball.massMultiplier);

      // Initial inward velocity vector factoring in country agility
      const speed = (this.config.minDesiredSpeed + Math.random() * 1.5) * ball.speedMultiplier;
      const inwardAngle = angle + Math.PI + (Math.random() - 0.5) * 0.5;

      Body.setVelocity(body, {
        x: Math.cos(inwardAngle) * speed,
        y: Math.sin(inwardAngle) * speed,
      });

      this.balls.push(ball);
      Composite.add(this.engine.world, body);
    }
  }

  /**
   * Main game logic tick updated with fixedDeltaMs
   */
  public update(deltaMs: number, timestamp: number): void {
    try {
      this.currentTimestamp = timestamp;
      this.particles.update();

      switch (this.state) {
        case 'COUNTDOWN': {
          this.stateTimerMs -= deltaMs;
          const secondsRemaining = Math.max(1, Math.ceil(this.stateTimerMs / 1000));
          this.onStateChange?.(this.state, secondsRemaining);

          // Gently keep balls in position or slow glide during countdown
          for (const ball of this.balls) {
            ball.enforceRadialBoundary(
              this.config.arenaCenterX,
              this.config.arenaCenterY,
              this.config.arenaRadius,
              this.config.ballRadius
            );
          }

          if (this.stateTimerMs <= 0) {
            this.state = 'BATTLE';
            this.roundStartTime = timestamp;
            this.collectibleManager.scheduleNextSpawn(timestamp);
            this.onStateChange?.(this.state);
            logger.info(`Round ${this.roundNumber} BATTLE started!`);
          }
          break;
        }

        case 'BATTLE': {
          // Controlled movement: periodic steering force and velocity limit enforcement
          this.movementController.update(
            this.balls,
            { x: this.config.arenaCenterX, y: this.config.arenaCenterY },
            timestamp
          );

          // Update visual flash timers and enforce radial boundary clamp
          for (const ball of this.balls) {
            if (ball.isAlive) {
              ball.updateVisualTimers();
              ball.enforceRadialBoundary(
                this.config.arenaCenterX,
                this.config.arenaCenterY,
                this.config.arenaRadius,
                this.config.ballRadius
              );
            }
          }

          // Update & check Collectible Abilities
          const ballPositions = this.balls.map((b) => ({
            x: b.body.position.x,
            y: b.body.position.y,
            radius: this.config.ballRadius,
            isAlive: b.isAlive,
          }));

          this.collectibleManager.update(
            deltaMs,
            timestamp,
            this.config.arenaCenterX,
            this.config.arenaCenterY,
            this.config.arenaRadius,
            ballPositions
          );

          // Check pickups
          const activeBalls = this.balls.map((b) => ({
            ball: b,
            x: b.body.position.x,
            y: b.body.position.y,
            vx: b.body.velocity.x,
            vy: b.body.velocity.y,
            radius: this.config.ballRadius,
            isAlive: b.isAlive,
          }));

          this.collectibleManager.checkPickups(activeBalls, timestamp, (adapter, item) => {
            this.applyAbility(adapter.ball, item, timestamp);
          });

          this.checkWinnerCondition(timestamp);
          break;
        }

        case 'WINNER_ANNOUNCEMENT': {
          this.stateTimerMs -= deltaMs;

          // Spawn celebratory victory confetti
          if (this.winner && Math.random() > 0.4) {
            this.particles.spawnConfetti(
              this.config.arenaCenterX,
              this.config.arenaCenterY,
              3
            );
          }

          if (this.stateTimerMs <= 0) {
            this.state = 'RESULTS';
            this.stateTimerMs = this.config.resultsDurationMs;
            this.onStateChange?.(this.state);
          }
          break;
        }

        case 'RESULTS': {
          this.stateTimerMs -= deltaMs;
          if (this.stateTimerMs <= 0) {
            this.state = 'RESETTING';
            this.stateTimerMs = this.config.resetDelayMs;
            this.onStateChange?.(this.state);
          }
          break;
        }

        case 'RESETTING': {
          this.stateTimerMs -= deltaMs;
          if (this.stateTimerMs <= 0) {
            if (this.autoLoop) {
              this.prepareNextRound();
            } else {
              this.state = 'INITIALIZING';
              this.onStateChange?.('INITIALIZING');
            }
          }
          break;
        }

        default:
          break;
      }
    } catch (err) {
      logger.error('Error during BattleManager update:', err);
      this.scheduleRecovery();
    }
  }

  private applyAbility(ball: CountryBall, item: CollectibleItem, timestamp: number): void {
    switch (item.type) {
      case 'HEALTH_BOOST': {
        const healed = ball.heal(this.config.healAmount || 35);
        this.particles.spawnSparks(ball.body.position.x, ball.body.position.y, '#10b981', 10);
        logger.info(`[Ability] ${ball.country.name} picked up HEALTH_BOOST (+${healed} HP)`);
        break;
      }

      case 'DAMAGE_BOOST': {
        const duration = this.config.damageBoostDurationMs || 6000;
        const multiplier = this.config.damageBoostMultiplier || 2.0;
        ball.applyDamageBoost(duration, multiplier, timestamp);
        this.particles.spawnSparks(ball.body.position.x, ball.body.position.y, '#f97316', 10);
        logger.info(`[Ability] ${ball.country.name} picked up DAMAGE_BOOST (2x for ${duration / 1000}s)`);
        break;
      }

      case 'SHIELD': {
        const duration = this.config.shieldDurationMs || 6000;
        ball.applyShield(duration, timestamp);
        this.particles.spawnSparks(ball.body.position.x, ball.body.position.y, '#06b6d4', 10);
        logger.info(`[Ability] ${ball.country.name} picked up SHIELD (${duration / 1000}s)`);
        break;
      }

      case 'DUPLICATE': {
        const countryBalls = this.balls.filter((b) => b.isAlive && b.id === ball.id);
        const totalAlive = this.balls.filter((b) => b.isAlive).length;

        if (countryBalls.length >= 3 || totalAlive >= 24) {
          // Cap reached: convert to heal
          const healed = ball.heal(this.config.healAmount || 35);
          this.particles.spawnSparks(ball.body.position.x, ball.body.position.y, '#10b981', 10);
          this.collectibleManager.addNotification(
            ball.body.position.x,
            ball.body.position.y,
            `+${healed} HP`,
            '#10b981',
            timestamp
          );
          return;
        }

        // Spawn duplicate physical ball
        const offsetAngle = Math.random() * Math.PI * 2;
        const spawnDist = this.config.ballRadius * 1.8;
        const cloneX = ball.body.position.x + Math.cos(offsetAngle) * spawnDist;
        const cloneY = ball.body.position.y + Math.sin(offsetAngle) * spawnDist;

        const cloneBody = Bodies.circle(cloneX, cloneY, this.config.ballRadius, {
          restitution: this.config.ballRestitution,
          friction: this.config.ballFriction,
          frictionAir: this.config.ballFrictionAir,
          density: this.config.ballDensity,
          label: 'CountryBall',
        });

        const clone = new CountryBall(ball.country, cloneBody, ball.health);
        clone.isDuplicate = true;
        Body.setVelocity(cloneBody, {
          x: -ball.body.velocity.x * 0.9,
          y: -ball.body.velocity.y * 0.9,
        });

        this.balls.push(clone);
        Composite.add(this.engine.world, cloneBody);

        this.particles.spawnSparks(cloneX, cloneY, '#a855f7', 12);
        logger.info(`[Ability] ${ball.country.name} duplicated! (Country now has ${countryBalls.length + 1} balls)`);
        break;
      }
    }
  }

  private handleBallEliminated(victim: CountryBall, killer?: CountryBall): void {
    // Remove physics body from world
    victim.destroy(this.engine);

    // If country still has duplicate balls alive, don't eliminate country yet
    const anyAliveForCountry = this.balls.some((b) => b.isAlive && b.id === victim.id);
    if (anyAliveForCountry) {
      logger.info(`[Ball Eliminated] A duplicate for ${victim.country.name} was eliminated, but country remains!`);
      return;
    }

    const aliveCountries = new Set(this.balls.filter((b) => b.isAlive).map((b) => b.id));
    victim.eliminationRank = aliveCountries.size + 1;

    const event: EliminationEvent = {
      victim: victim.country,
      killer: killer?.country,
      timestamp: Date.now(),
      rank: victim.eliminationRank,
    };

    this.eliminationLog.unshift(event);
    this.onElimination?.(event);
    logger.info(`[Eliminated] ${victim.country.name} (Rank #${victim.eliminationRank}) by ${killer ? killer.country.name : 'Arena'}`);
  }

  private checkWinnerCondition(timestamp: number): void {
    const aliveBalls = this.balls.filter((b) => b.isAlive);
    const aliveCountries = new Set(aliveBalls.map((b) => b.id));

    if (aliveCountries.size === 1) {
      // Clear winner!
      const survivor = aliveBalls[0];
      survivor.eliminationRank = 1;
      this.winner = survivor;
      this.finishBattle(survivor, timestamp);
    } else if (aliveCountries.size === 0 && this.balls.length > 0) {
      // Edge case: simultaneous elimination
      const fallback = [...this.balls].sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt)[0] || null;
      if (fallback) {
        fallback.eliminationRank = 1;
        this.winner = fallback;
      }
      this.finishBattle(fallback, timestamp);
    }
  }

  private finishBattle(winner: CountryBall | null, timestamp: number): void {
    this.state = 'WINNER_ANNOUNCEMENT';
    this.stateTimerMs = this.config.winnerAnnouncementDurationMs;
    this.onStateChange?.(this.state);

    const durationSeconds = Math.max(1, Math.round((timestamp - this.roundStartTime) / 1000));
    logger.info(`Round ${this.roundNumber} finished! Winner: ${winner ? winner.country.name : 'Draw'} in ${durationSeconds}s`);

    const leaderboard = this.getLeaderboard();
    this.onRoundEnd?.({
      roundNumber: this.roundNumber,
      winner: winner ? winner.country : null,
      leaderboard,
      eliminationLog: [...this.eliminationLog],
      durationSeconds,
    });
  }

  private onMatterCollision(event: IEventCollision<Engine>): void {
    if (this.state !== 'BATTLE') return;

    const timestamp = this.currentTimestamp > 0 ? this.currentTimestamp : performance.now();
    const pairs = event.pairs;

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      const ballA = this.balls.find((b) => b.body === pair.bodyA);
      const ballB = this.balls.find((b) => b.body === pair.bodyB);

      if (ballA && ballB) {
        const contactPoint = pair.collision.supports[0] || ballA.body.position;
        this.combatSystem.handleCollision(ballA, ballB, contactPoint, timestamp, this.roundStartTime);
      }
    }
  }

  public getLeaderboard(): ParticipantScore[] {
    const uniqueCountries = new Map<string, ParticipantScore>();

    for (let i = 0; i < this.balls.length; i++) {
      const ball = this.balls[i];
      const existing = uniqueCountries.get(ball.country.id);

      if (!existing) {
        uniqueCountries.set(ball.country.id, {
          country: ball.country,
          rank: ball.eliminationRank || (ball.isAlive ? 1 : 99),
          kills: ball.kills,
          damageDealt: ball.damageDealt,
          health: ball.isAlive ? ball.health : 0,
          isAlive: ball.isAlive,
        });
      } else {
        existing.kills += ball.kills;
        existing.damageDealt += ball.damageDealt;
        if (ball.isAlive) {
          existing.isAlive = true;
          existing.health = Math.max(existing.health, ball.health);
          existing.rank = 1;
        }
      }
    }

    return Array.from(uniqueCountries.values()).sort((a, b) => {
      if (a.isAlive && !b.isAlive) return -1;
      if (!a.isAlive && b.isAlive) return 1;
      if (a.rank !== b.rank) {
        return a.rank - b.rank;
      }
      return b.kills - a.kills || b.damageDealt - a.damageDealt;
    });
  }

  private scheduleRecovery(): void {
    this.state = 'RESETTING';
    this.stateTimerMs = 2000;
  }

  public destroy(): void {
    Events.off(this.engine, 'collisionStart', this.collisionHandlerBound);
    this.arena.destroy(this.engine);
    for (const ball of this.balls) {
      ball.destroy(this.engine);
    }
    this.balls = [];
    this.particles.reset();
    this.collectibleManager.reset();
  }
}
