/**
 * Configuration for Game 3: Country Line Battle Arena
 * Autonomous line-tether survival physics arena with Collectible String Abilities
 */

export interface LineBattleConfig {
  // Dimensions
  canvasWidth: number;
  canvasHeight: number;
  arenaCenterX: number;
  arenaCenterY: number;
  arenaRadius: number;
  arenaSegments: number;

  // Ball & Movement Dynamics
  ballRadius: number;
  countryCount: number;
  minDesiredSpeed: number;
  maxSpeed: number;
  steeringStrength: number;
  steeringIntervalMs: number;
  ballRestitution: number;
  ballFriction: number;
  ballFrictionAir: number;
  ballDensity: number;
  wallRestitution: number;

  // Connection Line Rules
  maxLinesPerCountry: number;
  boundaryHitCooldownMs: number;
  initialLinesPerCountry: number;
  lineCutFlashDurationMs: number;
  lineThickness: number;

  // String Abilities & Collectibles
  addStringsCount: number;
  removeStringsCount: number;
  stringShieldDurationMs: number;
  collectibleMinSpawnIntervalMs: number;
  collectibleMaxSpawnIntervalMs: number;
  collectibleLifetimeMs: number;
  collectibleMaxSimultaneous: number;

  // Round Lifecycle (ms)
  countdownDurationMs: number;
  winnerAnnouncementDurationMs: number;
  resultsDurationMs: number;
  resetDelayMs: number;

  // Simulation Timestep
  targetFps: number;
  fixedDeltaMs: number;
  maxSubSteps: number;

  // Visuals & Diagnostics
  debugMode: boolean;
  broadcastMode: boolean;
}

export const LINE_BATTLE_CONFIG: LineBattleConfig = {
  canvasWidth: 1280,
  canvasHeight: 720,
  arenaCenterX: 640,
  arenaCenterY: 360,
  arenaRadius: 346,
  arenaSegments: 32,

  ballRadius: 19,
  countryCount: 12,
  minDesiredSpeed: 3.4,
  maxSpeed: 8.8,
  steeringStrength: 0.0008,
  steeringIntervalMs: 250,
  ballRestitution: 1.0,
  ballFriction: 0,
  ballFrictionAir: 0,
  ballDensity: 0.002,
  wallRestitution: 1.0,

  maxLinesPerCountry: 25,
  boundaryHitCooldownMs: 280,
  initialLinesPerCountry: 6,
  lineCutFlashDurationMs: 350,
  lineThickness: 2.5,

  // String Abilities
  addStringsCount: 5,
  removeStringsCount: 2,
  stringShieldDurationMs: 7000,
  collectibleMinSpawnIntervalMs: 4000,
  collectibleMaxSpawnIntervalMs: 9000,
  collectibleLifetimeMs: 11000,
  collectibleMaxSimultaneous: 3,

  countdownDurationMs: 3000,
  winnerAnnouncementDurationMs: 4000,
  resultsDurationMs: 3000,
  resetDelayMs: 1500,

  targetFps: 60,
  fixedDeltaMs: 16.666,
  maxSubSteps: 4,

  debugMode: false,
  broadcastMode: false,
};
