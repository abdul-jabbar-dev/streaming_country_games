import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
const { Engine } = Matter;
import { BattleManager } from '../src/game/BattleManager.ts';
import type { GameConfig } from '../src/config/game.config.ts';

const testConfig: GameConfig = {
  canvasWidth: 1280,
  canvasHeight: 720,
  arenaCenterX: 490,
  arenaCenterY: 360,
  arenaRadius: 285,
  arenaSegments: 16,
  ballRadius: 20,
  countryCount: 4,
  initialHealth: 100,
  baseDamage: 10,
  damageMultiplier: 1,
  collisionCooldownMs: 100,
  minDesiredSpeed: 2,
  maxSpeed: 8,
  steeringStrength: 0.0008,
  steeringIntervalMs: 250,
  ballRestitution: 1,
  ballFriction: 0,
  ballFrictionAir: 0,
  ballDensity: 0.002,
  wallRestitution: 1,
  enableSleeping: false,
  countdownDurationMs: 1000,
  winnerAnnouncementDurationMs: 1000,
  resultsDurationMs: 1000,
  resetDelayMs: 500,
  targetFps: 60,
  fixedDeltaMs: 16.666,
  maxSubSteps: 4,
  broadcastMode: false,
  debugMode: false,
};

test('BattleManager: state lifecycle progresses automatically', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const bm = new BattleManager(testConfig, engine);

  bm.start();
  assert.equal(bm.state, 'COUNTDOWN');
  assert.equal(bm.balls.length, 4);

  // Advance time past countdown (1000ms)
  bm.update(1100, 1100);
  assert.equal(bm.state, 'BATTLE');

  // Eliminate 3 balls so 1 survivor remains
  bm.balls[0].health = 0;
  bm.balls[0].isAlive = false;
  bm.balls[1].health = 0;
  bm.balls[1].isAlive = false;
  bm.balls[2].health = 0;
  bm.balls[2].isAlive = false;

  bm.update(16, 1200);
  assert.equal(bm.state, 'WINNER_ANNOUNCEMENT');
  assert.equal(bm.winner, bm.balls[3]);
  assert.equal(bm.balls[3].eliminationRank, 1);

  // Advance through WINNER_ANNOUNCEMENT
  bm.update(1100, 2300);
  assert.equal(bm.state, 'RESULTS');

  // Advance through RESULTS
  bm.update(1100, 3400);
  assert.equal(bm.state, 'RESETTING');

  // Advance through RESETTING
  bm.update(600, 4000);
  assert.equal(bm.state, 'COUNTDOWN');
  assert.equal(bm.roundNumber, 2);
  assert.equal(bm.balls.length, 4);

  bm.destroy();
});

test('BattleManager: handles 0-survivor edge case gracefully without crashing', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const bm = new BattleManager(testConfig, engine);

  bm.start();
  bm.update(1100, 1100); // Enter BATTLE
  assert.equal(bm.state, 'BATTLE');

  // Both remaining balls eliminate each other simultaneously (0 survivors)
  for (const b of bm.balls) {
    b.health = 0;
    b.isAlive = false;
  }
  bm.balls[0].damageDealt = 120; // Highest damage dealt

  // Update should not throw
  assert.doesNotThrow(() => {
    bm.update(16, 1200);
  });

  assert.equal(bm.state, 'WINNER_ANNOUNCEMENT');
  assert.ok(bm.winner !== null);
  assert.equal(bm.winner, bm.balls[0], 'Ball with highest score declared winner in draw edge-case');

  bm.destroy();
});

test('BattleManager: leaderboard rankings reflect survivor and kill stats', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const bm = new BattleManager(testConfig, engine);

  bm.start();
  bm.balls[0].health = 80;
  bm.balls[0].kills = 2;

  bm.balls[1].health = 0;
  bm.balls[1].isAlive = false;
  bm.balls[1].eliminationRank = 4; // First eliminated

  bm.balls[2].health = 0;
  bm.balls[2].isAlive = false;
  bm.balls[2].eliminationRank = 3;

  bm.balls[3].health = 40;
  bm.balls[3].kills = 1;

  const lb = bm.getLeaderboard();
  assert.equal(lb.length, 4);
  assert.equal(lb[0].country.id, bm.balls[0].country.id, 'Alive ball with 2 kills must be top rank');
  assert.equal(lb[3].rank, 4, 'Rank 4 must be at bottom');

  bm.destroy();
});

test('CONFIG: Normal damage is reduced by 20%', async () => {
  const { CONFIG } = await import('../src/config/game.config.ts');
  // Original baseDamage was 5, 20% reduced is 4
  assert.equal(CONFIG.baseDamage, 4);
  // Original damageMultiplier was 2.2, 20% reduced is 1.76
  assert.equal(CONFIG.damageMultiplier, 1.76);
});

test('BattleManager: Collectible ability system spawns and applies Health, Damage, Shield, Duplicate', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const bm = new BattleManager(testConfig, engine);

  bm.start();
  bm.update(1100, 1100);
  assert.equal(bm.state, 'BATTLE');

  const ball = bm.balls[0];
  ball.health = 50;

  // 1. Health Boost
  (bm as any).applyAbility(
    ball,
    { type: 'HEALTH_BOOST', label: '+35 HP', sublabel: 'HEAL', icon: '❤️', color: '#10b981', accentColor: '' },
    1200
  );
  assert.equal(ball.health, 85, 'Health boost must add 35 HP');

  // 2. Shield
  (bm as any).applyAbility(
    ball,
    { type: 'SHIELD', label: 'SHIELD', sublabel: 'ARMOR', icon: '🛡️', color: '#06b6d4', accentColor: '' },
    1200
  );
  assert.equal(ball.isShieldActive(1300), true, 'Shield must be active');

  // Shield absorbs damage
  const damageResult = ball.takeDamage(40, 1300);
  assert.equal(ball.health, 85, 'Shield must absorb incoming damage');
  assert.equal(damageResult.eliminated, false);

  // 3. Damage Boost
  (bm as any).applyAbility(
    ball,
    { type: 'DAMAGE_BOOST', label: '2x DMG', sublabel: 'BOOST', icon: '⚔️', color: '#f97316', accentColor: '' },
    1200
  );
  assert.equal(ball.isDamageBoostActive(1300), true, 'Damage boost must be active');
  assert.equal(ball.damageMultiplier, 2.0);

  // 4. Duplicate (Clone)
  const initialBallCount = bm.balls.length;
  (bm as any).applyAbility(
    ball,
    { type: 'DUPLICATE', label: 'CLONE', sublabel: 'DUPLICATE', icon: '👥', color: '#a855f7', accentColor: '' },
    1200
  );
  assert.equal(bm.balls.length, initialBallCount + 1, 'Duplicate must spawn a new physical ball');
  const clone = bm.balls[bm.balls.length - 1];
  assert.equal(clone.id, ball.id);
  assert.equal(clone.isDuplicate, true);

  bm.destroy();
});
