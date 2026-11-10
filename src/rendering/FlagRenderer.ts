/**
 * FlagRenderer & Sprite Cache
 * Pre-renders country flag badges to off-screen canvases
 * Eliminates per-frame font parsing, emoji layout, and clipping operations
 */

import type { CountryData } from '../config/countries';

export interface CachedBallSprite {
  normal: HTMLCanvasElement;
  hit: HTMLCanvasElement;
  size: number;
}

export class FlagRenderer {
  private cache = new Map<string, CachedBallSprite>();

  public getOrCreate(country: CountryData, radius: number): CachedBallSprite {
    const key = `${country.id}_${radius}`;
    const existing = this.cache.get(key);
    if (existing) {
      return existing;
    }

    const sprite = this.rasterizeSprite(country, radius);
    this.cache.set(key, sprite);
    return sprite;
  }

  private rasterizeSprite(country: CountryData, radius: number): CachedBallSprite {
    const diameter = radius * 2;
    // Add 4px padding for clean antialiasing and stroke
    const canvasSize = diameter + 8;
    const center = canvasSize / 2;

    // 1. Normal Sprite
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = canvasSize;
    normalCanvas.height = canvasSize;
    const ctx = normalCanvas.getContext('2d');

    if (ctx) {
      ctx.imageSmoothingEnabled = true;

      // Base circle background
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Border with country accent
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = country.color || '#00d9ff';
      ctx.stroke();

      // Clip flag emoji cleanly
      ctx.save();
      ctx.beginPath();
      ctx.arc(center, center, radius - 1.5, 0, Math.PI * 2);
      ctx.clip();

      const fontSize = Math.round(radius * 1.35);
      ctx.font = `${fontSize}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(country.flag, center, center + 1);
      ctx.restore();

      // Outer subtle rim
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.stroke();
    }

    // 2. Hit Flash Sprite (white-hot flash overlay)
    const hitCanvas = document.createElement('canvas');
    hitCanvas.width = canvasSize;
    hitCanvas.height = canvasSize;
    const hitCtx = hitCanvas.getContext('2d');

    if (hitCtx) {
      hitCtx.drawImage(normalCanvas, 0, 0);

      // Flash overlay
      hitCtx.save();
      hitCtx.globalCompositeOperation = 'source-atop';
      hitCtx.fillStyle = 'rgba(255, 60, 60, 0.65)';
      hitCtx.fillRect(0, 0, canvasSize, canvasSize);

      hitCtx.globalCompositeOperation = 'lighter';
      hitCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      hitCtx.fillRect(0, 0, canvasSize, canvasSize);
      hitCtx.restore();

      hitCtx.beginPath();
      hitCtx.arc(center, center, radius, 0, Math.PI * 2);
      hitCtx.lineWidth = 3;
      hitCtx.strokeStyle = '#ffffff';
      hitCtx.stroke();
    }

    return {
      normal: normalCanvas,
      hit: hitCanvas,
      size: canvasSize,
    };
  }

  public clear(): void {
    this.cache.clear();
  }
}
