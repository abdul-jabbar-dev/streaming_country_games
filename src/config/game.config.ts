/**
 * Central Game Configuration
 * Country Flag Battle Arena
 */

import type { QualityMode, QualityProfileName } from '../rendering/QualityProfiles.ts';

export interface GameConfig {
  // Canvas and Arena Dimensions
  canvasWidth: number;
  canvasHeight: number;
  arenaCenterX: number;
  arenaCenterY: number;
  arenaRadius: number;
  arenaSegments: number;

  // Ball & Combat Physics
  ballRadius: number;
  countryCount: number;
  initialHealth: number;
  baseDamage: number;
  damageMultiplier: number;
  collisionCooldownMs: number;

  // Collectible Abilities
  collectibleMinSpawnIntervalMs: number;
  collectibleMaxSpawnIntervalMs: number;
  collectibleLifetimeMs: number;
  collectibleMaxSimultaneous: number;
  shieldDurationMs: number;
  damageBoostDurationMs: number;
  damageBoostMultiplier: number;
  healAmount: number;

  // Controlled Movement & Energy System (Phase 3.1)
  minDesiredSpeed: number;
  maxSpeed: number;
  steeringStrength: number;
  steeringIntervalMs: number;
  ballRestitution: number;
  ballFriction: number;
  ballFrictionAir: number;
  ballDensity: number;
  wallRestitution: number;
  enableSleeping: boolean;

  // Battle Cycle Timings (milliseconds)
  countdownDurationMs: number;
  winnerAnnouncementDurationMs: number;
  resultsDurationMs: number;
  resetDelayMs: number;

  // Simulation & Fixed Timestep Engine
  targetFps: number;
  fixedDeltaMs: number;
  maxSubSteps: number;

  // Broadcast & UI
  broadcastMode: boolean;
  debugMode: boolean;
  qualityMode: QualityMode;
  initialQualityProfile: QualityProfileName;
}

function parseUrlParams(): Partial<GameConfig> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const overrides: Partial<GameConfig> = {};

  if (params.has('broadcast')) {
    overrides.broadcastMode = params.get('broadcast') === 'true' || params.get('broadcast') === '1';
  }
  if (params.has('debug')) {
    overrides.debugMode = params.get('debug') === 'true' || params.get('debug') === '1';
  }
  if (params.has('count')) {
    const count = parseInt(params.get('count') || '', 10);
    if (!isNaN(count) && count >= 2 && count <= 32) {
      overrides.countryCount = count;
    }
  }
  if (params.has('fps')) {
    const fps = parseInt(params.get('fps') || '', 10);
    if (!isNaN(fps) && fps >= 30 && fps <= 120) {
      overrides.targetFps = fps;
      overrides.fixedDeltaMs = 1000 / fps;
    }
  }
  if (params.has('quality')) {
    const q = params.get('quality')?.toUpperCase();
    if (q === 'LOW' || q === 'BALANCED' || q === 'HIGH' || q === 'AUTO') {
      overrides.qualityMode = q as QualityMode;
      if (q !== 'AUTO') {
        overrides.initialQualityProfile = q as QualityProfileName;
      }
    }
  }

  return overrides;
}

const baseConfig: GameConfig = {
  // Standard Balanced 16:9 canvas (1280x720) - Big, centered & focused arena ring
  canvasWidth: 1280,
  canvasHeight: 720,
  arenaCenterX: 640,
  arenaCenterY: 360,
  arenaRadius: 346,
  arenaSegments: 32,

  // Ball & Combat Physics (Sleek radius 19px for spacious arena mobility)
  ballRadius: 19,
  countryCount: 12,
  initialHealth: 100,
  baseDamage: 4,
  damageMultiplier: 1.76,
  collisionCooldownMs: 200,

  // Collectible Abilities
  collectibleMinSpawnIntervalMs: 3500,
  collectibleMaxSpawnIntervalMs: 8000,
  collectibleLifetimeMs: 10000,
  collectibleMaxSimultaneous: 3,
  shieldDurationMs: 6000,
  damageBoostDurationMs: 6000,
  damageBoostMultiplier: 2.0,
  healAmount: 35,

  // Controlled Movement & Energy System
  minDesiredSpeed: 2.6,
  maxSpeed: 8.5,
  steeringStrength: 0.00035,
  steeringIntervalMs: 250, // Evaluates 4 times/sec (not every 16ms frame)
  ballRestitution: 0.98,
  ballFriction: 0.0,
  ballFrictionAir: 0.0005,
  ballDensity: 0.002,
  wallRestitution: 1.0,
  enableSleeping: false,

  // Automated Battle Lifecycle Timers
  countdownDurationMs: 3000,
  winnerAnnouncementDurationMs: 5000,
  resultsDurationMs: 4000,
  resetDelayMs: 1500,

  // Loop & Fixed Timestep
  targetFps: 60,
  fixedDeltaMs: 1000 / 60, // 16.666 ms
  maxSubSteps: 4,

  // Broadcast & UI
  broadcastMode: false,
  debugMode: false,
  qualityMode: 'AUTO',
  initialQualityProfile: 'BALANCED',
};

export const CONFIG: GameConfig = {
  ...baseConfig,
  ...parseUrlParams(),
};
