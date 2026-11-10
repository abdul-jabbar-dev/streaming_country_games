import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
const { Engine, Bodies, Body } = Matter;

import { CONFIG as BATTLE_CONFIG } from '../src/config/game.config.ts';
import { ELIMINATE_CONFIG } from '../src/eliminate/EliminateConfig.ts';
import { LINE_BATTLE_CONFIG } from '../src/linebattle/LineBattleConfig.ts';

import { CountryBall } from '../src/game/CountryBall.ts';
import { EliminateBall } from '../src/eliminate/EliminateBall.ts';
import { LineBattleBall } from '../src/linebattle/LineBattleBall.ts';
import { CombatSystem } from '../src/game/CombatSystem.ts';
import { RotatingBoundary } from '../src/eliminate/RotatingBoundary.ts';
import { ConnectionLine } from '../src/linebattle/ConnectionLine.ts';
import type { CountryData } from '../src/config/countries.ts';

const countryUS: CountryData = { id: 'us', name: 'United States', iso: 'US', flag: '🇺🇸', color: '#3c3b6e' };
const countryBR: CountryData = { id: 'br', name: 'Brazil', iso: 'BR', flag: '🇧🇷', color: '#009c3b' };
const countryJP: CountryData = { id: 'jp', name: 'Japan', iso: 'JP', flag: '🇯🇵', color: '#bc002d' };
const countryDE: CountryData = { id: 'de', name: 'Germany', iso: 'DE', flag: '🇩🇪', color: '#dd0000' };

test('Speed Differentiation: The three game modes have distinct speed and pacing configurations', () => {
  // Game 1: Battle Arena (tactical, weighty combat)
  assert.ok(BATTLE_CONFIG.minDesiredSpeed < ELIMINATE_CONFIG.minSpeed, 'Battle Arena has a more tactical/weighty base speed than Eliminate Arena');
  assert.ok(BATTLE_CONFIG.maxSpeed < ELIMINATE_CONFIG.maxSpeed, 'Battle Arena max speed is lower than Eliminate Arena evasion speed');

  // Game 2: Eliminate Arena (high energy, frantic gap evasion)
  assert.strictEqual(ELIMINATE_CONFIG.minSpeed, 4.8);
  assert.strictEqual(ELIMINATE_CONFIG.maxSpeed, 11.2);

  // Game 3: Line Battle Arena (tethered tactical line cutting)
  assert.strictEqual(LINE_BATTLE_CONFIG.minDesiredSpeed, 3.4);
  assert.strictEqual(LINE_BATTLE_CONFIG.maxSpeed, 8.8);

  // Cross check speeds are all distinct
  assert.notStrictEqual(BATTLE_CONFIG.minDesiredSpeed, ELIMINATE_CONFIG.minSpeed);
  assert.notStrictEqual(ELIMINATE_CONFIG.minSpeed, LINE_BATTLE_CONFIG.minDesiredSpeed);
});

test('Physics Traits: Different countries have distinct speed and mass multipliers', () => {
  const body1 = Bodies.circle(100, 100, 20);
  const body2 = Bodies.circle(200, 200, 20);
  const ballUS = new CountryBall(countryUS, body1, 100);
  const ballBR = new CountryBall(countryBR, body2, 100);

  // Verify non-identical multipliers
  assert.notStrictEqual(ballUS.speedMultiplier, ballBR.speedMultiplier, 'Different countries must have varied speed multipliers');
  assert.notStrictEqual(ballUS.massMultiplier, ballBR.massMultiplier, 'Different countries must have varied mass multipliers');

  // Verify in bounds
  assert.ok(ballUS.speedMultiplier >= 0.85 && ballUS.speedMultiplier <= 1.25);
  assert.ok(ballBR.massMultiplier >= 0.80 && ballBR.massMultiplier <= 1.30);
});

test('CombatSystem: Hard collisions transfer momentum and alter velocities dynamically', () => {
  const bodyA = Bodies.circle(100, 100, 20);
  const bodyB = Bodies.circle(140, 100, 20);
  Body.setVelocity(bodyA, { x: 5, y: 0 });
  Body.setVelocity(bodyB, { x: -5, y: 0 });

  const ballA = new CountryBall(countryUS, bodyA, 100);
  const ballB = new CountryBall(countryJP, bodyB, 100);

  const combat = new CombatSystem({ baseDamage: 5, damageMultiplier: 2, collisionCooldownMs: 100 });
  
  // Velocity before collision
  const vxABefore = bodyA.velocity.x;
  const vxBBefore = bodyB.velocity.x;

  combat.handleCollision(ballA, ballB, { x: 120, y: 100 }, 1000);

  // Momentum impulse was applied, so velocities changed
  assert.notStrictEqual(bodyA.velocity.x, vxABefore, 'Body A velocity must change on collision impulse');
  assert.notStrictEqual(bodyB.velocity.x, vxBBefore, 'Body B velocity must change on collision impulse');
});

test('RotatingBoundary: Surface friction imparts tangential kick when bouncing off rotating perimeter', () => {
  const boundary = new RotatingBoundary(400, 300, 200, (50 * Math.PI) / 180, 240);
  boundary.update(0.02); // Wall rotating clockwise

  // Ball hitting top wall at (400, 100), moving purely upward (vy = -5, vx = 0)
  const ball = new EliminateBall(countryDE, 400, 95, 0, -5, 20);
  
  boundary.resolveCollisions([ball]);

  // After bounce: radial vy reflected inward (> 0)
  assert.ok(ball.vy > 0, 'Radial velocity must be reflected inward');
  // Tangential velocity vx must receive wall slip friction kick in clockwise direction (> 0)
  assert.ok(ball.vx > 0, 'Ball must receive positive tangential velocity kick from clockwise spinning wall');
});

test('Eliminate Arena: Mass-dependent collision imparts greater velocity change to lighter balls', () => {
  const boundary = new RotatingBoundary(400, 300, 200, (50 * Math.PI) / 180, 240);

  const bLight = new EliminateBall(countryUS, 100, 100, 4, 0, 20);
  bLight.massMultiplier = 0.8; // lighter ball

  const bHeavy = new EliminateBall(countryBR, 130, 100, -4, 0, 20);
  bHeavy.massMultiplier = 1.3; // heavier ball

  const vxLightBefore = bLight.vx;
  const vxHeavyBefore = bHeavy.vx;

  boundary.resolveBallToBall([bLight, bHeavy]);

  const deltaVLight = Math.abs(bLight.vx - vxLightBefore);
  const deltaVHeavy = Math.abs(bHeavy.vx - vxHeavyBefore);

  assert.ok(deltaVLight > deltaVHeavy, 'Lighter ball must undergo larger velocity delta than heavier ball');
});

test('Line Battle Arena: Tether drag reduces speed as active lines increase', () => {
  const body = Bodies.circle(100, 100, 20);
  const ball = new LineBattleBall(countryUS, body);

  // 0 active lines: high agility
  const mult0 = ball.getEffectiveSpeedMultiplier();

  // Add 8 lines
  for (let i = 0; i < 8; i++) {
    ball.addLine(new ConnectionLine(`line_${i}`, ball.id, 0, 0, 100, 100, 0));
  }
  const mult8 = ball.getEffectiveSpeedMultiplier();

  assert.ok(mult0 > mult8, `Effective speed with 0 lines (${mult0.toFixed(3)}) must be higher than with 8 lines (${mult8.toFixed(3)})`);
});
