/**
 * Line Battle Manager & State Machine
 * Manages Country Line Battle Arena round lifecycles, connection line creation on boundary impacts,
 * continuous line-cutting detection, country elimination, and champion coronation.
 */

import Matter from 'matter-js';
const { Bodies, Body, Composite, Events } = Matter;
import type { IEventCollision, Engine } from 'matter-js';
import type { LineBattleConfig } from './LineBattleConfig.ts';
import type { CountryData } from '../config/countries.ts';
import { getRoundParticipants } from '../config/countries.ts';
import { LineBattleBall } from './LineBattleBall.ts';
import { ConnectionLine } from './ConnectionLine.ts';
import { Arena } from '../game/Arena.ts';
import { MovementController } from '../game/MovementController.ts';
import { ParticleSystem } from '../game/ParticleSystem.ts';
import { checkBallCrossesSegmentCoords } from './LineIntersection.ts';
import { CollectibleManager } from '../collectibles/CollectibleManager.ts';
import type { CollectibleDefinition, CollectibleItem } from '../collectibles/CollectibleItem.ts';
import type { BattleResults, BattleState, EliminationEvent, ParticipantScore } from '../game/GameState.ts';
import { soundSynth } from '../audio/SoundSynthesizer.ts';
import { logger } from '../utils/logger.ts';

const LINE_ABILITY_DEFINITIONS: CollectibleDefinition[] = [
  {
    type: 'ADD_STRINGS',
    label: '+5 STRINGS',
    sublabel: '+5 LINES',
    icon: '🧶',
    color: '#eab308',
    accentColor: 'rgba(234, 179, 8, 0.45)',
    weight: 25,
  },
  {
    type: 'REMOVE_STRINGS',
    label: '-2 STRINGS',
    sublabel: '-2 CUT',
    icon: '✂️',
    color: '#ef4444',
    accentColor: 'rgba(239, 68, 68, 0.45)',
    weight: 20,
  },
  {
    type: 'SHIELD_STRINGS',
    label: 'SHIELD',
    sublabel: 'PROTECT',
    icon: '🛡️',
    color: '#06b6d4',
    accentColor: 'rgba(6, 182, 212, 0.45)',
    weight: 20,
  },
  {
    type: 'REPAIR_STRING',
    label: 'REPAIR',
    sublabel: 'FIX 1',
    icon: '🔧',
    color: '#10b981',
    accentColor: 'rgba(168, 85, 247, 0.45)',
    weight: 15,
  },
  {
    type: 'SPEED_SLICER',
    label: 'SLICER',
    sublabel: 'SPEED',
    icon: '⚡',
    color: '#3b82f6',
    accentColor: 'rgba(59, 130, 246, 0.45)',
    weight: 10,
  },
  {
    type: 'REPULSE',
    label: 'DEFENSE',
    sublabel: 'BLAST',
    icon: '💥',
    color: '#ec4899',
    accentColor: 'rgba(236, 72, 153, 0.45)',
    weight: 10,
  },
];

export class LineBattleManager {
  public state: BattleState = 'INITIALIZING';
  public roundNumber: number = 0;
  public balls: LineBattleBall[] = [];
  public eliminationLog: EliminationEvent[] = [];
  public winner: LineBattleBall | null = null;
  public isDraw: boolean = false;

  public arena: Arena;
  public movementController: MovementController;
  public particles: ParticleSystem;
  public collectibleManager: CollectibleManager;

  public customParticipants: CountryData[] | null = null;
  public autoLoop: boolean = true;
  private isDestroyed: boolean = false;
  private hasPlayedShowdown: boolean = false;

  public stateTimerMs: number = 0;
  private roundStartTime: number = 0;
  private lineIdCounter: number = 0;
  private collisionHandlerBound: (event: IEventCollision<Engine>) => void;
  private currentTimestamp: number = 0;

  public readonly config: LineBattleConfig;
  public readonly engine: Engine;

  // Listeners for UI updates
  public onStateChange?: (state: BattleState, countdownVal?: number) => void;
  public onElimination?: (event: EliminationEvent) => void;
  public onRoundEnd?: (results: BattleResults) => void;
  public onComplete?: () => void;
  public onLineCreated?: (line: ConnectionLine, ball: LineBattleBall) => void;
  public onLineCut?: (line: ConnectionLine, cutter: LineBattleBall, owner: LineBattleBall) => void;

  constructor(config: LineBattleConfig, engine: Engine) {
    this.config = config;
    this.engine = engine;

    this.arena = new Arena(
      config.arenaCenterX,
      config.arenaCenterY,
      config.arenaRadius,
      config.arenaSegments
    );

    this.particles = new ParticleSystem(250);

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
      LINE_ABILITY_DEFINITIONS
    );

    this.movementController = new MovementController({
      minDesiredSpeed: config.minDesiredSpeed,
      maxSpeed: config.maxSpeed,
      steeringStrength: config.steeringStrength,
      steeringIntervalMs: config.steeringIntervalMs,
    });

    this.collisionHandlerBound = (event) => this.handleCollisions(event);
    Events.on(this.engine, 'collisionStart', this.collisionHandlerBound);
  }

  public setParticipants(countries: CountryData[]): void {
    this.customParticipants = countries;
  }

  public start(): void {
    logger.info('LineBattleManager started. Preparing round 1.');
    this.roundNumber = 0;
    this.prepareNextRound();
  }

  public prepareNextRound(): void {
    this.roundNumber++;
    this.resetRound();

    // Rebuild boundary
    this.arena.build(this.engine, this.config.wallRestitution);

    // Select contestants
    const participants = this.customParticipants && this.customParticipants.length >= 2
      ? this.customParticipants
      : getRoundParticipants(this.config.countryCount);

    this.spawnCountryBalls(participants);

    // Initial state: 3-second countdown
    this.state = 'COUNTDOWN';
    this.stateTimerMs = this.config.countdownDurationMs;
    const initialSeconds = Math.max(1, Math.ceil(this.stateTimerMs / 1000));
    this.onStateChange?.('COUNTDOWN', initialSeconds);
    logger.info(`Line Battle Round ${this.roundNumber} prepared with ${this.balls.length} countries.`);
  }

  private spawnCountryBalls(countries: CountryData[]): void {
    const count = countries.length;
    const spawnRadius = this.config.arenaRadius * 0.55;
    const sectorSpan = (Math.PI * 2) / count;
    const linesPerCountry = this.config.initialLinesPerCountry || 6;

    for (let i = 0; i < count; i++) {
      const country = countries[i];
      const sectorStart = i * sectorSpan;
      const midAngle = sectorStart + sectorSpan / 2;

      // Ball spawns at the center of its assigned boundary sector
      const x = this.config.arenaCenterX + Math.cos(midAngle) * spawnRadius;
      const y = this.config.arenaCenterY + Math.sin(midAngle) * spawnRadius;

      const body = Bodies.circle(x, y, this.config.ballRadius, {
        restitution: this.config.ballRestitution,
        friction: this.config.ballFriction,
        frictionAir: this.config.ballFrictionAir,
        density: this.config.ballDensity,
        label: country.id,
      });

      const ball = new LineBattleBall(country, body);
      // Set physical mass based on ball's individual trait
      Body.setMass(body, body.mass * ball.massMultiplier);

      // Keep bodies stationary during countdown
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);

      // Pre-initial connection lines distributed evenly across this country's boundary sector
      // 2 countries => 50% sector (180 deg) each
      // 3 countries => 33.33% sector (120 deg) each
      // 4 countries => 25% sector (90 deg) each
      for (let j = 0; j < linesPerCountry; j++) {
        const lineAngle = sectorStart + ((j + 0.5) / linesPerCountry) * sectorSpan;
        const anchorX = this.config.arenaCenterX + Math.cos(lineAngle) * this.config.arenaRadius;
        const anchorY = this.config.arenaCenterY + Math.sin(lineAngle) * this.config.arenaRadius;

        this.lineIdCounter++;
        const initialLine = new ConnectionLine(
          `line_${this.lineIdCounter}`,
          country.id,
          anchorX,
          anchorY,
          x,
          y,
          0
        );
        ball.addLine(initialLine);
      }

      this.balls.push(ball);
      Composite.add(this.engine.world, body);
    }
  }

  public resetRound(): void {
    // Remove all existing bodies from physics engine
    for (const ball of this.balls) {
      ball.destroy(this.engine);
    }

    this.arena.destroy(this.engine);
    this.balls = [];
    this.particles.reset();
    this.collectibleManager.reset();
    this.winner = null;
    this.isDraw = false;
    this.hasPlayedShowdown = false;
    this.eliminationLog = [];
  }

  /**
   * Collision callback: detects genuine boundary hits to create connection lines
   */
  private handleCollisions(event: IEventCollision<Engine>): void {
    if (this.state !== 'BATTLE') return;

    const pairs = event.pairs;
    const len = pairs.length;

    for (let i = 0; i < len; i++) {
      const pair = pairs[i];
      const bodyA = pair.bodyA;
      const bodyB = pair.bodyB;

      const isWallA = bodyA.label === 'ArenaWall';
      const isWallB = bodyB.label === 'ArenaWall';

      if (!isWallA && !isWallB) {
        // Inter-ball kinetic collision impact
        const bA = this.balls.find((b) => b.isAlive && b.body.id === bodyA.id);
        const bB = this.balls.find((b) => b.isAlive && b.body.id === bodyB.id);
        if (bA && bB) {
          const dvx = bA.body.velocity.x - bB.body.velocity.x;
          const dvy = bA.body.velocity.y - bB.body.velocity.y;
          const relSpeed = Math.sqrt(dvx * dvx + dvy * dvy);
          const panX = ((bA.body.position.x + bB.body.position.x) * 0.5 - this.config.arenaCenterX) / this.config.arenaRadius;
          soundSynth.playImpact(relSpeed, panX);
        }
        continue;
      }

      const ballBody = isWallA ? bodyB : bodyA;
      const ball = this.balls.find((b) => b.isAlive && b.body.id === ballBody.id);

      if (!ball) continue;

      // Play wall bounce ping
      const vx = ball.body.velocity.x;
      const vy = ball.body.velocity.y;
      const bSpeed = Math.sqrt(vx * vx + vy * vy);
      const panX = (ball.body.position.x - this.config.arenaCenterX) / this.config.arenaRadius;
      soundSynth.playWallBounce(bSpeed, panX);

      // Check collision cooldown and max lines per country
      if (!ball.canCreateBoundaryLine(this.currentTimestamp, this.config.boundaryHitCooldownMs)) {
        continue;
      }

      if (ball.getActiveLineCount() >= this.config.maxLinesPerCountry) {
        // Line limit reached: reject additional line creation until one is cut
        continue;
      }

      // Calculate anchor on circular boundary
      const dx = ball.body.position.x - this.config.arenaCenterX;
      const dy = ball.body.position.y - this.config.arenaCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 1) continue;

      const nx = dx / dist;
      const ny = dy / dist;
      const anchorX = this.config.arenaCenterX + nx * this.config.arenaRadius;
      const anchorY = this.config.arenaCenterY + ny * this.config.arenaRadius;

      this.lineIdCounter++;
      const newLine = new ConnectionLine(
        `line_${this.lineIdCounter}`,
        ball.country.id,
        anchorX,
        anchorY,
        ball.body.position.x,
        ball.body.position.y,
        this.currentTimestamp
      );

      ball.addLine(newLine);
      ball.registerBoundaryHit(this.currentTimestamp);

      // Elastic rebound velocity kick from boundary impact
      const curVx = ball.body.velocity.x;
      const curVy = ball.body.velocity.y;
      Body.setVelocity(ball.body, {
        x: curVx * 1.12,
        y: curVy * 1.12,
      });

      // Spawn boundary hit spark
      this.particles.spawnSparks(anchorX, anchorY, ball.country.color, 6);

      const eventLog: EliminationEvent = {
        victim: ball.country,
        rank: ball.getActiveLineCount(),
        timestamp: this.currentTimestamp,
        customMessage: `${ball.country.name} created line #${ball.getActiveLineCount()}`,
      };
      this.eliminationLog.unshift(eventLog);
      this.onLineCreated?.(newLine, ball);
    }
  }

  private launchInitialImpulses(): void {
    const count = this.balls.length;
    const sectorSpan = (Math.PI * 2) / count;
    for (let i = 0; i < count; i++) {
      const ball = this.balls[i];
      if (!ball.isAlive) continue;
      const sectorStart = i * sectorSpan;
      const midAngle = sectorStart + sectorSpan / 2;
      const speed = (this.config.minDesiredSpeed + Math.random() * 1.5) * ball.getEffectiveSpeedMultiplier();
      const launchAngle = midAngle + Math.PI + (Math.random() - 0.5) * 0.6;
      Body.setVelocity(ball.body, {
        x: Math.cos(launchAngle) * speed,
        y: Math.sin(launchAngle) * speed,
      });
    }
  }

  public update(deltaMs: number, timestamp: number): void {
    if (this.isDestroyed) return;
    this.currentTimestamp = timestamp;

    try {
      this.particles.update();

      switch (this.state) {
        case 'INITIALIZING':
          break;

        case 'COUNTDOWN': {
          this.stateTimerMs -= deltaMs;
          const secondsRemaining = Math.max(0, Math.ceil(this.stateTimerMs / 1000));
          this.onStateChange?.('COUNTDOWN', secondsRemaining);

          // COMPLETE STADIUM FREEZE: Balls locked stationary at starting sectors
          for (const ball of this.balls) {
            Body.setVelocity(ball.body, { x: 0, y: 0 });
            Body.setAngularVelocity(ball.body, 0);
            for (const line of ball.lines) {
              line.updateEndpoint(ball.body.position.x, ball.body.position.y);
            }
          }

          if (this.stateTimerMs <= 0) {
            this.state = 'BATTLE';
            this.roundStartTime = timestamp;
            this.collectibleManager.scheduleNextSpawn(timestamp);
            this.onStateChange?.('BATTLE', 0);
            soundSynth.playGoSignal();
            this.launchInitialImpulses();
            logger.info(`Line Battle Round ${this.roundNumber} BATTLE started with GO!`);
          }
          break;
        }

        case 'BATTLE': {
          // 1. Record previous positions for CCD before physics step continues
          for (const ball of this.balls) {
            if (ball.isAlive) {
              ball.recordPreviousPosition();
            }
          }

          // 2. Physics & autonomous movement controller
          this.movementController.update(
            this.balls as any,
            { x: this.config.arenaCenterX, y: this.config.arenaCenterY },
            timestamp
          );

          // 3. Update active line endpoints and enforce boundary clamps
          for (const ball of this.balls) {
            if (ball.isAlive) {
              ball.updateVisualTimers();
              ball.enforceRadialBoundary(
                this.config.arenaCenterX,
                this.config.arenaCenterY,
                this.config.arenaRadius,
                this.config.ballRadius
              );

              for (const line of ball.lines) {
                line.updateEndpoint(ball.body.position.x, ball.body.position.y);
              }
            }
          }

          // 4. Check Continuous Line Cutting
          this.processLineCutting(timestamp);

          // 5. Update & check Collectibles
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

          // Adapt ball for collectible pickup collision
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

          // 6. Check winner condition
          this.checkWinnerCondition(timestamp);
          break;
        }

        case 'WINNER_ANNOUNCEMENT': {
          this.stateTimerMs -= deltaMs;

          if (this.winner && Math.random() > 0.3) {
            this.particles.spawnConfetti(
              this.config.arenaCenterX + (Math.random() - 0.5) * 260,
              this.config.arenaCenterY + (Math.random() - 0.5) * 160,
              4
            );
          }

          if (this.stateTimerMs <= 0) {
            this.state = 'RESULTS';
            this.stateTimerMs = this.config.resultsDurationMs;
            this.onStateChange?.('RESULTS');
          }
          break;
        }

        case 'RESULTS': {
          this.stateTimerMs -= deltaMs;
          if (this.winner && Math.random() > 0.6) {
            this.particles.spawnConfetti(
              this.config.arenaCenterX + (Math.random() - 0.5) * 200,
              this.config.arenaCenterY + (Math.random() - 0.5) * 140,
              2
            );
          }
          if (this.stateTimerMs <= 0) {
            this.state = 'RESETTING';
            this.stateTimerMs = this.config.resetDelayMs;
            this.onStateChange?.('RESETTING');
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
              this.onComplete?.();
            }
          }
          break;
        }

        default:
          break;
      }
    } catch (err) {
      logger.error('Error during LineBattleManager update cycle:', err);
    }
  }

  /**
   * Continuous Line Cutting Check:
   * Opponent balls cut connection lines when crossing or touching them.
   */
  private processLineCutting(timestamp: number): void {
    const balls = this.balls;
    const ballCount = balls.length;
    const ballRadius = this.config.ballRadius;
    const flashDuration = this.config.lineCutFlashDurationMs;

    for (let i = 0; i < ballCount; i++) {
      const cutter = balls[i];
      if (!cutter.isAlive) continue;

      const p0x = cutter.prevX;
      const p0y = cutter.prevY;
      const p1x = cutter.body.position.x;
      const p1y = cutter.body.position.y;

      for (let j = 0; j < ballCount; j++) {
        // Rule: A country cannot cut its own lines
        if (i === j) continue;

        const owner = balls[j];
        if (!owner.isAlive) continue;

        const lines = owner.lines;
        const lineCount = lines.length;

        for (let k = 0; k < lineCount; k++) {
          const line = lines[k];
          if (!line.isActive) continue;

          if (checkBallCrossesSegmentCoords(p0x, p0y, p1x, p1y, ballRadius, line.anchorX, line.anchorY, line.endpointX, line.endpointY)) {
            // Check Shield: if lines are protected, cutting is blocked!
            if (owner.isShieldActive(timestamp)) {
              this.particles.spawnSparks(p1x, p1y, '#06b6d4', 5);
              continue;
            }

            // Line cut confirmed!
            line.cut(cutter.id, timestamp, flashDuration);
            cutter.linesCut++;

            // Razor-sharp laser line slice audio with stereo pan
            const panX = (p1x - this.config.arenaCenterX) / this.config.arenaRadius;
            soundSynth.playSlice(panX);

            // Dynamic slice momentum kick for the cutter
            const cutterVx = cutter.body.velocity.x;
            const cutterVy = cutter.body.velocity.y;
            Body.setVelocity(cutter.body, {
              x: cutterVx * 1.08,
              y: cutterVy * 1.08,
            });

            // Cutting particle spark
            this.particles.spawnSparks(p1x, p1y, '#ffffff', 8);
            this.particles.spawnSparks(p1x, p1y, owner.country.color, 5);

            logger.info(`[Cut] ${cutter.country.name} cut ${owner.country.name}'s line!`);
            this.onLineCut?.(line, cutter, owner);

            // Check if owner has been eliminated (0 active lines)
            const remainingLines = owner.getActiveLineCount();
            if (remainingLines === 0) {
              this.eliminateBall(owner, cutter);
            }
          }
        }
      }
    }
  }

  private eliminateBall(victim: LineBattleBall, killer?: LineBattleBall): void {
    if (!victim.isAlive) return;

    victim.isAlive = false;
    const aliveCount = this.balls.filter((b) => b.isAlive).length;
    victim.eliminationRank = aliveCount + 1;

    // Remove physics body so it ceases colliding or cutting
    victim.destroy(this.engine);

    // Spawn elimination burst
    this.particles.spawnElimination(
      victim.body.position.x,
      victim.body.position.y,
      victim.country.color,
      25
    );

    const event: EliminationEvent = {
      victim: victim.country,
      killer: killer ? killer.country : undefined,
      rank: victim.eliminationRank,
      timestamp: this.currentTimestamp,
      customMessage: `${victim.country.name} lost all lines and is ELIMINATED!`,
    };

    this.eliminationLog.unshift(event);
    this.onElimination?.(event);
    logger.info(`[Eliminated] ${victim.country.name} (Rank #${victim.eliminationRank}) by ${killer ? killer.country.name : 'All Lines Cut'}`);
  }

  /**
   * Applies Line Battle collectible ability
   */
  private applyAbility(ball: LineBattleBall, item: CollectibleItem, timestamp: number): void {
    if (!ball.isAlive) return;
    soundSynth.playPickup();

    switch (item.type) {
      case 'ADD_STRINGS': {
        const currentCount = ball.getActiveLineCount();
        const availableSpace = Math.max(0, this.config.maxLinesPerCountry - currentCount);
        const toAdd = Math.min(this.config.addStringsCount, availableSpace);

        if (toAdd > 0) {
          for (let k = 0; k < toAdd; k++) {
            const angle = Math.random() * Math.PI * 2;
            const anchorX = this.config.arenaCenterX + Math.cos(angle) * this.config.arenaRadius;
            const anchorY = this.config.arenaCenterY + Math.sin(angle) * this.config.arenaRadius;

            this.lineIdCounter++;
            const newLine = new ConnectionLine(
              `line_${this.lineIdCounter}`,
              ball.country.id,
              anchorX,
              anchorY,
              ball.body.position.x,
              ball.body.position.y,
              timestamp
            );
            ball.addLine(newLine);
          }
          this.particles.spawnSparks(ball.body.position.x, ball.body.position.y, '#eab308', 12);
          soundSynth.playAbilityActivate();
          logger.info(`[Ability] ${ball.country.name} collected +${toAdd} strings!`);
        } else {
          logger.info(
            `[Ability] ${ball.country.name} collected string boost, but at max line capacity (${this.config.maxLinesPerCountry})`
          );
        }
        break;
      }

      case 'REMOVE_STRINGS': {
        const removed = ball.removeOldestActiveLines(this.config.removeStringsCount, timestamp);
        this.particles.spawnSparks(ball.body.position.x, ball.body.position.y, '#ef4444', 10);
        soundSynth.playAbilityImpact();
        logger.info(`[Ability] ${ball.country.name} lost ${removed.length} strings from hazard collectible!`);

        // Check if removal triggered elimination (0 lines remaining)
        if (ball.getActiveLineCount() === 0) {
          this.eliminateBall(ball);
        }
        break;
      }

      case 'SHIELD_STRINGS': {
        ball.applyShield(this.config.stringShieldDurationMs, timestamp);
        this.particles.spawnSparks(ball.body.position.x, ball.body.position.y, '#06b6d4', 14);
        soundSynth.playAbilityActivate();
        logger.info(
          `[Ability] ${ball.country.name} collected Shield String! (Lines protected for ${
            this.config.stringShieldDurationMs / 1000
          }s)`
        );
        break;
      }

      case 'REPAIR_STRING': {
        if (ball.isAlive && ball.getActiveLineCount() < this.config.maxLinesPerCountry) {
          const angle = Math.random() * Math.PI * 2;
          const anchorX = this.config.arenaCenterX + Math.cos(angle) * this.config.arenaRadius;
          const anchorY = this.config.arenaCenterY + Math.sin(angle) * this.config.arenaRadius;

          this.lineIdCounter++;
          const repairedLine = new ConnectionLine(
            `line_${this.lineIdCounter}`,
            ball.country.id,
            anchorX,
            anchorY,
            ball.body.position.x,
            ball.body.position.y,
            timestamp
          );
          ball.addLine(repairedLine);
          this.particles.spawnSparks(ball.body.position.x, ball.body.position.y, '#10b981', 10);
          soundSynth.playAbilityActivate();
          logger.info(`[Ability] ${ball.country.name} repaired 1 line!`);
        }
        break;
      }

      case 'SPEED_SLICER': {
        ball.applySpeedBoost(6000, timestamp);
        const vx = ball.body.velocity.x * 1.6;
        const vy = ball.body.velocity.y * 1.6;
        Body.setVelocity(ball.body, { x: vx, y: vy });
        this.particles.spawnSparks(ball.body.position.x, ball.body.position.y, '#3b82f6', 16);
        soundSynth.playAbilityActivate();
        logger.info(`[Ability] ${ball.country.name} activated SPEED_SLICER!`);
        break;
      }

      case 'REPULSE': {
        const blastRadius = 180;
        this.particles.spawnSparks(ball.body.position.x, ball.body.position.y, '#ec4899', 22);
        soundSynth.playAbilityImpact();
        for (let i = 0; i < this.balls.length; i++) {
          const target = this.balls[i];
          if (!target.isAlive || target.id === ball.id) continue;
          const rdx = target.body.position.x - ball.body.position.x;
          const rdy = target.body.position.y - ball.body.position.y;
          const dist = Math.hypot(rdx, rdy);
          if (dist < blastRadius && dist > 1) {
            const forceMag = (1 - dist / blastRadius) * 0.075 * (target.body.mass || 1);
            Body.applyForce(target.body, target.body.position, {
              x: (rdx / dist) * forceMag,
              y: (rdy / dist) * forceMag,
            });
          }
        }
        logger.info(`[Ability] ${ball.country.name} blasted defensive shockwave!`);
        break;
      }

      default:
        break;
    }
  }

  private checkWinnerCondition(timestamp: number): void {
    const aliveBalls = this.balls.filter((b) => b.isAlive);

    if (aliveBalls.length === 2 && !this.hasPlayedShowdown) {
      this.hasPlayedShowdown = true;
      soundSynth.playShowdown();
    }

    if (aliveBalls.length === 1) {
      const winner = aliveBalls[0];
      winner.eliminationRank = 1;
      this.declareWinner(winner, timestamp);
    } else if (aliveBalls.length === 0 && this.balls.length > 0) {
      // Draw condition: all contestants eliminated in the same step
      this.isDraw = true;
      const fallback = [...this.balls].sort((a, b) => b.linesCut - a.linesCut)[0];
      this.declareWinner(fallback, timestamp);
    }
  }

  private declareWinner(winner: LineBattleBall, timestamp: number): void {
    this.winner = winner;
    this.state = 'WINNER_ANNOUNCEMENT';
    this.stateTimerMs = this.config.winnerAnnouncementDurationMs;
    this.onStateChange?.('WINNER_ANNOUNCEMENT');

    const durationSeconds = Math.max(1, Math.round((timestamp - this.roundStartTime) / 1000));
    logger.info(`Line Battle Round ${this.roundNumber} finished! Winner: ${winner.country.name} in ${durationSeconds}s`);

    const leaderboard = this.getLeaderboard();
    this.onRoundEnd?.({
      roundNumber: this.roundNumber,
      winner: winner.country,
      leaderboard,
      eliminationLog: [...this.eliminationLog],
      durationSeconds,
    });
  }

  public getLeaderboard(): ParticipantScore[] {
    return [...this.balls]
      .sort((a, b) => {
        if (a.isAlive && !b.isAlive) return -1;
        if (!a.isAlive && b.isAlive) return 1;
        if (a.eliminationRank !== b.eliminationRank) {
          return a.eliminationRank - b.eliminationRank;
        }
        return b.linesCut - a.linesCut;
      })
      .map((ball) => ({
        country: ball.country,
        rank: ball.eliminationRank || (ball.isAlive ? 1 : 99),
        kills: ball.linesCut,
        damageDealt: ball.linesCreated,
        health: ball.getActiveLineCount(),
        isAlive: ball.isAlive,
      }));
  }

  public getAllActiveLines(): ConnectionLine[] {
    const res: ConnectionLine[] = [];
    for (const ball of this.balls) {
      for (const line of ball.lines) {
        if (line.isActive) {
          res.push(line);
        }
      }
    }
    return res;
  }

  public getAllVisibleLines(timestamp: number): ConnectionLine[] {
    const res: ConnectionLine[] = [];
    for (const ball of this.balls) {
      for (const line of ball.lines) {
        if (line.isAnimationVisible(timestamp)) {
          res.push(line);
        }
      }
    }
    return res;
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    Events.off(this.engine, 'collisionStart', this.collisionHandlerBound);
    this.resetRound();
    try {
      Composite.clear(this.engine.world, false);
    } catch {}
    this.onStateChange = undefined;
    this.onElimination = undefined;
    this.onRoundEnd = undefined;
    this.onComplete = undefined;
    this.onLineCreated = undefined;
    this.onLineCut = undefined;
  }
}
