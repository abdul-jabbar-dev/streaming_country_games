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
  private isDestroyed: boolean = false;

  private visibilityHandler: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    customConfig?: Partial<LineBattleConfig>,
    adaptivePerf?: AdaptivePerformanceManager
  ) {
    this.config = { ...LINE_BATTLE_CONFIG, ...customConfig };
    this.adaptivePerf = adaptivePerf;

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
        this.accumulator += delta;
        const maxAccumulator = this.config.fixedDeltaMs * this.config.maxSubSteps;
        if (this.accumulator > maxAccumulator) {
          this.accumulator = maxAccumulator;
        }

        const pStart = performance.now();
        while (this.accumulator >= this.config.fixedDeltaMs) {
          Engine.update(this.physicsEngine, this.config.fixedDeltaMs);
          this.manager.update(this.config.fixedDeltaMs, timestamp);
          this.accumulator -= this.config.fixedDeltaMs;
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
