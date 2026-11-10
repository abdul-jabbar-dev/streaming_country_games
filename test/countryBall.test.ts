import test from 'node:test';
import assert from 'node:assert/strict';
import { CountryBall } from '../src/game/CountryBall.ts';
import Matter from 'matter-js';
const { Bodies, Body } = Matter;

test('CountryBall: radial boundary clamps position and reflects velocity', () => {
  const body = Bodies.circle(500, 300, 20);
  const ball = new CountryBall({ id: 'de', name: 'Germany', iso: 'DE', flag: '🇩🇪', color: '#000' }, body, 100);

  const centerX = 400;
  const centerY = 300;
  const arenaRadius = 100;
  const ballRadius = 20;
  const maxAllowedDist = arenaRadius - ballRadius; // 80

  // Ball placed at (500, 300) -> distance from center is 100 > 80
  Body.setPosition(body, { x: 500, y: 300 });
  Body.setVelocity(body, { x: 5, y: 0 }); // Moving further right

  ball.enforceRadialBoundary(centerX, centerY, arenaRadius, ballRadius);

  const newDist = Math.sqrt((body.position.x - centerX) ** 2 + (body.position.y - centerY) ** 2);
  assert.ok(newDist <= maxAllowedDist + 0.001, `Distance ${newDist} must be clamped to <= ${maxAllowedDist}`);
  assert.ok(body.velocity.x < 0, 'Velocity pointing outward must be reflected inward');
});

test('CountryBall: velocity limits prevent standstill and excessive speed', () => {
  const body = Bodies.circle(100, 100, 20);
  const ball = new CountryBall({ id: 'jp', name: 'Japan', iso: 'JP', flag: '🇯🇵', color: '#f00' }, body, 100);

  // Test 1: speed too low (0.5 < 2.0)
  Body.setVelocity(body, { x: 0.3, y: 0.4 }); // speed = 0.5
  ball.enforceVelocityLimits(2.0, 8.0);
  const boostedSpeed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
  assert.ok(Math.abs(boostedSpeed - 2.0) < 0.01, `Speed ${boostedSpeed} must be scaled up to 2.0`);

  // Test 2: speed too high (15 > 8.0)
  Body.setVelocity(body, { x: 9, y: 12 }); // speed = 15
  ball.enforceVelocityLimits(2.0, 8.0);
  const clampedSpeed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
  assert.ok(Math.abs(clampedSpeed - 8.0) < 0.01, `Speed ${clampedSpeed} must be scaled down to 8.0`);

  // Test 3: stationary ball gets random kick
  Body.setVelocity(body, { x: 0, y: 0 });
  ball.enforceVelocityLimits(2.0, 8.0);
  const kickedSpeed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
  assert.ok(Math.abs(kickedSpeed - 2.0) < 0.01, 'Stationary ball must receive impulse');
});
