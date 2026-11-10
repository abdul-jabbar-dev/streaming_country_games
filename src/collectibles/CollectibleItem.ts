/**
 * Collectible Item Entity
 * Represents an in-arena floating ability pickup with lifetime, visual styling, and pulse animation
 */

export type CollectibleType =
  // Universal / Battle Arena Abilities
  | 'HEALTH_BOOST'
  | 'DAMAGE_BOOST'
  | 'SHIELD'
  | 'DUPLICATE'
  | 'REPULSE'
  | 'SPEED_BOOST'
  | 'VORTEX'
  | 'GRAB_THROW'
  // Line Battle Arena Abilities
  | 'ADD_STRINGS'
  | 'REMOVE_STRINGS'
  | 'SHIELD_STRINGS'
  | 'REPAIR_STRING'
  | 'SPEED_SLICER';

export interface CollectibleDefinition {
  type: CollectibleType;
  label: string;
  sublabel: string;
  icon: string;
  color: string;
  accentColor: string;
  weight: number;
}

export class CollectibleItem {
  public readonly id: string;
  public readonly type: CollectibleType;
  public readonly x: number;
  public readonly y: number;
  public readonly offsetX: number;
  public readonly offsetY: number;
  public readonly radius: number;
  public readonly createdAt: number;
  public readonly lifetimeMs: number;

  public readonly label: string;
  public readonly sublabel: string;
  public readonly icon: string;
  public readonly color: string;
  public readonly accentColor: string;

  public isCollected: boolean = false;
  public collectedByCountryId?: string;

  constructor(
    id: string,
    definition: CollectibleDefinition,
    x: number,
    y: number,
    radius: number,
    createdAt: number,
    lifetimeMs: number,
    offsetX: number = 0,
    offsetY: number = 0
  ) {
    this.id = id;
    this.type = definition.type;
    this.label = definition.label;
    this.sublabel = definition.sublabel;
    this.icon = definition.icon;
    this.color = definition.color;
    this.accentColor = definition.accentColor;
    this.x = x;
    this.y = y;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.radius = radius;
    this.createdAt = createdAt;
    this.lifetimeMs = lifetimeMs;
  }

  public isExpired(now: number): boolean {
    return !this.isCollected && now - this.createdAt >= this.lifetimeMs;
  }

  public getRemainingLifeRatio(now: number): number {
    const elapsed = now - this.createdAt;
    return Math.max(0, 1 - elapsed / this.lifetimeMs);
  }

  public getPulseScale(now: number): number {
    const age = now - this.createdAt;
    // Gentle floating pulsing animation (0.92 to 1.08 scale)
    return 1.0 + Math.sin(age * 0.005) * 0.08;
  }
}
