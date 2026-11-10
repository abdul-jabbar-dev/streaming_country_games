/**
 * Quality Profiles Configuration
 * Defines visual fidelity presets for low-end, integrated GPU, and high-end environments
 */

export type QualityProfileName = 'LOW' | 'BALANCED' | 'HIGH';
export type QualityMode = 'AUTO' | 'LOW' | 'BALANCED' | 'HIGH';

export interface QualityProfile {
  name: QualityProfileName;
  canvasWidth: number;
  canvasHeight: number;
  arenaCenterX: number;
  arenaCenterY: number;
  arenaRadius: number;
  dprCap: number;
  renderShadows: boolean;
  shadowBlur: number;
  maxParticles: number;
  sparkCount: number;
  burstCount: number;
  enableGlow: boolean;
  targetFps: number;
}

export const QUALITY_PROFILES: Record<QualityProfileName, QualityProfile> = {
  // Low-end CPU-only / Budget VPS / Software rendering
  LOW: {
    name: 'LOW',
    canvasWidth: 960,
    canvasHeight: 540,
    arenaCenterX: 480,
    arenaCenterY: 270,
    arenaRadius: 260,
    dprCap: 1.0,
    renderShadows: false,
    shadowBlur: 0,
    maxParticles: 40,
    sparkCount: 3,
    burstCount: 8,
    enableGlow: false,
    targetFps: 30,
  },

  // Balanced: Integrated GPU (Intel UHD 630) / Standard 720p broadcast
  BALANCED: {
    name: 'BALANCED',
    canvasWidth: 1280,
    canvasHeight: 720,
    arenaCenterX: 640,
    arenaCenterY: 360,
    arenaRadius: 346,
    dprCap: 1.0,
    renderShadows: true,
    shadowBlur: 0, // Zero Gaussian blur; uses crisp vector strokes
    maxParticles: 120,
    sparkCount: 6,
    burstCount: 18,
    enableGlow: false,
    targetFps: 60,
  },

  // High: Dedicated GPU / Modern Desktop 1080p
  HIGH: {
    name: 'HIGH',
    canvasWidth: 1920,
    canvasHeight: 1080,
    arenaCenterX: 960,
    arenaCenterY: 540,
    arenaRadius: 520,
    dprCap: 2.0,
    renderShadows: true,
    shadowBlur: 4,
    maxParticles: 250,
    sparkCount: 10,
    burstCount: 26,
    enableGlow: true,
    targetFps: 60,
  },
};
