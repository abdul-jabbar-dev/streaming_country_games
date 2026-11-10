import test from 'node:test';
import assert from 'node:assert/strict';
import { EliminateBall } from '../src/eliminate/EliminateBall.ts';
import { EliminateManager } from '../src/eliminate/EliminateManager.ts';
import { ELIMINATE_CONFIG, type EliminateConfig } from '../src/eliminate/EliminateConfig.ts';
import { CollectibleItem } from '../src/collectibles/CollectibleItem.ts';
import { CollectibleManager } from '../src/collectibles/CollectibleManager.ts';
import type { CountryData } from '../src/config/countries.ts';

const countryUS: CountryData = { id: 'us', name: 'United States', iso: 'US', flag: '🇺🇸', color: '#3c3b6e' };
const countryBR: CountryData = { id: 'br', name: 'Brazil', iso: 'BR', flag: '🇧🇷', color: '#009c3b' };
const countryDE: CountryData = { id: 'de', name: 'Germany', iso: 'DE', flag: '🇩🇪', color: '#dd0000' };

test('Eliminate Health: ball starts with max health, clamps damage and never exceeds bounds', () => {
  const ball = new EliminateBall(countryUS, 100, 100, 2, 2, 22, 100, false);
  assert.strictEqual(ball.health, 100);
  assert.strictEqual(ball.maxHealth, 100);

  // Take 40 damage
  const res1 = ball.takeDamage(40, 1000);
  assert.strictEqual(res1.currentHealth, 60);
  assert.strictEqual(res1.eliminated, false);
  assert.strictEqual(ball.health, 60);

  // Heal 25 -> 85
  const healed = ball.heal(25);
  assert.strictEqual(healed, 25);
  assert.strictEqual(ball.health, 85);

  // Overheal 50 -> clamped to 100
  const overhealed = ball.heal(50);
  assert.strictEqual(overhealed, 15);
  assert.strictEqual(ball.health, 100);

  // Fatal damage 150 -> clamped to 0 and marked eliminated
  const resFatal = ball.takeDamage(150, 1500);
  assert.strictEqual(resFatal.currentHealth, 0);
  assert.strictEqual(resFatal.eliminated, true);
  assert.strictEqual(ball.isAlive, false);
  assert.strictEqual(ball.health, 0);
});

test('Eliminate Abilities: Shield blocks incoming damage and expires correctly', () => {
  const ball = new EliminateBall(countryUS, 100, 100, 2, 2, 22, 100, false);
  
  // Apply shield for 5000ms at t = 1000
  ball.applyShield(5000, 1000);
  assert.strictEqual(ball.isShieldActive(2000), true);

  // Incoming damage at t = 2000 is 100% absorbed
  const hit = ball.takeDamage(50, 2000);
  assert.strictEqual(hit.absorbed, true);
  assert.strictEqual(ball.health, 100);

  // At t = 7000 (shield expired)
  assert.strictEqual(ball.isShieldActive(7000), false);
  const unshieldedHit = ball.takeDamage(30, 7000);
  assert.strictEqual(unshieldedHit.absorbed, false);
  assert.strictEqual(ball.health, 70);
});

test('Eliminate Abilities: Damage Boost multiplies outgoing damage and expires', () => {
  const ball = new EliminateBall(countryBR, 100, 100, 2, 2, 22, 100, false);
  ball.applyDamageBoost(2.5, 6000, 1000);

  assert.strictEqual(ball.isDamageBoostActive(2000), true);
  assert.strictEqual(ball.damageMultiplier, 2.5);

  // After 6000ms (at t = 7500)
  assert.strictEqual(ball.isDamageBoostActive(7500), false);
});

test('Eliminate Abilities: Duplicate spawns an independent physical ball for the same country', () => {
  const testCfg: EliminateConfig = {
    ...ELIMINATE_CONFIG,
    countryCount: 3,
    maxBallsPerCountry: 3,
    duplicateHealth: 60,
    countdownDurationMs: 50,
  };

  const em = new EliminateManager(testCfg);
  em.setParticipants([countryUS, countryBR, countryDE]);
  em.prepareNextRound();

  const originalUS = em.balls.find((b) => b.id === 'us')!;
  assert.ok(originalUS);
  assert.strictEqual(originalUS.health, 100);
  assert.strictEqual(originalUS.isDuplicate, false);

  // Trigger DUPLICATE pickup
  const dupItem = new CollectibleItem(
    'dup_1',
    {
      type: 'DUPLICATE',
      label: 'CLONE',
      sublabel: 'DUPLICATE',
      icon: '👥',
      color: '#a855f7',
      accentColor: 'rgba(168, 85, 247, 0.45)',
      weight: 20,
    },
    originalUS.x,
    originalUS.y,
    16,
    1000,
    10000
  );

  (em as any).applyAbility(originalUS, dupItem, 1000);

  const usBalls = em.balls.filter((b) => b.id === 'us');
  assert.strictEqual(usBalls.length, 2, 'Country US should now have 2 balls');

  const duplicateBall = usBalls.find((b) => b.isDuplicate)!;
  assert.ok(duplicateBall, 'Duplicate ball must exist');
  assert.strictEqual(duplicateBall.health, 60, 'Duplicate ball has configured starting health');
  assert.strictEqual(duplicateBall.country.id, 'us');

  // Eliminating duplicate does NOT eliminate original
  duplicateBall.isAlive = false;
  (em as any).processBallDeath(duplicateBall, 'test death');
  assert.strictEqual(originalUS.isAlive, true, 'Original must remain alive after duplicate death');
  assert.strictEqual(duplicateBall.eliminationRank, 0, 'Country is not eliminated yet');

  // Now eliminate original -> Country is eliminated
  originalUS.isAlive = false;
  (em as any).processBallDeath(originalUS, 'test death');
  assert.strictEqual(originalUS.eliminationRank > 0, true, 'Country is eliminated when all its balls die');
});

test('Eliminate Abilities: Maximum duplicate limits per country are enforced', () => {
  const testCfg: EliminateConfig = {
    ...ELIMINATE_CONFIG,
    maxBallsPerCountry: 2,
    countdownDurationMs: 50,
  };

  const em = new EliminateManager(testCfg);
  em.setParticipants([countryUS, countryBR]);
  em.prepareNextRound();

  const ballUS = em.balls.find((b) => b.id === 'us')!;
  const dupDef = {
    type: 'DUPLICATE' as const,
    label: 'CLONE',
    sublabel: 'DUPLICATE',
    icon: '👥',
    color: '#a855f7',
    accentColor: 'rgba(168, 85, 247, 0.45)',
    weight: 20,
  };

  // First duplicate -> allowed (total = 2)
  (em as any).applyAbility(ballUS, new CollectibleItem('d1', dupDef, 0, 0, 16, 0, 10000), 1000);
  assert.strictEqual(em.balls.filter((b) => b.id === 'us').length, 2);

  // Second duplicate -> rejected because maxBallsPerCountry = 2
  (em as any).applyAbility(ballUS, new CollectibleItem('d2', dupDef, 0, 0, 16, 0, 10000), 1000);
  assert.strictEqual(em.balls.filter((b) => b.id === 'us').length, 2, 'Cannot exceed maxBallsPerCountry');
});

test('Eliminate Arena: Escape gap is noticeably reduced and balls still cleanly escape', () => {
  // Gap is 34 deg (~0.593 rad), noticeably less than old 54 deg (0.942 rad)
  assert.ok(ELIMINATE_CONFIG.gapAngleWidthRad < (45 * Math.PI) / 180, 'Escape gap is noticeably smaller');
  assert.strictEqual(ELIMINATE_CONFIG.gapAngleWidthRad, (34 * Math.PI) / 180);

  // Arc width at 280 radius is ~166px > 44px ball diameter, allowing clean escape
  const arcOpeningPx = ELIMINATE_CONFIG.gapAngleWidthRad * ELIMINATE_CONFIG.arenaRadius;
  assert.ok(arcOpeningPx >= 150, `Arc opening of ${arcOpeningPx.toFixed(1)}px allows ball diameter 44px to pass`);
});

test('CollectibleManager: Items are strictly inside the ring, smaller radius, and apply immediately on touch', () => {
  const cm = new CollectibleManager(
    { itemRadius: 13, spawnMargin: 75 },
    [
      { type: 'HEALTH_BOOST', label: '+35 HP', sublabel: 'HEAL', icon: '❤️', color: '#10b981', accentColor: '', weight: 10 }
    ]
  );

  const arenaRadius = 285;
  const arenaCenterX = 490;
  const arenaCenterY = 360;

  // 1. Verify 20 spawned items are ALL strictly well inside the ring
  for (let i = 0; i < 20; i++) {
    const item = cm.spawnItem(1000 + i, arenaCenterX, arenaCenterY, arenaRadius, []);
    assert.ok(item !== null, 'Item should be spawned');
    const distFromCenter = Math.hypot(item.x - arenaCenterX, item.y - arenaCenterY);
    assert.ok(
      distFromCenter <= arenaRadius - 75,
      `Item distance ${distFromCenter} must be strictly <= ${arenaRadius - 75} (well inside ring)`
    );
    assert.strictEqual(item.radius, 13, 'Item radius must be compact size 13');
    cm.reset();
  }

  // 2. Immediate touch pickup verification
  const item = cm.spawnItem(1000, arenaCenterX, arenaCenterY, arenaRadius, []);
  assert.ok(item !== null);

  let pickedUp = false;
  const testBall = {
    x: item.x + item.radius + 15, // Ball edge directly touching item edge
    y: item.y,
    radius: 20,
    isAlive: true,
  };

  cm.checkPickups([testBall], 1000, (_ball: any, _item: any) => {
    pickedUp = true;
  });

  assert.strictEqual(pickedUp, true, 'Immediate touch must trigger pickup instantly');
  assert.strictEqual(cm.items.length, 0, 'Picked up item must be consumed immediately');
});
