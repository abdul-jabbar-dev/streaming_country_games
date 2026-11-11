/**
 * Robust Fixed-Timestep Game Loop
 * Handles tab visibility, accumulator clamping, single-instance RAF lifecycle,
 * and adaptive performance monitoring.
 */

import Matter from 'matter-js';
const { Engine } = Matter;
import type { Engine as MatterEngine } from 'matter-js';
import type { PerformanceMonitor } from '../utils/performance.ts';
import type { AdaptivePerformanceManager } from '../rendering/AdaptivePerformanceManager.ts';
import { logger } from '../utils/logger.ts';
import { validateSpeedMultiplier } from '../config/GameSpeed.ts';

export interface GameLoopCallbacks {
  updatePhysics: (fixedDeltaMs: number) => void;
  updateLogic: (deltaMs: number, timestamp: number) => void;
  render: () => void;
  isGameplayActive?: () => boolean;
}

export class GameLoop {
  private readonly engine: MatterEngine;
  private readonly fixedDeltaMs: number;
  private readonly maxSubSteps: number;
  private readonly callbacks: GameLoopCallbacks;
  private readonly perfMonitor?: PerformanceMonitor;
  private readonly adaptivePerf?: AdaptivePerformanceManager;

  private rafId: number | null = null;
  private isRunning = false;
  private isPaused = false;
  private lastTime = 0;
  private accumulator = 0;
  private virtualTime = 0;
  private speedMultiplier = 1.0;
  private isDestroyed = false;

  private visibilityHandler: () => void;

  constructor(
    engine: MatterEngine,
    fixedDeltaMs: number,
    maxSubSteps: number,
    callbacks: GameLoopCallbacks,
    perfMonitor?: PerformanceMonitor,
    adaptivePerf?: AdaptivePerformanceManager,
    initialSpeedMultiplier: number = 1.0
  ) {
    this.engine = engine;
    this.fixedDeltaMs = fixedDeltaMs;
    this.maxSubSteps = maxSubSteps;
    this.callbacks = callbacks;
    this.perfMonitor = perfMonitor;
    this.adaptivePerf = adaptivePerf;
    this.speedMultiplier = validateSpeedMultiplier(initialSpeedMultiplier);

    this.visibilityHandler = () => this.handleVisibilityChange();
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
      logger.warn('Cannot start destroyed GameLoop.');
      return;
    }
    if (this.isRunning) {
      logger.warn('GameLoop is already running. Ignoring start request.');
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.virtualTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
    logger.info('GameLoop started.');
  }

  public stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    logger.info('GameLoop stopped.');
  }

  public pause(): void {
    this.isPaused = true;
    logger.info('GameLoop paused.');
  }

  public resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.accumulator = 0;
    logger.info('GameLoop resumed.');
  }

  private handleVisibilityChange(): void {
    if (document.hidden) {
      // Tab hidden: pause accumulator to prevent huge physics backlog
      this.accumulator = 0;
    } else {
      // Tab resumed: reset lastTime
      this.lastTime = performance.now();
      this.accumulator = 0;
    }
  }

  private tick(timestamp: number): void {
    if (!this.isRunning) return;

    const frameStart = performance.now();

    if (this.lastTime === 0) {
      this.lastTime = timestamp;
    }

    // Clamp frame delta to max 100ms
    const rawDelta = timestamp - this.lastTime;
    const delta = Math.min(Math.max(0, rawDelta), 100);
    this.lastTime = timestamp;

    let physicsSteps = 0;
    let physicsDuration = 0;

    try {
      if (!this.isPaused) {
        const isGameplay = this.callbacks.isGameplayActive ? this.callbacks.isGameplayActive() : true;
        const currentSpeed = isGameplay ? this.speedMultiplier : 1.0;

        // When not in active gameplay (e.g. countdown or post-round screens), clamp any residual high-speed accumulator
        if (!isGameplay && this.accumulator > this.fixedDeltaMs * 1.5) {
          this.accumulator = this.fixedDeltaMs;
        }

        // Accumulate scaled delta time: speedMultiplier during active gameplay, 1.0x during countdown and post-round screens
        this.accumulator += delta * currentSpeed;

        // Scale maxSubSteps dynamically so high speeds run without artificial sub-step clamping
        const scaledMaxSubSteps = Math.ceil(this.maxSubSteps * Math.max(1, currentSpeed) * 1.5);
        const maxAccumulator = this.fixedDeltaMs * scaledMaxSubSteps;
        if (this.accumulator > maxAccumulator) {
          this.accumulator = maxAccumulator;
        }

        const pStart = performance.now();
        while (this.accumulator >= this.fixedDeltaMs) {
          // Advance virtual simulation timestamp exactly synchronized with physics steps
          this.virtualTime += this.fixedDeltaMs;

          // Step physics engine at fixed 60Hz delta (zero tunneling / instability)
          Engine.update(this.engine, this.fixedDeltaMs);
          this.callbacks.updatePhysics(this.fixedDeltaMs);

          // Step game logic and state timers using simulated time
          this.callbacks.updateLogic(this.fixedDeltaMs, this.virtualTime);

          this.accumulator -= this.fixedDeltaMs;
          physicsSteps++;

          // If round just finished and entered non-gameplay state, truncate any remaining high-speed sub-steps in this frame
          if (isGameplay && this.callbacks.isGameplayActive && !this.callbacks.isGameplayActive()) {
            this.accumulator = 0;
            break;
          }
        }
        physicsDuration = performance.now() - pStart;
      }

      // Render step (runs once per RAF frame for smooth 60fps display)
      const rStart = performance.now();
      this.callbacks.render();
      const renderDuration = performance.now() - rStart;

      const totalFrameTime = performance.now() - frameStart;
      this.perfMonitor?.recordFrame(totalFrameTime, physicsDuration, renderDuration, physicsSteps);
      this.adaptivePerf?.recordFrame(totalFrameTime, physicsDuration, renderDuration);
    } catch (err) {
      logger.error('Unhandled error in GameLoop tick:', err);
      this.destroy();
      throw err;
    }

    if (this.isRunning) {
      this.rafId = requestAnimationFrame((ts) => this.tick(ts));
    }
  }

  public destroy(): void {
    this.stop();
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
  }
}
