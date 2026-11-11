import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSpeedMultiplier,
  getSpeedPresetInfo,
  SPEED_PRESETS,
  DEFAULT_GAME_SPEED,
  MIN_GAME_SPEED,
  MAX_GAME_SPEED,
} from '../src/config/GameSpeed.ts';
import { GameSessionController } from '../src/session/GameSessionController.ts';
import { GameLoop } from '../src/game/GameLoop.ts';
import { GameEngine } from '../src/game/GameEngine.ts';
import { EliminateEngine } from '../src/eliminate/EliminateEngine.ts';
import { LineBattleEngine } from '../src/linebattle/LineBattleEngine.ts';
import { AdaptivePerformanceManager } from '../src/rendering/AdaptivePerformanceManager.ts';
import { CONFIG } from '../src/config/game.config.ts';

// Polyfill RAF for headless Node.js tests
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    return setTimeout(() => cb(performance.now()), 16) as unknown as number;
  };
  globalThis.cancelAnimationFrame = (id: number): void => {
    clearTimeout(id);
  };
}

function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 1920,
    height: 1080,
    getContext: () => ({
      clearRect: () => {},
      fillRect: () => {},
      drawImage: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      measureText: () => ({ width: 50 }),
      fillText: () => {},
      setLineDash: () => {},
      rect: () => {},
      clip: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      roundRect: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
    }),
  } as unknown as HTMLCanvasElement;
}

test('GameSpeed: Validation and preset lookup logic', () => {
  assert.equal(validateSpeedMultiplier(1), 1);
  assert.equal(validateSpeedMultiplier(2), 2);
  assert.equal(validateSpeedMultiplier(0.5), 0.5);
  assert.equal(validateSpeedMultiplier(0.1), 0.1);
  assert.equal(validateSpeedMultiplier(3), 3);

  // Clamping outside bounds (0.1 to 3.0)
  assert.equal(validateSpeedMultiplier(0.02), MIN_GAME_SPEED);
  assert.equal(validateSpeedMultiplier(5), MAX_GAME_SPEED);
  assert.equal(validateSpeedMultiplier(10), MAX_GAME_SPEED);
  assert.equal(validateSpeedMultiplier(NaN), DEFAULT_GAME_SPEED);
  assert.equal(validateSpeedMultiplier(-2), MIN_GAME_SPEED);

  // Preset lookup
  const slowMoInfo = getSpeedPresetInfo(0.1);
  assert.ok(slowMoInfo);
  assert.equal(slowMoInfo?.label, '0.1x');
  assert.equal(slowMoInfo?.description, 'Slow-Mo');

  const normalInfo = getSpeedPresetInfo(1);
  assert.ok(normalInfo);
  assert.equal(normalInfo?.label, '1x');
  assert.equal(normalInfo?.description, 'Normal');

  const fastInfo = getSpeedPresetInfo(2);
  assert.ok(fastInfo);
  assert.equal(fastInfo?.label, '2x');
  assert.equal(fastInfo?.description, 'Very Fast');

  const maxInfo = getSpeedPresetInfo(3);
  assert.ok(maxInfo);
  assert.equal(maxInfo?.label, '3x');
  assert.equal(maxInfo?.description, 'Max');
});

test('GameSessionController: Speed configuration, propagation, and metrics scaling', () => {
  const canvas = createMockCanvas();
  const controller = new GameSessionController(canvas);

  // Defaults to 1x
  assert.equal(controller.getGameSpeed(), 1.0);

  // Set speed before starting session
  controller.setGameSpeed(2.0);
  assert.equal(controller.getGameSpeed(), 2.0);
  assert.equal(controller.getMetrics().gameSpeed, 2.0);

  // Start a timed session
  controller.selectGame('battle');
  controller.startSession('TIMED', 10);
  assert.equal(controller.sessionState, 'RUNNING');
  assert.equal(controller.getGameSpeed(), 2.0);

  // At 2x speed, time advances twice as fast
  // Shifting sessionStartTime back 3 wall-clock minutes = 6 simulated minutes
  (controller as any).sessionStartTime = performance.now() - (3 * 60 * 1000);
  const metrics = controller.getMetrics();
  assert.equal(metrics.gameSpeed, 2.0);
  assert.ok(metrics.sessionRemainingMs !== null);
  // Remaining should be approximately 10 - 6 = 4 minutes (240,000 ms)
  const remainingMinutes = metrics.sessionRemainingMs / 60000;
  assert.ok(remainingMinutes <= 4.1 && remainingMinutes >= 3.9);

  // Shifting sessionStartTime back 5.5 wall-clock minutes = 11 simulated minutes (expired)
  (controller as any).sessionStartTime = performance.now() - (5.5 * 60 * 1000);
  assert.equal(controller.getMetrics().isSessionExpired, true);

  controller.destroy();
});

test('GameSessionController: Preserves selected speed across restarts and game switches', () => {
  const canvas = createMockCanvas();
  const controller = new GameSessionController(canvas);

  controller.setGameSpeed(3.0);
  assert.equal(controller.getGameSpeed(), 3.0);

  // Switch game to eliminate
  controller.selectGame('eliminate');
  assert.equal(controller.getGameSpeed(), 3.0);

  // Start and stop session
  controller.startSession('INFINITE');
  assert.equal(controller.getGameSpeed(), 3.0);
  controller.stopSession();
  assert.equal(controller.getGameSpeed(), 3.0);

  // Switch to line battle
  controller.selectGame('line');
  assert.equal(controller.getGameSpeed(), 3.0);

  controller.destroy();
});

import Matter from 'matter-js';

test('GameLoop: Fixed-step sub-stepping and virtual time scale with speed multiplier without physics tunneling', () => {
  const matterEngine = Matter.Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  let steps1x = 0;
  let virtualTimeAdvanced1x = 0;

  const testLoop = new GameLoop(
    matterEngine,
    16.6666,
    4,
    {
      updatePhysics: () => {},
      updateLogic: (delta) => {
        steps1x++;
        virtualTimeAdvanced1x += delta;
      },
      render: () => {},
    },
    undefined,
    undefined,
    1.0
  );

  // Simulate a 50ms browser frame at 1x
  // 50ms / 16.66ms = 3 fixed sub-steps
  (testLoop as any).isRunning = true;
  (testLoop as any).lastTime = 1000;
  (testLoop as any).tick(1050);

  assert.equal(steps1x, 3);
  assert.ok(Math.abs(virtualTimeAdvanced1x - (3 * 16.6666)) < 1);

  // Now test at 3x speed
  let steps3x = 0;
  let virtualTimeAdvanced3x = 0;
  const loop3x = new GameLoop(
    matterEngine,
    16.6666,
    4,
    {
      updatePhysics: () => {},
      updateLogic: (delta) => {
        steps3x++;
        virtualTimeAdvanced3x += delta;
      },
      render: () => {},
    },
    undefined,
    undefined,
    3.0
  );

  // Simulate same 50ms browser frame at 3x
  // 50ms * 3.0 = 150ms of virtual simulation / 16.66ms = 9 fixed sub-steps
  (loop3x as any).isRunning = true;
  (loop3x as any).lastTime = 1000;
  (loop3x as any).tick(1050);

  assert.equal(steps3x, 9);
  assert.ok(Math.abs(virtualTimeAdvanced3x - (9 * 16.6666)) < 1);
  assert.equal(loop3x.getSpeedMultiplier(), 3.0);

  testLoop.destroy();
  loop3x.destroy();
});

test('Countdown and ending screens remain at 1.0x real time regardless of game speed', () => {
  const matterEngine = Matter.Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  let isBattle = false;
  let countdownSteps = 0;
  let countdownVirtualTime = 0;

  let logicCallback = (delta: number) => {
    countdownSteps++;
    countdownVirtualTime += delta;
  };

  const loop = new GameLoop(
    matterEngine,
    16.6666,
    4,
    {
      updatePhysics: () => {},
      updateLogic: (delta) => logicCallback(delta),
      render: () => {},
      isGameplayActive: () => isBattle,
    },
    undefined,
    undefined,
    3.0 // 3x speed configured
  );

  // During COUNTDOWN (isBattle = false), a 50ms frame should advance by 1.0x (3 steps, not 9!)
  (loop as any).isRunning = true;
  (loop as any).lastTime = 1000;
  (loop as any).tick(1050);

  assert.equal(countdownSteps, 3);
  assert.ok(Math.abs(countdownVirtualTime - (3 * 16.6666)) < 1);

  // Now switch to active BATTLE (isBattle = true)
  isBattle = true;
  let battleSteps = 0;
  let battleVirtualTime = 0;
  logicCallback = (delta: number) => {
    battleSteps++;
    battleVirtualTime += delta;
  };

  // During BATTLE, same 50ms frame advances by 3x (9 steps!)
  (loop as any).lastTime = 2000;
  (loop as any).tick(2050);

  assert.equal(battleSteps, 9);
  assert.ok(Math.abs(battleVirtualTime - (9 * 16.6666)) < 1);

  loop.destroy();
});

test('All Three Engines: Correctly receive and apply speed multiplier', () => {
  const canvas = createMockCanvas();
  const perf = new AdaptivePerformanceManager(CONFIG);

  // 1. Battle GameEngine
  const battleEngine = new GameEngine(CONFIG, () => {}, perf, 2.0);
  assert.equal(battleEngine.getSpeedMultiplier(), 2.0);
  battleEngine.setSpeedMultiplier(3.0);
  assert.equal(battleEngine.getSpeedMultiplier(), 3.0);
  battleEngine.setSpeedMultiplier(0.1);
  assert.equal(battleEngine.getSpeedMultiplier(), 0.1);
  battleEngine.destroy();

  // 2. EliminateEngine
  const eliminateEngine = new EliminateEngine(canvas, {}, perf, 1.5);
  assert.equal(eliminateEngine.getSpeedMultiplier(), 1.5);
  eliminateEngine.setSpeedMultiplier(3.0);
  assert.equal(eliminateEngine.getSpeedMultiplier(), 3.0);
  eliminateEngine.destroy();

  // 3. LineBattleEngine
  const lineEngine = new LineBattleEngine(canvas, {}, perf, 0.75);
  assert.equal(lineEngine.getSpeedMultiplier(), 0.75);
  lineEngine.setSpeedMultiplier(2.0);
  assert.equal(lineEngine.getSpeedMultiplier(), 2.0);
  lineEngine.destroy();
});
