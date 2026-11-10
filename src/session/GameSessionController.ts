/**
 * Shared Game Session Controller
 * Orchestrates game selection, execution modes (Once, Timed, Infinite),
 * country lists, and session lifecycles with single-game concurrency guarantee
 * and adaptive cross-device performance profiles.
 */

import type { CountryData } from '../config/countries.ts';
import { COUNTRIES, getCountriesByIds } from '../config/countries.ts';
import { getSavedPreferences, saveGamePreferences } from '../utils/storage.ts';
import { GameEngine } from '../game/GameEngine.ts';
import { EliminateEngine } from '../eliminate/EliminateEngine.ts';
import { LineBattleEngine } from '../linebattle/LineBattleEngine.ts';
import { Renderer } from '../rendering/Renderer.ts';
import { CONFIG } from '../config/game.config.ts';
import type { BattleResults, EliminationEvent } from '../game/GameState.ts';
import { AdaptivePerformanceManager } from '../rendering/AdaptivePerformanceManager.ts';
import type { PerformanceDiagnosticsData } from '../rendering/AdaptivePerformanceManager.ts';
import type { QualityMode, QualityProfile } from '../rendering/QualityProfiles.ts';
import { logger } from '../utils/logger.ts';

export type GameType = 'battle' | 'eliminate' | 'line';
export type ExecutionMode = 'ONCE' | 'TIMED' | 'INFINITE';
export type SessionState = 'IDLE' | 'RUNNING' | 'SESSION_FINISHED';

export interface SessionMetrics {
  gameType: GameType;
  mode: ExecutionMode;
  state: SessionState;
  roundNumber: number;
  totalRoundsCompleted: number;
  sessionElapsedMs: number;
  sessionRemainingMs: number | null; // null if INFINITE or ONCE
  formattedTime: string;
  isSessionExpired: boolean;
  winsByCountry: Map<string, { country: CountryData; wins: number }>;
  currentProfileName: string;
  qualityMode: QualityMode;
}

export class GameSessionController {
  public activeGameType: GameType = 'battle';
  public executionMode: ExecutionMode = 'INFINITE';
  public sessionState: SessionState = 'IDLE';
  public timedMinutes: number = 30;

  public adaptivePerf: AdaptivePerformanceManager;

  // Active game engine & renderer instances (Only ONE active at any time)
  private battleEngine: GameEngine | null = null;
  private renderer: Renderer | null = null;
  private eliminateEngine: EliminateEngine | null = null;
  private lineEngine: LineBattleEngine | null = null;

  // Session Timing
  private sessionStartTime: number = 0;
  private totalRoundsCompleted: number = 0;
  private winsByCountry = new Map<string, { country: CountryData; wins: number }>();

  // Selected Countries per game
  private selectedCountries: Map<GameType, CountryData[]> = new Map();

  // Callbacks
  public onMetricsUpdate?: (metrics: SessionMetrics) => void;
  public onStateChange?: (state: string, countdownVal?: number) => void;
  public onElimination?: (event: EliminationEvent) => void;
  public onRoundEnd?: (results: BattleResults) => void;
  public onProfileChanged?: (profile: QualityProfile) => void;

  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.adaptivePerf = new AdaptivePerformanceManager(CONFIG.qualityMode, CONFIG.initialQualityProfile);

    this.adaptivePerf.onProfileChanged = (profile) => {
      this.renderer?.applyProfile(profile);
      this.onProfileChanged?.(profile);
    };

    this.loadSavedSelections();
  }

  private loadSavedSelections(): void {
    const defaultIds = COUNTRIES.slice(0, 12).map((c) => c.id);

    // Battle preferences
    const battlePref = getSavedPreferences('battle', defaultIds);
    this.selectedCountries.set('battle', getCountriesByIds(battlePref.selectedCountryIds));
    this.executionMode = battlePref.lastMode;
    this.timedMinutes = battlePref.timedMinutes;

    // Eliminate preferences
    const elimPref = getSavedPreferences('eliminate', defaultIds);
    this.selectedCountries.set('eliminate', getCountriesByIds(elimPref.selectedCountryIds));

    // Line Battle preferences
    const linePref = getSavedPreferences('line', defaultIds);
    this.selectedCountries.set('line', getCountriesByIds(linePref.selectedCountryIds));
  }

  public getSelectedCountries(gameType: GameType): CountryData[] {
    return this.selectedCountries.get(gameType) || COUNTRIES.slice(0, 12);
  }

  public setSelectedCountries(gameType: GameType, countries: CountryData[]): void {
    if (countries.length < 2) {
      throw new Error('Must select at least 2 countries');
    }
    this.selectedCountries.set(gameType, countries);
    saveGamePreferences(gameType, {
      selectedCountryIds: countries.map((c) => c.id),
      lastMode: this.executionMode,
      timedMinutes: this.timedMinutes,
    });
  }

  public setQualityMode(mode: QualityMode): void {
    this.adaptivePerf.setMode(mode);
  }

  /**
   * Switches game type cleanly, terminating any currently running session
   */
  public selectGame(gameType: GameType): void {
    if (this.sessionState === 'RUNNING') {
      this.stopSession();
    }
    this.activeGameType = gameType;
    logger.info(`Switched active game to: ${gameType}`);
  }

  /**
   * Starts a new game session with the chosen execution mode
   */
  public startSession(mode: ExecutionMode, customMinutes?: number): void {
    this.stopActiveEngine();

    this.executionMode = mode;
    if (customMinutes && customMinutes > 0) {
      this.timedMinutes = customMinutes;
    }

    this.sessionState = 'RUNNING';
    this.sessionStartTime = performance.now();
    this.totalRoundsCompleted = 0;
    this.winsByCountry.clear();

    // Save preferences
    saveGamePreferences(this.activeGameType, {
      selectedCountryIds: this.getSelectedCountries(this.activeGameType).map((c) => c.id),
      lastMode: this.executionMode,
      timedMinutes: this.timedMinutes,
    });

    const participants = this.getSelectedCountries(this.activeGameType);

    if (this.activeGameType === 'battle') {
      this.initBattleEngine(participants);
    } else if (this.activeGameType === 'eliminate') {
      this.initEliminateEngine(participants);
    } else {
      this.initLineBattleEngine(participants);
    }

    logger.info(`Started ${this.activeGameType} session in mode: ${mode}`);
  }

  private initBattleEngine(participants: CountryData[]): void {
    this.battleEngine = new GameEngine(
      CONFIG,
      () => {
        if (this.renderer) {
          const diag = CONFIG.debugMode ? this.adaptivePerf.getDiagnostics() : undefined;
          this.renderer.render(diag);
        }
      },
      this.adaptivePerf
    );

    this.renderer = new Renderer(
      this.canvas,
      CONFIG,
      this.battleEngine.battleManager,
      this.adaptivePerf.currentProfile
    );

    const bm = this.battleEngine.battleManager;
    bm.setParticipants(participants);
    bm.autoLoop = this.executionMode !== 'ONCE';

    bm.onStateChange = (state, countdownVal) => {
      this.onStateChange?.(state, countdownVal);
    };

    bm.onElimination = (event) => {
      this.onElimination?.(event);
    };

    bm.onRoundEnd = (results) => {
      this.handleRoundFinished(results);
    };

    this.battleEngine.start();
  }

  private initEliminateEngine(participants: CountryData[]): void {
    this.eliminateEngine = new EliminateEngine(this.canvas, undefined, this.adaptivePerf);
    const em = this.eliminateEngine.manager;
    em.setParticipants(participants);
    em.autoLoop = this.executionMode !== 'ONCE';

    em.onStateChange = (state, countdownVal) => {
      this.onStateChange?.(state, countdownVal);
    };

    em.onElimination = (event) => {
      this.onElimination?.(event);
    };

    em.onRoundEnd = (results) => {
      this.handleRoundFinished(results);
    };

    this.eliminateEngine.start();
  }

  private initLineBattleEngine(participants: CountryData[]): void {
    this.lineEngine = new LineBattleEngine(this.canvas, undefined, this.adaptivePerf);
    const lm = this.lineEngine.manager;
    lm.setParticipants(participants);
    lm.autoLoop = this.executionMode !== 'ONCE';

    lm.onStateChange = (state, countdownVal) => {
      this.onStateChange?.(state, countdownVal);
    };

    lm.onElimination = (event) => {
      this.onElimination?.(event);
    };

    lm.onRoundEnd = (results) => {
      this.handleRoundFinished(results);
    };

    this.lineEngine.start();
  }

  private handleRoundFinished(results: BattleResults): void {
    this.totalRoundsCompleted++;

    if (results.winner) {
      const existing = this.winsByCountry.get(results.winner.id) || { country: results.winner, wins: 0 };
      existing.wins++;
      this.winsByCountry.set(results.winner.id, existing);
    }

    this.onRoundEnd?.(results);

    // Check execution mode termination rules
    if (this.executionMode === 'ONCE') {
      this.finishSession();
      if (this.battleEngine) this.battleEngine.battleManager.autoLoop = false;
      if (this.eliminateEngine) this.eliminateEngine.manager.autoLoop = false;
      if (this.lineEngine) this.lineEngine.manager.autoLoop = false;
      return;
    }

    if (this.executionMode === 'TIMED') {
      const elapsedMs = performance.now() - this.sessionStartTime;
      const targetDurationMs = this.timedMinutes * 60 * 1000;

      if (elapsedMs >= targetDurationMs) {
        // Timed session expired: gracefully finish
        logger.info(`Timed session (${this.timedMinutes}m) reached. Gracefully stopping.`);
        this.finishSession();
        if (this.battleEngine) this.battleEngine.battleManager.autoLoop = false;
        if (this.eliminateEngine) this.eliminateEngine.manager.autoLoop = false;
        if (this.lineEngine) this.lineEngine.manager.autoLoop = false;
      }
    }
  }

  public finishSession(): void {
    this.sessionState = 'SESSION_FINISHED';
    logger.info('Game session finished.');
  }

  public stopSession(): void {
    this.stopActiveEngine();
    this.sessionState = 'IDLE';
    logger.info('Game session stopped.');
  }

  private stopActiveEngine(): void {
    if (this.battleEngine) {
      this.battleEngine.stop();
      this.battleEngine = null;
    }
    this.renderer = null;

    if (this.eliminateEngine) {
      this.eliminateEngine.stop();
      this.eliminateEngine = null;
    }

    if (this.lineEngine) {
      this.lineEngine.stop();
      this.lineEngine = null;
    }
  }

  public getActiveManager(): { roundNumber: number; balls: { isAlive: boolean }[]; getLeaderboard: () => any[] } | null {
    if (this.activeGameType === 'battle' && this.battleEngine) {
      return this.battleEngine.battleManager;
    }
    if (this.activeGameType === 'eliminate' && this.eliminateEngine) {
      return this.eliminateEngine.manager;
    }
    if (this.activeGameType === 'line' && this.lineEngine) {
      return this.lineEngine.manager;
    }
    return null;
  }

  public getDiagnosticsData(): PerformanceDiagnosticsData {
    return this.adaptivePerf.getDiagnostics();
  }

  public exportReport(): string {
    return this.adaptivePerf.exportReport();
  }

  public getMetrics(): SessionMetrics {
    const now = performance.now();
    const elapsedMs = this.sessionState === 'RUNNING' || this.sessionState === 'SESSION_FINISHED'
      ? Math.max(0, now - this.sessionStartTime)
      : 0;

    let remainingMs: number | null = null;
    let formattedTime = '00:00';
    let isExpired = false;

    if (this.executionMode === 'TIMED') {
      const totalAllowedMs = this.timedMinutes * 60 * 1000;
      remainingMs = Math.max(0, totalAllowedMs - elapsedMs);
      isExpired = remainingMs <= 0;
      formattedTime = this.formatDuration(remainingMs);
    } else {
      formattedTime = this.formatDuration(elapsedMs);
    }

    const manager = this.getActiveManager();
    const roundNumber = manager ? manager.roundNumber : this.totalRoundsCompleted;

    return {
      gameType: this.activeGameType,
      mode: this.executionMode,
      state: this.sessionState,
      roundNumber,
      totalRoundsCompleted: this.totalRoundsCompleted,
      sessionElapsedMs: elapsedMs,
      sessionRemainingMs: remainingMs,
      formattedTime,
      isSessionExpired: isExpired,
      winsByCountry: new Map(this.winsByCountry),
      currentProfileName: this.adaptivePerf.currentProfile.name,
      qualityMode: this.adaptivePerf.qualityMode,
    };
  }

  private formatDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  public destroy(): void {
    this.stopActiveEngine();
  }
}
