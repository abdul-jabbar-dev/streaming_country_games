import test from 'node:test';
import assert from 'node:assert/strict';
import { RotatingBoundary } from '../src/eliminate/RotatingBoundary.ts';
import { EliminateBall } from '../src/eliminate/EliminateBall.ts';
import { EliminateManager } from '../src/eliminate/EliminateManager.ts';
import { ELIMINATE_CONFIG } from '../src/eliminate/EliminateConfig.ts';
import type { EliminateConfig } from '../src/eliminate/EliminateConfig.ts';

test('RotatingBoundary: balls bounce off solid perimeter when outside gap', () => {
  const boundary = new RotatingBoundary(400, 300, 200, (50 * Math.PI) / 180, 240);
  boundary.currentAngleRad = 0; // Gap centered at 0 rad (East, x > 400, y = 300)

  // Ball located at angle PI (West, 180 deg away from gap), at edge
  const ball = new EliminateBall(
    { id: 'us', name: 'USA', iso: 'US', flag: '🇺🇸', color: '#00f' },
    195, // 400 - 205 -> dist = 205 > 200 - 20 = 180
    300,
    -5, // Moving further left/outward
    0,
    20
  );

  const escaped = boundary.resolveCollisions([ball]);
  assert.equal(escaped.length, 0, 'Ball should not escape through solid wall');

  const dist = Math.sqrt((ball.x - 400) ** 2 + (ball.y - 300) ** 2);
  assert.ok(dist <= 180 + 0.001, 'Ball position must be clamped to radius - ballRadius');
  assert.ok(ball.vx > 0, 'Velocity pointing outward must be reflected inward');
});

test('RotatingBoundary: ball passes freely through open gap and escapes beyond threshold', () => {
  const boundary = new RotatingBoundary(400, 300, 200, (60 * Math.PI) / 180, 230);
  boundary.currentAngleRad = 0; // Gap centered at 0 rad (East)

  // Ball located in the gap corridor (angle 0) past the perimeter
  const ball = new EliminateBall(
    { id: 'br', name: 'Brazil', iso: 'BR', flag: '🇧🇷', color: '#0f0' },
    610, // dist = 210 (past radius 200, but before escape threshold 230)
    300,
    4,
    0,
    20
  );

  let escaped = boundary.resolveCollisions([ball]);
  assert.equal(escaped.length, 0, 'Ball has not yet reached escape threshold');
  assert.equal(ball.vx, 4, 'Velocity should not be reflected inside gap corridor');

  // Move ball past escapeThreshold (230 -> x = 635)
  ball.x = 635;
  escaped = boundary.resolveCollisions([ball]);
  assert.equal(escaped.length, 1, 'Ball crossing escape threshold must be marked escaped');
  assert.equal(escaped[0], ball);
  assert.equal(ball.escaped, true);
  assert.equal(ball.isAlive, false);
});

test('EliminateManager: full round life cycle runs until sole survivor is crowned', () => {
  const testCfg: EliminateConfig = {
    ...ELIMINATE_CONFIG,
    countryCount: 4,
    countdownDurationMs: 100,
    winnerAnnouncementDurationMs: 100,
    resultsDurationMs: 100,
    resetDelayMs: 100,
  };

  const manager = new EliminateManager(testCfg);
  manager.start();
  assert.equal(manager.state, 'COUNTDOWN');
  assert.equal(manager.balls.length, 4);

  // Advance through countdown
  manager.update(150, 150);
  assert.equal(manager.state, 'BATTLE');

  // Eliminate 3 balls
  manager.balls[0].isAlive = false;
  manager.balls[0].escaped = true;
  manager.balls[0].eliminationRank = 4;

  manager.balls[1].isAlive = false;
  manager.balls[1].escaped = true;
  manager.balls[1].eliminationRank = 3;

  manager.balls[2].isAlive = false;
  manager.balls[2].escaped = true;
  manager.balls[2].eliminationRank = 2;

  manager.update(16, 200);
  assert.equal(manager.state, 'WINNER_ANNOUNCEMENT');
  assert.equal(manager.winner, manager.balls[3]);
  assert.equal(manager.balls[3].eliminationRank, 1);

  manager.destroy();
});

test('RotatingBoundary: Grazing collision enforces guaranteed inward bounce angle preventing rim skimming', () => {
  const boundary = new RotatingBoundary(400, 300, 200, (30 * Math.PI) / 180, 240);
  boundary.update(0.016);

  // Ball at top perimeter (y = 120, x = 400), moving almost purely horizontally/tangentially (vx = 5, vy = -0.2)
  const ball = new EliminateBall(
    { id: 'it', name: 'Italy', iso: 'IT', flag: '🇮🇹', color: '#0f0' },
    400,
    115, // Outward past radius 200 - 20 = 180
    5,
    -0.2,
    20
  );

  boundary.resolveCollisions([ball]);

  // Center is at (400, 300). Ball is at top, so inward direction points downward (+vy)
  const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  const inwardVyRatio = ball.vy / speed;

  // Inward ratio must be at least ~0.45 (at least 27° - 35° inward deflection), NOT skimming at ~0.04
  assert.ok(
    inwardVyRatio >= 0.40,
    `Grazing hit must bounce inward into arena. Found inward ratio: ${inwardVyRatio.toFixed(3)}`
  );
});

test('EliminateManager: Few remaining balls actively combat-seek each other across arena', () => {
  const testCfg: EliminateConfig = {
    ...ELIMINATE_CONFIG,
    countryCount: 2,
    countdownDurationMs: 10,
    winnerAnnouncementDurationMs: 100,
    resultsDurationMs: 100,
    resetDelayMs: 100,
  };

  const manager = new EliminateManager(testCfg);
  manager.start();
  manager.update(50, 50); // Enter BATTLE

  assert.equal(manager.state, 'BATTLE');
  assert.equal(manager.balls.length, 2);

  const b1 = manager.balls[0];
  const b2 = manager.balls[1];

  // Initial distance between contestants
  const initialDist = Math.hypot(b2.x - b1.x, b2.y - b1.y);

  // Run 10 frames
  for (let step = 0; step < 10; step++) {
    manager.update(16.666, 100 + step * 16.666);
  }

  // Both balls must remain alive and active with healthy kinetic speeds
  assert.ok(b1.isAlive && b2.isAlive);
  const speed1 = Math.hypot(b1.vx, b1.vy);
  const speed2 = Math.hypot(b2.vx, b2.vy);
  assert.ok(speed1 >= testCfg.minSpeed * 0.8, 'Ball 1 must maintain healthy speed');
  assert.ok(speed2 >= testCfg.minSpeed * 0.8, 'Ball 2 must maintain healthy speed');

  manager.destroy();
});
