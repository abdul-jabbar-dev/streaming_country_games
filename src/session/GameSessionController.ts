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
import { DEFAULT_GAME_SPEED, validateSpeedMultiplier } from '../config/GameSpeed.ts';
import { logger } from '../utils/logger.ts';

export type GameType = 'battle' | 'eliminate' | 'line';
export type ExecutionMode = 'ONCE' | 'TIMED' | 'INFINITE';
export type SessionState = 'IDLE' | 'RUNNING' | 'SESSION_FINISHED';

export interface RoundHistoryEntry {
  roundNumber: number;
  gameType: GameType;
  winner: CountryData | null;
  durationSeconds: number;
  timestamp: number;
}

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
  recentResults: RoundHistoryEntry[];
  currentProfileName: string;
  qualityMode: QualityMode;
  gameSpeed: number;
}

export class GameSessionController {
  public activeGameType: GameType = 'battle';
  public executionMode: ExecutionMode = 'INFINITE';
  public sessionState: SessionState = 'IDLE';
  public timedMinutes: number = 30;
  public gameSpeed: number = DEFAULT_GAME_SPEED;

  public adaptivePerf: AdaptivePerformanceManager;

  // Active game engine & renderer instances (Only ONE active at any time)
  private battleEngine: GameEngine | null = null;
  private renderer: Renderer | null = null;
  private eliminateEngine: EliminateEngine | null = null;
  private lineEngine: LineBattleEngine | null = null;

  // Session Generation & Lifecycle Guard
  private currentSessionId: number = 0;
  private finalSessionElapsedMs: number = 0;
  public lastRoundResults: BattleResults | null = null;

  // Session Timing
  private sessionStartTime: number = 0;
  private lastSpeedUpdateTime: number = 0;
  private simulatedElapsedMs: number = 0;
  private totalRoundsCompleted: number = 0;
  private winsByCountry = new Map<string, { country: CountryData; wins: number }>();
  public recentResults: RoundHistoryEntry[] = [];

  // Selected Countries per game
  private selectedCountries: Map<GameType, CountryData[]> = new Map();

  // Callbacks
  public onMetricsUpdate?: (metrics: SessionMetrics) => void;
  public onStateChange?: (state: string, countdownVal?: number) => void;
  public onElimination?: (event: EliminationEvent) => void;
  public onRoundEnd?: (results: BattleResults) => void;
  public onSessionFinish?: (metrics: SessionMetrics) => void;
  public onProfileChanged?: (profile: QualityProfile) => void;

  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.adaptivePerf = new AdaptivePerformanceManager(CONFIG.qualityMode, CONFIG.initialQualityProfile);

    this.adaptivePerf.onProfileChanged = (profile) => {
      this.renderer?.applyProfile(profile);
      this.eliminateEngine?.renderer.applyProfile(profile);
      this.lineEngine?.renderer.applyProfile(profile);
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

    // Load persisted simulation speed (default 1x)
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const savedSpeed = localStorage.getItem('cba_game_speed');
        if (savedSpeed !== null) {
          const parsed = parseFloat(savedSpeed);
          if (!isNaN(parsed) && isFinite(parsed)) {
            this.gameSpeed = validateSpeedMultiplier(parsed);
          }
        }
      } catch {}
    }
  }

  public setGameSpeed(speed: number): void {
    const validated = validateSpeedMultiplier(speed);

    // Accumulate simulated elapsed time up to this speed change point
    if (this.sessionState === 'RUNNING' && this.lastSpeedUpdateTime > 0) {
      const now = performance.now();
      this.simulatedElapsedMs += Math.max(0, now - this.lastSpeedUpdateTime) * this.gameSpeed;
      this.lastSpeedUpdateTime = now;
    }

    this.gameSpeed = validated;

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('cba_game_speed', validated.toString());
      } catch {}
    }

    // Propagate dynamically to running engines
    if (this.battleEngine) {
      this.battleEngine.setSpeedMultiplier(validated);
    }
    if (this.eliminateEngine) {
      this.eliminateEngine.setSpeedMultiplier(validated);
    }
    if (this.lineEngine) {
      this.lineEngine.setSpeedMultiplier(validated);
    }

    this.onMetricsUpdate?.(this.getMetrics());
    logger.info(`Game speed set to: ${validated}x`);
  }

  public getGameSpeed(): number {
    return this.gameSpeed;
  }

  /**
   * Calculates simulated session elapsed time in milliseconds,
   * accounting for the speed multiplier and any dynamic speed switches.
   */
  public getSimulatedElapsedMs(): number {
    if (this.sessionStartTime === 0) return 0;
    const now = performance.now();
    if (this.simulatedElapsedMs === 0) {
      return Math.max(0, (now - this.sessionStartTime) * this.gameSpeed);
    }
    const recent = this.lastSpeedUpdateTime > 0
      ? Math.max(0, now - this.lastSpeedUpdateTime) * this.gameSpeed
      : 0;
    return this.simulatedElapsedMs + recent;
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

    this.currentSessionId++;
    const sessionId = this.currentSessionId;

    this.executionMode = mode;
    if (customMinutes && customMinutes > 0) {
      this.timedMinutes = customMinutes;
    }

    this.sessionState = 'RUNNING';
    this.sessionStartTime = performance.now();
    this.lastSpeedUpdateTime = this.sessionStartTime;
    this.simulatedElapsedMs = 0;
    this.finalSessionElapsedMs = 0;
    this.totalRoundsCompleted = 0;
    this.winsByCountry.clear();
    this.lastRoundResults = null;

    // Save preferences
    saveGamePreferences(this.activeGameType, {
      selectedCountryIds: this.getSelectedCountries(this.activeGameType).map((c) => c.id),
      lastMode: this.executionMode,
      timedMinutes: this.timedMinutes,
    });

    const participants = this.getSelectedCountries(this.activeGameType);

    try {
      if (this.activeGameType === 'battle') {
        this.initBattleEngine(participants, sessionId);
      } else if (this.activeGameType === 'eliminate') {
        this.initEliminateEngine(participants, sessionId);
      } else {
        this.initLineBattleEngine(participants, sessionId);
      }
    } catch (err) {
      logger.error(`Failed to initialize ${this.activeGameType} session #${sessionId}:`, err);
      this.stopSession();
      throw err;
    }

    logger.info(`Started ${this.activeGameType} session #${sessionId} in mode: ${mode}`);
  }

  private initBattleEngine(participants: CountryData[], sessionId: number): void {
    this.battleEngine = new GameEngine(
      CONFIG,
      () => {
        if (this.renderer) {
          const diag = CONFIG.debugMode ? this.adaptivePerf.getDiagnostics() : undefined;
          this.renderer.render(diag);
        }
      },
      this.adaptivePerf,
      this.gameSpeed
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
      if (this.currentSessionId !== sessionId) return;
      this.onStateChange?.(state, countdownVal);
    };

    bm.onElimination = (event) => {
      if (this.currentSessionId !== sessionId) return;
      this.onElimination?.(event);
    };

    bm.onRoundEnd = (results) => {
      if (this.currentSessionId !== sessionId) return;
      this.handleRoundFinished(results);
    };

    bm.onComplete = () => {
      if (this.currentSessionId !== sessionId) return;
      this.handleRoundSequenceComplete();
    };

    this.battleEngine.start();
  }

  private initEliminateEngine(participants: CountryData[], sessionId: number): void {
    this.eliminateEngine = new EliminateEngine(this.canvas, undefined, this.adaptivePerf, this.gameSpeed);
    const em = this.eliminateEngine.manager;
    em.setParticipants(participants);
    em.autoLoop = this.executionMode !== 'ONCE';

    em.onStateChange = (state, countdownVal) => {
      if (this.currentSessionId !== sessionId) return;
      this.onStateChange?.(state, countdownVal);
    };

    em.onElimination = (event) => {
      if (this.currentSessionId !== sessionId) return;
      this.onElimination?.(event);
    };

    em.onRoundEnd = (results) => {
      if (this.currentSessionId !== sessionId) return;
      this.handleRoundFinished(results);
    };

    em.onComplete = () => {
      if (this.currentSessionId !== sessionId) return;
      this.handleRoundSequenceComplete();
    };

    this.eliminateEngine.start();
  }

  private initLineBattleEngine(participants: CountryData[], sessionId: number): void {
    this.lineEngine = new LineBattleEngine(this.canvas, undefined, this.adaptivePerf, this.gameSpeed);
    const lm = this.lineEngine.manager;
    lm.setParticipants(participants);
    lm.autoLoop = this.executionMode !== 'ONCE';

    lm.onStateChange = (state, countdownVal) => {
      if (this.currentSessionId !== sessionId) return;
      this.onStateChange?.(state, countdownVal);
    };

    lm.onElimination = (event) => {
      if (this.currentSessionId !== sessionId) return;
      this.onElimination?.(event);
    };

    lm.onRoundEnd = (results) => {
      if (this.currentSessionId !== sessionId) return;
      this.handleRoundFinished(results);
    };

    lm.onComplete = () => {
      if (this.currentSessionId !== sessionId) return;
      this.handleRoundSequenceComplete();
    };

    this.lineEngine.start();
  }

  private handleRoundFinished(results: BattleResults): void {
    this.totalRoundsCompleted++;
    this.lastRoundResults = results;

    if (results.winner) {
      const existing = this.winsByCountry.get(results.winner.id) || { country: results.winner, wins: 0 };
      existing.wins++;
      this.winsByCountry.set(results.winner.id, existing);
    }

    this.recentResults.unshift({
      roundNumber: results.roundNumber,
      gameType: this.activeGameType,
      winner: results.winner,
      durationSeconds: results.durationSeconds,
      timestamp: Date.now(),
    });
    if (this.recentResults.length > 10) {
      this.recentResults.pop();
    }

    this.onRoundEnd?.(results);

    // Check execution mode termination rules
    if (this.executionMode === 'ONCE') {
      this.finalSessionElapsedMs = this.getSimulatedElapsedMs();
      this.finishSession();
      if (this.battleEngine) this.battleEngine.battleManager.autoLoop = false;
      if (this.eliminateEngine) this.eliminateEngine.manager.autoLoop = false;
      if (this.lineEngine) this.lineEngine.manager.autoLoop = false;
      return;
    }

    if (this.executionMode === 'TIMED') {
      const simulatedElapsedMs = this.getSimulatedElapsedMs();
      const targetDurationMs = this.timedMinutes * 60 * 1000;

      if (simulatedElapsedMs >= targetDurationMs) {
        // Timed session expired: gracefully finish after presenting results
        logger.info(`Timed session (${this.timedMinutes}m) reached. Gracefully stopping after results presentation.`);
        this.finalSessionElapsedMs = simulatedElapsedMs;
        this.finishSession();
        if (this.battleEngine) this.battleEngine.battleManager.autoLoop = false;
        if (this.eliminateEngine) this.eliminateEngine.manager.autoLoop = false;
        if (this.lineEngine) this.lineEngine.manager.autoLoop = false;
      }
    }
  }

  /**
   * Called when an engine completes its full post-round presentation (winner + results + reset)
   * while autoLoop is false (e.g. in ONCE mode or after TIMED expiry).
   */
  private handleRoundSequenceComplete(): void {
    if (this.sessionState === 'SESSION_FINISHED') {
      logger.info('Session round sequence completed. Gracefully shutting down active engine and releasing resources.');
      this.stopActiveEngine();
      this.onSessionFinish?.(this.getMetrics());
      this.onMetricsUpdate?.(this.getMetrics());
    }
  }

  public finishSession(): void {
    this.sessionState = 'SESSION_FINISHED';
    if (this.finalSessionElapsedMs === 0 && this.sessionStartTime > 0) {
      this.finalSessionElapsedMs = this.getSimulatedElapsedMs();
    }
    logger.info('Game session finished.');
  }

  public stopSession(): void {
    this.currentSessionId++;
    this.stopActiveEngine();
    this.sessionState = 'IDLE';
    this.finalSessionElapsedMs = 0;
    this.simulatedElapsedMs = 0;
    this.lastSpeedUpdateTime = 0;
    this.onMetricsUpdate?.(this.getMetrics());
    logger.info('Game session stopped.');
  }

  private stopActiveEngine(): void {
    if (this.battleEngine) {
      try {
        this.battleEngine.destroy();
      } catch (err) {
        logger.error('Error destroying battleEngine:', err);
      }
      this.battleEngine = null;
    }
    this.renderer = null;

    if (this.eliminateEngine) {
      try {
        this.eliminateEngine.destroy();
      } catch (err) {
        logger.error('Error destroying eliminateEngine:', err);
      }
      this.eliminateEngine = null;
    }

    if (this.lineEngine) {
      try {
        this.lineEngine.destroy();
      } catch (err) {
        logger.error('Error destroying lineEngine:', err);
      }
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
    const elapsedMs = this.sessionState === 'SESSION_FINISHED' && this.finalSessionElapsedMs > 0
      ? this.finalSessionElapsedMs
      : (this.sessionState === 'RUNNING' || this.sessionState === 'SESSION_FINISHED'
          ? this.getSimulatedElapsedMs()
          : 0);

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
      recentResults: [...this.recentResults],
      currentProfileName: this.adaptivePerf.currentProfile.name,
      qualityMode: this.adaptivePerf.qualityMode,
      gameSpeed: this.gameSpeed,
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
    this.currentSessionId++;
    this.stopActiveEngine();
  }
}
