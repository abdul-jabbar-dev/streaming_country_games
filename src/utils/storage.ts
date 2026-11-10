/**
 * Lightweight Browser Persistence Helper
 * Handles country selections and mode preferences per game
 */

export interface SavedGamePreferences {
  selectedCountryIds: string[];
  lastMode: 'ONCE' | 'TIMED' | 'INFINITE';
  timedMinutes: number;
}

const STORAGE_PREFIX = 'cba_pref_';

export function getSavedPreferences(gameType: 'battle' | 'eliminate' | 'line', defaultCountryIds: string[]): SavedGamePreferences {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      selectedCountryIds: defaultCountryIds,
      lastMode: 'INFINITE',
      timedMinutes: 30,
    };
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${gameType}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.selectedCountryIds) && parsed.selectedCountryIds.length >= 2) {
        return {
          selectedCountryIds: parsed.selectedCountryIds,
          lastMode: parsed.lastMode || 'INFINITE',
          timedMinutes: parsed.timedMinutes || 30,
        };
      }
    }
  } catch {
    // Ignore storage parse errors
  }

  return {
    selectedCountryIds: defaultCountryIds,
    lastMode: 'INFINITE',
    timedMinutes: 30,
  };
}

export function saveGamePreferences(gameType: 'battle' | 'eliminate' | 'line', prefs: SavedGamePreferences): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${gameType}`, JSON.stringify(prefs));
  } catch {
    // Quota or privacy mode error ignored
  }
}
