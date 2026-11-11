/**
 * Centralized Game Speed Configuration & Presets
 * Defines valid speed multipliers, descriptive labels, and helper validation methods
 * for pre-game and real-time simulation pacing across all three survival arena modes.
 */

export interface SpeedPreset {
  multiplier: number;
  label: string;
  description: string;
}

export const SPEED_PRESETS: SpeedPreset[] = [
  { multiplier: 0.1, label: '0.1x', description: 'Slow-Mo' },
  { multiplier: 0.25, label: '0.25x', description: 'Quarter' },
  { multiplier: 0.5, label: '0.5x', description: 'Half' },
  { multiplier: 1.0, label: '1x', description: 'Normal' },
  { multiplier: 1.5, label: '1.5x', description: 'Fast' },
  { multiplier: 2.0, label: '2x', description: 'Very Fast' },
  { multiplier: 3.0, label: '3x', description: 'Max' },
];

export const DEFAULT_GAME_SPEED = 1.0;
export const MIN_GAME_SPEED = 0.1;
export const MAX_GAME_SPEED = 3.0;

/**
 * Validates and clamps simulation speed multiplier between 0.1x and 3.0x
 */
export function validateSpeedMultiplier(val: unknown): number {
  if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
    return DEFAULT_GAME_SPEED;
  }
  return Math.max(MIN_GAME_SPEED, Math.min(MAX_GAME_SPEED, Math.round(val * 100) / 100));
}

/**
 * Returns formatted label and descriptive text for a given speed multiplier
 */
export function getSpeedPresetInfo(speed: number): { label: string; description: string } {
  const rounded = Math.round(speed * 100) / 100;
  const match = SPEED_PRESETS.find((p) => Math.abs(p.multiplier - rounded) < 0.05);
  if (match) {
    return { label: match.label, description: match.description };
  }

  if (speed < 0.2) {
    return { label: `${speed.toFixed(2)}x`, description: 'Slow-Mo' };
  } else if (speed < 0.4) {
    return { label: `${speed.toFixed(2)}x`, description: 'Quarter' };
  } else if (speed < 0.8) {
    return { label: `${speed.toFixed(2)}x`, description: 'Slow' };
  } else if (speed < 1.3) {
    return { label: `${speed.toFixed(2)}x`, description: 'Normal' };
  } else if (speed < 2.2) {
    return { label: `${speed.toFixed(1)}x`, description: 'Fast' };
  } else {
    return { label: `${speed.toFixed(1)}x`, description: 'Max' };
  }
}
