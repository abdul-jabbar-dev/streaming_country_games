/**
 * Core Game Engine
 * Encapsulates Matter.js world, BattleManager, and GameLoop
 */

import Matter from 'matter-js';
const { Engine } = Matter;
import type { Engine as MatterEngine } from 'matter-js';
import type { GameConfig } from '../config/game.config.ts';
import { BattleManager } from './BattleManager.ts';
import { GameLoop } from './GameLoop.ts';
import type { AdaptivePerformanceManager } from '../rendering/AdaptivePerformanceManager.ts';
import { logger } from '../utils/logger.ts';

export class GameEngine {
  public readonly config: GameConfig;
  public engine: MatterEngine;
  public battleManager: BattleManager;
  public gameLoop: GameLoop;
  public adaptivePerf?: AdaptivePerformanceManager;
  private isDestroyed = false;

  constructor(
    config: GameConfig,
    renderCallback: () => void,
    adaptivePerf?: AdaptivePerformanceManager
  ) {
    this.config = config;
    this.adaptivePerf = adaptivePerf;

    this.engine = Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
      positionIterations: 6,
      velocityIterations: 6,
      enableSleeping: config.enableSleeping || false,
    });

    this.battleManager = new BattleManager(config, this.engine);

    this.gameLoop = new GameLoop(
      this.engine,
      config.fixedDeltaMs,
      config.maxSubSteps,
      {
        updatePhysics: () => {},
        updateLogic: (deltaMs, timestamp) => {
          this.battleManager.update(deltaMs, timestamp);
        },
        render: renderCallback,
      },
      undefined,
      adaptivePerf
    );
  }

  public start(): void {
    if (this.isDestroyed) {
      logger.warn('Cannot start a destroyed GameEngine.');
      return;
    }
    this.battleManager.start();
    this.gameLoop.start();
  }

  public stop(): void {
    this.gameLoop.destroy();
    this.battleManager.destroy();
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.stop();
  }
}
