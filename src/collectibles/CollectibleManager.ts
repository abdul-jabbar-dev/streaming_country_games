/**
 * Reusable Collectible Manager
 * Handles spawning, spatial validation, lifetime tracking, pickup collisions,
 * floating pickup feedback texts, and rendering.
 */

import { CollectibleItem, type CollectibleDefinition } from './CollectibleItem.ts';

export interface CollectibleConfig {
  minSpawnIntervalMs: number;
  maxSpawnIntervalMs: number;
  maxSimultaneousItems: number;
  itemLifetimeMs: number;
  itemRadius: number;
  spawnMargin: number; // distance from arena outer wall
  minDistanceBetweenItems: number;
  minDistanceFromBalls: number;
}

export interface FloatingNotification {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  createdAt: number;
  durationMs: number;
}

export class CollectibleManager {
  public items: CollectibleItem[] = [];
  public notifications: FloatingNotification[] = [];
  public readonly config: CollectibleConfig;
  public readonly definitions: CollectibleDefinition[];

  private nextSpawnTime: number = 0;
  private itemIdCounter: number = 0;
  private notifIdCounter: number = 0;

  constructor(config: Partial<CollectibleConfig>, definitions: CollectibleDefinition[]) {
    this.config = {
      minSpawnIntervalMs: config.minSpawnIntervalMs ?? 4000,
      maxSpawnIntervalMs: config.maxSpawnIntervalMs ?? 9000,
      maxSimultaneousItems: config.maxSimultaneousItems ?? 3,
      itemLifetimeMs: config.itemLifetimeMs ?? 11000,
      itemRadius: config.itemRadius ?? 13,
      spawnMargin: config.spawnMargin ?? 75,
      minDistanceBetweenItems: config.minDistanceBetweenItems ?? 40,
      minDistanceFromBalls: config.minDistanceFromBalls ?? 35,
    };
    this.definitions = definitions;
  }

  public reset(now: number = 0): void {
    this.items = [];
    this.notifications = [];
    this.scheduleNextSpawn(now);
  }

  public scheduleNextSpawn(now: number): void {
    const interval =
      this.config.minSpawnIntervalMs +
      Math.random() * (this.config.maxSpawnIntervalMs - this.config.minSpawnIntervalMs);
    this.nextSpawnTime = now + interval;
  }

  /**
   * Main update cycle: cleans up expired items/notifications and checks spawn timer
   */
  public update(
    _deltaMs: number,
    now: number,
    arenaCenterX: number,
    arenaCenterY: number,
    arenaRadius: number,
    balls: Array<{ x: number; y: number; radius: number; isAlive?: boolean }>
  ): void {
    // 1. Remove expired items
    this.items = this.items.filter((item) => !item.isExpired(now) && !item.isCollected);

    // 2. Remove expired notifications
    this.notifications = this.notifications.filter(
      (n) => now - n.createdAt < n.durationMs
    );

    // 3. Attempt spawn if timer reached and below capacity
    if (now >= this.nextSpawnTime) {
      if (this.items.length < this.config.maxSimultaneousItems) {
        this.spawnItem(now, arenaCenterX, arenaCenterY, arenaRadius, balls);
      }
      this.scheduleNextSpawn(now);
    }
  }

  /**
   * Spawns a collectible at a valid, non-overlapping location strictly inside the arena
   */
  public spawnItem(
    now: number,
    arenaCenterX: number,
    arenaCenterY: number,
    arenaRadius: number,
    balls: Array<{ x: number; y: number; radius: number; isAlive?: boolean }>
  ): CollectibleItem | null {
    if (this.definitions.length === 0) return null;

    const def = this.selectRandomDefinition();
    // Guarantee placement strictly inside the ring: minimum 75px safety buffer from the outer wall
    const maxSpawnRadius = Math.max(30, Math.min(arenaRadius * 0.70, arenaRadius - Math.max(this.config.spawnMargin, 75)));

    let chosenOffsetX = 0;
    let chosenOffsetY = 0;
    let foundValidSpot = false;

    for (let attempt = 0; attempt < 20; attempt++) {
      // Uniform disk distribution strictly inside maxSpawnRadius
      const r = Math.sqrt(Math.random()) * maxSpawnRadius;
      const theta = Math.random() * Math.PI * 2;
      const offX = Math.cos(theta) * r;
      const offY = Math.sin(theta) * r;
      const testX = arenaCenterX + offX;
      const testY = arenaCenterY + offY;

      // Check distance from existing items
      let overlapsItem = false;
      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i];
        const dist = Math.hypot(testX - item.x, testY - item.y);
        if (dist < this.config.minDistanceBetweenItems) {
          overlapsItem = true;
          break;
        }
      }
      if (overlapsItem) continue;

      // Check distance from active balls
      let overlapsBall = false;
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (b.isAlive === false) continue;
        const dist = Math.hypot(testX - b.x, testY - b.y);
        if (dist < this.config.minDistanceFromBalls + (b.radius || 22)) {
          overlapsBall = true;
          break;
        }
      }
      if (overlapsBall) continue;

      chosenOffsetX = offX;
      chosenOffsetY = offY;
      foundValidSpot = true;
      break;
    }

    if (!foundValidSpot) {
      if (this.items.length > 0) {
        return null;
      }
      // If arena has no items yet, place at a safe central offset
      const safeR = Math.random() * (maxSpawnRadius * 0.5);
      const safeTheta = Math.random() * Math.PI * 2;
      chosenOffsetX = Math.cos(safeTheta) * safeR;
      chosenOffsetY = Math.sin(safeTheta) * safeR;
    }

    // Double check offset distance is strictly within maxSpawnRadius
    const finalDist = Math.hypot(chosenOffsetX, chosenOffsetY);
    if (finalDist > maxSpawnRadius) {
      chosenOffsetX = (chosenOffsetX / finalDist) * maxSpawnRadius;
      chosenOffsetY = (chosenOffsetY / finalDist) * maxSpawnRadius;
    }

    const chosenX = arenaCenterX + chosenOffsetX;
    const chosenY = arenaCenterY + chosenOffsetY;

    this.itemIdCounter++;
    const item = new CollectibleItem(
      `col_${this.itemIdCounter}`,
      def,
      chosenX,
      chosenY,
      this.config.itemRadius,
      now,
      this.config.itemLifetimeMs,
      chosenOffsetX,
      chosenOffsetY
    );

    this.items.push(item);
    return item;
  }

  /**
   * Checks collisions between active balls and collectibles
   * Immediately triggers and applies effect upon touching
   */
  public checkPickups<T extends { x: number; y: number; radius: number; isAlive: boolean; vx?: number; vy?: number; prevX?: number; prevY?: number }>(
    balls: T[],
    now: number,
    onPickup: (ball: T, item: CollectibleItem) => void
  ): void {
    const items = this.items;
    let anyCollected = false;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.isCollected || item.isExpired(now)) continue;

      for (let j = 0; j < balls.length; j++) {
        const ball = balls[j];
        if (!ball.isAlive) continue;

        // Immediate responsive touch detection with +4px touch buffer
        const threshold = ball.radius + item.radius + 4;
        const thresholdSq = threshold * threshold;

        // Direct position distance
        const dx = ball.x - item.x;
        const dy = ball.y - item.y;
        let touched = (dx * dx + dy * dy) <= thresholdSq;

        // Continuous swept line segment collision test to catch high-speed ball movement
        if (!touched && (ball.vx !== undefined && ball.vy !== undefined)) {
          const prevX = ball.prevX ?? (ball.x - ball.vx);
          const prevY = ball.prevY ?? (ball.y - ball.vy);
          const segDx = ball.x - prevX;
          const segDy = ball.y - prevY;
          const segLenSq = segDx * segDx + segDy * segDy;

          if (segLenSq > 0.001) {
            const t = Math.max(0, Math.min(1, ((item.x - prevX) * segDx + (item.y - prevY) * segDy) / segLenSq));
            const projX = prevX + t * segDx;
            const projY = prevY + t * segDy;
            const distToSegSq = (item.x - projX) ** 2 + (item.y - projY) ** 2;
            if (distToSegSq <= thresholdSq) {
              touched = true;
            }
          }
        }

        if (touched) {
          item.isCollected = true;
          anyCollected = true;
          onPickup(ball, item);
          this.addNotification(item.x, item.y, item.label, item.color, now);
          break;
        }
      }
    }

    if (anyCollected) {
      this.items = this.items.filter((it) => !it.isCollected && !it.isExpired(now));
    }
  }

  public addNotification(
    x: number,
    y: number,
    text: string,
    color: string,
    now: number,
    durationMs: number = 900
  ): void {
    this.notifIdCounter++;
    this.notifications.push({
      id: `notif_${this.notifIdCounter}`,
      x,
      y,
      text,
      color,
      createdAt: now,
      durationMs,
    });
  }

  private selectRandomDefinition(): CollectibleDefinition {
    let totalWeight = 0;
    for (let i = 0; i < this.definitions.length; i++) {
      totalWeight += this.definitions[i].weight;
    }

    let randomVal = Math.random() * totalWeight;
    for (let i = 0; i < this.definitions.length; i++) {
      const def = this.definitions[i];
      if (randomVal <= def.weight) {
        return def;
      }
      randomVal -= def.weight;
    }

    return this.definitions[0];
  }

  /**
   * Renders all active collectibles and floating text notifications
   */
  public render(
    ctx: CanvasRenderingContext2D,
    arenaCenterX: number,
    arenaCenterY: number,
    scale: number,
    now: number
  ): void {
    const items = this.items;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.isCollected || item.isExpired(now)) continue;

      // Position relative to the center using stored offsets to guarantee item stays strictly inside ring on any resolution
      const px = arenaCenterX + item.offsetX * scale;
      const py = arenaCenterY + item.offsetY * scale;
      const r = item.radius * scale * item.getPulseScale(now);

      // Blinking warning when lifetime is expiring (last 25%)
      const remainingRatio = item.getRemainingLifeRatio(now);
      if (remainingRatio < 0.25) {
        const blinkPhase = Math.floor(now / 150) % 2;
        if (blinkPhase === 1) continue;
      }

      ctx.save();

      // Outer glow circle (compact: r + 2.5)
      ctx.beginPath();
      ctx.arc(px, py, r + 2.5 * scale, 0, Math.PI * 2);
      ctx.fillStyle = item.accentColor;
      ctx.fill();

      // Main badge sphere
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();

      // Inner border ring
      ctx.beginPath();
      ctx.arc(px, py, r - 1.5 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1 * scale;
      ctx.stroke();

      // Icon / Symbol inside collectible (compact font size)
      ctx.font = `${Math.round(10.5 * scale)}px "Inter", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.icon, px, py);

      // Small compact label pill beneath collectible
      ctx.font = `bold ${Math.round(7.5 * scale)}px "Inter", sans-serif`;
      ctx.fillStyle = 'rgba(10, 16, 28, 0.88)';
      const textWidth = ctx.measureText(item.sublabel).width;
      const pad = 3 * scale;
      const labelY = py + r + 6 * scale;

      ctx.fillRect(px - textWidth / 2 - pad, labelY - 4 * scale, textWidth + pad * 2, 8.5 * scale);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(item.sublabel, px, labelY);

      ctx.restore();
    }

    // Render floating pickup notifications
    const notifs = this.notifications;
    for (let i = 0; i < notifs.length; i++) {
      const n = notifs[i];
      const elapsed = now - n.createdAt;
      const progress = Math.min(1, elapsed / n.durationMs);

      // Floats upwards and fades out
      const px = arenaCenterX + (n.x - arenaCenterX) * scale;
      const py = arenaCenterY + (n.y - arenaCenterY) * scale - progress * 28 * scale;
      const alpha = Math.max(0, 1 - progress);

      ctx.save();
      ctx.font = `bold ${Math.round(11 * scale)}px "Inter", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Outline for readability
      ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.9})`;
      ctx.lineWidth = 3 * scale;
      ctx.strokeText(n.text, px, py);

      // Foreground text
      ctx.fillStyle = n.color;
      ctx.globalAlpha = alpha;
      ctx.fillText(n.text, px, py);

      ctx.restore();
    }
  }
}
