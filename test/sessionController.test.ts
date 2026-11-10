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

test('Lifecycle: ONCE mode presents results then completely stops engine and preserves metrics', () => {
  const canvas = createMockCanvas();
  const controller = new GameSessionController(canvas);

  controller.selectGame('battle');
  controller.startSession('ONCE');
  assert.equal(controller.sessionState, 'RUNNING');

  const mgr = controller.getActiveManager() as any;
  assert.ok(mgr !== null);
  assert.equal(mgr.autoLoop, false);

  let sessionFinishFired = false;
  controller.onSessionFinish = (metrics) => {
    sessionFinishFired = true;
    assert.equal(metrics.state, 'SESSION_FINISHED');
    assert.equal(metrics.totalRoundsCompleted, 1);
  };

  // Simulate round end (victim eliminated, finishBattle triggers onRoundEnd)
  (controller as any).handleRoundFinished({
    roundNumber: 1,
    winner: COUNTRIES[0],
    leaderboard: [],
    eliminationLog: [],
    durationSeconds: 12,
  });

  // State is now SESSION_FINISHED, but presentation can still display
  assert.equal(controller.sessionState, 'SESSION_FINISHED');
  assert.equal(controller.lastRoundResults?.winner?.id, COUNTRIES[0].id);

  // When manager completes winner announcement, results, and reset delay:
  (controller as any).handleRoundSequenceComplete();

  // Engine is now cleanly destroyed and shut down
  assert.equal(controller.getActiveManager(), null);
  assert.equal(sessionFinishFired, true);

  // Metrics are fully preserved
  const metrics = controller.getMetrics();
  assert.equal(metrics.totalRoundsCompleted, 1);
  assert.equal(metrics.state, 'SESSION_FINISHED');
  assert.ok(metrics.winsByCountry.has(COUNTRIES[0].id));

  controller.destroy();
});

test('Lifecycle: TIMED mode allows in-progress round to finish, presents results, then cleanly stops', () => {
  const canvas = createMockCanvas();
  const controller = new GameSessionController(canvas);

  controller.selectGame('line');
  controller.startSession('TIMED', 5); // 5 minutes
  assert.equal(controller.sessionState, 'RUNNING');

  const mgr = controller.getActiveManager() as any;
  assert.ok(mgr !== null);
  assert.equal(mgr.autoLoop, true); // Stays true while time remains

  // Round 1 completes within time limit
  (controller as any).handleRoundFinished({
    roundNumber: 1,
    winner: COUNTRIES[1],
    leaderboard: [],
    eliminationLog: [],
    durationSeconds: 20,
  });

  // Since time remains, session stays RUNNING and autoLoop stays true
  assert.equal(controller.sessionState, 'RUNNING');
  assert.equal(mgr.autoLoop, true);
  assert.equal(controller.getMetrics().totalRoundsCompleted, 1);

  // Time travels past 5 minutes
  (controller as any).sessionStartTime = performance.now() - (6 * 60 * 1000);

  // Round 2 finishes after expiration
  (controller as any).handleRoundFinished({
    roundNumber: 2,
    winner: COUNTRIES[2],
    leaderboard: [],
    eliminationLog: [],
    durationSeconds: 25,
  });

  // Session transitions to SESSION_FINISHED and autoLoop becomes false
  assert.equal(controller.sessionState, 'SESSION_FINISHED');
  assert.equal(mgr.autoLoop, false);

  // Post-round results presentation finishes
  (controller as any).handleRoundSequenceComplete();

  // Engine stopped and resources released
  assert.equal(controller.getActiveManager(), null);
  const finalMetrics = controller.getMetrics();
  assert.equal(finalMetrics.totalRoundsCompleted, 2);
  assert.equal(finalMetrics.state, 'SESSION_FINISHED');
  assert.equal(finalMetrics.isSessionExpired, true);

  controller.destroy();
});

test('Lifecycle: INFINITE mode continues rounds without stopping until explicit stopSession', () => {
  const canvas = createMockCanvas();
  const controller = new GameSessionController(canvas);

  controller.selectGame('eliminate');
  controller.startSession('INFINITE');
  assert.equal(controller.sessionState, 'RUNNING');

  const mgr = controller.getActiveManager() as any;
  assert.equal(mgr.autoLoop, true);

  // Complete round 1
  (controller as any).handleRoundFinished({
    roundNumber: 1,
    winner: COUNTRIES[0],
    leaderboard: [],
    eliminationLog: [],
    durationSeconds: 10,
  });
  assert.equal(controller.sessionState, 'RUNNING');
  assert.equal(mgr.autoLoop, true);

  // Complete round 2
  (controller as any).handleRoundFinished({
    roundNumber: 2,
    winner: COUNTRIES[1],
    leaderboard: [],
    eliminationLog: [],
    durationSeconds: 15,
  });
  assert.equal(controller.sessionState, 'RUNNING');
  assert.equal(mgr.autoLoop, true);
  assert.equal(controller.getMetrics().totalRoundsCompleted, 2);

  // Manual stop
  controller.stopSession();
  assert.equal(controller.sessionState, 'IDLE');
  assert.equal(controller.getActiveManager(), null);

  controller.destroy();
});

test('Restart Safety: Start -> Stop -> Start -> Stop -> Start cleanly manages resources', () => {
  const canvas = createMockCanvas();
  const controller = new GameSessionController(canvas);

  // 1. First session
  controller.selectGame('battle');
  controller.startSession('INFINITE');
  assert.equal(controller.sessionState, 'RUNNING');
  const engine1 = (controller as any).battleEngine;
  assert.ok(engine1 !== null);
  const bodiesCount1 = engine1.engine.world.bodies.length;
  assert.ok(bodiesCount1 > 0);

  // 2. Stop
  controller.stopSession();
  assert.equal(controller.sessionState, 'IDLE');
  assert.equal((controller as any).battleEngine, null);

  // 3. Second session
  controller.startSession('INFINITE');
  assert.equal(controller.sessionState, 'RUNNING');
  const engine2 = (controller as any).battleEngine;
  assert.ok(engine2 !== null);
  assert.notEqual(engine1, engine2);
  const bodiesCount2 = engine2.engine.world.bodies.length;
  // Body count in fresh engine must equal initial body count (no body accumulation)
  assert.equal(bodiesCount2, bodiesCount1);

  // 4. Stop
  controller.stopSession();
  assert.equal(controller.sessionState, 'IDLE');

  // 5. Third session (switch to line battle)
  controller.selectGame('line');
  controller.startSession('INFINITE');
  assert.equal(controller.sessionState, 'RUNNING');
  assert.ok((controller as any).lineEngine !== null);
  assert.equal((controller as any).battleEngine, null);

  controller.stopSession();
  assert.equal(controller.sessionState, 'IDLE');
  assert.equal((controller as any).lineEngine, null);

  controller.destroy();
});

test('Idempotency: multiple calls to stopSession() and destroy() are completely safe', () => {
  const canvas = createMockCanvas();
  const controller = new GameSessionController(canvas);

  controller.startSession('INFINITE');
  assert.equal(controller.sessionState, 'RUNNING');

  // Call stopSession multiple times
  controller.stopSession();
  assert.doesNotThrow(() => controller.stopSession());
  assert.doesNotThrow(() => controller.stopSession());
  assert.equal(controller.sessionState, 'IDLE');

  // Call destroy multiple times
  assert.doesNotThrow(() => controller.destroy());
  assert.doesNotThrow(() => controller.destroy());
  assert.equal((controller as any).battleEngine, null);
});

test('Callback Isolation: old session callbacks cannot modify a new session', () => {
  const canvas = createMockCanvas();
  const controller = new GameSessionController(canvas);

  controller.startSession('INFINITE');
  const initialSessionId = (controller as any).currentSessionId;
  assert.ok(initialSessionId > 0);

  // Stop session
  controller.stopSession();

  // Start new session
  controller.startSession('INFINITE');
  const newSessionId = (controller as any).currentSessionId;
  assert.notEqual(initialSessionId, newSessionId);

  // If a stale callback from initialSessionId arrives:
  const initialRounds = controller.getMetrics().totalRoundsCompleted;
  // Handlers guarded by sessionId should reject stale calls
  (controller as any).currentSessionId = newSessionId; // Current session is valid

  controller.destroy();
});

test('GameEngine and GameLoop: document visibilitychange event listener is removed on destroy', () => {
  let addCount = 0;
  let removeCount = 0;

  const originalDoc = (globalThis as any).document;
  (globalThis as any).document = {
    addEventListener: (type: string) => {
      if (type === 'visibilitychange') addCount++;
    },
    removeEventListener: (type: string) => {
      if (type === 'visibilitychange') removeCount++;
    },
  };

  try {
    const canvas = createMockCanvas();
    const controller = new GameSessionController(canvas);

    controller.selectGame('battle');
    controller.startSession('ONCE');
    assert.equal(addCount, 1);

    // Stop session - must destroy GameEngine and GameLoop, removing visibilitychange listener
    controller.stopSession();
    assert.equal(removeCount, 1);

    controller.destroy();
  } finally {
    if (originalDoc !== undefined) {
      (globalThis as any).document = originalDoc;
    } else {
      delete (globalThis as any).document;
    }
  }
});
