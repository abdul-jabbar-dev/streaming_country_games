/**
 * Performance Monitor & Diagnostics
 * Country Flag Battle Arena
 */

export interface PerformanceSnapshot {
  fps: number;
  frameTimeMs: number;
  physicsTimeMs: number;
  renderTimeMs: number;
  activeCountries: number;
  activeBodies: number;
  physicsStepsPerFrame: number;
  longFrameCount: number;
}

export class PerformanceMonitor {
  private frameCount = 0;
  private lastSecondTime = 0;
  private physicsTimeAccumulator = 0;
  private renderTimeAccumulator = 0;
  private frameTimeAccumulator = 0;
  private stepsAccumulator = 0;
  private longFramesTotal = 0;

  private currentFps = 60;
  private avgFrameTime = 16.6;
  private avgPhysicsTime = 2.0;
  private avgRenderTime = 4.0;
  private avgStepsPerFrame = 1;

  public activeCountries = 0;
  public activeBodies = 0;

  public enabled: boolean;

  constructor(enabled: boolean = false) {
    this.enabled = enabled;
  }

  public recordFrame(
    frameTimeMs: number,
    physicsTimeMs: number,
    renderTimeMs: number,
    physicsSteps: number
  ): void {
    if (!this.enabled) return;

    const now = performance.now();
    if (this.lastSecondTime === 0) {
      this.lastSecondTime = now;
    }

    this.frameCount++;
    this.frameTimeAccumulator += frameTimeMs;
    this.physicsTimeAccumulator += physicsTimeMs;
    this.renderTimeAccumulator += renderTimeMs;
    this.stepsAccumulator += physicsSteps;

    if (frameTimeMs > 33.33) {
      this.longFramesTotal++;
    }

    if (now - this.lastSecondTime >= 1000) {
      const frames = Math.max(1, this.frameCount);
      this.currentFps = frames;
      this.avgFrameTime = this.frameTimeAccumulator / frames;
      this.avgPhysicsTime = this.physicsTimeAccumulator / frames;
      this.avgRenderTime = this.renderTimeAccumulator / frames;
      this.avgStepsPerFrame = this.stepsAccumulator / frames;

      this.frameCount = 0;
      this.frameTimeAccumulator = 0;
      this.physicsTimeAccumulator = 0;
      this.renderTimeAccumulator = 0;
      this.stepsAccumulator = 0;
      this.lastSecondTime = now;
    }
  }

  public getSnapshot(): PerformanceSnapshot {
    return {
      fps: this.currentFps,
      frameTimeMs: Number(this.avgFrameTime.toFixed(2)),
      physicsTimeMs: Number(this.avgPhysicsTime.toFixed(2)),
      renderTimeMs: Number(this.avgRenderTime.toFixed(2)),
      activeCountries: this.activeCountries,
      activeBodies: this.activeBodies,
      physicsStepsPerFrame: Number(this.avgStepsPerFrame.toFixed(2)),
      longFrameCount: this.longFramesTotal,
    };
  }
}
