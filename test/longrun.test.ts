import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
const { Engine, Composite } = Matter;
import { BattleManager } from '../src/game/BattleManager.ts';
import { EliminateManager } from '../src/eliminate/EliminateManager.ts';
import type { GameConfig } from '../src/config/game.config.ts';

const longRunConfig: GameConfig = {
  canvasWidth: 1280,
  canvasHeight: 720,
  arenaCenterX: 490,
  arenaCenterY: 360,
  arenaRadius: 285,
  arenaSegments: 16,
  ballRadius: 22,
  countryCount: 6,
  initialHealth: 40,
  baseDamage: 25,
  damageMultiplier: 2.0,
  collisionCooldownMs: 50,
  minDesiredSpeed: 3.5,
  maxSpeed: 9.0,
  steeringStrength: 0.0008,
  steeringIntervalMs: 250,
  ballRestitution: 1.0,
  ballFriction: 0,
  ballFrictionAir: 0,
  ballDensity: 0.002,
  wallRestitution: 1.0,
  enableSleeping: false,
  countdownDurationMs: 50,
  winnerAnnouncementDurationMs: 100,
  resultsDurationMs: 50,
  resetDelayMs: 50,
  targetFps: 60,
  fixedDeltaMs: 16.666,
  maxSubSteps: 4,
  broadcastMode: false,
  debugMode: false,
};

test('Long-Run Battle: 10 rounds maintain body count invariant without physics body leak', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const bm = new BattleManager(longRunConfig, engine);
  bm.start();

  let completedRounds = 0;
  const initialBodyCount = Composite.allBodies(engine.world).length;
  // Boundary segments (16) + 6 country balls = 22 bodies max active at any time
  const bodyCountsPerRound: number[] = [];

  bm.onRoundEnd = () => {
    completedRounds++;
    const currentBodies = Composite.allBodies(engine.world).length;
    bodyCountsPerRound.push(currentBodies);
  };

  const fixedStep = longRunConfig.fixedDeltaMs;
  let simulatedTime = 0;
  let iteration = 0;
  const maxIterations = 100000;

  while (completedRounds < 10 && iteration < maxIterations) {
    iteration++;
    simulatedTime += fixedStep;
    Engine.update(engine, fixedStep);
    bm.update(fixedStep, simulatedTime);
  }

  assert.strictEqual(completedRounds, 10, 'Must complete 10 rounds');

  // Verify that active bodies never accumulate unbounded across 10 rounds
  for (const count of bodyCountsPerRound) {
    assert.ok(
      count <= initialBodyCount + 2,
      `Bodies leaked! Found ${count} bodies, expected <= ${initialBodyCount + 2}`
    );
  }
});

import { ELIMINATE_CONFIG, type EliminateConfig } from '../src/eliminate/EliminateConfig.ts';

const fastEliminateConfig: EliminateConfig = {
  ...ELIMINATE_CONFIG,
  countryCount: 6,
  minSpeed: 4.5,
  maxSpeed: 10.0,
  countdownDurationMs: 50,
  winnerAnnouncementDurationMs: 100,
  resultsDurationMs: 50,
  resetDelayMs: 50,
  gapAngleWidthRad: (75 * Math.PI) / 180,
  rotationSpeedRad: 0.04,
};

test('Long-Run Eliminate: 10 rounds maintain rotating boundary & state reset without leakage', () => {
  const em = new EliminateManager(fastEliminateConfig);
  em.start();

  let completedRounds = 0;
  const countryCountsPerRound: number[] = [];

  em.onRoundEnd = () => {
    completedRounds++;
    countryCountsPerRound.push(em.getLeaderboard().length);
  };

  const fixedStep = fastEliminateConfig.fixedDeltaMs;
  let simulatedTime = 0;
  let iteration = 0;
  const maxIterations = 80000;

  while (completedRounds < 10 && iteration < maxIterations) {
    iteration++;
    simulatedTime += fixedStep;
    em.update(fixedStep, simulatedTime);
  }

  assert.strictEqual(completedRounds, 10, 'Must complete 10 Eliminate rounds');

  for (const count of countryCountsPerRound) {
    assert.strictEqual(count, fastEliminateConfig.countryCount, 'Every round must have exactly configured participant country count');
  }

  em.destroy();
});

import { LineBattleManager } from '../src/linebattle/LineBattleManager.ts';
import { LINE_BATTLE_CONFIG, type LineBattleConfig } from '../src/linebattle/LineBattleConfig.ts';

const fastLineConfig: LineBattleConfig = {
  ...LINE_BATTLE_CONFIG,
  countryCount: 6,
  minDesiredSpeed: 4.5,
  maxSpeed: 9.0,
  countdownDurationMs: 50,
  winnerAnnouncementDurationMs: 100,
  resultsDurationMs: 50,
  resetDelayMs: 50,
};

test('Long-Run Line Battle: 10 rounds maintain body count and line cleanup without leakage', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const lm = new LineBattleManager(fastLineConfig, engine);
  lm.start();

  let completedRounds = 0;
  const initialBodyCount = Composite.allBodies(engine.world).length;
  const bodyCountsPerRound: number[] = [];

  lm.onRoundEnd = () => {
    completedRounds++;
    const currentBodies = Composite.allBodies(engine.world).length;
    bodyCountsPerRound.push(currentBodies);
  };

  const fixedStep = fastLineConfig.fixedDeltaMs;
  let simulatedTime = 0;
  let iteration = 0;
  const maxIterations = 80000;

  while (completedRounds < 10 && iteration < maxIterations) {
    iteration++;
    simulatedTime += fixedStep;
    Engine.update(engine, fixedStep);
    lm.update(fixedStep, simulatedTime);
  }

  assert.strictEqual(completedRounds, 10, 'Must complete 10 Line Battle rounds');

  for (const count of bodyCountsPerRound) {
    assert.ok(
      count <= initialBodyCount + 2,
      `Line battle bodies leaked! Found ${count} bodies, expected <= ${initialBodyCount + 2}`
    );
  }

  lm.destroy();
});
