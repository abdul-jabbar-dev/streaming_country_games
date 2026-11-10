/**
 * Renderer for Country Eliminate Arena
 * Renders rotating circular boundary with glowing open gap and escape effects,
 * adapted to dynamic quality profiles.
 */

import type { EliminateConfig } from './EliminateConfig.ts';
import type { EliminateManager } from './EliminateManager.ts';
import { FlagRenderer } from '../rendering/FlagRenderer.ts';
import type { PerformanceDiagnosticsData } from '../rendering/AdaptivePerformanceManager.ts';
import type { QualityProfile } from '../rendering/QualityProfiles.ts';
import { QUALITY_PROFILES } from '../rendering/QualityProfiles.ts';

export class EliminateRenderer {
  public readonly canvas: HTMLCanvasElement;
  public readonly config: EliminateConfig;
  public readonly manager: EliminateManager;
  public currentProfile: QualityProfile;

  private ctx: CanvasRenderingContext2D;
  private flagRenderer = new FlagRenderer();

  constructor(
    canvas: HTMLCanvasElement,
    config: EliminateConfig,
    manager: EliminateManager,
    initialProfile?: QualityProfile
  ) {
    this.canvas = canvas;
    this.config = config;
    this.manager = manager;
    this.currentProfile = initialProfile || QUALITY_PROFILES['BALANCED'];

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Failed to acquire 2D canvas context for EliminateRenderer');
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

    // 1. Clear Canvas
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Subtle arena radial background (only on Balanced / High)
    if (profile.renderShadows || profile.enableGlow) {
      const bgGrad = ctx.createRadialGradient(
        arenaCenterX,
        arenaCenterY,
        10,
        arenaCenterX,
        arenaCenterY,
        arenaRadius + 60
      );
      bgGrad.addColorStop(0, '#12182c');
      bgGrad.addColorStop(0.7, '#0b101e');
      bgGrad.addColorStop(1, '#060a14');

      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(arenaCenterX, arenaCenterY, arenaRadius + 60, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Arena Floor (Deep high-tech battle pit)
    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, arenaRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#090e1d';
    ctx.fill();

    // Concentric tactical floor rings
    const ring1 = Math.round(arenaRadius * 0.28);
    const ring2 = Math.round(arenaRadius * 0.58);
    const ring3 = Math.round(arenaRadius * 0.84);

    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, ring1, 0, Math.PI * 2);
    ctx.strokeStyle = '#1d2a4a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, ring2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(29, 42, 74, 0.6)';
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, ring3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(29, 42, 74, 0.35)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // Subtle crosshair lines through center
    ctx.beginPath();
    ctx.moveTo(arenaCenterX - ring1 * 0.8, arenaCenterY);
    ctx.lineTo(arenaCenterX + ring1 * 0.8, arenaCenterY);
    ctx.moveTo(arenaCenterX, arenaCenterY - ring1 * 0.8);
    ctx.lineTo(arenaCenterX, arenaCenterY + ring1 * 0.8);
    ctx.strokeStyle = 'rgba(0, 217, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 3. Rotating Outer Boundary with Open Gap
    this.renderRotatingBoundary(ctx, profile);

    // 4. Particles (Under balls)
    const now = performance.now();
    const scale = canvasWidth / 1280;
    const scaleFactor = scale;

    // 4.5. Render Collectibles & Floating Notifications
    this.manager.collectibleManager.render(ctx, arenaCenterX, arenaCenterY, scale, now);

    this.manager.particles.render(ctx);

    // 5. Balls
    const balls = this.manager.balls;
    const radius = this.config.ballRadius;
    const effectiveRadius = Math.round(radius * scale);

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      if (!ball.isAlive && !ball.escaped) continue;

      const px = arenaCenterX + (ball.x - this.config.arenaCenterX) * scale;
      const py = arenaCenterY + (ball.y - this.config.arenaCenterY) * scale;

      const sprite = this.flagRenderer.getOrCreate(ball.country, effectiveRadius);
      const offset = sprite.size / 2;

      // Drop shadow (only on balanced / high)
      if (profile.renderShadows) {
        ctx.beginPath();
        ctx.arc(px, py + 3 * scaleFactor, effectiveRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fill();
      }

      // Damage Boost Active Aura (fiery pulsing ring)
      if (ball.isDamageBoostActive(now)) {
        ctx.beginPath();
        ctx.arc(px, py, effectiveRadius + 6 * scaleFactor, 0, Math.PI * 2);
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 3 * scaleFactor;
        ctx.stroke();
      }

      // Speed Boost Nitro Aura (electric golden ring)
      if (ball.isSpeedBoostActive(now)) {
        ctx.beginPath();
        ctx.arc(px, py, effectiveRadius + 7 * scaleFactor, 0, Math.PI * 2);
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 3.5 * scaleFactor;
        ctx.stroke();
      }

      // Ball Sprite
      ctx.drawImage(sprite.normal, px - offset, py - offset);

      // Shield Active Bubble (glowing cyan shield ring)
      if (ball.isShieldActive(now)) {
        ctx.beginPath();
        ctx.arc(px, py, effectiveRadius + 4 * scaleFactor, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(6, 182, 212, 0.22)';
        ctx.fill();
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2.5 * scaleFactor;
        ctx.stroke();
      } else {
        // Normal Ring border indicator
        ctx.beginPath();
        ctx.arc(px, py, effectiveRadius + 3 * scaleFactor, 0, Math.PI * 2);
        ctx.strokeStyle = ball.escaped ? '#ff3366' : '#a855f7';
        ctx.lineWidth = 2 * scaleFactor;
        ctx.stroke();
      }

      // Health Bar Indicator above ball
      if (ball.isAlive) {
        const barW = Math.round(30 * scaleFactor);
        const barH = Math.round(4 * scaleFactor);
        const barX = px - barW / 2;
        const barY = py - effectiveRadius - (7 + barH) * scaleFactor;

        // Health bar background
        ctx.fillStyle = 'rgba(12, 18, 30, 0.85)';
        ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

        // Current health fill
        const healthRatio = Math.max(0, Math.min(1, ball.health / ball.maxHealth));
        const fillW = Math.round(barW * healthRatio);
        ctx.fillStyle = healthRatio > 0.45 ? '#10b981' : healthRatio > 0.2 ? '#f59e0b' : '#ef4444';
        ctx.fillRect(barX, barY, fillW, barH);
      }

      // ISO tag & Duplicate marker
      const badgeW = Math.round(28 * scaleFactor);
      const badgeH = Math.round(12 * scaleFactor);
      ctx.fillStyle = 'rgba(8, 14, 26, 0.85)';
      ctx.fillRect(px - badgeW / 2, py + effectiveRadius + 3 * scaleFactor, badgeW, badgeH);

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(8 * scaleFactor)}px "Inter", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelText = ball.isDuplicate ? `${ball.country.iso}²` : ball.country.iso;
      ctx.fillText(labelText, px, py + effectiveRadius + (3 + badgeH / 2) * scaleFactor);
    }

    // 6. Overlays
    this.renderStateOverlays(ctx, profile);

    // 7. Performance Overlay
    if (this.config.debugMode && diagnostics) {
      this.renderDiagnostics(ctx, diagnostics);
    }
  }

  private renderRotatingBoundary(ctx: CanvasRenderingContext2D, profile: QualityProfile): void {
    const { arenaCenterX, arenaCenterY, arenaRadius } = profile;
    const gapAngleWidthRad = this.config.gapAngleWidthRad;
    const currentAngle = this.manager.rotatingBoundary.currentAngleRad;
    const halfGap = gapAngleWidthRad / 2;

    const startSolidAngle = currentAngle + halfGap;
    const endSolidAngle = currentAngle - halfGap + Math.PI * 2;

    // 1. Solid Wall Arc (Glow & Main perimeter)
    ctx.save();
    ctx.shadowColor = '#c084fc';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, arenaRadius, startSolidAngle, endSolidAngle, false);
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();

    // Secondary inner luminous rim
    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, arenaRadius - 3, startSolidAngle, endSolidAngle, false);
    ctx.strokeStyle = 'rgba(233, 213, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Perimeter boundary tick marks along the solid ring
    const solidArc = (Math.PI * 2) - gapAngleWidthRad;
    const tickCount = 20;
    for (let i = 0; i <= tickCount; i++) {
      const angle = startSolidAngle + (i / tickCount) * solidArc;
      const x1 = arenaCenterX + Math.cos(angle) * (arenaRadius - 8);
      const y1 = arenaCenterY + Math.sin(angle) * (arenaRadius - 8);
      const x2 = arenaCenterX + Math.cos(angle) * (arenaRadius + 6);
      const y2 = arenaCenterY + Math.sin(angle) * (arenaRadius + 6);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = i % 5 === 0 ? '#e9d5ff' : 'rgba(192, 132, 252, 0.4)';
      ctx.lineWidth = i % 5 === 0 ? 2.5 : 1.2;
      ctx.stroke();
    }

    // 2. Gap Hazard Arc (Bright warning barrier)
    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, arenaRadius, currentAngle - halfGap, currentAngle + halfGap, false);
    ctx.strokeStyle = 'rgba(255, 51, 102, 0.6)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Gap Endpoint Tips (Gold luminous beacons)
    const tip1Angle = currentAngle - halfGap;
    const tip2Angle = currentAngle + halfGap;

    const tip1X = arenaCenterX + Math.cos(tip1Angle) * arenaRadius;
    const tip1Y = arenaCenterY + Math.sin(tip1Angle) * arenaRadius;
    const tip2X = arenaCenterX + Math.cos(tip2Angle) * arenaRadius;
    const tip2Y = arenaCenterY + Math.sin(tip2Angle) * arenaRadius;

    ctx.save();
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(tip1X, tip1Y, 6.5, 0, Math.PI * 2);
    ctx.arc(tip2X, tip2Y, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4. Direction Arrow (Sleek rotating hazard indicator)
    const arrowDist = arenaRadius + 20;
    const arrowX = arenaCenterX + Math.cos(currentAngle) * arrowDist;
    const arrowY = arenaCenterY + Math.sin(currentAngle) * arrowDist;

    ctx.save();
    ctx.translate(arrowX, arrowY);
    ctx.rotate(currentAngle);
    ctx.fillStyle = '#ff3366';
    ctx.shadowColor = '#ff3366';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-7, -6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-7, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private renderStateOverlays(ctx: CanvasRenderingContext2D, profile: QualityProfile): void {
    const { arenaCenterX, arenaCenterY } = profile;
    const state = this.manager.state;

    if (state === 'COUNTDOWN') {
      const timerMs = this.manager.stateTimerMs;
      const seconds = Math.max(0, Math.ceil(timerMs / 1000));
      const secondProgress = Math.max(0, Math.min(1, (timerMs % 1000) / 1000 || 1));
      const isGo = seconds === 0 || timerMs <= 250;
      const isFinal = seconds === 1;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 1. Semi-transparent backdrop disc
      const plateRadius = isGo ? 90 : 78;
      ctx.fillStyle = isGo ? 'rgba(16, 185, 129, 0.25)' : 'rgba(6, 10, 20, 0.78)';
      ctx.beginPath();
      ctx.arc(arenaCenterX, arenaCenterY, plateRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. Animated circular progress ring
      const ringRadius = 68;
      const ringColor = isGo ? '#10b981' : (isFinal ? '#ff3366' : '#a855f7');
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

      // 3. Central countdown numeral (3, 2, 1, GO!)
      const numScale = 1 + 0.16 * Math.sin(secondProgress * Math.PI);
      const textToDisplay = isGo ? 'GO!' : seconds.toString();
      ctx.font = `900 ${Math.round((isGo ? 64 : 76) * numScale)}px "Inter", sans-serif`;
      ctx.fillStyle = isGo ? '#10b981' : (isFinal ? '#ffd700' : '#ffffff');
      ctx.shadowColor = isGo ? '#10b981' : (isFinal ? '#ffd700' : '#a855f7');
      ctx.shadowBlur = 18;
      ctx.fillText(textToDisplay, arenaCenterX, arenaCenterY - 2);

      // 4. Header & Subtitle
      ctx.shadowBlur = 0;
      ctx.font = '900 15px "Inter", sans-serif';
      ctx.fillStyle = isGo ? '#10b981' : '#a855f7';
      ctx.fillText(isGo ? '⚡ FIGHT! ⚡' : '🌀 ROTATING GAP ARENA 🌀', arenaCenterX, arenaCenterY - 105);

      ctx.font = '700 13px "Inter", sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText("DON'T GET THROWN OUT OF THE GAP!", arenaCenterX, arenaCenterY + 102);

      ctx.restore();
    } else if (state === 'WINNER_ANNOUNCEMENT') {
      const winner = this.manager.winner;
      if (winner) {
        ctx.save();
        const bannerW = 340;
        const bannerH = 170;
        ctx.fillStyle = 'rgba(12, 18, 32, 0.96)';
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
        ctx.fillText('★ SOLE SURVIVOR ★', arenaCenterX, arenaCenterY - 55);

        ctx.font = '48px "Noto Color Emoji", sans-serif';
        ctx.fillText(winner.country.flag, arenaCenterX, arenaCenterY - 12);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 24px "Inter", sans-serif';
        ctx.fillText(winner.country.name.toUpperCase(), arenaCenterX, arenaCenterY + 34);

        ctx.fillStyle = '#8da2ba';
        ctx.font = '600 12px "Inter", sans-serif';
        ctx.fillText('Escaped the rotating gap trap!', arenaCenterX, arenaCenterY + 60);
        ctx.restore();
      }
    } else if (state === 'RESULTS') {
      ctx.save();
      const bannerW = 300;
      const bannerH = 100;
      ctx.fillStyle = 'rgba(12, 18, 32, 0.92)';
      ctx.beginPath();
      ctx.roundRect(arenaCenterX - bannerW / 2, arenaCenterY - bannerH / 2, bannerW, bannerH, 12);
      ctx.fill();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#a855f7';
      ctx.font = '800 14px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('NEXT ROUND PREPARING...', arenaCenterX, arenaCenterY - 15);

      ctx.fillStyle = '#91a6c0';
      ctx.font = '600 12px "Inter", sans-serif';
      ctx.fillText(`Round ${this.manager.roundNumber + 1} starting soon`, arenaCenterX, arenaCenterY + 15);
      ctx.restore();
    }
  }

  private renderDiagnostics(ctx: CanvasRenderingContext2D, diag: PerformanceDiagnosticsData): void {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.fillRect(12, 12, 250, 140);
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, 250, 140);

    ctx.fillStyle = '#a855f7';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const lines = [
      `FPS: ${diag.fps} (${diag.avgFrameTimeMs} ms)`,
      `Profile: ${diag.currentProfile} [Mode: ${diag.qualityMode}]`,
      `Resolution: ${this.currentProfile.canvasWidth}x${this.currentProfile.canvasHeight}`,
      `Physics: ${diag.physicsTimeMs} ms`,
      `Render:  ${diag.renderTimeMs} ms`,
      `Alive: ${this.manager.balls.filter((b) => b.isAlive).length} / ${this.manager.balls.length}`,
      `Gap Angle: ${(this.manager.rotatingBoundary.currentAngleRad * 180 / Math.PI).toFixed(1)}°`,
    ];

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 22, 20 + i * 19);
    }
    ctx.restore();
  }
}
