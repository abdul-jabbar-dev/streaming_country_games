/**
 * Eliminate Manager & Game Logic Controller
 * Manages automated rounds for Country Eliminate Arena,
 * equipped with Health System, Collision Damage, and Collectible Abilities.
 */

import type { EliminateConfig } from './EliminateConfig.ts';
import type { CountryData } from '../config/countries.ts';
import { getRoundParticipants } from '../config/countries.ts';
import { EliminateBall } from './EliminateBall.ts';
import { RotatingBoundary } from './RotatingBoundary.ts';
import { ParticleSystem } from '../game/ParticleSystem.ts';
import { CollectibleManager } from '../collectibles/CollectibleManager.ts';
import type { CollectibleDefinition, CollectibleItem } from '../collectibles/CollectibleItem.ts';
import type { BattleResults, BattleState, EliminationEvent, ParticipantScore } from '../game/GameState.ts';
import { logger } from '../utils/logger.ts';

const ELIMINATE_ABILITY_DEFINITIONS: CollectibleDefinition[] = [
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

export class EliminateManager {
  public state: BattleState = 'INITIALIZING';
  public roundNumber: number = 0;
  public balls: EliminateBall[] = [];
  public eliminationLog: EliminationEvent[] = [];
  public winner: EliminateBall | null = null;
  public rotatingBoundary: RotatingBoundary;
  public particles: ParticleSystem;
  public collectibleManager: CollectibleManager;

  public customParticipants: CountryData[] | null = null;
  public autoLoop: boolean = true;

  public stateTimerMs: number = 0;
  private roundStartTime: number = 0;

  // Listeners for UI
  public onStateChange?: (state: BattleState, countdownVal?: number) => void;
  public onElimination?: (event: EliminationEvent) => void;
  public onRoundEnd?: (results: BattleResults) => void;

  public readonly config: EliminateConfig;

  constructor(config: EliminateConfig) {
    this.config = config;
    this.rotatingBoundary = new RotatingBoundary(
      config.arenaCenterX,
      config.arenaCenterY,
      config.arenaRadius,
      config.gapAngleWidthRad,
      config.escapeThreshold
    );
    this.particles = new ParticleSystem(350);

    this.collectibleManager = new CollectibleManager(
      {
        minSpawnIntervalMs: config.collectibleMinSpawnIntervalMs,
        maxSpawnIntervalMs: config.collectibleMaxSpawnIntervalMs,
        maxSimultaneousItems: config.collectibleMaxSimultaneous,
        itemLifetimeMs: config.collectibleLifetimeMs,
        itemRadius: 13,
        spawnMargin: 75,
        minDistanceBetweenItems: 45,
        minDistanceFromBalls: 35,
      },
      ELIMINATE_ABILITY_DEFINITIONS
    );
  }

  public setParticipants(countries: CountryData[]): void {
    this.customParticipants = countries;
  }

  public start(): void {
    logger.info('EliminateManager started. Preparing round 1.');
    this.prepareNextRound();
  }

  public prepareNextRound(): void {
    try {
      this.state = 'INITIALIZING';
      this.roundNumber++;
      this.winner = null;
      this.eliminationLog = [];
      this.balls = [];
      this.particles.reset();
      this.collectibleManager.reset();

      const participants =
        this.customParticipants && this.customParticipants.length >= 2
          ? [...this.customParticipants]
          : getRoundParticipants(this.config.countryCount, true);

      this.spawnParticipants(participants);

      this.state = 'COUNTDOWN';
      this.stateTimerMs = this.config.countdownDurationMs;
      this.onStateChange?.(this.state, Math.ceil(this.stateTimerMs / 1000));
      logger.info(`Eliminate Round ${this.roundNumber} prepared with ${participants.length} countries.`);
    } catch (err) {
      logger.error('Failed to prepare eliminate round:', err);
      this.state = 'RESETTING';
      this.stateTimerMs = 2000;
    }
  }

  private spawnParticipants(countries: CountryData[]): void {
    const count = countries.length;
    const spawnRadius = this.config.arenaRadius * 0.55;

    for (let i = 0; i < count; i++) {
      const country = countries[i];
      const angle = (i / count) * Math.PI * 2;

      const x = this.config.arenaCenterX + Math.cos(angle) * spawnRadius;
      const y = this.config.arenaCenterY + Math.sin(angle) * spawnRadius;

      const ball = new EliminateBall(
        country,
        x,
        y,
        0,
        0,
        this.config.ballRadius,
        this.config.maxHealth,
        false
      );
      const speed = (this.config.minSpeed + Math.random() * 1.5) * ball.speedMultiplier;
      const moveAngle = angle + Math.PI / 2 + (Math.random() - 0.5) * 0.8; // Initial swirl

      ball.vx = Math.cos(moveAngle) * speed;
      ball.vy = Math.sin(moveAngle) * speed;

      this.balls.push(ball);
    }
  }

  public update(deltaMs: number, timestamp: number): void {
    this.particles.update();

    switch (this.state) {
      case 'COUNTDOWN': {
        this.stateTimerMs -= deltaMs;
        const secondsRemaining = Math.max(1, Math.ceil(this.stateTimerMs / 1000));
        this.onStateChange?.(this.state, secondsRemaining);

        // Rotate boundary during countdown so players see the gap in motion
        this.rotatingBoundary.update(this.config.rotationSpeedRad * 0.5);

        if (this.stateTimerMs <= 0) {
          this.state = 'BATTLE';
          this.roundStartTime = timestamp;
          this.collectibleManager.scheduleNextSpawn(timestamp);
          this.onStateChange?.(this.state);
          logger.info(`Eliminate Round ${this.roundNumber} started!`);
        }
        break;
      }

      case 'BATTLE': {
        // 1. Rotate gap
        this.rotatingBoundary.update(this.config.rotationSpeedRad);

        const aliveBalls = this.balls.filter((b) => b.isAlive);
        const aliveCount = aliveBalls.length;

        // 2. Intelligent physical steering & anti-orbiting
        for (let i = 0; i < aliveBalls.length; i++) {
          const ball = aliveBalls[i];

          // 2a. Natural inward pull toward arena center (keeps balls crossing through the arena)
          const cdx = this.config.arenaCenterX - ball.x;
          const cdy = this.config.arenaCenterY - ball.y;
          const distFromCenter = Math.sqrt(cdx * cdx + cdy * cdy);

          if (distFromCenter > this.config.arenaRadius * 0.35 && distFromCenter > 0.001) {
            const centerPull = 0.07 * (ball.speedMultiplier || 1.0);
            ball.vx += (cdx / distFromCenter) * centerPull;
            ball.vy += (cdy / distFromCenter) * centerPull;
          }

          // 2b. Combat seek: When few balls remain (<= 6), actively steer toward the nearest opponent!
          if (aliveCount <= 6 && distFromCenter < this.config.arenaRadius - 8) {
            let nearestOpponent: EliminateBall | null = null;
            let minDistSq = Infinity;

            for (let j = 0; j < aliveBalls.length; j++) {
              const opp = aliveBalls[j];
              if (opp.country.id === ball.country.id) continue;
              const odx = opp.x - ball.x;
              const ody = opp.y - ball.y;
              const dSq = odx * odx + ody * ody;
              if (dSq < minDistSq) {
                minDistSq = dSq;
                nearestOpponent = opp;
              }
            }

            if (nearestOpponent) {
              const oppDist = Math.sqrt(minDistSq);
              if (oppDist > 0.001) {
                // Aggressive interception steering when few survive to guarantee decisive battles
                const combatStrength = aliveCount <= 3 ? 0.20 : 0.12;
                ball.vx += ((nearestOpponent.x - ball.x) / oppDist) * combatStrength;
                ball.vy += ((nearestOpponent.y - ball.y) / oppDist) * combatStrength;
              }
            }
          }

          // 2c. Anti-wall-orbiting safeguard:
          // If a ball is near the wall with minimal radial velocity (gliding along rim), kick it inward
          if (distFromCenter > this.config.arenaRadius - ball.radius * 2.2 && distFromCenter > 0.001) {
            const nx = (ball.x - this.config.arenaCenterX) / distFromCenter;
            const ny = (ball.y - this.config.arenaCenterY) / distFromCenter;
            const vr = ball.vx * nx + ball.vy * ny; // Outward radial speed
            const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);

            if (speed > 0.001 && Math.abs(vr) / speed < 0.30) {
              ball.vx -= nx * 1.2;
              ball.vy -= ny * 1.2;
            }
          }

          // 2d. Update ball physics position and speed limits
          ball.update(this.config.minSpeed, this.config.maxSpeed);
        }

        // 3. Inter-ball elastic collisions & impact damage
        this.rotatingBoundary.resolveBallToBall(
          this.balls,
          (b1, b2, relSpeed, contactX, contactY) => {
            this.handleCollisionDamage(b1, b2, relSpeed, contactX, contactY, timestamp);
          }
        );

        // 4. Boundary collisions & gap escape detection
        const escaped = this.rotatingBoundary.resolveCollisions(this.balls);
        for (let i = 0; i < escaped.length; i++) {
          this.handleBallEscaped(escaped[i]);
        }

        // 5. Update & check Collectibles
        this.collectibleManager.update(
          deltaMs,
          timestamp,
          this.config.arenaCenterX,
          this.config.arenaCenterY,
          this.config.arenaRadius,
          this.balls
        );

        this.collectibleManager.checkPickups(this.balls, timestamp, (ball, item) => {
          this.applyAbility(ball, item, timestamp);
        });

        // 6. Check winner condition
        this.checkWinnerCondition(timestamp);
        break;
      }

      case 'WINNER_ANNOUNCEMENT': {
        this.stateTimerMs -= deltaMs;
        this.rotatingBoundary.update(this.config.rotationSpeedRad * 0.3);

        if (this.winner && Math.random() > 0.4) {
          this.particles.spawnConfetti(this.config.arenaCenterX, this.config.arenaCenterY, 3);
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
        this.rotatingBoundary.update(this.config.rotationSpeedRad * 0.3);
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
  }

  /**
   * Applies collision damage based on relative velocity and active damage multipliers
   */
  private handleCollisionDamage(
    b1: EliminateBall,
    b2: EliminateBall,
    relSpeed: number,
    contactX: number,
    contactY: number,
    timestamp: number
  ): void {
    if (!b1.isAlive || !b2.isAlive) return;

    // Friendly duplicates do not inflict damage on each other
    if (b1.country.id === b2.country.id) return;

    // Check collision damage cooldown between this pair
    const canDamage1 = b1.canDamageWith(b2.instanceId, timestamp, this.config.collisionDamageCooldownMs);
    const canDamage2 = b2.canDamageWith(b1.instanceId, timestamp, this.config.collisionDamageCooldownMs);

    if (!canDamage1 && !canDamage2) return;

    b1.registerDamageCollision(b2.instanceId, timestamp);
    b2.registerDamageCollision(b1.instanceId, timestamp);

    // Dynamic match acceleration after 25s to decisively conclude stalemates
    const battleDurationSec = Math.max(0, (timestamp - this.roundStartTime) / 1000);
    const timeScale = battleDurationSec > 25 ? 1.0 + (battleDurationSec - 25) * 0.05 : 1.0;

    // Calculate base damage from collision impact strength
    const baseDamage = Math.max(
      1,
      Math.round((this.config.baseCollisionDamage + this.config.damageMultiplier * relSpeed) * timeScale)
    );

    // Factor in outgoing damage multipliers from Damage Boost
    const dmgToB2 = baseDamage * (b1.isDamageBoostActive(timestamp) ? b1.damageMultiplier : 1.0);
    const dmgToB1 = baseDamage * (b2.isDamageBoostActive(timestamp) ? b2.damageMultiplier : 1.0);

    const res2 = b2.takeDamage(dmgToB2, timestamp);
    const res1 = b1.takeDamage(dmgToB1, timestamp);

    // Spawn contact sparks
    this.particles.spawnSparks(contactX, contactY, '#ffd700', 5);

    // Check eliminations by HP depletion
    if (res2.eliminated) {
      this.handleBallDepleted(b2, b1);
    }
    if (res1.eliminated) {
      this.handleBallDepleted(b1, b2);
    }
  }

  /**
   * Applies picked up collectible effect
   */
  private applyAbility(ball: EliminateBall, item: CollectibleItem, timestamp: number): void {
    switch (item.type) {
      case 'HEALTH_BOOST': {
        const restored = ball.heal(this.config.healthBoostAmount);
        this.particles.spawnSparks(ball.x, ball.y, '#10b981', 8);
        logger.info(`[Ability] ${ball.country.name} collected Health Boost (+${restored} HP)`);
        break;
      }

      case 'DAMAGE_BOOST': {
        ball.applyDamageBoost(
          this.config.damageBoostMultiplier,
          this.config.damageBoostDurationMs,
          timestamp
        );
        this.particles.spawnSparks(ball.x, ball.y, '#f97316', 10);
        logger.info(`[Ability] ${ball.country.name} collected Damage Boost (${this.config.damageBoostMultiplier}x)`);
        break;
      }

      case 'SHIELD': {
        ball.applyShield(this.config.shieldDurationMs, timestamp);
        this.particles.spawnSparks(ball.x, ball.y, '#06b6d4', 10);
        logger.info(`[Ability] ${ball.country.name} collected Shield`);
        break;
      }

      case 'DUPLICATE': {
        const currentCountryBalls = this.balls.filter(
          (b) => b.isAlive && b.country.id === ball.country.id
        ).length;
        const totalAlive = this.balls.filter((b) => b.isAlive).length;

        if (
          currentCountryBalls < this.config.maxBallsPerCountry &&
          totalAlive < this.config.maxGlobalBalls
        ) {
          // Spawn real duplicate ball offset from collector
          const angle = Math.random() * Math.PI * 2;
          const offsetDist = ball.radius * 2 + 6;
          const dupX = ball.x + Math.cos(angle) * offsetDist;
          const dupY = ball.y + Math.sin(angle) * offsetDist;

          const dupBall = new EliminateBall(
            ball.country,
            dupX,
            dupY,
            -ball.vx * 0.9,
            -ball.vy * 0.9,
            ball.radius,
            this.config.duplicateHealth,
            true
          );

          this.balls.push(dupBall);
          this.particles.spawnSparks(dupX, dupY, '#a855f7', 14);
          logger.info(`[Ability] ${ball.country.name} duplicated! (Country now has ${currentCountryBalls + 1} balls)`);
        } else {
          // At capacity: give partial health bonus instead
          ball.heal(20);
          logger.info(`[Ability] ${ball.country.name} duplicate cap reached; converted to heal`);
        }
        break;
      }

      default:
        break;
    }
  }

  private handleBallEscaped(ball: EliminateBall): void {
    this.particles.spawnElimination(ball.x, ball.y, ball.country.color, 22);
    this.processBallDeath(ball, 'escaped the arena');
  }

  private handleBallDepleted(ball: EliminateBall, killer: EliminateBall): void {
    this.particles.spawnElimination(ball.x, ball.y, ball.country.color, 22);
    this.processBallDeath(ball, `was eliminated in combat by ${killer.country.name}`);
  }

  /**
   * Processes the destruction of an EliminateBall (original or duplicate)
   */
  private processBallDeath(ball: EliminateBall, reason: string): void {
    ball.isAlive = false;

    // Check if any other balls for this country are still alive
    const otherBallsAlive = this.balls.some(
      (b) => b.isAlive && b.country.id === ball.country.id
    );

    if (otherBallsAlive) {
      // Country still has living duplicate(s) or original!
      logger.info(
        `[Ball Eliminated] A ball for ${ball.country.name} ${reason}, but country remains in the game!`
      );
      return;
    }

    // ALL balls for this country are eliminated! Country is out.
    const remainingCountries = this.getUniqueAliveCountries().length;
    ball.eliminationRank = remainingCountries + 1;

    // Synchronize elimination rank to all balls of this country
    for (let i = 0; i < this.balls.length; i++) {
      if (this.balls[i].country.id === ball.country.id) {
        this.balls[i].eliminationRank = ball.eliminationRank;
      }
    }

    const event: EliminationEvent = {
      victim: ball.country,
      timestamp: Date.now(),
      rank: ball.eliminationRank,
      customMessage: `${ball.country.name} eliminated! (${reason})`,
    };

    this.eliminationLog.unshift(event);
    this.onElimination?.(event);
    logger.info(`[Country Eliminated] ${ball.country.name} is fully eliminated! (Rank #${ball.eliminationRank})`);
  }

  private getUniqueAliveCountries(): CountryData[] {
    const seen = new Set<string>();
    const list: CountryData[] = [];
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (b.isAlive && !seen.has(b.country.id)) {
        seen.add(b.country.id);
        list.push(b.country);
      }
    }
    return list;
  }

  private checkWinnerCondition(timestamp: number): void {
    const aliveCountries = this.getUniqueAliveCountries();

    if (aliveCountries.length === 1) {
      const winningCountry = aliveCountries[0];
      const survivor =
        this.balls.find((b) => b.isAlive && b.country.id === winningCountry.id) || null;

      if (survivor) {
        survivor.eliminationRank = 1;
        this.winner = survivor;
      }
      this.finishRound(survivor, timestamp);
    } else if (aliveCountries.length === 0) {
      // Fallback in case of simultaneous elimination
      const fallback =
        [...this.balls].sort((a, b) => b.eliminationRank - a.eliminationRank)[0] || null;
      if (fallback) {
        fallback.eliminationRank = 1;
        this.winner = fallback;
      }
      this.finishRound(fallback, timestamp);
    }
  }

  private finishRound(winner: EliminateBall | null, timestamp: number): void {
    this.state = 'WINNER_ANNOUNCEMENT';
    this.stateTimerMs = this.config.winnerAnnouncementDurationMs;
    this.onStateChange?.(this.state);

    const durationSeconds = Math.max(1, Math.round((timestamp - this.roundStartTime) / 1000));
    logger.info(
      `Eliminate Round ${this.roundNumber} finished! Winner: ${winner ? winner.country.name : 'None'} in ${durationSeconds}s`
    );

    const leaderboard = this.getLeaderboard();
    this.onRoundEnd?.({
      roundNumber: this.roundNumber,
      winner: winner ? winner.country : null,
      leaderboard,
      eliminationLog: [...this.eliminationLog],
      durationSeconds,
    });
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
          kills: 0,
          damageDealt: 0,
          health: ball.isAlive ? ball.health : 0,
          isAlive: ball.isAlive,
        });
      } else {
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
      return a.rank - b.rank;
    });
  }

  public destroy(): void {
    this.balls = [];
    this.particles.reset();
    this.collectibleManager.reset();
  }
}
