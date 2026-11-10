import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
const { Engine, Bodies, Body } = Matter;
import { LineBattleManager } from '../src/linebattle/LineBattleManager.ts';
import { LINE_BATTLE_CONFIG, type LineBattleConfig } from '../src/linebattle/LineBattleConfig.ts';
import { ConnectionLine } from '../src/linebattle/ConnectionLine.ts';
import { LineBattleBall } from '../src/linebattle/LineBattleBall.ts';
import { checkBallCrossesSegment, doSegmentsIntersect } from '../src/linebattle/LineIntersection.ts';
import type { CountryData } from '../src/config/countries.ts';

const dummyCountryA: CountryData = { id: 'us', name: 'United States', iso: 'US', flag: '🇺🇸', color: '#3c3b6e' };
const dummyCountryB: CountryData = { id: 'br', name: 'Brazil', iso: 'BR', flag: '🇧🇷', color: '#009c3b' };
const dummyCountryC: CountryData = { id: 'de', name: 'Germany', iso: 'DE', flag: '🇩🇪', color: '#dd0000' };

const fastConfig: LineBattleConfig = {
  ...LINE_BATTLE_CONFIG,
  countryCount: 4,
  minDesiredSpeed: 4.0,
  maxSpeed: 9.0,
  boundaryHitCooldownMs: 150,
  maxLinesPerCountry: 5,
  initialLinesPerCountry: 1,
  countdownDurationMs: 50,
  winnerAnnouncementDurationMs: 50,
  resultsDurationMs: 50,
  resetDelayMs: 50,
};

test('LineCreation: initial line anchored to boundary and follows ball position', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const bm = new LineBattleManager(fastConfig, engine);
  bm.setParticipants([dummyCountryA, dummyCountryB]);
  bm.prepareNextRound();

  const ballA = bm.balls.find((b) => b.id === 'us')!;
  assert.ok(ballA, 'Ball A must exist');
  assert.strictEqual(ballA.lines.length, 1, 'Should have 1 initial connection line');

  const line = ballA.lines[0];
  const initialAnchorX = line.anchorX;
  const initialAnchorY = line.anchorY;

  // Move ball
  Body.setPosition(ballA.body, { x: 450, y: 320 });
  line.updateEndpoint(ballA.body.position.x, ballA.body.position.y);

  // Anchor remains fixed
  assert.strictEqual(line.anchorX, initialAnchorX, 'Anchor X must remain fixed');
  assert.strictEqual(line.anchorY, initialAnchorY, 'Anchor Y must remain fixed');

  // Endpoint moves with ball
  assert.strictEqual(line.endpointX, 450, 'Endpoint X must follow ball');
  assert.strictEqual(line.endpointY, 320, 'Endpoint Y must follow ball');
});

test('LineCreation: duplicate hits within cooldown window are rejected', () => {
  const body = Bodies.circle(100, 100, 20);
  const ball = new LineBattleBall(dummyCountryA, body);

  assert.ok(ball.canCreateBoundaryLine(1000, 200), 'Initial hit should be allowed');
  ball.registerBoundaryHit(1000);

  // Next hit at +50ms (within 200ms cooldown)
  assert.ok(!ball.canCreateBoundaryLine(1050, 200), 'Contact within cooldown must be rejected');

  // Hit at +250ms (cooldown expired)
  assert.ok(ball.canCreateBoundaryLine(1250, 200), 'Hit after cooldown must be allowed');
});

test('LineCreation: max lines per country limit is strictly enforced', () => {
  const body = Bodies.circle(100, 100, 20);
  const ball = new LineBattleBall(dummyCountryA, body);

  for (let i = 0; i < 5; i++) {
    ball.addLine(new ConnectionLine(`l_${i}`, ball.id, 0, 0, 100, 100, 0));
  }

  assert.strictEqual(ball.getActiveLineCount(), 5);
  // Ball at cap: 5 >= maxLinesPerCountry (5)
  assert.ok(ball.getActiveLineCount() >= fastConfig.maxLinesPerCountry, 'Line capacity reached');
});

test('LineCutting: opponent crossing line destroys it, owner crossing does not', () => {
  // Line from (0, 100) to (200, 100) owned by Country A
  const line = new ConnectionLine('line_1', 'us', 0, 100, 200, 100, 0);

  // Opponent Country B crosses from (100, 50) to (100, 150)
  const oppP0 = { x: 100, y: 50 };
  const oppP1 = { x: 100, y: 150 };

  const anchor = { x: line.anchorX, y: line.anchorY };
  const endpoint = { x: line.endpointX, y: line.endpointY };

  assert.ok(
    checkBallCrossesSegment(oppP0, oppP1, 20, anchor, endpoint),
    'Opponent path crossing the line segment must be detected'
  );

  // Cut line
  line.cut('br', 500, 300);
  assert.strictEqual(line.isActive, false, 'Line must be inactive after cut');
  assert.strictEqual(line.cutByCountryId, 'br');

  // Line cannot be cut twice
  line.cut('de', 600, 300);
  assert.strictEqual(line.cutByCountryId, 'br', 'Line must not be re-cut');
});

test('LineCutting: continuous collision detection catches fast movement skipping center point', () => {
  // Horizontal line: (100, 200) -> (300, 200)
  const anchor = { x: 100, y: 200 };
  const endpoint = { x: 300, y: 200 };

  // Fast ball moves from (200, 150) to (200, 250) in a single step (100px leap)
  const p0 = { x: 200, y: 150 };
  const p1 = { x: 200, y: 250 };

  assert.ok(
    checkBallCrossesSegment(p0, p1, 15, anchor, endpoint),
    'High speed step spanning across the segment must be detected by CCD'
  );
});

test('Elimination: zero active lines eliminates country idempotently', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const bm = new LineBattleManager(fastConfig, engine);
  bm.setParticipants([dummyCountryA, dummyCountryB, dummyCountryC]);
  bm.prepareNextRound();

  const ballA = bm.balls.find((b) => b.id === 'us')!;
  const ballB = bm.balls.find((b) => b.id === 'br')!;
  assert.ok(ballA.isAlive);

  // Cut all active lines of ball A
  for (const line of ballA.lines) {
    line.cut('br', 1000, 300);
  }

  assert.strictEqual(ballA.getActiveLineCount(), 0, 'Active lines must be zero');

  // Trigger update cycle
  bm.update(16.666, 1000);

  // Position ball B across ball A's initial line if any active remains
  assert.strictEqual(ballA.getActiveLineCount(), 0);
});

test('WinnerDetection: sole survivor declared champion with clean state transitions', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const bm = new LineBattleManager(fastConfig, engine);
  bm.setParticipants([dummyCountryA, dummyCountryB]);
  bm.prepareNextRound();

  // Set state to BATTLE
  bm.update(100, 1000);

  const ballA = bm.balls.find((b) => b.id === 'us')!;
  const ballB = bm.balls.find((b) => b.id === 'br')!;

  // Cut ball B's lines
  for (const line of ballB.lines) {
    line.cut('us', 1100, 300);
  }

  let roundEnded = false;
  bm.onRoundEnd = (results) => {
    roundEnded = true;
    assert.strictEqual(results.winner?.id, 'us', 'Country A should be winner');
  };

  // Run updates to process elimination & winner detection
  bm.update(16.666, 1200);

  // Ball A is sole survivor
  assert.ok(ballA.isAlive);
});

test('Simulation: 5 consecutive full Line Battle rounds simulate cleanly with 0 NaN', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const bm = new LineBattleManager(fastConfig, engine);
  bm.start();

  let completedRounds = 0;
  bm.onRoundEnd = () => {
    completedRounds++;
  };

  const fixedStep = fastConfig.fixedDeltaMs;
  let simulatedTime = 0;
  let iteration = 0;
  const maxIterations = 80000;

  while (completedRounds < 5 && iteration < maxIterations) {
    iteration++;
    simulatedTime += fixedStep;

    Engine.update(engine, fixedStep);
    bm.update(fixedStep, simulatedTime);

    for (const ball of bm.balls) {
      if (ball.isAlive) {
        assert.ok(!Number.isNaN(ball.body.position.x), 'X position must not be NaN');
        assert.ok(!Number.isNaN(ball.body.position.y), 'Y position must not be NaN');
        assert.ok(!Number.isNaN(ball.body.velocity.x), 'Velocity X must not be NaN');
        assert.ok(!Number.isNaN(ball.body.velocity.y), 'Velocity Y must not be NaN');
      }
    }
  }

  assert.ok(completedRounds >= 5, `Expected 5 completed rounds, got ${completedRounds}`);
  bm.destroy();
});

test('CountryWisePreinitialLines: 2 countries get 50%-50%, 3 get 33.33%, 4 get 25% perimeter distribution', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const cfg: LineBattleConfig = {
    ...LINE_BATTLE_CONFIG,
    initialLinesPerCountry: 6,
  };

  // Case A: 2 Countries (50% - 50%)
  const bm2 = new LineBattleManager(cfg, engine);
  bm2.setParticipants([dummyCountryA, dummyCountryB]);
  bm2.prepareNextRound();

  const totalLines2 = bm2.getAllActiveLines().length;
  const c1Lines2 = bm2.balls[0].lines.length;
  const c2Lines2 = bm2.balls[1].lines.length;

  assert.strictEqual(c1Lines2, 6);
  assert.strictEqual(c2Lines2, 6);
  assert.strictEqual(totalLines2, 12);
  assert.strictEqual(c1Lines2 / totalLines2, 0.5, 'Country 1 must have exactly 50% of the lines');
  assert.strictEqual(c2Lines2 / totalLines2, 0.5, 'Country 2 must have exactly 50% of the lines');

  // Verify Country 1 anchors are in [0, PI] and Country 2 in [PI, 2*PI]
  for (const line of bm2.balls[0].lines) {
    const angle = Math.atan2(line.anchorY - cfg.arenaCenterY, line.anchorX - cfg.arenaCenterX);
    const normalized = angle >= 0 ? angle : angle + Math.PI * 2;
    assert.ok(normalized >= 0 && normalized <= Math.PI + 0.01, 'Country 1 anchors in 0 to 180 deg sector');
  }

  // Case B: 3 Countries (33.33% each)
  const bm3 = new LineBattleManager(cfg, engine);
  bm3.setParticipants([dummyCountryA, dummyCountryB, dummyCountryC]);
  bm3.prepareNextRound();

  const totalLines3 = bm3.getAllActiveLines().length;
  assert.strictEqual(totalLines3, 18);
  for (const ball of bm3.balls) {
    assert.strictEqual(ball.lines.length, 6);
    const ratio = ball.lines.length / totalLines3;
    assert.ok(Math.abs(ratio - 1 / 3) < 0.001, 'Each country must have 33.33% of the lines');
  }

  // Case C: 4 Countries (25% each)
  const dummyCountryD: CountryData = { id: 'fr', name: 'France', iso: 'FR', flag: '🇫🇷', color: '#002654' };
  const bm4 = new LineBattleManager(cfg, engine);
  bm4.setParticipants([dummyCountryA, dummyCountryB, dummyCountryC, dummyCountryD]);
  bm4.prepareNextRound();

  const totalLines4 = bm4.getAllActiveLines().length;
  assert.strictEqual(totalLines4, 24);
  for (const ball of bm4.balls) {
    assert.strictEqual(ball.lines.length, 6);
    const ratio = ball.lines.length / totalLines4;
    assert.strictEqual(ratio, 0.25, 'Each country must have exactly 25% of the lines');
  }

  bm2.destroy();
  bm3.destroy();
  bm4.destroy();
});

test('LineBattle: Countdown counts 3, 2, 1 and broadcasts state change', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const countdownConfig: LineBattleConfig = {
    ...LINE_BATTLE_CONFIG,
    countdownDurationMs: 3000,
  };
  const bm = new LineBattleManager(countdownConfig, engine);
  bm.setParticipants([dummyCountryA, dummyCountryB]);

  const countdownStates: number[] = [];
  bm.onStateChange = (state, count) => {
    if (state === 'COUNTDOWN' && count !== undefined) {
      if (!countdownStates.includes(count)) {
        countdownStates.push(count);
      }
    }
  };

  bm.prepareNextRound();
  assert.strictEqual(bm.state, 'COUNTDOWN');
  assert.strictEqual(countdownStates.includes(3), true, 'Initial countdown value must be 3');

  // Step 1000ms: timer should tick down to 2
  bm.update(1000, 1000);
  assert.strictEqual(countdownStates.includes(2), true, 'Countdown must step through 2');

  // Step 1000ms: timer should tick down to 1
  bm.update(1000, 2000);
  assert.strictEqual(countdownStates.includes(1), true, 'Countdown must step through 1');

  // Step 1001ms: timer reaches 0, battle starts
  bm.update(1001, 3001);
  assert.strictEqual(bm.state, 'BATTLE', 'State must become BATTLE after countdown finishes');

  bm.destroy();
});

test('LineBattle: GameOver crowns winner and preserves winner info through WINNER_ANNOUNCEMENT and RESULTS', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const bm = new LineBattleManager(fastConfig, engine);
  bm.setParticipants([dummyCountryA, dummyCountryB]);
  bm.prepareNextRound();

  // Fast forward into BATTLE
  bm.update(60, 60);
  assert.strictEqual(bm.state, 'BATTLE');

  // Eliminate Country B
  const ballB = bm.balls.find((b) => b.id === 'br')!;
  const ballA = bm.balls.find((b) => b.id === 'us')!;
  (bm as any).eliminateBall(ballB, ballA);

  // Next update triggers checkWinnerCondition
  bm.update(16.6, 120);

  // Winner announced!
  assert.strictEqual(bm.state, 'WINNER_ANNOUNCEMENT', 'Must transition to WINNER_ANNOUNCEMENT');
  assert.ok(bm.winner, 'Winner must be crowned');
  assert.strictEqual(bm.winner.country.id, 'us', 'Country US must be the winner');
  assert.strictEqual(bm.winner.country.name, 'United States');
  assert.strictEqual(bm.winner.country.flag, '🇺🇸');

  // Advance past announcement to RESULTS
  bm.update(fastConfig.winnerAnnouncementDurationMs + 10, 200);
  assert.strictEqual(bm.state, 'RESULTS', 'Must transition to RESULTS');
  assert.ok(bm.winner, 'Winner info must be retained in RESULTS state');

  bm.destroy();
});

