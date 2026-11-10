/**
 * Connection Line Model
 * Represents a dynamic gameplay tether anchored to the arena boundary
 * with high-precision physics coordinates and smooth visual tracking.
 */

export class ConnectionLine {
  public readonly id: string;
  public readonly ownerCountryId: string;
  public readonly anchorX: number;
  public readonly anchorY: number;

  // Exact physics coordinates (for instantaneous, zero-lag collision detection)
  public endpointX: number;
  public endpointY: number;

  // Interpolated visual coordinates (for buttery-smooth, jitter-free rendering)
  public visualEndpointX: number;
  public visualEndpointY: number;

  public readonly createdAt: number;

  public isActive: boolean = true;
  public cutAt: number | null = null;
  public cutByCountryId: string | null = null;
  public cutFlashEndTime: number | null = null;

  constructor(
    id: string,
    ownerCountryId: string,
    anchorX: number,
    anchorY: number,
    endpointX: number,
    endpointY: number,
    createdAt: number
  ) {
    this.id = id;
    this.ownerCountryId = ownerCountryId;
    this.anchorX = anchorX;
    this.anchorY = anchorY;
    this.endpointX = endpointX;
    this.endpointY = endpointY;
    this.visualEndpointX = endpointX;
    this.visualEndpointY = endpointY;
    this.createdAt = createdAt;
  }

  /**
   * Updates moving endpoint with instantaneous physics sync and exponential visual smoothing
   */
  public updateEndpoint(x: number, y: number, smooth: boolean = true): void {
    if (!this.isActive) return;

    this.endpointX = x;
    this.endpointY = y;

    if (!smooth || Math.hypot(x - this.visualEndpointX, y - this.visualEndpointY) > 60) {
      this.visualEndpointX = x;
      this.visualEndpointY = y;
    } else {
      // Exponential smoothing factor: tracks fluidly without lag
      this.visualEndpointX += (x - this.visualEndpointX) * 0.45;
      this.visualEndpointY += (y - this.visualEndpointY) * 0.45;
    }
  }

  /**
   * Marks line as cut and sets up destruction animation window
   */
  public cut(byCountryId: string, timestamp: number, flashDurationMs: number): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.cutAt = timestamp;
    this.cutByCountryId = byCountryId;
    this.cutFlashEndTime = timestamp + flashDurationMs;
  }

  /**
   * Checks if cutting visual animation is still active
   */
  public isAnimationVisible(currentTimestamp: number): boolean {
    if (this.isActive) return true;
    if (this.cutFlashEndTime === null) return false;
    return currentTimestamp < this.cutFlashEndTime;
  }

  /**
   * Progress of the cut animation (0 to 1)
   */
  public getCutProgress(currentTimestamp: number, flashDurationMs: number): number {
    if (this.isActive || !this.cutAt) return 0;
    const elapsed = currentTimestamp - this.cutAt;
    return Math.min(1, Math.max(0, elapsed / flashDurationMs));
  }
}
