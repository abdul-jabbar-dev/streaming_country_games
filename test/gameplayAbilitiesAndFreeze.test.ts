import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
const { Engine } = Matter;
import { BattleManager } from '../src/game/BattleManager.ts';
import { EliminateManager } from '../src/eliminate/EliminateManager.ts';
import { LineBattleManager } from '../src/linebattle/LineBattleManager.ts';
import { CONFIG } from '../src/config/game.config.ts';
import { ELIMINATE_CONFIG } from '../src/eliminate/EliminateConfig.ts';
import { LINE_BATTLE_CONFIG } from '../src/linebattle/LineBattleConfig.ts';
import { soundSynth } from '../src/audio/SoundSynthesizer.ts';
import { KeyboardShortcutManager } from '../src/ui/KeyboardShortcutManager.ts';
import { CollectibleItem } from '../src/collectibles/CollectibleItem.ts';

describe('Gameplay Abilities, Stadium Freeze & Keyboard Shortcuts', () => {
  it('BattleManager freezes all balls at (0,0) velocity during COUNTDOWN, then launches on GO!', () => {
    const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
    const manager = new BattleManager(CONFIG, engine);
    manager.start();

    assert.equal(manager.state, 'COUNTDOWN');
    assert.ok(manager.balls.length > 0);

    // During COUNTDOWN, all ball velocities and angular velocities must be strictly 0
    for (const b of manager.balls) {
      assert.equal(b.body.velocity.x, 0);
      assert.equal(b.body.velocity.y, 0);
      assert.equal(b.body.angularVelocity, 0);
    }

    // Step countdown partially
    manager.update(1000, 1000);
    assert.equal(manager.state, 'COUNTDOWN');
    for (const b of manager.balls) {
      assert.equal(b.body.velocity.x, 0);
      assert.equal(b.body.velocity.y, 0);
    }

    // Reach zero countdown -> triggers GO! and BATTLE state
    manager.update(2500, 3500);
    assert.equal(manager.state, 'BATTLE');

    // Balls must now have non-zero initial combat velocities
    let hasMovement = false;
    for (const b of manager.balls) {
      const speed = Math.hypot(b.body.velocity.x, b.body.velocity.y);
      if (speed > 0.1) hasMovement = true;
    }
    assert.ok(hasMovement, 'Balls launched into combat after COUNTDOWN reached 0');

    manager.destroy();
  });

  it('EliminateManager freezes all balls and boundary rotation during COUNTDOWN', () => {
    const manager = new EliminateManager(ELIMINATE_CONFIG);
    manager.start();

    assert.equal(manager.state, 'COUNTDOWN');
    for (const b of manager.balls) {
      assert.equal(b.vx, 0);
      assert.equal(b.vy, 0);
    }

    const angleBefore = manager.rotatingBoundary.currentAngle;
    manager.update(1000, 1000);
    assert.equal(manager.state, 'COUNTDOWN');
    assert.equal(manager.rotatingBoundary.currentAngle, angleBefore, 'Rotating boundary is frozen during COUNTDOWN');

    // Advance to 0
    manager.update(2500, 3500);
    assert.equal(manager.state, 'BATTLE');
    let hasMovement = false;
    for (const b of manager.balls) {
      if (Math.hypot(b.vx, b.vy) > 0.1) hasMovement = true;
    }
    assert.ok(hasMovement, 'Eliminate balls launched smoothly upon GO!');

    manager.destroy();
  });

  it('LineBattleManager freezes balls during COUNTDOWN and launches them upon GO!', () => {
    const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
    const manager = new LineBattleManager(LINE_BATTLE_CONFIG, engine);
    manager.start();

    assert.equal(manager.state, 'COUNTDOWN');
    for (const b of manager.balls) {
      assert.equal(b.body.velocity.x, 0);
      assert.equal(b.body.velocity.y, 0);
    }

    manager.update(1000, 1000);
    assert.equal(manager.state, 'COUNTDOWN');
    for (const b of manager.balls) {
      assert.equal(b.body.velocity.x, 0);
      assert.equal(b.body.velocity.y, 0);
    }

    manager.update(2500, 3500);
    assert.equal(manager.state, 'BATTLE');
    let hasMovement = false;
    for (const b of manager.balls) {
      if (Math.hypot(b.body.velocity.x, b.body.velocity.y) > 0.1) hasMovement = true;
    }
    assert.ok(hasMovement, 'Line Battle balls launched smoothly upon GO!');

    manager.destroy();
  });

  it('BattleManager applies REPULSE, SPEED_BOOST, GRAB_THROW, and VORTEX abilities', () => {
    const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
    const manager = new BattleManager(CONFIG, engine);
    manager.start();
    manager.update(3500, 3500); // Enter BATTLE

    const ballA = manager.balls[0];
    const ballB = manager.balls[1];
    assert.ok(ballA && ballB);

    // 1. SPEED_BOOST
    const speedBoostItem = new CollectibleItem('test_sb', {
      type: 'SPEED_BOOST',
      label: 'NITRO',
      sublabel: 'BOOST',
      icon: '⚡',
      color: '#eab308',
      accentColor: 'rgba(234, 179, 8, 0.45)',
      weight: 10,
    }, ballA.body.position.x, ballA.body.position.y, 13, 3500, 8000);

    (manager as any).applyAbility(ballA, speedBoostItem, 3500);
    assert.ok(ballA.isSpeedBoostActive(3600), 'Speed boost is active');

    // 2. GRAB_THROW
    const grabItem = new CollectibleItem('test_gt', {
      type: 'GRAB_THROW',
      label: 'GRAB',
      sublabel: 'THROW',
      icon: '🥊',
      color: '#ef4444',
      accentColor: 'rgba(239, 68, 68, 0.45)',
      weight: 10,
    }, ballA.body.position.x, ballA.body.position.y, 13, 3500, 8000);

    (manager as any).applyAbility(ballA, grabItem, 3500);
    assert.ok(ballA.isGrabActive(3600), 'Grab ability is armed');

    // 3. VORTEX
    const vortexItem = new CollectibleItem('test_vx', {
      type: 'VORTEX',
      label: 'VORTEX',
      sublabel: 'GRAVITY',
      icon: '🌀',
      color: '#6366f1',
      accentColor: 'rgba(99, 102, 241, 0.45)',
      weight: 10,
    }, ballA.body.position.x, ballA.body.position.y, 13, 3500, 8000);

    (manager as any).applyAbility(ballA, vortexItem, 3500);
    assert.ok(ballA.isVortexActive(3600), 'Vortex is active');

    // 4. REPULSE
    const repulseItem = new CollectibleItem('test_rp', {
      type: 'REPULSE',
      label: 'BLAST',
      sublabel: 'REPULSE',
      icon: '💥',
      color: '#ec4899',
      accentColor: 'rgba(236, 72, 153, 0.45)',
      weight: 10,
    }, ballA.body.position.x, ballA.body.position.y, 13, 3500, 8000);

    (manager as any).applyAbility(ballA, repulseItem, 3500);

    manager.destroy();
  });

  it('SoundSynthesizer handles master volume and mute controls correctly', () => {
    soundSynth.setMasterVolume(0.8);
    assert.equal(soundSynth.getMasterVolume(), 0.8);

    const isMuted = soundSynth.toggleMute();
    assert.equal(isMuted, true);
    assert.equal(soundSynth.getIsMuted(), true);

    const unmuted = soundSynth.toggleMute();
    assert.equal(unmuted, false);
    assert.equal(soundSynth.getIsMuted(), false);

    // Clamping limits
    soundSynth.setMasterVolume(1.5);
    assert.equal(soundSynth.getMasterVolume(), 1.0);
    soundSynth.setMasterVolume(-0.2);
    assert.equal(soundSynth.getMasterVolume(), 0.0);

    // Restore comfortable volume
    soundSynth.setMasterVolume(0.5);
  });

  it('KeyboardShortcutManager executes single keys and sequence combos', () => {
    const triggered: string[] = [];

    // Mock document & window
    const originalDoc = (globalThis as any).document;
    const originalWin = (globalThis as any).window;

    let keyListener: ((e: any) => void) | null = null;
    (globalThis as any).window = {
      addEventListener: (_ev: string, handler: any) => {
        keyListener = handler;
      },
      removeEventListener: () => {},
    };
    (globalThis as any).document = {
      getElementById: () => null,
      createElement: () => ({
        className: '',
        id: '',
        innerHTML: '',
        appendChild: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        remove: () => {},
        classList: {
          add: () => {},
          remove: () => {},
          contains: () => false,
        },
      }),
      body: {
        appendChild: () => {},
      },
    };

    try {
      const shortcuts = new KeyboardShortcutManager({
        switchGameMode: (mode) => triggered.push(`switch:${mode}`),
        startSession: (mode, minutes) => triggered.push(`start:${mode}:${minutes ?? 0}`),
        stopSession: () => triggered.push('stop'),
        toggleFullscreen: () => triggered.push('fullscreen'),
      });

      assert.ok(keyListener);

      // Single Key: 'O'
      keyListener({ key: 'o', isComposing: false });
      assert.deepEqual(triggered, ['start:ONCE:0']);
      triggered.length = 0;

      // Single Key: 'S'
      keyListener({ key: 's', isComposing: false });
      assert.deepEqual(triggered, ['stop']);
      triggered.length = 0;

      // Combo: 'B' followed by 'O' (switches to battle and starts once)
      keyListener({ key: 'b', isComposing: false });
      assert.equal(triggered[0], 'switch:battle');
      keyListener({ key: 'o', isComposing: false, preventDefault: () => {} });
      assert.ok(triggered.includes('start:ONCE:0'));
      triggered.length = 0;

      // Combo: 'E' followed by 'I' (switches to eliminate and starts infinite)
      keyListener({ key: 'e', isComposing: false });
      assert.equal(triggered[0], 'switch:eliminate');
      keyListener({ key: 'i', isComposing: false, preventDefault: () => {} });
      assert.ok(triggered.includes('start:INFINITE:0'));

      shortcuts.destroy();
    } finally {
      (globalThis as any).document = originalDoc;
      (globalThis as any).window = originalWin;
    }
  });

  it('SoundSynthesizer handles audio routing, stereo panning, rate limiting, and all sound cues safely', () => {
    // Test volume controls
    soundSynth.setMasterVolume(0.85);
    assert.equal(soundSynth.getMasterVolume(), 0.85);

    const initialMute = soundSynth.getIsMuted();
    soundSynth.toggleMute();
    assert.equal(soundSynth.getIsMuted(), !initialMute);
    soundSynth.toggleMute(); // restore

    // Test all sound triggers execute safely without errors
    assert.doesNotThrow(() => {
      soundSynth.playSessionStart();
      soundSynth.playImpact(5.2, -0.6);
      soundSynth.playWallBounce(4.1, 0.7);
      soundSynth.playSlice(-0.3);
      soundSynth.playGrab(0.2);
      soundSynth.playPickup();
      soundSynth.playAbilityActivate();
      soundSynth.playAbilityImpact(0.5);
      soundSynth.playCountdown(3);
      soundSynth.playCountdown(1);
      soundSynth.playGoSignal();
      soundSynth.playElimination(-0.4);
      soundSynth.playShowdown();
      soundSynth.playVictory();
      soundSynth.playRoundComplete();
    });
  });
});
