import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSessionController } from '../src/session/GameSessionController.ts';
import { COUNTRIES } from '../src/config/countries.ts';

// Polyfill RAF for headless Node.js tests
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    return setTimeout(() => cb(performance.now()), 16) as unknown as number;
  };
  globalThis.cancelAnimationFrame = (id: number): void => {
    clearTimeout(id);
  };
}

// Mock minimal HTML5 Canvas for headless node environment
function createMockCanvas(): HTMLCanvasElement {
  return {
    getContext: () => ({
      fillRect: () => {},
      drawImage: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      setLineDash: () => {},
      save: () => {},
      restore: () => {},
      fillText: () => {},
      strokeRect: () => {},
      translate: () => {},
      rotate: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      roundRect: () => {},
    }),
  } as unknown as HTMLCanvasElement;
}

test('GameSessionController: initial state and country selections', () => {
  const canvas = createMockCanvas();
  const controller = new GameSessionController(canvas);

  assert.equal(controller.sessionState, 'IDLE');
  assert.equal(controller.activeGameType, 'battle');

  const battleCountries = controller.getSelectedCountries('battle');
  assert.ok(battleCountries.length >= 2);

  const elimCountries = controller.getSelectedCountries('eliminate');
  assert.ok(elimCountries.length >= 2);

  const lineCountries = controller.getSelectedCountries('line');
  assert.ok(lineCountries.length >= 2);

  // Custom country selection update
  const subset = COUNTRIES.slice(0, 5);
  controller.setSelectedCountries('battle', subset);
  assert.equal(controller.getSelectedCountries('battle').length, 5);

  controller.setSelectedCountries('line', subset);
  assert.equal(controller.getSelectedCountries('line').length, 5);

  controller.destroy();
});

test('GameSessionController: Start Once mode configures autoLoop false on round end', () => {
  const canvas = createMockCanvas();
  const controller = new GameSessionController(canvas);

  controller.selectGame('battle');
  controller.startSession('ONCE');
  assert.equal(controller.sessionState, 'RUNNING');
  assert.equal(controller.executionMode, 'ONCE');

  const mgr = controller.getActiveManager();
  assert.ok(mgr !== null);

  // Simulate round end
  (controller as any).handleRoundFinished({
    roundNumber: 1,
    winner: COUNTRIES[0],
    leaderboard: [],
    eliminationLog: [],
    durationSeconds: 15,
  });

  assert.equal(controller.sessionState, 'SESSION_FINISHED');
  const metrics = controller.getMetrics();
  assert.equal(metrics.totalRoundsCompleted, 1);

  controller.destroy();
});

test('GameSessionController: Timed mode tracks elapsed time and terminates on expiry', () => {
  const canvas = createMockCanvas();
  const controller = new GameSessionController(canvas);

  controller.selectGame('eliminate');
  controller.startSession('TIMED', 10); // 10 minutes
  assert.equal(controller.sessionState, 'RUNNING');
  assert.equal(controller.executionMode, 'TIMED');

  const metrics = controller.getMetrics();
  assert.equal(metrics.mode, 'TIMED');
  assert.ok(metrics.sessionRemainingMs !== null);
  assert.ok(metrics.sessionRemainingMs > 0);

  // Simulate time travel by shifting sessionStartTime back 11 minutes
  (controller as any).sessionStartTime = performance.now() - (11 * 60 * 1000);

  // Simulate round end after expiration
  (controller as any).handleRoundFinished({
    roundNumber: 1,
    winner: COUNTRIES[1],
    leaderboard: [],
    eliminationLog: [],
    durationSeconds: 30,
  });

  assert.equal(controller.sessionState, 'SESSION_FINISHED');

  controller.destroy();
});

test('GameSessionController: Concurrency protection stops active engine when switching games', () => {
  const canvas = createMockCanvas();
  const controller = new GameSessionController(canvas);

  controller.selectGame('battle');
  controller.startSession('INFINITE');
  assert.equal(controller.sessionState, 'RUNNING');
  assert.equal(controller.activeGameType, 'battle');

  // Switching game must stop the running battle engine and set state to IDLE
  controller.selectGame('eliminate');
  assert.equal(controller.sessionState, 'IDLE');
  assert.equal(controller.activeGameType, 'eliminate');

  // Start eliminate
  controller.startSession('INFINITE');
  assert.equal(controller.sessionState, 'RUNNING');
  assert.equal(controller.activeGameType, 'eliminate');

  // Switching to Line Battle must stop eliminate engine and set state to IDLE
  controller.selectGame('line');
  assert.equal(controller.sessionState, 'IDLE');
  assert.equal(controller.activeGameType, 'line');

  // Start Line Battle
  controller.startSession('INFINITE');
  assert.equal(controller.sessionState, 'RUNNING');
  assert.equal(controller.activeGameType, 'line');
  assert.ok(controller.getActiveManager() !== null);

  controller.stopSession();
  assert.equal(controller.sessionState, 'IDLE');

  controller.destroy();
});
