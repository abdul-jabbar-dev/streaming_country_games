import test from 'node:test';
import assert from 'node:assert/strict';
import { EliminateManager } from '../src/eliminate/EliminateManager.ts';
import { ELIMINATE_CONFIG } from '../src/eliminate/EliminateConfig.ts';
import type { EliminateConfig } from '../src/eliminate/EliminateConfig.ts';

const fastEliminateConfig: EliminateConfig = {
  ...ELIMINATE_CONFIG,
  countryCount: 8,
  minSpeed: 4.5,
  maxSpeed: 10.0,
  countdownDurationMs: 100,
  winnerAnnouncementDurationMs: 100,
  resultsDurationMs: 100,
  resetDelayMs: 100,
  gapAngleWidthRad: (70 * Math.PI) / 180, // Slightly wider gap for fast headless testing
  rotationSpeedRad: 0.04,
};

test('EliminateSimulation: 5 consecutive full Eliminate rounds simulate with zero errors or NaN coordinates', () => {
  const manager = new EliminateManager(fastEliminateConfig);
  manager.start();

  let completedRounds = 0;
  manager.onRoundEnd = () => {
    completedRounds++;
  };

  const fixedStep = fastEliminateConfig.fixedDeltaMs;
  let simulatedTime = 0;
  const maxIterations = 60000;
  let iteration = 0;

  while (completedRounds < 5 && iteration < maxIterations) {
    iteration++;
    simulatedTime += fixedStep;

    manager.update(fixedStep, simulatedTime);

    // Verify all alive ball coordinates are valid numbers
    for (const ball of manager.balls) {
      if (ball.isAlive && !ball.escaped) {
        assert.ok(!Number.isNaN(ball.x), 'X position must not be NaN');
        assert.ok(!Number.isNaN(ball.y), 'Y position must not be NaN');
        assert.ok(!Number.isNaN(ball.vx), 'Velocity X must not be NaN');
        assert.ok(!Number.isNaN(ball.vy), 'Velocity Y must not be NaN');
      }
    }
  }

  assert.ok(
    completedRounds >= 5,
    `Eliminate simulation must complete 5 full rounds. Completed: ${completedRounds}`
  );
  assert.ok(manager.roundNumber >= 5);

  manager.destroy();
});
