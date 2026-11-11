/**
 * Game Engine for Country Eliminate Arena
 * Adapted for cross-device performance and dynamic quality profiles
 */

import { EliminateManager } from './EliminateManager.ts';
import { EliminateRenderer } from './EliminateRenderer.ts';
import { ELIMINATE_CONFIG } from './EliminateConfig.ts';
import type { EliminateConfig } from './EliminateConfig.ts';
import type { AdaptivePerformanceManager } from '../rendering/AdaptivePerformanceManager.ts';
import { logger } from '../utils/logger.ts';
import { validateSpeedMultiplier } from '../config/GameSpeed.ts';

export class EliminateEngine {
  public manager: EliminateManager;
  public renderer: EliminateRenderer;
  public adaptivePerf?: AdaptivePerformanceManager;
  public readonly config: EliminateConfig;

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
    customConfig?: Partial<EliminateConfig>,
    adaptivePerf?: AdaptivePerformanceManager,
    initialSpeedMultiplier: number = 1.0
  ) {
    this.config = { ...ELIMINATE_CONFIG, ...customConfig };
    this.adaptivePerf = adaptivePerf;
    this.speedMultiplier = validateSpeedMultiplier(initialSpeedMultiplier);
    this.manager = new EliminateManager(this.config);
    this.renderer = new EliminateRenderer(
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
      logger.warn('Cannot start a destroyed EliminateEngine.');
      return;
    }
    if (this.isRunning) {
      logger.warn('EliminateEngine is already running.');
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.virtualTime = performance.now();
    this.accumulator = 0;
    this.manager.start();
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
    logger.info('EliminateEngine started.');
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
    logger.info('EliminateEngine stopped.');
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
      logger.error('Unhandled error in EliminateEngine tick:', err);
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
