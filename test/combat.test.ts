import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatSystem } from '../src/game/CombatSystem.ts';
import { CountryBall } from '../src/game/CountryBall.ts';
import Matter from 'matter-js';
const { Bodies } = Matter;

test('CombatSystem: damage formula scales with relative velocity', () => {
  const combat = new CombatSystem({
    baseDamage: 5,
    damageMultiplier: 2,
    collisionCooldownMs: 200,
  });

  // vRel = 0 -> damage = 5 + 2*0 = 5
  assert.equal(combat.calculateDamage(0), 5);

  // vRel = 5.5 -> damage = 5 + 2*5.5 = 16
  assert.equal(combat.calculateDamage(5.5), 16);

  // Minimum damage is 1 even if formula yields 0
  const lowCombat = new CombatSystem({
    baseDamage: -10,
    damageMultiplier: 0,
    collisionCooldownMs: 200,
  });
  assert.equal(lowCombat.calculateDamage(0), 1);
});

test('CombatSystem: collision cooldown prevents consecutive hits within cooldown window', () => {
  const combat = new CombatSystem({
    baseDamage: 10,
    damageMultiplier: 1,
    collisionCooldownMs: 250,
  });

  const bodyA = Bodies.circle(100, 100, 20);
  const bodyB = Bodies.circle(100, 100, 20);

  const ballA = new CountryBall({ id: 'us', name: 'USA', iso: 'US', flag: '🇺🇸', color: '#00f' }, bodyA, 100);
  const ballB = new CountryBall({ id: 'ca', name: 'Canada', iso: 'CA', flag: '🇨🇦', color: '#f00' }, bodyB, 100);

  // First collision at t = 1000ms should succeed
  const hit1 = combat.handleCollision(ballA, ballB, { x: 100, y: 100 }, 1000);
  assert.equal(hit1, true);
  assert.ok(ballA.health < 100);
  assert.ok(ballB.health < 100);

  const hpAAfterHit1 = ballA.health;

  // Immediate collision at t = 1050ms (within 250ms cooldown) must be ignored
  const hit2 = combat.handleCollision(ballA, ballB, { x: 100, y: 100 }, 1050);
  assert.equal(hit2, false);
  assert.equal(ballA.health, hpAAfterHit1, 'Health must not decrease during cooldown');

  // Collision after cooldown expires at t = 1300ms should register
  const hit3 = combat.handleCollision(ballA, ballB, { x: 100, y: 100 }, 1300);
  assert.equal(hit3, true);
  assert.ok(ballA.health < hpAAfterHit1);
});

test('CombatSystem: health never goes below zero and elimination is triggered', () => {
  const combat = new CombatSystem({
    baseDamage: 50,
    damageMultiplier: 0,
    collisionCooldownMs: 100,
  });

  const bodyA = Bodies.circle(100, 100, 20);
  const bodyB = Bodies.circle(100, 100, 20);

  const ballA = new CountryBall({ id: 'br', name: 'Brazil', iso: 'BR', flag: '🇧🇷', color: '#0f0' }, bodyA, 30);
  const ballB = new CountryBall({ id: 'ar', name: 'Argentina', iso: 'AR', flag: '🇦🇷', color: '#00f' }, bodyB, 100);

  let eliminatedVictim: CountryBall | null = null;
  let killerBall: CountryBall | null = null;

  const combatWithCallback = new CombatSystem(
    { baseDamage: 50, damageMultiplier: 0, collisionCooldownMs: 100 },
    undefined,
    (victim, killer) => {
      eliminatedVictim = victim;
      killerBall = killer;
    }
  );

  combatWithCallback.handleCollision(ballA, ballB, { x: 100, y: 100 }, 1000);

  assert.equal(ballA.health, 0, 'Health must be clamped to 0');
  assert.equal(ballA.isAlive, false, 'Victim must be marked eliminated');
  assert.equal(ballB.kills, 1, 'Killer must receive 1 kill credit');
  assert.equal(eliminatedVictim, ballA);
  assert.equal(killerBall, ballB);
});
