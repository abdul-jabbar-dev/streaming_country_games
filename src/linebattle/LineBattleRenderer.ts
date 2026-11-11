/**
 * Renderer for Game 3: Country Line Battle Arena
 * Renders circular arena, dynamic multi-tether connection lines, cutting animations,
 * country flag sprites, and active line counters.
 */

import type { LineBattleConfig } from './LineBattleConfig.ts';
import type { LineBattleManager } from './LineBattleManager.ts';
import { FlagRenderer } from '../rendering/FlagRenderer.ts';
import type { PerformanceDiagnosticsData } from '../rendering/AdaptivePerformanceManager.ts';
import type { QualityProfile } from '../rendering/QualityProfiles.ts';
import { QUALITY_PROFILES } from '../rendering/QualityProfiles.ts';

export class LineBattleRenderer {
  public readonly canvas: HTMLCanvasElement;
  public readonly config: LineBattleConfig;
  public readonly manager: LineBattleManager;
  public currentProfile: QualityProfile;

  private ctx: CanvasRenderingContext2D;
  private flagRenderer = new FlagRenderer();

  constructor(
    canvas: HTMLCanvasElement,
    config: LineBattleConfig,
    manager: LineBattleManager,
    initialProfile?: QualityProfile
  ) {
    this.canvas = canvas;
    this.config = config;
    this.manager = manager;
    this.currentProfile = initialProfile || QUALITY_PROFILES['BALANCED'];

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Failed to acquire 2D canvas context for LineBattleRenderer');
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
    const scale = canvasWidth / 1280;
    const now = this.manager.currentTimestamp > 0 ? this.manager.currentTimestamp : performance.now();

    // 1. Clear Canvas Background
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Subtle arena radial aura
    const bgGrad = ctx.createRadialGradient(
      arenaCenterX,
      arenaCenterY,
      20,
      arenaCenterX,
      arenaCenterY,
      arenaRadius + 70
    );
    bgGrad.addColorStop(0, '#1c172e');
    bgGrad.addColorStop(0.65, '#0b0f1e');
    bgGrad.addColorStop(1, '#050912');

    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, arenaRadius + 70, 0, Math.PI * 2);
    ctx.fill();

    // 2. Arena Floor
    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, arenaRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#090e1c';
    ctx.fill();

    // Geometric rings on the floor
    const ring1 = Math.round(arenaRadius * 0.28);
    const ring2 = Math.round(arenaRadius * 0.62);

    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, ring1, 0, Math.PI * 2);
    ctx.strokeStyle = '#1d2742';
    ctx.lineWidth = 2 * scale;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(arenaCenterX, arenaCenterY, ring2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(29, 39, 66, 0.5)';
    ctx.setLineDash([8 * scale, 8 * scale]);
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosshair target markings
    ctx.beginPath();
    ctx.moveTo(arenaCenterX - ring1 * 0.8, arenaCenterY);
    ctx.lineTo(arenaCenterX + ring1 * 0.8, arenaCenterY);
    ctx.moveTo(arenaCenterX, arenaCenterY - ring1 * 0.8);
    ctx.lineTo(arenaCenterX, arenaCenterY + ring1 * 0.8);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.25)';
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();

    // 3. Circular Solid Arena Perimeter
    this.renderArenaPerimeter(ctx, arenaCenterX, arenaCenterY, arenaRadius, scale, profile);

    // 4. Render Connection Lines (Below balls)
    this.renderConnectionLines(ctx, arenaCenterX, arenaCenterY, scale, now, profile);

    // 4.5. Render String Abilities & Floating Notifications
    this.manager.collectibleManager.render(ctx, arenaCenterX, arenaCenterY, scale, now);

    // 5. Particles
    this.manager.particles.render(ctx);

    // 6. Country Flag Balls & Active Line Badges
    this.renderCountryBalls(ctx, arenaCenterX, arenaCenterY, scale, profile);

    // 7. State Banners (Countdown, Winner, Draw)
    this.renderStateOverlays(ctx, arenaCenterX, arenaCenterY, scale);

    // 8. Diagnostics Overlay
    if (diagnostics) {
      this.renderDiagnostics(ctx, diagnostics, canvasWidth, canvasHeight);
    }
  }

  private renderArenaPerimeter(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    scale: number,
    profile: QualityProfile
  ): void {
    ctx.save();

    const balls = this.manager.balls;
    const count = balls.length;

    // 1. Draw base outer glow ring
    if (profile.enableGlow) {
      ctx.shadowColor = '#00f2ff';
      ctx.shadowBlur = 10;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.lineWidth = 4 * scale;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // 2. Pre-initial territory boundary sectors colored per country (50% / 33.33% / 25%)
    if (count > 0) {
      const sectorSpan = (Math.PI * 2) / count;

      for (let i = 0; i < count; i++) {
        const ball = balls[i];
        const sectorStart = i * sectorSpan;
        const sectorEnd = (i + 1) * sectorSpan;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, sectorStart, sectorEnd);
        ctx.strokeStyle = ball.isAlive ? ball.country.color : 'rgba(100, 100, 100, 0.3)';
        ctx.lineWidth = (ball.isAlive ? 6 : 2) * scale;
        ctx.stroke();

        // Boundary divider notch
        const notchX = cx + Math.cos(sectorStart) * radius;
        const notchY = cy + Math.sin(sectorStart) * radius;
        ctx.beginPath();
        ctx.arc(notchX, notchY, 3 * scale, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    }

    // 3. Inner bevel ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 4 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();

    ctx.restore();
  }

  /**
   * High-Performance, Super-Smooth Batched Tether Line Renderer
   * Implements multi-pass neon laser beams, subtle catenary curves,
   * smooth exponential endpoint tracking, and zero-overhead halo glow.
   */
  private renderConnectionLines(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    scale: number,
    now: number,
    profile: QualityProfile
  ): void {
    const balls = this.manager.balls;
    const baseLineWidth = (this.config.lineThickness || 2.5) * scale;
    const arenaCenterX = this.config.arenaCenterX;
    const arenaCenterY = this.config.arenaCenterY;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Store anchor beacons to batch draw in a single pass at the end
    const standardBeacons: Array<{ x: number; y: number }> = [];
    const shieldedBeacons: Array<{ x: number; y: number }> = [];

    // Group active lines by country to minimize canvas state changes
    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      const lines = ball.lines;
      const count = lines.length;
      if (count === 0) continue;

      const lineColor = ball.country.color || '#00e5ff';
      const isShielded = ball.isShieldActive(now);

      // Collect line coordinates and smooth catenary control points
      interface LineCoords {
        ax: number;
        ay: number;
        ex: number;
        ey: number;
        ctrlX: number;
        ctrlY: number;
      }
      const activeCoords: LineCoords[] = [];

      for (let j = 0; j < count; j++) {
        const line = lines[j];
        if (!line.isAnimationVisible(now)) continue;

        const ax = cx + (line.anchorX - arenaCenterX) * scale;
        const ay = cy + (line.anchorY - arenaCenterY) * scale;

        if (line.isActive) {
          const ex = cx + (line.visualEndpointX - arenaCenterX) * scale;
          const ey = cy + (line.visualEndpointY - arenaCenterY) * scale;

          // Subtle organic catenary tension towards the arena center
          const midX = (ax + ex) * 0.5;
          const midY = (ay + ey) * 0.5;
          const sagX = (cx - midX) * 0.04;
          const sagY = (cy - midY) * 0.04;

          activeCoords.push({
            ax,
            ay,
            ex,
            ey,
            ctrlX: midX + sagX,
            ctrlY: midY + sagY,
          });

          if (isShielded) {
            shieldedBeacons.push({ x: ax, y: ay });
          } else {
            standardBeacons.push({ x: ax, y: ay });
          }
        } else {
          // Smooth snapping recoil animation for cut lines
          const progress = line.getCutProgress(now, this.config.lineCutFlashDurationMs);
          const alpha = Math.max(0, 1 - progress);

          // Snapping endpoint recoils back toward the anchor as it fades out
          const rawEx = cx + (line.endpointX - arenaCenterX) * scale;
          const rawEy = cy + (line.endpointY - arenaCenterY) * scale;
          const recoilFactor = 1 - progress * 0.45;
          const snapEx = ax + (rawEx - ax) * recoilFactor;
          const snapEy = ay + (rawEy - ay) * recoilFactor;

          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(snapEx, snapEy);
          ctx.strokeStyle = `rgba(255, 60, 60, ${alpha * 0.9})`;
          ctx.lineWidth = baseLineWidth * (1.8 - progress * 0.8);
          ctx.stroke();

          // Electric snap core
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(snapEx, snapEy);
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
          ctx.lineWidth = Math.max(1, baseLineWidth * 0.4);
          ctx.stroke();
        }
      }

      if (activeCoords.length === 0) continue;

      // PASS 1: Batched Neon Halo (Ultra-smooth, zero-overhead glow)
      if (profile.enableGlow) {
        ctx.beginPath();
        for (let k = 0; k < activeCoords.length; k++) {
          const c = activeCoords[k];
          ctx.moveTo(c.ax, c.ay);
          ctx.quadraticCurveTo(c.ctrlX, c.ctrlY, c.ex, c.ey);
        }
        ctx.strokeStyle = isShielded ? 'rgba(0, 242, 255, 0.35)' : `${lineColor}33`;
        ctx.lineWidth = isShielded ? baseLineWidth * 2.8 : baseLineWidth * 2.2;
        ctx.stroke();
      }

      // PASS 2: Batched Core Vibrant Beam
      ctx.beginPath();
      for (let k = 0; k < activeCoords.length; k++) {
        const c = activeCoords[k];
        ctx.moveTo(c.ax, c.ay);
        ctx.quadraticCurveTo(c.ctrlX, c.ctrlY, c.ex, c.ey);
      }
      ctx.strokeStyle = isShielded ? '#00f2ff' : lineColor;
      ctx.lineWidth = isShielded ? baseLineWidth * 1.35 : baseLineWidth;
      ctx.stroke();

      // PASS 3: Bright White Fiber Core (Silky laser effect on Balanced/High)
      if (profile.renderShadows || profile.enableGlow) {
        ctx.beginPath();
        for (let k = 0; k < activeCoords.length; k++) {
          const c = activeCoords[k];
          ctx.moveTo(c.ax, c.ay);
          ctx.quadraticCurveTo(c.ctrlX, c.ctrlY, c.ex, c.ey);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = Math.max(1, baseLineWidth * 0.35);
        ctx.stroke();
      }
    }

    // PASS 4: Batched Perimeter Anchor Beacons (Single draw call)
    if (standardBeacons.length > 0) {
      ctx.beginPath();
      for (let i = 0; i < standardBeacons.length; i++) {
        const b = standardBeacons[i];
        ctx.moveTo(b.x + 3.5 * scale, b.y);
        ctx.arc(b.x, b.y, 3.5 * scale, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    if (shieldedBeacons.length > 0) {
      ctx.beginPath();
      for (let i = 0; i < shieldedBeacons.length; i++) {
        const b = shieldedBeacons[i];
        ctx.moveTo(b.x + 5 * scale, b.y);
        ctx.arc(b.x, b.y, 5 * scale, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#00f2ff';
      ctx.fill();
    }

    ctx.restore();
  }

  private renderCountryBalls(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    scale: number,
    profile: QualityProfile
  ): void {
    const balls = this.manager.balls;
    const effectiveRadius = Math.round(this.config.ballRadius * scale);
    const now = this.manager.currentTimestamp > 0 ? this.manager.currentTimestamp : performance.now();

    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      if (!ball.isAlive) continue;

      const px = cx + (ball.body.position.x - this.config.arenaCenterX) * scale;
      const py = cy + (ball.body.position.y - this.config.arenaCenterY) * scale;

      const sprite = this.flagRenderer.getOrCreate(ball.country, effectiveRadius);
      const offset = sprite.size / 2;

      // Drop shadow (Balanced & High)
      if (profile.renderShadows) {
        ctx.beginPath();
        ctx.arc(px, py + 3 * scale, effectiveRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fill();
      }

      // Flag Ball
      ctx.drawImage(sprite.normal, px - offset, py - offset);

      // Hit flash overlay
      if (ball.hitFlashTimer > 0) {
        ctx.beginPath();
        ctx.arc(px, py, effectiveRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.fill();
      }

      // Ball Outline
      ctx.beginPath();
      ctx.arc(px, py, effectiveRadius + 1 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * scale;
      ctx.stroke();

      // Shield Active Bubble (glowing protective shield ring)
      if (ball.isShieldActive(now)) {
        ctx.beginPath();
        ctx.arc(px, py, effectiveRadius + 5 * scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(6, 182, 212, 0.25)';
        ctx.fill();
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2.5 * scale;
        ctx.stroke();
      }

      // Speed Slicer Active Aura (electric blue high speed ring)
      if (ball.isSpeedBoostActive(now)) {
        ctx.beginPath();
        ctx.arc(px, py, effectiveRadius + 7 * scale, 0, Math.PI * 2);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3 * scale;
        ctx.stroke();
      }

      // Active Line Count Badge (e.g. ⚡3)
      const lineCount = ball.getActiveLineCount();
      const badgeY = py - effectiveRadius - 12 * scale;

      ctx.save();
      ctx.font = `bold ${Math.round(11 * scale)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Badge pill background
      const badgeText = `⚡${lineCount}`;
      const textWidth = ctx.measureText(badgeText).width;
      const pillWidth = textWidth + 10 * scale;
      const pillHeight = 16 * scale;

      ctx.fillStyle = lineCount > 1 ? 'rgba(0, 229, 255, 0.85)' : 'rgba(255, 51, 102, 0.9)';
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(px - pillWidth / 2, badgeY - pillHeight / 2, pillWidth, pillHeight, 8 * scale);
        ctx.fill();
      } else {
        ctx.fillRect(px - pillWidth / 2, badgeY - pillHeight / 2, pillWidth, pillHeight);
      }

      // Badge text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(badgeText, px, badgeY);
      ctx.restore();
    }
  }

  private renderStateOverlays(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    scale: number
  ): void {
    const state = this.manager.state;
    if (state === 'BATTLE') return;

    if (state === 'COUNTDOWN') {
      const timerMs = this.manager.stateTimerMs;
      const seconds = Math.max(0, Math.ceil(timerMs / 1000));
      // Fraction of current second remaining: 1 down to 0
      const secondProgress = Math.max(0, Math.min(1, (timerMs % 1000) / 1000 || 1));
      const isGo = seconds === 0 || timerMs <= 250;
      const isFinal = seconds === 1;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 1. Semi-transparent central backdrop plate
      const plateRadius = (isGo ? 90 : 78) * scale;
      ctx.fillStyle = isGo ? 'rgba(16, 185, 129, 0.25)' : 'rgba(6, 12, 24, 0.78)';
      ctx.beginPath();
      ctx.arc(cx, cy, plateRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. Animated circular progress ring
      const ringRadius = 68 * scale;
      const ringColor = isGo ? '#10b981' : (isFinal ? '#ff3366' : '#00f2ff');
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 6 * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = ringColor;
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = 14 * scale;
      ctx.lineWidth = 6 * scale;
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        ringRadius,
        -Math.PI / 2,
        -Math.PI / 2 + secondProgress * Math.PI * 2
      );
      ctx.stroke();

      // 3. Central countdown numeral (3, 2, 1, GO!) with scale pop
      const numScale = 1 + 0.16 * Math.sin(secondProgress * Math.PI);
      const textToDisplay = isGo ? 'GO!' : seconds.toString();
      const fontSize = Math.round((isGo ? 64 : 76) * scale * numScale);
      ctx.font = `900 ${fontSize}px "Inter", system-ui, sans-serif`;
      ctx.fillStyle = isGo ? '#10b981' : (isFinal ? '#ffd700' : '#ffffff');
      ctx.shadowColor = isGo ? '#10b981' : (isFinal ? '#ffd700' : '#00f2ff');
      ctx.shadowBlur = 18 * scale;
      ctx.fillText(textToDisplay, cx, cy - 2 * scale);

      // 4. Header & Subtitle
      ctx.shadowBlur = 0;
      ctx.font = `900 ${Math.round(15 * scale)}px system-ui, sans-serif`;
      ctx.fillStyle = isGo ? '#10b981' : '#00f2ff';
      ctx.fillText(isGo ? '⚡ FIGHT! ⚡' : '⚡ BATTLE STARTING ⚡', cx, cy - 105 * scale);

      ctx.font = `700 ${Math.round(13 * scale)}px system-ui, sans-serif`;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('CUT OPPONENTS • KEEP YOUR LINES INTACT', cx, cy + 102 * scale);

      ctx.restore();
    } else if (
      state === 'WINNER_ANNOUNCEMENT' ||
      state === 'RESULTS' ||
      state === 'RESETTING'
    ) {
      const winner = this.manager.winner;
      if (!winner) {
        // Draw match fallback
        if (this.manager.isDraw) {
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const cardW = 340 * scale;
          const cardH = 150 * scale;
          ctx.fillStyle = 'rgba(8, 14, 28, 0.95)';
          if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 16 * scale);
            ctx.fill();
          } else {
            ctx.fillRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH);
          }
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 2 * scale;
          ctx.stroke();

          ctx.font = `900 ${Math.round(22 * scale)}px system-ui, sans-serif`;
          ctx.fillStyle = '#e2e8f0';
          ctx.fillText('⚔ DRAW MATCH ⚔', cx, cy - 25 * scale);

          ctx.font = `600 ${Math.round(13 * scale)}px system-ui, sans-serif`;
          ctx.fillStyle = '#94a3b8';
          ctx.fillText('All lines cut simultaneously!', cx, cy + 15 * scale);
          ctx.restore();
        }
        return;
      }

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 1. Frosted Champion Card
      const cardW = 400 * scale;
      const cardH = 230 * scale;
      const cardX = cx - cardW / 2;
      const cardY = cy - cardH / 2;

      ctx.fillStyle = 'rgba(8, 14, 28, 0.95)';
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 18 * scale);
        ctx.fill();
      } else {
        ctx.fillRect(cardX, cardY, cardW, cardH);
      }

      // Glowing Champion Border
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 3 * scale;
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 18 * scale;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 18 * scale);
        ctx.stroke();
      } else {
        ctx.strokeRect(cardX, cardY, cardW, cardH);
      }

      // 2. Banner Header
      ctx.shadowBlur = 8 * scale;
      ctx.font = `900 ${Math.round(15 * scale)}px system-ui, sans-serif`;
      ctx.fillStyle = '#ffd700';
      ctx.fillText('🏆 LINE BATTLE CHAMPION 🏆', cx, cardY + 28 * scale);

      // 3. Country Flag Avatar Badge
      const avatarY = cardY + 82 * scale;
      const avatarRadius = 32 * scale;
      ctx.shadowBlur = 0;

      // Outer gold circle
      ctx.beginPath();
      ctx.arc(cx, avatarY, avatarRadius, 0, Math.PI * 2);
      ctx.fillStyle = winner.country.color || '#1e293b';
      ctx.fill();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2.5 * scale;
      ctx.stroke();

      // Flag Emoji inside badge
      ctx.font = `${Math.round(42 * scale)}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.fillText(winner.country.flag, cx, avatarY + 2 * scale);

      // 4. Country Name
      ctx.font = `900 ${Math.round(26 * scale)}px system-ui, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#00f2ff';
      ctx.shadowBlur = 10 * scale;
      ctx.fillText(winner.country.name.toUpperCase(), cx, cardY + 140 * scale);

      // 5. Match Statistics
      ctx.shadowBlur = 0;
      ctx.font = `700 ${Math.round(13 * scale)}px system-ui, sans-serif`;
      ctx.fillStyle = '#00f2ff';
      ctx.fillText(
        `⚡ Surviving Lines: ${winner.getActiveLineCount()}   •   ✂ Opponents Cut: ${winner.linesCut}`,
        cx,
        cardY + 170 * scale
      );

      // 6. Footer: Status or Next Battle Countdown
      ctx.font = `700 ${Math.round(13 * scale)}px system-ui, sans-serif`;
      if (state === 'WINNER_ANNOUNCEMENT') {
        ctx.fillStyle = '#ffd700';
        ctx.fillText('★ VICTORY ACHIEVED ★', cx, cardY + 202 * scale);
      } else {
        // RESULTS or RESETTING
        const nextSec = Math.max(1, Math.ceil(this.manager.stateTimerMs / 1000));
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`Next Battle in ${nextSec}s...`, cx, cardY + 202 * scale);
      }

      ctx.restore();
    }
  }

  private renderDiagnostics(
    ctx: CanvasRenderingContext2D,
    diagnostics: PerformanceDiagnosticsData,
    width: number,
    height: number
  ): void {
    ctx.save();
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const padding = 12;
    const boxWidth = 240;
    const boxHeight = 115;
    const x = width - boxWidth - padding;
    const y = height - boxHeight - padding;

    ctx.fillStyle = 'rgba(6, 10, 18, 0.85)';
    ctx.strokeStyle = '#00f2ff';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, boxWidth, boxHeight);
    ctx.strokeRect(x, y, boxWidth, boxHeight);

    ctx.fillStyle = '#00f2ff';
    ctx.fillText(`PROFILE: ${diagnostics.currentProfile} (${diagnostics.qualityMode})`, x + 10, y + 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`FPS: ${diagnostics.fps} (Frame: ${diagnostics.avgFrameTimeMs}ms)`, x + 10, y + 26);
    ctx.fillText(`Physics: ${diagnostics.physicsTimeMs}ms | Render: ${diagnostics.renderTimeMs}ms`, x + 10, y + 44);
    ctx.fillText(`Dropped Frames: ${diagnostics.droppedFramesCount}`, x + 10, y + 62);
    ctx.fillText(`Active Lines: ${this.manager.getAllActiveLines().length}`, x + 10, y + 80);
    ctx.fillText(`Memory: ${diagnostics.estimatedMemoryMB ?? 'N/A'} MB`, x + 10, y + 98);

    ctx.restore();
  }
}
