import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
const { Engine, Bodies } = Matter;
import { MovementController } from '../src/game/MovementController.ts';
import { CountryBall } from '../src/game/CountryBall.ts';
import { AdaptivePerformanceManager } from '../src/rendering/AdaptivePerformanceManager.ts';
import { QUALITY_PROFILES } from '../src/rendering/QualityProfiles.ts';
import type { CountryData } from '../src/config/countries.ts';

const dummyCountry: CountryData = {
  id: 'US',
  name: 'United States',
  colors: ['#b22234', '#ffffff', '#3c3b6e'],
  code: 'US',
};

test('MovementController: clamps excessive velocity to maxSpeed', () => {
  const mc = new MovementController({ minDesiredSpeed: 2, maxSpeed: 8 });
  const body = Bodies.circle(100, 100, 20);
  Matter.Body.setVelocity(body, { x: 10, y: 10 }); // speed = ~14.14 > 8

  const ball = new CountryBall(dummyCountry, body, 100);
  ball.speedMultiplier = 1.0;
  mc.update([ball], { x: 100, y: 100 }, 0);

  const newSpeed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
  assert.ok(Math.abs(newSpeed - 8) < 0.01, `Expected speed ~8, got ${newSpeed}`);
});

test('MovementController: imparts recovery impulse on standstill', () => {
  const mc = new MovementController({ minDesiredSpeed: 3, maxSpeed: 8 });
  const body = Bodies.circle(100, 100, 20);
  Matter.Body.setVelocity(body, { x: 0, y: 0 }); // stationary

  const ball = new CountryBall(dummyCountry, body, 100);
  ball.speedMultiplier = 1.0;
  mc.update([ball], { x: 200, y: 200 }, 0);

  const newSpeed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
  assert.ok(newSpeed >= 2.9, `Expected recovery speed >= 2.9, got ${newSpeed}`);
});

test('AdaptivePerformanceManager: manual profile changes update currentProfile', () => {
  const apm = new AdaptivePerformanceManager('BALANCED');
  assert.strictEqual(apm.getCurrentProfileName(), 'BALANCED');
  assert.strictEqual(apm.getCurrentProfile().canvasWidth, 1280);

  apm.setProfile('LOW');
  assert.strictEqual(apm.getCurrentProfileName(), 'LOW');
  assert.strictEqual(apm.getCurrentProfile().canvasWidth, 960);
  assert.strictEqual(apm.getCurrentProfile().renderShadows, false);

  apm.setProfile('HIGH');
  assert.strictEqual(apm.getCurrentProfileName(), 'HIGH');
  assert.strictEqual(apm.getCurrentProfile().canvasWidth, 1920);
  assert.strictEqual(apm.getCurrentProfile().renderShadows, true);
});

test('AdaptivePerformanceManager: auto mode downgrades profile under sustained low FPS', () => {
  let simulatedTime = 1000;
  const apm = new AdaptivePerformanceManager('AUTO', 'BALANCED', simulatedTime);

  // Simulate 6.5 seconds of 15 FPS (frame time 66.6ms)
  // Two evaluations occur at +2500ms and +5000ms, triggering downgrade to LOW after lowFpsStreak >= 2
  for (let i = 0; i < 100; i++) {
    simulatedTime += 66.6;
    apm.recordFrame(66.6, 25, 40, simulatedTime);
  }

  // Should have downgraded from BALANCED to LOW
  assert.strictEqual(apm.getCurrentProfileName(), 'LOW', 'Expected profile to downgrade to LOW');
});

test('AdaptivePerformanceManager: exportReport returns valid diagnostic JSON structure', () => {
  const apm = new AdaptivePerformanceManager('BALANCED');
  apm.recordFrame(16.6, 2, 4);

  const reportStr = apm.exportReport();
  const report = JSON.parse(reportStr);
  assert.strictEqual(typeof report.activeProfile, 'string');
  assert.strictEqual(typeof report.currentFps, 'number');
  assert.strictEqual(typeof report.avgFrameTimeMs, 'number');
  assert.strictEqual(typeof report.physicsTimeMs, 'number');
  assert.strictEqual(typeof report.renderTimeMs, 'number');
});
