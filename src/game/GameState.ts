/**
 * Game State & Event Types
 * Country Flag Battle Arena
 */

import type { CountryData } from '../config/countries';

export type BattleState =
  | 'INITIALIZING'
  | 'COUNTDOWN'
  | 'BATTLE'
  | 'WINNER_ANNOUNCEMENT'
  | 'RESULTS'
  | 'RESETTING';

export interface EliminationEvent {
  victim: CountryData;
  killer?: CountryData;
  timestamp: number;
  rank: number;
  customMessage?: string;
}

export interface ParticipantScore {
  country: CountryData;
  rank: number;
  kills: number;
  damageDealt: number;
  health: number;
  isAlive: boolean;
}

export interface BattleResults {
  roundNumber: number;
  winner: CountryData | null;
  leaderboard: ParticipantScore[];
  eliminationLog: EliminationEvent[];
  durationSeconds: number;
}
