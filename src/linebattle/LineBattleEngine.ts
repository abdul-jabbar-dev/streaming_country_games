/**
 * Game Engine for Country Line Battle Arena
 * Manages Matter.js physics engine, LineBattleManager, LineBattleRenderer,
 * fixed-timestep simulation accumulator, and adaptive performance profiles.
 */

import Matter from 'matter-js';
const { Engine } = Matter;
import type { Engine as MatterEngine } from 'matter-js';
import { LineBattleManager } from './LineBattleManager.ts';
import { LineBattleRenderer } from './LineBattleRenderer.ts';
import { LINE_BATTLE_CONFIG } from './LineBattleConfig.ts';
import type { LineBattleConfig } from './LineBattleConfig.ts';
import type { AdaptivePerformanceManager } from '../rendering/AdaptivePerformanceManager.ts';
import { logger } from '../utils/logger.ts';
import { validateSpeedMultiplier } from '../config/GameSpeed.ts';

export class LineBattleEngine {
  public manager: LineBattleManager;
  public renderer: LineBattleRenderer;
  public adaptivePerf?: AdaptivePerformanceManager;
  public readonly config: LineBattleConfig;
  public readonly physicsEngine: MatterEngine;

  private rafId: number | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private lastTime: number = 0;
  private accumulator: number = 0;
  private virtualTime: number = 0;
  private speedMultiplier: number = 1.0;
  private isDestroyed: boolean = false;

  private visibilityHandler: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    customConfig?: Partial<LineBattleConfig>,
    adaptivePerf?: AdaptivePerformanceManager,
    initialSpeedMultiplier: number = 1.0
  ) {
    this.config = { ...LINE_BATTLE_CONFIG, ...customConfig };
    this.adaptivePerf = adaptivePerf;
    this.speedMultiplier = validateSpeedMultiplier(initialSpeedMultiplier);

    // Matter.js engine with zero gravity and sleeping disabled
    this.physicsEngine = Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
      enableSleeping: false,
    });

    this.manager = new LineBattleManager(this.config, this.physicsEngine);
    this.renderer = new LineBattleRenderer(
      canvas,
      this.config,
      this.manager,
      adaptivePerf?.currentProfile
    );

    this.visibilityHandler = () => {
      if (document.hidden) {
        this.accumulator = 0;
      } else {
        this.lastTime = performance.now();
        this.accumulator = 0;
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  public setSpeedMultiplier(mult: number): void {
    this.speedMultiplier = validateSpeedMultiplier(mult);
  }

  public getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  public start(): void {
    if (this.isDestroyed) {
      logger.warn('Cannot start a destroyed LineBattleEngine.');
      return;
    }
    if (this.isRunning) {
      logger.warn('LineBattleEngine is already running.');
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.virtualTime = performance.now();
    this.accumulator = 0;
    this.manager.start();
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
    logger.info('LineBattleEngine started.');
  }

  public stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.manager.destroy();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    logger.info('LineBattleEngine stopped.');
  }

  private tick(timestamp: number): void {
    if (!this.isRunning) return;

    const frameStart = performance.now();
    if (this.lastTime === 0) {
      this.lastTime = timestamp;
    }

    const rawDelta = timestamp - this.lastTime;
    const delta = Math.min(Math.max(0, rawDelta), 100);
    this.lastTime = timestamp;

    let physicsDuration = 0;

    try {
      if (!this.isPaused) {
        const isGameplay = this.manager.state === 'BATTLE';
        const currentSpeed = isGameplay ? this.speedMultiplier : 1.0;

        // When not in active gameplay (e.g. countdown or post-round screens), clamp any residual high-speed accumulator
        if (!isGameplay && this.accumulator > this.config.fixedDeltaMs * 1.5) {
          this.accumulator = this.config.fixedDeltaMs;
        }

        // Accumulate scaled delta time: speedMultiplier during active gameplay, 1.0x during countdown and post-round screens
        this.accumulator += delta * currentSpeed;

        // Scale maxSubSteps dynamically so high speeds run without artificial sub-step clamping
        const scaledMaxSubSteps = Math.ceil(this.config.maxSubSteps * Math.max(1, currentSpeed) * 1.5);
        const maxAccumulator = this.config.fixedDeltaMs * scaledMaxSubSteps;
        if (this.accumulator > maxAccumulator) {
          this.accumulator = maxAccumulator;
        }

        const pStart = performance.now();
        while (this.accumulator >= this.config.fixedDeltaMs) {
          // Advance virtual simulation timestamp exactly synchronized with physics steps
          this.virtualTime += this.config.fixedDeltaMs;
          Engine.update(this.physicsEngine, this.config.fixedDeltaMs);
          this.manager.update(this.config.fixedDeltaMs, this.virtualTime);
          this.accumulator -= this.config.fixedDeltaMs;

          // Truncate residual high-speed sub-steps if battle state just transitioned
          if (isGameplay && this.manager.state !== 'BATTLE') {
            this.accumulator = 0;
            break;
          }
        }
        physicsDuration = performance.now() - pStart;
      }

      const rStart = performance.now();
      const diagnostics = this.adaptivePerf?.getDiagnostics();
      this.renderer.render(this.config.debugMode ? diagnostics : undefined);
      const renderDuration = performance.now() - rStart;

      const totalFrameTime = performance.now() - frameStart;
      this.adaptivePerf?.recordFrame(totalFrameTime, physicsDuration, renderDuration);
    } catch (err) {
      logger.error('Unhandled error in LineBattleEngine tick:', err);
      this.destroy();
      throw err;
    }

    if (this.isRunning) {
      this.rafId = requestAnimationFrame((ts) => this.tick(ts));
    }
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.stop();
  }
}
