import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
const { Engine, Bodies } = Matter;

import { LineBattleManager } from '../src/linebattle/LineBattleManager.ts';
import { LineBattleBall } from '../src/linebattle/LineBattleBall.ts';
import { ConnectionLine } from '../src/linebattle/ConnectionLine.ts';
import { LINE_BATTLE_CONFIG, type LineBattleConfig } from '../src/linebattle/LineBattleConfig.ts';
import { CollectibleItem } from '../src/collectibles/CollectibleItem.ts';
import type { CountryData } from '../src/config/countries.ts';

const countryUS: CountryData = { id: 'us', name: 'United States', iso: 'US', flag: '🇺🇸', color: '#3c3b6e' };
const countryBR: CountryData = { id: 'br', name: 'Brazil', iso: 'BR', flag: '🇧🇷', color: '#009c3b' };

const fastConfig: LineBattleConfig = {
  ...LINE_BATTLE_CONFIG,
  countryCount: 4,
  initialLinesPerCountry: 2,
  maxLinesPerCountry: 8,
  addStringsCount: 5,
  removeStringsCount: 2,
  stringShieldDurationMs: 6000,
  countdownDurationMs: 50,
};

test('Line Battle Ability: +5 Strings creates valid connection lines respecting capacity', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const lm = new LineBattleManager(fastConfig, engine);
  lm.setParticipants([countryUS, countryBR]);
  lm.prepareNextRound();

  const ballUS = lm.balls.find((b) => b.id === 'us')!;
  assert.strictEqual(ballUS.getActiveLineCount(), 2, 'Initial lines = 2');

  const addDef = {
    type: 'ADD_STRINGS' as const,
    label: '+5 STRINGS',
    sublabel: '+5 LINES',
    icon: '🧶',
    color: '#eab308',
    accentColor: 'rgba(234, 179, 8, 0.45)',
    weight: 30,
  };

  (lm as any).applyAbility(ballUS, new CollectibleItem('add_1', addDef, 0, 0, 16, 0, 10000), 1000);
  assert.strictEqual(ballUS.getActiveLineCount(), 7, '2 initial + 5 added = 7 lines');

  // Adding 5 more with maxLines = 8 should clamp to 8 (+1 added)
  (lm as any).applyAbility(ballUS, new CollectibleItem('add_2', addDef, 0, 0, 16, 0, 10000), 1500);
  assert.strictEqual(ballUS.getActiveLineCount(), 8, 'Lines capped at maxLinesPerCountry (8)');
});

test('Line Battle Ability: -2 Strings removes oldest active lines and can eliminate', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const lm = new LineBattleManager(fastConfig, engine);
  lm.setParticipants([countryUS, countryBR]);
  lm.prepareNextRound();

  const ballUS = lm.balls.find((b) => b.id === 'us')!;
  assert.strictEqual(ballUS.getActiveLineCount(), 2);

  const removeDef = {
    type: 'REMOVE_STRINGS' as const,
    label: '-2 STRINGS',
    sublabel: '-2 CUT',
    icon: '✂️',
    color: '#ef4444',
    accentColor: 'rgba(239, 68, 68, 0.45)',
    weight: 25,
  };

  (lm as any).applyAbility(ballUS, new CollectibleItem('rem_1', removeDef, 0, 0, 16, 0, 10000), 1000);
  assert.strictEqual(ballUS.getActiveLineCount(), 0, 'Active lines reduced by 2 to 0');
  assert.strictEqual(ballUS.isAlive, false, 'Country eliminated when all lines cut');
});

test('Line Battle Ability: Shield protects active lines from being cut', () => {
  const body = Bodies.circle(100, 100, 20);
  const ball = new LineBattleBall(countryUS, body);
  ball.addLine(new ConnectionLine('line_1', 'us', 0, 100, 200, 100, 0));

  assert.strictEqual(ball.isShieldActive(1000), false);
  ball.applyShield(5000, 1000);
  assert.strictEqual(ball.isShieldActive(2000), true);

  // At t = 7000 (shield expired)
  assert.strictEqual(ball.isShieldActive(7000), false);
});

test('Line Battle Ability: String Repair restores cut lines up to cap', () => {
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  const lm = new LineBattleManager(fastConfig, engine);
  lm.setParticipants([countryUS, countryBR]);
  lm.prepareNextRound();

  const ballUS = lm.balls.find((b) => b.id === 'us')!;
  assert.strictEqual(ballUS.getActiveLineCount(), 2);

  // Cut 1 line
  ballUS.lines[0].cut('br', 500, 300);
  assert.strictEqual(ballUS.getActiveLineCount(), 1);

  const repairDef = {
    type: 'REPAIR_STRING' as const,
    label: 'REPAIR',
    sublabel: 'FIX 1',
    icon: '🔧',
    color: '#10b981',
    accentColor: 'rgba(16, 185, 129, 0.45)',
    weight: 20,
  };

  (lm as any).applyAbility(ballUS, new CollectibleItem('rep_1', repairDef, 0, 0, 16, 0, 10000), 1000);
  assert.strictEqual(ballUS.getActiveLineCount(), 2, 'Line repaired successfully');
});
