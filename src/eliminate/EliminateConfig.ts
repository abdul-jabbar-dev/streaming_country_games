/**
 * Configuration for Game 2: Country Eliminate Arena
 * Rotating boundary with open escape gap, health system, and collectible abilities
 */

export interface EliminateConfig {
  canvasWidth: number;
  canvasHeight: number;
  arenaCenterX: number;
  arenaCenterY: number;
  arenaRadius: number;

  // Rotating Boundary
  gapAngleWidthRad: number; // Angular width of escape gap (noticeably reduced from 54 deg)
  rotationSpeedRad: number; // Radians per fixed physics step
  boundaryThickness: number;

  // Ball & Escape Dynamics
  ballRadius: number;
  countryCount: number;
  minSpeed: number;
  maxSpeed: number;
  escapeThreshold: number; // Distance beyond arenaRadius where elimination confirms

  // Health & Combat
  maxHealth: number;
  duplicateHealth: number;
  baseCollisionDamage: number;
  damageMultiplier: number;
  collisionDamageCooldownMs: number;

  // Collectible Abilities
  healthBoostAmount: number;
  damageBoostMultiplier: number;
  damageBoostDurationMs: number;
  shieldDurationMs: number;
  maxBallsPerCountry: number;
  maxGlobalBalls: number;
  collectibleMinSpawnIntervalMs: number;
  collectibleMaxSpawnIntervalMs: number;
  collectibleLifetimeMs: number;
  collectibleMaxSimultaneous: number;

  // Lifecycle Timings (ms)
  countdownDurationMs: number;
  winnerAnnouncementDurationMs: number;
  resultsDurationMs: number;
  resetDelayMs: number;

  // Timestep
  targetFps: number;
  fixedDeltaMs: number;
  maxSubSteps: number;

  // Presentation
  debugMode: boolean;
}

export const ELIMINATE_CONFIG: EliminateConfig = {
  canvasWidth: 1280,
  canvasHeight: 720,
  arenaCenterX: 640,
  arenaCenterY: 360,
  arenaRadius: 346,

  // Noticeably smaller escape gap: reduced from 54° to 34° (~0.593 rad)
  gapAngleWidthRad: (34 * Math.PI) / 180,
  // Rotates at ~0.016 rad/step
  rotationSpeedRad: 0.016,
  boundaryThickness: 12,

  ballRadius: 19,
  countryCount: 12,
  minSpeed: 4.8,
  maxSpeed: 11.2,
  escapeThreshold: 346 + 19 + 15, // 380px from center

  // Health & Combat
  maxHealth: 100,
  duplicateHealth: 60,
  baseCollisionDamage: 4,
  damageMultiplier: 2.2,
  collisionDamageCooldownMs: 220,

  // Collectible Abilities
  healthBoostAmount: 35,
  damageBoostMultiplier: 2.0,
  damageBoostDurationMs: 7000,
  shieldDurationMs: 6000,
  maxBallsPerCountry: 3,
  maxGlobalBalls: 24,
  collectibleMinSpawnIntervalMs: 4000,
  collectibleMaxSpawnIntervalMs: 9000,
  collectibleLifetimeMs: 11000,
  collectibleMaxSimultaneous: 3,

  countdownDurationMs: 3000,
  winnerAnnouncementDurationMs: 5000,
  resultsDurationMs: 4000,
  resetDelayMs: 1500,

  targetFps: 60,
  fixedDeltaMs: 1000 / 60,
  maxSubSteps: 4,

  debugMode: false,
};
