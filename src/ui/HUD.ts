/**
 * HUD & Leaderboard UI
 * Real-time esports broadcast sidebar, kill feed, and round metrics
 */

import type { EliminationEvent, ParticipantScore } from '../game/GameState.ts';
import type { CountryData } from '../config/countries.ts';
import type { RoundHistoryEntry } from '../session/GameSessionController.ts';

export interface IGameManagerLike {
  roundNumber: number;
  balls: { isAlive: boolean }[];
  getLeaderboard(): ParticipantScore[];
  winner?: { country: { name: string; flag: string } } | null;
}

export type SidebarTab = 'standings' | 'wins' | 'history';

export class HUD {
  public gameType: 'battle' | 'eliminate' | 'line' = 'battle';
  public currentTab: SidebarTab = 'standings';

  private manager: IGameManagerLike | null = null;
  private roundElem: HTMLElement | null = null;
  private statusElem: HTMLElement | null = null;
  private countryCountElem: HTMLElement | null = null;
  private leaderboardListElem: HTMLElement | null = null;
  private killFeedElem: HTMLElement | null = null;
  private tabContainerElem: HTMLElement | null = null;

  private recentKills: EliminationEvent[] = [];
  private winsByCountry: Map<string, { country: CountryData; wins: number }> = new Map();
  private recentResults: RoundHistoryEntry[] = [];

  constructor(manager?: IGameManagerLike) {
    this.roundElem = document.querySelector('#round-number');
    this.statusElem = document.querySelector('#game-status');
    this.countryCountElem = document.querySelector('#country-count');
    this.leaderboardListElem = document.querySelector('#country-list');
    this.killFeedElem = document.querySelector('#kill-feed');

    this.initTabs();

    if (manager) {
      this.bindManager(manager);
    }
  }

  private initTabs(): void {
    const countryPanel = document.querySelector('.country-panel');
    if (!countryPanel) return;

    // Check if tabs already exist
    let tabs = countryPanel.querySelector('.sidebar-tabs') as HTMLElement;
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.className = 'sidebar-tabs';
      tabs.innerHTML = `
        <button class="sidebar-tab-btn active" data-tab="standings">⚔️ Standings</button>
        <button class="sidebar-tab-btn" data-tab="wins">🏆 Wins</button>
        <button class="sidebar-tab-btn" data-tab="history">📜 History</button>
      `;

      // Replace or insert before heading
      const heading = countryPanel.querySelector('h3');
      if (heading) {
        heading.style.display = 'none'; // Replaced by tabs
      }
      countryPanel.insertBefore(tabs, this.leaderboardListElem);

      tabs.querySelectorAll('.sidebar-tab-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const target = e.currentTarget as HTMLElement;
          const tab = target.getAttribute('data-tab') as SidebarTab;
          if (tab) {
            this.setTab(tab);
          }
        });
      });
    }
    this.tabContainerElem = tabs;
  }

  public setTab(tab: SidebarTab): void {
    this.currentTab = tab;
    if (this.tabContainerElem) {
      this.tabContainerElem.querySelectorAll('.sidebar-tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
      });
    }
    this.updateLeaderboard();
  }

  public updateSessionStats(
    winsByCountry: Map<string, { country: CountryData; wins: number }>,
    recentResults: RoundHistoryEntry[]
  ): void {
    this.winsByCountry = winsByCountry;
    this.recentResults = recentResults;
    if (this.currentTab === 'wins' || this.currentTab === 'history') {
      this.updateLeaderboard();
    }
  }

  public setGameType(gameType: 'battle' | 'eliminate' | 'line'): void {
    this.gameType = gameType;
    this.updateLeaderboard();
  }

  public bindManager(manager: IGameManagerLike): void {
    this.manager = manager;
    this.updateMetrics();
    this.updateLeaderboard();
  }

  public updateStatus(state: string, countdownVal?: number): void {
    if (!this.statusElem) return;

    switch (state) {
      case 'COUNTDOWN':
        this.statusElem.textContent = `COUNTDOWN: ${countdownVal ?? 3}`;
        this.statusElem.style.color = '#00d9ff';
        break;
      case 'BATTLE':
        this.statusElem.textContent = 'GAME IN PROGRESS';
        this.statusElem.style.color = '#37e89a';
        break;
      case 'WINNER_ANNOUNCEMENT': {
        const winCountry = this.manager?.winner?.country;
        this.statusElem.textContent = winCountry
          ? `WINNER: ${winCountry.flag} ${winCountry.name.toUpperCase()}!`
          : 'WINNER DECIDED!';
        this.statusElem.style.color = '#ffd700';
        break;
      }
      case 'RESULTS':
        this.statusElem.textContent = 'FINAL STANDINGS';
        this.statusElem.style.color = '#00d9ff';
        break;
      case 'RESETTING':
        this.statusElem.textContent = 'PREPARING ARENA...';
        this.statusElem.style.color = '#8da2ba';
        break;
      case 'IDLE':
        this.statusElem.textContent = 'SESSION READY';
        this.statusElem.style.color = '#00d9ff';
        break;
      case 'SESSION_FINISHED':
        this.statusElem.textContent = 'SESSION COMPLETED';
        this.statusElem.style.color = '#ffd700';
        break;
      default:
        this.statusElem.textContent = state;
    }
  }

  public updateMetrics(): void {
    if (!this.manager) return;

    if (this.roundElem) {
      const r = this.manager.roundNumber;
      this.roundElem.textContent = r < 10 ? `0${r}` : `${r}`;
    }

    if (this.countryCountElem) {
      const alive = this.manager.balls.filter((b) => b.isAlive).length;
      const total = this.manager.balls.length;
      this.countryCountElem.textContent = `${alive} / ${total}`;
    }
  }

  public addElimination(event: EliminationEvent): void {
    this.recentKills.unshift(event);
    if (this.recentKills.length > 5) {
      this.recentKills.pop();
    }
    this.renderKillFeed();
  }

  private renderKillFeed(): void {
    if (!this.killFeedElem) return;

    this.killFeedElem.innerHTML = this.recentKills
      .map((k) => `
        <div class="kill-item">
          <span class="victim-flag">${k.victim.flag}</span>
          <span class="victim-name">${k.victim.name}</span>
          ${k.customMessage ? `<span class="kill-tag">${k.customMessage}</span>` : `
            <span class="kill-tag">OUT</span>
            ${k.killer ? `<span class="killer-by">by ${k.killer.flag} ${k.killer.iso}</span>` : ''}
          `}
        </div>
      `)
      .join('');
  }

  public updateLeaderboard(): void {
    if (!this.leaderboardListElem) return;

    if (this.currentTab === 'wins') {
      const winsList = Array.from(this.winsByCountry.values()).sort((a, b) => b.wins - a.wins);
      if (winsList.length === 0) {
        this.leaderboardListElem.innerHTML = `
          <div class="empty-state-notice">
            <span>🏆</span>
            <p>No wins recorded yet in this session</p>
          </div>
        `;
        return;
      }
      this.leaderboardListElem.innerHTML = winsList
        .map((entry, idx) => `
          <div class="country-item alive wins-rank-row">
            <span class="wins-rank-badge">#${idx + 1}</span>
            <span class="country-flag">${entry.country.flag}</span>
            <div class="country-info">
              <div class="country-row">
                <span class="country-name">${entry.country.name}</span>
                <span class="country-hp highlight-gold">${entry.wins} ${entry.wins === 1 ? 'Win' : 'Wins'}</span>
              </div>
            </div>
            <span class="kill-badge gold-badge">👑 ${entry.wins}</span>
          </div>
        `)
        .join('');
      return;
    }

    if (this.currentTab === 'history') {
      if (this.recentResults.length === 0) {
        this.leaderboardListElem.innerHTML = `
          <div class="empty-state-notice">
            <span>📜</span>
            <p>No completed rounds yet</p>
          </div>
        `;
        return;
      }
      this.leaderboardListElem.innerHTML = this.recentResults
        .map((entry) => `
          <div class="country-item history-row">
            <span class="history-round-pill">R${entry.roundNumber}</span>
            <span class="country-flag">${entry.winner ? entry.winner.flag : '🤝'}</span>
            <div class="country-info">
              <div class="country-row">
                <span class="country-name">${entry.winner ? entry.winner.name : 'Draw Match'}</span>
                <span class="country-hp">${entry.durationSeconds}s</span>
              </div>
            </div>
            <span class="history-mode-tag">${entry.gameType.toUpperCase()}</span>
          </div>
        `)
        .join('');
      return;
    }

    // Default 'standings' tab
    if (!this.manager) return;
    const leaderboard = this.manager.getLeaderboard();

    this.leaderboardListElem.innerHTML = leaderboard
      .map((item) => {
        let statusLabel = '';
        let hpPercent = 100;
        let barColor = '#00ff88';

        if (!item.isAlive) {
          statusLabel = `#${item.rank}`;
          hpPercent = 0;
          barColor = '#ff3366';
        } else if (this.gameType === 'line') {
          statusLabel = `${item.health} Lines`;
          hpPercent = Math.min(100, Math.max(12, item.health * 15));
          barColor = item.health > 2 ? '#00e5ff' : item.health > 1 ? '#ffd700' : '#ff3366';
        } else if (this.gameType === 'eliminate') {
          const hp = Math.max(0, Math.min(100, Math.round(item.health)));
          statusLabel = `${hp} HP`;
          hpPercent = hp;
          barColor = hp > 50 ? '#a855f7' : hp > 25 ? '#f59e0b' : '#ef4444';
        } else {
          // Battle Arena
          const hp = Math.max(0, Math.min(100, Math.round(item.health)));
          statusLabel = `${hp} HP`;
          hpPercent = hp;
          barColor = hp > 50 ? '#00ff88' : hp > 20 ? '#ffd700' : '#ff3366';
        }

        const badgeIcon = this.gameType === 'line' ? '✂' : '⚔';

        return `
          <div class="country-item ${item.isAlive ? 'alive' : 'eliminated'}">
            <span class="country-flag">${item.country.flag}</span>
            <div class="country-info">
              <div class="country-row">
                <span class="country-name">${item.country.name}</span>
                <span class="country-hp">${statusLabel}</span>
              </div>
              <div class="hp-track">
                <div class="hp-fill" style="width: ${hpPercent}%; background: ${barColor}"></div>
              </div>
            </div>
            ${item.kills > 0 ? `<span class="kill-badge">${item.kills} ${badgeIcon}</span>` : ''}
          </div>
        `;
      })
      .join('');
  }

  public resetRound(): void {
    this.recentKills = [];
    if (this.killFeedElem) {
      this.killFeedElem.innerHTML = '';
    }
    this.updateMetrics();
    this.updateLeaderboard();
  }
}
