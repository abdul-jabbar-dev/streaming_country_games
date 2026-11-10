import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
const { Engine } = Matter;
import { BattleManager } from '../src/game/BattleManager.ts';
import type { GameConfig } from '../src/config/game.config.ts';

const simConfig: GameConfig = {
  canvasWidth: 1280,
  canvasHeight: 720,
  arenaCenterX: 490,
  arenaCenterY: 360,
  arenaRadius: 285,
  arenaSegments: 16,
  ballRadius: 22,
  countryCount: 8,
  initialHealth: 60,
  baseDamage: 30,
  damageMultiplier: 2.5,
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
  countdownDurationMs: 200,
  winnerAnnouncementDurationMs: 300,
  resultsDurationMs: 200,
  resetDelayMs: 100,
  targetFps: 60,
  fixedDeltaMs: 16.666,
  maxSubSteps: 4,
  broadcastMode: false,
  debugMode: false,
};

test('Simulation: 5 consecutive full battle rounds simulate with zero errors or NaN coordinates', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const bm = new BattleManager(simConfig, engine);
  bm.start();

  let completedRounds = 0;
  bm.onRoundEnd = () => {
    completedRounds++;
  };

  const fixedStep = simConfig.fixedDeltaMs;
  let simulatedTime = 0;
  const maxIterations = 80000; // Allows ample virtual steps for 5 full simulated rounds
  let iteration = 0;

  while (completedRounds < 5 && iteration < maxIterations) {
    iteration++;
    simulatedTime += fixedStep;

    // Run physics update
    Engine.update(engine, fixedStep);

    // Run battle update
    bm.update(fixedStep, simulatedTime);

    // Verify all active ball coordinates are valid numbers and inside the arena
    for (const ball of bm.balls) {
      if (ball.isAlive) {
        assert.ok(!Number.isNaN(ball.body.position.x), 'X position must not be NaN');
        assert.ok(!Number.isNaN(ball.body.position.y), 'Y position must not be NaN');
        assert.ok(!Number.isNaN(ball.body.velocity.x), 'Velocity X must not be NaN');
        assert.ok(!Number.isNaN(ball.body.velocity.y), 'Velocity Y must not be NaN');

        const dist = Math.sqrt(
          (ball.body.position.x - simConfig.arenaCenterX) ** 2 +
          (ball.body.position.y - simConfig.arenaCenterY) ** 2
        );
        assert.ok(
          dist <= simConfig.arenaRadius + 5,
          `Ball distance ${dist} must remain within arena bounds (${simConfig.arenaRadius})`
        );
      }
    }
  }

  assert.ok(
    completedRounds >= 5,
    `Simulation must complete at least 5 full automated rounds. Completed: ${completedRounds}`
  );
  assert.ok(bm.roundNumber >= 5);

  bm.destroy();
});
