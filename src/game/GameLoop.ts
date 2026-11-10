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

export interface GameLoopCallbacks {
  updatePhysics: (fixedDeltaMs: number) => void;
  updateLogic: (deltaMs: number, timestamp: number) => void;
  render: () => void;
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

  private visibilityHandler: () => void;

  constructor(
    engine: MatterEngine,
    fixedDeltaMs: number,
    maxSubSteps: number,
    callbacks: GameLoopCallbacks,
    perfMonitor?: PerformanceMonitor,
    adaptivePerf?: AdaptivePerformanceManager
  ) {
    this.engine = engine;
    this.fixedDeltaMs = fixedDeltaMs;
    this.maxSubSteps = maxSubSteps;
    this.callbacks = callbacks;
    this.perfMonitor = perfMonitor;
    this.adaptivePerf = adaptivePerf;

    this.visibilityHandler = () => this.handleVisibilityChange();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  public start(): void {
    if (this.isRunning) {
      logger.warn('GameLoop is already running. Ignoring start request.');
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
    logger.info('GameLoop started.');
  }

  public stop(): void {
    if (!this.isRunning) return;

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

    if (!this.isPaused) {
      this.accumulator += delta;

      // Cap accumulator to prevent spiral of death
      const maxAccumulator = this.fixedDeltaMs * this.maxSubSteps;
      if (this.accumulator > maxAccumulator) {
        this.accumulator = maxAccumulator;
      }

      const pStart = performance.now();
      while (this.accumulator >= this.fixedDeltaMs) {
        // Step physics engine
        Engine.update(this.engine, this.fixedDeltaMs);
        this.callbacks.updatePhysics(this.fixedDeltaMs);
        this.accumulator -= this.fixedDeltaMs;
        physicsSteps++;
      }
      physicsDuration = performance.now() - pStart;

      // Update game logic (states, particles, timers)
      this.callbacks.updateLogic(delta, timestamp);
    }

    // Render step
    const rStart = performance.now();
    this.callbacks.render();
    const renderDuration = performance.now() - rStart;

    const totalFrameTime = performance.now() - frameStart;
    this.perfMonitor?.recordFrame(totalFrameTime, physicsDuration, renderDuration, physicsSteps);
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
