/**
 * Adaptive Performance Manager
 * Estimates runtime device capability, dynamically shifts visual quality profiles,
 * and maintains strict separation between rendering quality and simulation correctness.
 */

import { QUALITY_PROFILES } from './QualityProfiles.ts';
import type { QualityMode, QualityProfile, QualityProfileName } from './QualityProfiles.ts';
import { logger } from '../utils/logger.ts';

export interface PerformanceDiagnosticsData {
  fps: number;
  avgFrameTimeMs: number;
  physicsTimeMs: number;
  renderTimeMs: number;
  droppedFramesCount: number;
  currentProfile: QualityProfileName;
  qualityMode: QualityMode;
  uptimeSeconds: number;
  estimatedMemoryMB?: number;
}

export class AdaptivePerformanceManager {
  public qualityMode: QualityMode = 'AUTO';
  public currentProfile: QualityProfile;

  // Frame history ring buffer (last 60 frames)
  private readonly windowSize = 60;
  private frameTimes: number[] = [];
  private physicsTimes: number[] = [];
  private renderTimes: number[] = [];

  private lastEvaluationTime: number = 0;
  private lastQualityShiftTime: number = 0;
  private lowFpsStreak: number = 0;
  private highFpsStreak: number = 0;
  private droppedFramesTotal: number = 0;
  private startTime: number = 0;

  public onProfileChanged?: (newProfile: QualityProfile) => void;

  constructor(initialMode: QualityMode = 'AUTO', initialProfileName: QualityProfileName = 'BALANCED', initialTimestamp?: number) {
    const t = initialTimestamp !== undefined ? initialTimestamp : performance.now();
    this.qualityMode = initialMode;
    this.currentProfile = QUALITY_PROFILES[initialProfileName];
    this.startTime = t;
    this.lastEvaluationTime = t;
    this.lastQualityShiftTime = t;
  }

  public getCurrentProfile(): QualityProfile {
    return this.currentProfile;
  }

  public getCurrentProfileName(): QualityProfileName {
    return this.currentProfile.name;
  }

  public setProfile(profileName: QualityProfileName): void {
    this.applyProfile(profileName);
  }

  public setMode(mode: QualityMode): void {
    this.qualityMode = mode;
    logger.info(`Quality mode set to: ${mode}`);

    if (mode !== 'AUTO') {
      this.applyProfile(mode);
    }
  }

  public recordFrame(
    frameDurationMs: number,
    physicsDurationMs: number,
    renderDurationMs: number,
    customTimestamp?: number
  ): void {
    const now = customTimestamp !== undefined ? customTimestamp : performance.now();

    this.frameTimes.push(frameDurationMs);
    this.physicsTimes.push(physicsDurationMs);
    this.renderTimes.push(renderDurationMs);

    if (this.frameTimes.length > this.windowSize) {
      this.frameTimes.shift();
      this.physicsTimes.shift();
      this.renderTimes.shift();
    }

    if (frameDurationMs > 33.33) {
      this.droppedFramesTotal++;
    }

    // Adaptive auto-evaluation every 2.5 seconds
    if (this.qualityMode === 'AUTO' && now - this.lastEvaluationTime >= 2500) {
      this.evaluatePerformance(now);
      this.lastEvaluationTime = now;
    }
  }

  private evaluatePerformance(now: number): void {
    if (this.frameTimes.length < 30) return;

    const avgFrameTime = this.calculateAverage(this.frameTimes);
    const avgFps = avgFrameTime > 0 ? Math.min(120, Math.round(1000 / avgFrameTime)) : 60;
    const cooldownMs = now - this.lastQualityShiftTime;

    // Check for downgrade threshold (<26 FPS on Balanced/High)
    if (avgFps < 26) {
      this.lowFpsStreak++;
      this.highFpsStreak = 0;

      if (this.lowFpsStreak >= 2 && cooldownMs >= 5000) {
        if (this.currentProfile.name === 'HIGH') {
          this.applyProfile('BALANCED');
          this.lastQualityShiftTime = now;
          this.lowFpsStreak = 0;
        } else if (this.currentProfile.name === 'BALANCED') {
          this.applyProfile('LOW');
          this.lastQualityShiftTime = now;
          this.lowFpsStreak = 0;
        }
      }
    } else if (avgFps >= 56) {
      // Check for upgrade threshold (>56 FPS with stable performance)
      this.highFpsStreak++;
      this.lowFpsStreak = 0;

      if (this.highFpsStreak >= 5 && cooldownMs >= 15000) {
        if (this.currentProfile.name === 'LOW') {
          this.applyProfile('BALANCED');
          this.lastQualityShiftTime = now;
          this.highFpsStreak = 0;
        } else if (this.currentProfile.name === 'BALANCED') {
          this.applyProfile('HIGH');
          this.lastQualityShiftTime = now;
          this.highFpsStreak = 0;
        }
      }
    } else {
      this.lowFpsStreak = 0;
      this.highFpsStreak = 0;
    }
  }

  private applyProfile(profileName: QualityProfileName): void {
    if (this.currentProfile.name === profileName) return;

    this.currentProfile = QUALITY_PROFILES[profileName];
    logger.info(`[AdaptivePerformance] Switched profile to: ${profileName} (${this.currentProfile.canvasWidth}x${this.currentProfile.canvasHeight})`);
    this.onProfileChanged?.(this.currentProfile);
  }

  private calculateAverage(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sum = arr.reduce((acc, val) => acc + val, 0);
    return sum / arr.length;
  }

  public getDiagnostics(): PerformanceDiagnosticsData {
    const avgFrameTime = this.calculateAverage(this.frameTimes);
    const avgPhysicsTime = this.calculateAverage(this.physicsTimes);
    const avgRenderTime = this.calculateAverage(this.renderTimes);
    const fps = avgFrameTime > 0 ? Math.min(120, Math.round(1000 / avgFrameTime)) : 60;
    const uptime = Math.round((performance.now() - this.startTime) / 1000);

    let memoryMB: number | undefined;
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const mem = (performance as any).memory;
      memoryMB = Number((mem.usedJSHeapSize / (1024 * 1024)).toFixed(1));
    }

    return {
      fps,
      avgFrameTimeMs: Number(avgFrameTime.toFixed(2)),
      physicsTimeMs: Number(avgPhysicsTime.toFixed(2)),
      renderTimeMs: Number(avgRenderTime.toFixed(2)),
      droppedFramesCount: this.droppedFramesTotal,
      currentProfile: this.currentProfile.name,
      qualityMode: this.qualityMode,
      uptimeSeconds: uptime,
      estimatedMemoryMB: memoryMB,
    };
  }

  public exportReport(): string {
    const diag = this.getDiagnostics();
    const report = {
      timestamp: new Date().toISOString(),
      qualityMode: diag.qualityMode,
      activeProfile: diag.currentProfile,
      resolution: `${this.currentProfile.canvasWidth}x${this.currentProfile.canvasHeight}`,
      currentFps: diag.fps,
      avgFrameTimeMs: diag.avgFrameTimeMs,
      physicsTimeMs: diag.physicsTimeMs,
      renderTimeMs: diag.renderTimeMs,
      droppedFrames: diag.droppedFramesCount,
      uptimeSeconds: diag.uptimeSeconds,
      memoryMB: diag.estimatedMemoryMB ?? 'Not exposed by browser',
    };
    return JSON.stringify(report, null, 2);
  }
}
