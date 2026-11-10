/**
 * Professional Esports Arena Canvas Renderer
 * High-performance Canvas 2D with pre-rendered cached sprites,
 * adaptive quality profile support, and dynamic health indicator rings
 */

import type { GameConfig } from '../config/game.config.ts';
import type { BattleManager } from '../game/BattleManager.ts';
import { FlagRenderer } from './FlagRenderer.ts';
import type { PerformanceDiagnosticsData } from './AdaptivePerformanceManager.ts';
import type { QualityProfile } from './QualityProfiles.ts';
import { QUALITY_PROFILES } from './QualityProfiles.ts';

export class Renderer {
  public readonly canvas: HTMLCanvasElement;
  public readonly config: GameConfig;
  public readonly battleManager: BattleManager;
  public currentProfile: QualityProfile;

  private ctx: CanvasRenderingContext2D;
  private flagRenderer = new FlagRenderer();

  constructor(
    canvas: HTMLCanvasElement,
    config: GameConfig,
    battleManager: BattleManager,
    initialProfile?: QualityProfile
  ) {
    this.canvas = canvas;
    this.config = config;
    this.battleManager = battleManager;
    this.currentProfile = initialProfile || QUALITY_PROFILES[config.initialQualityProfile || 'BALANCED'];

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Failed to acquire 2D canvas context');
    }
    this.ctx = context;

    this.applyProfile(this.currentProfile);
  }

  public applyProfile(profile: QualityProfile): void {
    this.currentProfile = profile;
    if (this.canvas.width !== profile.canvasWidth || this.canvas.height !== profile.canvasHeight) {
      this.canvas.width = profile.canvasWidth;
      this.canvas.height = profile.canvasHeight;
    }
  }

  public render(diagnostics?: PerformanceDiagnosticsData): void {
    const ctx = this.ctx;
    const profile = this.currentProfile;
    const { canvasWidth, canvasHeight, arenaCenterX, arenaCenterY, arenaRadius } = profile;

    // 1. Clear & Background Fill
    ctx.fillStyle = '#060d19';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Subtle arena background glow
    const arenaGrad = ctx.createRadialGradient(
      arenaCenterX,
      arenaCenterY,
      20,
      arenaCenterX,
      arenaCenterY,
      arenaRadius + 70
    );
    arenaGrad.addColorStop(0, '#10223d');
    arenaGrad.addColorStop(0.65, '#0a1424');
    arenaGrad.addColorStop(1, '#060d19');

    ctx.fillStyle = arenaGrad;
    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, arenaRadius + 70, 0, Math.PI * 2);
    ctx.fill();

    // 2. Arena Floor
    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, arenaRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#0a1424';
    ctx.fill();

    // Center arena target markings
    const ringInner = Math.round(arenaRadius * 0.28);
    const ringMid = Math.round(arenaRadius * 0.62);

    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, ringInner, 0, Math.PI * 2);
    ctx.strokeStyle = '#183152';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, ringMid, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(24, 49, 82, 0.5)';
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosshair lines
    ctx.beginPath();
    ctx.moveTo(arenaCenterX - ringInner * 0.8, arenaCenterY);
    ctx.lineTo(arenaCenterX + ringInner * 0.8, arenaCenterY);
    ctx.moveTo(arenaCenterX, arenaCenterY - ringInner * 0.8);
    ctx.lineTo(arenaCenterX, arenaCenterY + ringInner * 0.8);
    ctx.strokeStyle = 'rgba(0, 217, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 3. Perimeter Neon Ring (Luminous cyan boundary)
    ctx.save();
    ctx.shadowColor = '#00d9ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, arenaRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#00d9ff';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.restore();

    // Inner subtle rim
    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, arenaRadius - 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(180, 245, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Perimeter tick marks
    const tickCount = profile.name === 'LOW' ? 12 : 24;
    for (let i = 0; i < tickCount; i++) {
      const angle = (i / tickCount) * Math.PI * 2;
      const x1 = arenaCenterX + Math.cos(angle) * (arenaRadius - 9);
      const y1 = arenaCenterY + Math.sin(angle) * (arenaRadius - 9);
      const x2 = arenaCenterX + Math.cos(angle) * (arenaRadius + 7);
      const y2 = arenaCenterY + Math.sin(angle) * (arenaRadius + 7);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = i % 4 === 0 ? '#b4f5ff' : 'rgba(0, 217, 255, 0.45)';
      ctx.lineWidth = i % 4 === 0 ? 3 : 1.5;
      ctx.stroke();
    }

    // Scaling ratio if profile resolution differs from baseline (1280x720)
    const scale = canvasWidth / 1280;

    // 4. Collectibles (Abilities)
    const now = performance.now();
    this.battleManager.collectibleManager.render(ctx, arenaCenterX, arenaCenterY, scale, now);

    // 4.5. Particles (Under balls)
    this.battleManager.particles.render(ctx);

    // 5. Country Balls & Health Bars
    const balls = this.battleManager.balls;
    const ballRadius = this.config.ballRadius;
    const effectiveBallRadius = Math.round(ballRadius * scale);

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      if (!ball.isAlive) continue;

      // Scale physics position to canvas coordinates
      const px = arenaCenterX + (ball.body.position.x - this.config.arenaCenterX) * scale;
      const py = arenaCenterY + (ball.body.position.y - this.config.arenaCenterY) * scale;

      const sprite = this.flagRenderer.getOrCreate(ball.country, effectiveBallRadius);
      const drawCanvas = ball.hitFlashTimer > 0 ? sprite.hit : sprite.normal;
      const offset = sprite.size / 2;

      // Drop shadow (only on balanced / high)
      if (profile.renderShadows) {
        ctx.beginPath();
        ctx.arc(px, py + 3 * scale, effectiveBallRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fill();
      }

      // Damage Boost Active Aura (fiery pulsing ring)
      if (ball.isDamageBoostActive(now)) {
        ctx.beginPath();
        ctx.arc(px, py, effectiveBallRadius + 6 * scale, 0, Math.PI * 2);
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 3 * scale;
        ctx.stroke();
      }

      // Ball Sprite (single fast blit)
      ctx.drawImage(drawCanvas, px - offset, py - offset);

      // Shield Active Bubble (glowing cyan bubble)
      if (ball.isShieldActive(now)) {
        ctx.beginPath();
        ctx.arc(px, py, effectiveBallRadius + 4 * scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(6, 182, 212, 0.22)';
        ctx.fill();
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2.5 * scale;
        ctx.stroke();
      }

      // Health Indicator Ring
      const healthPct = Math.max(0, Math.min(1, ball.health / ball.maxHealth));
      const ringRadius = effectiveBallRadius + 4 * scale;

      ctx.beginPath();
      ctx.arc(px, py, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = 3 * scale;
      ctx.stroke();

      if (healthPct > 0) {
        ctx.beginPath();
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + healthPct * (Math.PI * 2);
        ctx.arc(px, py, ringRadius, startAngle, endAngle);

        let healthColor = '#00ff88';
        if (healthPct < 0.3) {
          healthColor = '#ff3366';
        } else if (healthPct < 0.65) {
          healthColor = '#ffd700';
        }

        ctx.strokeStyle = healthColor;
        ctx.lineWidth = 2.5 * scale;
        ctx.stroke();
      }

      // ISO code badge under ball
      const badgeW = Math.round(28 * scale);
      const badgeH = Math.round(12 * scale);
      ctx.fillStyle = 'rgba(10, 20, 36, 0.85)';
      ctx.fillRect(px - badgeW / 2, py + effectiveBallRadius + 3 * scale, badgeW, badgeH);

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(8 * scale)}px "Inter", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelText = ball.isDuplicate ? `${ball.country.iso}²` : ball.country.iso;
      ctx.fillText(labelText, px, py + effectiveBallRadius + (3 + badgeH / 2) * scale);
    }

    // 6. State Overlays
    this.renderStateOverlays(ctx, profile);

    // 7. Performance Diagnostics Overlay (if enabled)
    if (this.config.debugMode && diagnostics) {
      this.renderDiagnostics(ctx, diagnostics);
    }
  }

  private renderStateOverlays(ctx: CanvasRenderingContext2D, profile: QualityProfile): void {
    const { arenaCenterX, arenaCenterY } = profile;
    const state = this.battleManager.state;

    if (state === 'COUNTDOWN') {
      const timerMs = this.battleManager.stateTimerMs;
      const seconds = Math.max(1, Math.ceil(timerMs / 1000));
      const secondProgress = Math.max(0, Math.min(1, (timerMs % 1000) / 1000 || 1));
      const isFinal = seconds === 1;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 1. Semi-transparent backdrop disc
      const plateRadius = 78;
      ctx.fillStyle = 'rgba(6, 12, 24, 0.78)';
      ctx.beginPath();
      ctx.arc(arenaCenterX, arenaCenterY, plateRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. Animated circular progress ring
      const ringRadius = 68;
      const ringColor = isFinal ? '#ff3366' : '#00e5ff';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(arenaCenterX, arenaCenterY, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = ringColor;
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(
        arenaCenterX,
        arenaCenterY,
        ringRadius,
        -Math.PI / 2,
        -Math.PI / 2 + secondProgress * Math.PI * 2
      );
      ctx.stroke();

      // 3. Central countdown numeral (3, 2, 1)
      const numScale = 1 + 0.16 * Math.sin(secondProgress * Math.PI);
      ctx.font = `900 ${Math.round(76 * numScale)}px "Inter", sans-serif`;
      ctx.fillStyle = isFinal ? '#ffd700' : '#ffffff';
      ctx.shadowColor = isFinal ? '#ffd700' : '#00e5ff';
      ctx.shadowBlur = 18;
      ctx.fillText(seconds.toString(), arenaCenterX, arenaCenterY - 2);

      // 4. Header & Subtitle
      ctx.shadowBlur = 0;
      ctx.font = '900 15px "Inter", sans-serif';
      ctx.fillStyle = '#00e5ff';
      ctx.fillText('⚡ BATTLE STARTING ⚡', arenaCenterX, arenaCenterY - 105);

      ctx.font = '700 13px "Inter", sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('COLLIDE & SURVIVE • LAST COUNTRY STANDS', arenaCenterX, arenaCenterY + 102);

      ctx.restore();
    } else if (state === 'WINNER_ANNOUNCEMENT') {
      const winner = this.battleManager.winner;
      if (winner) {
        ctx.save();
        const bannerW = 340;
        const bannerH = 170;
        ctx.fillStyle = 'rgba(11, 22, 38, 0.95)';
        ctx.beginPath();
        ctx.roundRect(arenaCenterX - bannerW / 2, arenaCenterY - bannerH / 2, bannerW, bannerH, 16);
        ctx.fill();

        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = '#ffd700';
        ctx.font = '800 13px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★ BATTLE CHAMPION ★', arenaCenterX, arenaCenterY - 55);

        ctx.font = '48px "Noto Color Emoji", sans-serif';
        ctx.fillText(winner.country.flag, arenaCenterX, arenaCenterY - 12);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 24px "Inter", sans-serif';
        ctx.fillText(winner.country.name.toUpperCase(), arenaCenterX, arenaCenterY + 34);

        ctx.fillStyle = '#8da2ba';
        ctx.font = '600 12px "Inter", sans-serif';
        ctx.fillText(`Kills: ${winner.kills}  |  Damage: ${winner.damageDealt}`, arenaCenterX, arenaCenterY + 60);
        ctx.restore();
      }
    } else if (state === 'RESULTS') {
      ctx.save();
      const bannerW = 300;
      const bannerH = 100;
      ctx.fillStyle = 'rgba(11, 22, 38, 0.92)';
      ctx.beginPath();
      ctx.roundRect(arenaCenterX - bannerW / 2, arenaCenterY - bannerH / 2, bannerW, bannerH, 12);
      ctx.fill();
      ctx.strokeStyle = '#00d9ff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#00d9ff';
      ctx.font = '800 14px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('NEXT BATTLE PREPARING...', arenaCenterX, arenaCenterY - 15);

      ctx.fillStyle = '#91a6c0';
      ctx.font = '600 12px "Inter", sans-serif';
      ctx.fillText(`Round ${this.battleManager.roundNumber + 1} starting soon`, arenaCenterX, arenaCenterY + 15);
      ctx.restore();
    }
  }

  private renderDiagnostics(ctx: CanvasRenderingContext2D, diag: PerformanceDiagnosticsData): void {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.fillRect(12, 12, 250, 160);
    ctx.strokeStyle = '#00d9ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, 250, 160);

    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const lines = [
      `FPS: ${diag.fps} (${diag.avgFrameTimeMs} ms)`,
      `Profile: ${diag.currentProfile} [Mode: ${diag.qualityMode}]`,
      `Resolution: ${this.currentProfile.canvasWidth}x${this.currentProfile.canvasHeight}`,
      `Physics: ${diag.physicsTimeMs} ms`,
      `Render:  ${diag.renderTimeMs} ms`,
      `Dropped Frames: ${diag.droppedFramesCount}`,
      `Contestants: ${this.battleManager.balls.filter((b) => b.isAlive).length} / ${this.battleManager.balls.length}`,
      diag.estimatedMemoryMB ? `JS Heap: ${diag.estimatedMemoryMB} MB` : `Uptime: ${diag.uptimeSeconds}s`,
    ];

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 22, 20 + i * 19);
    }
    ctx.restore();
  }
}
