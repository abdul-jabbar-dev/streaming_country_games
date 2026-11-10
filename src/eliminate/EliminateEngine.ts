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

  private visibilityHandler: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    customConfig?: Partial<EliminateConfig>,
    adaptivePerf?: AdaptivePerformanceManager
  ) {
    this.config = { ...ELIMINATE_CONFIG, ...customConfig };
    this.adaptivePerf = adaptivePerf;
    this.manager = new EliminateManager(this.config);
    this.renderer = new EliminateRenderer(
      canvas,
      this.config,
      this.manager,
      adaptivePerf?.currentProfile
    );

    if (adaptivePerf) {
      adaptivePerf.onProfileChanged = (newProfile) => {
        this.renderer.applyProfile(newProfile);
      };
    }

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
    if (this.isRunning) {
      logger.warn('EliminateEngine is already running.');
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.manager.start();
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
    logger.info('EliminateEngine started.');
  }

  public stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.manager.destroy();
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

    if (!this.isPaused) {
      this.accumulator += delta;
      const maxAccumulator = this.config.fixedDeltaMs * this.config.maxSubSteps;
      if (this.accumulator > maxAccumulator) {
        this.accumulator = maxAccumulator;
      }

      const pStart = performance.now();
      while (this.accumulator >= this.config.fixedDeltaMs) {
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

    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
  }

  public destroy(): void {
    this.stop();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
  }
}
