/**
 * Main Application Entry Point
 * Dual Game Management System with Adaptive Performance Architecture
 */

import './style.css';
import { CONFIG } from './config/game.config.ts';
import { GameSessionController } from './session/GameSessionController.ts';
import type { GameType } from './session/GameSessionController.ts';
import type { QualityMode } from './rendering/QualityProfiles.ts';
import { CountrySelector } from './ui/CountrySelector.ts';
import { HUD } from './ui/HUD.ts';
import { BroadcastMode } from './ui/BroadcastMode.ts';
import { KeyboardShortcutManager } from './ui/KeyboardShortcutManager.ts';
import { soundSynth } from './audio/SoundSynthesizer.ts';
import { logger } from './utils/logger.ts';
import { getSpeedPresetInfo } from './config/GameSpeed.ts';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Application root element #app not found');
}

// ------------------------------
// UNIFIED APPLICATION LAYOUT
// ------------------------------
app.innerHTML = `
  <main class="game-app">
    <!-- Global Header -->
    <header class="topbar">
      <div class="brand-group">
        <div class="brand">WORLD ARENA • 3-IN-1 SURVIVAL SYSTEM</div>
        <h1 id="app-heading">Country Battle Arena</h1>
        <p id="app-subheading">Select Game, Configure Participating Nations & Choose Execution Mode</p>
      </div>

      <div class="topbar-actions">
        <button id="nav-dashboard-btn" class="action-btn" title="Game Selection Dashboard">
          🎮 GAMES DASHBOARD
        </button>
        <div class="quality-selector-group">
          <label for="quality-select" class="quality-label">PROFILE:</label>
          <select id="quality-select" class="quality-select" title="Adaptive Performance Profile">
            <option value="AUTO">AUTO (Adaptive)</option>
            <option value="LOW">LOW (540p CPU)</option>
            <option value="BALANCED">BALANCED (720p)</option>
            <option value="HIGH">HIGH (1080p)</option>
          </select>
        </div>
        <div class="audio-control-group" title="Procedural Audio & Volume">
          <button id="btn-audio-mute" class="action-btn audio-btn" title="Toggle Sound / Mute (M)">🔊</button>
          <input type="range" id="audio-volume-slider" class="volume-slider" min="0" max="1" step="0.05" value="${soundSynth.getMasterVolume()}" title="Audio Volume" />
        </div>
        <button id="btn-shortcuts-help" class="action-btn" title="Keyboard Shortcuts (?)">
          ⌨️ SHORTCUTS
        </button>
        <button id="export-diag-btn" class="action-btn" title="Export Diagnostics Report">
          📊 REPORT
        </button>
        <button id="toggle-broadcast-btn" class="action-btn" title="Toggle Broadcast Mode (B)">
          📺 BROADCAST MODE
        </button>
        <button id="toggle-debug-btn" class="action-btn" title="Toggle Diagnostics (D)">
          ⚡ DIAGNOSTICS
        </button>
        <div class="live-indicator">
          <span></span> <strong id="global-live-text">STANDBY</strong>
        </div>
      </div>
    </header>

    <!-- SECTION 1: GAME SELECTION DASHBOARD -->
    <section id="dashboard-view" class="dashboard-view">
      <div class="dashboard-intro">
        <h2>SELECT A SURVIVAL ARENA</h2>
        <p>Choose an automated country survival simulation to launch</p>
        <div class="dashboard-speed-hint">
          <span>⚡ Simulation Speed:</span>
          <strong id="dash-speed-val">1x (Normal)</strong>
          <span class="dash-speed-tip">— Configurable in pre-game controller</span>
        </div>
      </div>

      <div class="game-cards-grid">
        <!-- Card 1: Country Battle Arena -->
        <div class="game-card" id="card-battle">
          <div class="card-badge badge-battle">BATTLE ROYALE</div>
          <div class="card-icon">⚔️</div>
          <h3>Country Battle Arena</h3>
          <p>
            Circular combat colosseum. Countries collide physically, dealing impact damage proportional to collision velocity.
            Last country standing is crowned Champion.
          </p>
          <div class="card-stats">
            <span>Mode: <strong>Kinetic Combat</strong></span>
            <span id="card-battle-count">12 Countries Selected</span>
          </div>
          <button class="btn-card-launch" id="btn-open-battle">
            Open Battle Arena
          </button>
        </div>

        <!-- Card 2: Country Eliminate Arena -->
        <div class="game-card" id="card-eliminate">
          <div class="card-badge badge-eliminate">ROTATING GAP SURVIVAL</div>
          <div class="card-icon">🌀</div>
          <h3>Country Eliminate Arena</h3>
          <p>
            Hazardous arena surrounded by a continuously rotating outer wall with an open gap.
            Flags bouncing inside that exit through the gap are eliminated! Last remaining flag wins.
          </p>
          <div class="card-stats">
            <span>Mode: <strong>Rotating Gap Trap</strong></span>
            <span id="card-eliminate-count">12 Countries Selected</span>
          </div>
          <button class="btn-card-launch" id="btn-open-eliminate">
            Open Eliminate Arena
          </button>
        </div>

        <!-- Card 3: Country Line Battle Arena -->
        <div class="game-card" id="card-line">
          <div class="card-badge badge-line">LINE TETHER SURVIVAL</div>
          <div class="card-icon">⚡</div>
          <h3>Country Line Battle Arena</h3>
          <p>
            Autonomous physics survival arena. Every boundary collision anchors a dynamic tether line to your flag.
            Opponents cut your lines by crossing them! Zero remaining lines = ELIMINATED!
          </p>
          <div class="card-stats">
            <span>Mode: <strong>Line Cutting & Tethers</strong></span>
            <span id="card-line-count">12 Countries Selected</span>
          </div>
          <button class="btn-card-launch" id="btn-open-line">
            Open Line Arena
          </button>
        </div>
      </div>
    </section>

    <!-- SECTION 2: IN-GAME ARENA & SESSION CONTROLS -->
    <section id="gameplay-view" class="gameplay-view hidden">
      <!-- Session Control Toolbar -->
      <div class="session-toolbar">
        <div class="session-left-controls">
          <button id="toolbar-back-btn" class="btn-tool btn-back" title="Return to Game Selection">
            ← Back to Games
          </button>
          <button id="toolbar-country-btn" class="btn-tool btn-country" title="Select Participating Nations">
            🏳️ Countries (<span id="selected-country-count">12</span>)
          </button>
        </div>

        <div class="session-mode-controls">
          <button id="mode-once-btn" class="btn-mode" title="Run Exactly One Round">
            ▶ Start Once
          </button>
          <button id="mode-30m-btn" class="btn-mode" title="Run Multiple Rounds for 30 Minutes">
            ⏱ 30 Min
          </button>
          <button id="mode-60m-btn" class="btn-mode" title="Run Multiple Rounds for 1 Hour">
            ⏱ 1 Hour
          </button>
          <button id="mode-infinite-btn" class="btn-mode active" title="Run Indefinitely Until Stopped">
            ♾ Infinite
          </button>
          <button id="session-stop-btn" class="btn-stop" title="Stop Active Session" disabled>
            ⏹ STOP
          </button>
        </div>
      </div>

      <!-- Pre-Game Simulation Speed Controller Toolbar -->
      <div class="session-speed-toolbar" id="session-speed-toolbar">
        <div class="speed-toolbar-title-wrap">
          <span>⚡ GAME SPEED:</span>
          <div class="speed-badge-wrap">
            <strong id="speed-display-val">1x</strong>
            <span id="speed-desc-val" class="speed-desc">(Normal)</span>
          </div>
        </div>

        <div class="speed-presets-group" id="speed-presets-group">
          <button type="button" class="btn-speed-preset" data-speed="0.1" title="0.1x — Slow Motion">0.1x</button>
          <button type="button" class="btn-speed-preset" data-speed="0.25" title="0.25x — Quarter Speed">0.25x</button>
          <button type="button" class="btn-speed-preset" data-speed="0.5" title="0.5x — Half Speed">0.5x</button>
          <button type="button" class="btn-speed-preset active" data-speed="1" title="1x — Normal">1x</button>
          <button type="button" class="btn-speed-preset" data-speed="1.5" title="1.5x — Fast">1.5x</button>
          <button type="button" class="btn-speed-preset" data-speed="2" title="2x — Very Fast">2x</button>
          <button type="button" class="btn-speed-preset" data-speed="3" title="3x — Maximum Speed">3x</button>
        </div>

        <div class="speed-slider-wrap">
          <input
            type="range"
            id="game-speed-slider"
            class="speed-slider"
            min="0.1"
            max="3"
            step="0.05"
            value="1"
            title="Adjust Simulation Speed Multiplier (0.1x to 3x)"
          />
        </div>
      </div>

      <!-- Live Session Status Banner -->
      <div class="session-status-banner">
        <div class="banner-item">
          <span class="banner-label">GAME</span>
          <strong id="banner-game-name" class="banner-val highlight-cyan">Battle Arena</strong>
        </div>
        <div class="banner-item">
          <span class="banner-label">EXECUTION MODE</span>
          <strong id="banner-mode-name" class="banner-val">INFINITE</strong>
        </div>
        <div class="banner-item">
          <span class="banner-label" id="banner-time-label">ELAPSED TIME</span>
          <strong id="banner-time-val" class="banner-val highlight-gold">00:00</strong>
        </div>
        <div class="banner-item">
          <span class="banner-label">SPEED</span>
          <strong id="banner-speed-val" class="banner-val highlight-gold">1x (Normal)</strong>
        </div>
        <div class="banner-item">
          <span class="banner-label">ROUNDS COMPLETED</span>
          <strong id="banner-rounds-val" class="banner-val">0</strong>
        </div>
        <div class="banner-item">
          <span class="banner-label">PROFILE</span>
          <strong id="banner-profile-val" class="banner-val highlight-cyan">BALANCED</strong>
        </div>
        <div class="banner-item">
          <span class="banner-label">STATUS</span>
          <strong id="banner-status-val" class="banner-val highlight-green">READY</strong>
        </div>
      </div>

      <!-- Main Game Arena & Sidebar Grid -->
      <div class="game-layout">
        <!-- Arena Canvas Panel -->
        <div class="arena-panel">
          <div class="arena-heading">
            <span class="arena-title" id="arena-panel-title">BATTLEGROUND</span> 
            <span id="game-status">IDLE</span>
          </div>

          <canvas
            id="game-canvas"
            width="${CONFIG.canvasWidth}"
            height="${CONFIG.canvasHeight}"
          ></canvas>

          <div class="arena-footer">
            <span id="arena-physics-desc">PHYSICS ENGINE • 60 HZ FIXED TIMESTEP</span>
            <span id="fps-counter">TARGET: 60 FPS</span>
          </div>
        </div>

        <!-- Live Leaderboard & Sidebar -->
        <aside class="sidebar">
          <div class="stat-grid">
            <div class="stat-card">
              <span>ROUND</span>
              <strong id="round-number">01</strong>
            </div>
            <div class="stat-card">
              <span>ALIVE</span>
              <strong id="country-count">12 / 12</strong>
            </div>
          </div>

          <!-- Live Kill / Elimination Feed -->
          <div class="feed-panel">
            <h3>ELIMINATION FEED</h3>
            <div id="kill-feed" class="kill-feed"></div>
          </div>

          <!-- Standings -->
          <div class="country-panel">
            <h3>LIVE STANDINGS</h3>
            <div id="country-list" class="country-list"></div>
          </div>
        </aside>
      </div>
    </section>

    <!-- Footer -->
    <footer class="bottom-footer">
      <span>COUNTRY BATTLE ARENA v3.0 • CROSS-DEVICE ADAPTIVE ENGINE</span>
      <span>PRESS 'B' FOR OBS BROADCAST VIEW • 'D' FOR DIAGNOSTICS</span>
    </footer>
  </main>
`;

// ------------------------------
// INITIALIZATION
// ------------------------------
const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) {
  throw new Error('Canvas element #game-canvas not found');
}

const sessionController = new GameSessionController(canvas);
const countrySelector = new CountrySelector();
const broadcastMode = new BroadcastMode(CONFIG.broadcastMode);
const hud = new HUD();

// View Elements
const dashboardView = document.querySelector<HTMLElement>('#dashboard-view')!;
const gameplayView = document.querySelector<HTMLElement>('#gameplay-view')!;
const appHeading = document.querySelector<HTMLElement>('#app-heading')!;
const appSubheading = document.querySelector<HTMLElement>('#app-subheading')!;
const arenaPanelTitle = document.querySelector<HTMLElement>('#arena-panel-title')!;
const globalLiveText = document.querySelector<HTMLElement>('#global-live-text')!;

// Banner Elements
const bannerGameName = document.querySelector<HTMLElement>('#banner-game-name')!;
const bannerModeName = document.querySelector<HTMLElement>('#banner-mode-name')!;
const bannerTimeLabel = document.querySelector<HTMLElement>('#banner-time-label')!;
const bannerTimeVal = document.querySelector<HTMLElement>('#banner-time-val')!;
const bannerRoundsVal = document.querySelector<HTMLElement>('#banner-rounds-val')!;
const bannerProfileVal = document.querySelector<HTMLElement>('#banner-profile-val')!;
const bannerStatusVal = document.querySelector<HTMLElement>('#banner-status-val')!;
const bannerSpeedVal = document.querySelector<HTMLElement>('#banner-speed-val');
const stopBtn = document.querySelector<HTMLButtonElement>('#session-stop-btn')!;
const selectedCountryCount = document.querySelector<HTMLElement>('#selected-country-count')!;
const qualitySelect = document.querySelector<HTMLSelectElement>('#quality-select')!;

// Pre-Game Simulation Speed Elements
const speedDisplayVal = document.querySelector<HTMLElement>('#speed-display-val');
const speedDescVal = document.querySelector<HTMLElement>('#speed-desc-val');
const gameSpeedSlider = document.querySelector<HTMLInputElement>('#game-speed-slider');
const speedPresetBtns = document.querySelectorAll<HTMLButtonElement>('.btn-speed-preset');
const arenaSpeedPill = document.querySelector<HTMLElement>('#arena-speed-pill');
const dashSpeedVal = document.querySelector<HTMLElement>('#dash-speed-val');

function updateSpeedUI(speed: number): void {
  const info = getSpeedPresetInfo(speed);
  const formattedSpeed = `${speed}x`;

  if (speedDisplayVal) {
    speedDisplayVal.textContent = formattedSpeed;
  }
  if (speedDescVal) {
    speedDescVal.textContent = info ? `(${info.label})` : '';
  }
  if (gameSpeedSlider && parseFloat(gameSpeedSlider.value) !== speed) {
    gameSpeedSlider.value = speed.toString();
  }
  speedPresetBtns.forEach((btn) => {
    const btnSpeed = parseFloat(btn.dataset.speed || '1');
    btn.classList.toggle('active', Math.abs(btnSpeed - speed) < 0.01);
  });
  if (bannerSpeedVal) {
    bannerSpeedVal.textContent = `${formattedSpeed} ${info ? `(${info.label})` : ''}`;
  }
  if (arenaSpeedPill) {
    arenaSpeedPill.textContent = `⚡ ${formattedSpeed} SPEED`;
  }
  if (dashSpeedVal) {
    dashSpeedVal.textContent = formattedSpeed;
  }
  broadcastMode.updateSpeedBadge(speed);
}

function setGameSpeed(speed: number): void {
  sessionController.setGameSpeed(speed);
  updateSpeedUI(sessionController.getGameSpeed());
}

speedPresetBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const speed = parseFloat(btn.dataset.speed || '1');
    setGameSpeed(speed);
  });
});

if (gameSpeedSlider) {
  gameSpeedSlider.addEventListener('input', (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    setGameSpeed(val);
  });
}

// Navigation & Screen Switching
function showDashboard(): void {
  dashboardView.classList.remove('hidden');
  gameplayView.classList.add('hidden');
  appHeading.textContent = 'Country Survival Arena';
  appSubheading.textContent = 'Multi-Game Management System • Select a Game Mode';
  globalLiveText.textContent = 'STANDBY';
  updateCardBadges();
  updateSpeedUI(sessionController.getGameSpeed());
}

function showGame(gameType: GameType): void {
  sessionController.selectGame(gameType);
  hud.setGameType(gameType);
  dashboardView.classList.add('hidden');
  gameplayView.classList.remove('hidden');

  const streamHeadline = document.querySelector<HTMLElement>('#stream-match-headline');

  if (gameType === 'battle') {
    appHeading.textContent = 'Country Battle Arena';
    appSubheading.textContent = 'Esports 2D Physics Battle Royale • Impact Velocity Damage';
    arenaPanelTitle.textContent = 'BATTLEGROUND ARENA';
    bannerGameName.textContent = 'Battle Arena';
    bannerGameName.className = 'banner-val highlight-cyan';
    if (streamHeadline) streamHeadline.textContent = 'WORLD ARENA • COUNTRY BATTLE ARENA';
  } else if (gameType === 'eliminate') {
    appHeading.textContent = 'Country Eliminate Arena';
    appSubheading.textContent = 'Rotating Gap Hazard Survival • Avoid Escaping the Gap';
    arenaPanelTitle.textContent = 'ROTATING GAP ARENA';
    bannerGameName.textContent = 'Eliminate Arena';
    bannerGameName.className = 'banner-val highlight-purple';
    if (streamHeadline) streamHeadline.textContent = 'WORLD ARENA • COUNTRY ELIMINATE ARENA';
  } else {
    appHeading.textContent = 'Country Line Battle Arena';
    appSubheading.textContent = 'Dynamic Line Tether Survival • Cut Opponent Lines To Eliminate';
    arenaPanelTitle.textContent = 'LINE TETHER ARENA';
    bannerGameName.textContent = 'Line Battle Arena';
    bannerGameName.className = 'banner-val highlight-gold';
    if (streamHeadline) streamHeadline.textContent = 'WORLD ARENA • COUNTRY LINE BATTLE ARENA';
  }

  updateSelectedCountryBadge();
  hud.updateStatus('IDLE');
}

function updateCardBadges(): void {
  const battleCount = sessionController.getSelectedCountries('battle').length;
  const elimCount = sessionController.getSelectedCountries('eliminate').length;
  const lineCount = sessionController.getSelectedCountries('line').length;

  const bElem = document.querySelector('#card-battle-count');
  if (bElem) bElem.textContent = `${battleCount} Countries Selected`;

  const eElem = document.querySelector('#card-eliminate-count');
  if (eElem) eElem.textContent = `${elimCount} Countries Selected`;

  const lElem = document.querySelector('#card-line-count');
  if (lElem) lElem.textContent = `${lineCount} Countries Selected`;
}

function updateSelectedCountryBadge(): void {
  const count = sessionController.getSelectedCountries(sessionController.activeGameType).length;
  selectedCountryCount.textContent = count.toString();
}

// Wire Dashboard Open Buttons
document.querySelector('#btn-open-battle')?.addEventListener('click', () => {
  showGame('battle');
});

document.querySelector('#btn-open-eliminate')?.addEventListener('click', () => {
  showGame('eliminate');
});

document.querySelector('#btn-open-line')?.addEventListener('click', () => {
  showGame('line');
});

document.querySelector('#nav-dashboard-btn')?.addEventListener('click', () => {
  if (sessionController.sessionState === 'RUNNING') {
    if (confirm('A game session is currently running. Return to dashboard and stop session?')) {
      sessionController.stopSession();
      showDashboard();
    }
  } else {
    showDashboard();
  }
});

document.querySelector('#toolbar-back-btn')?.addEventListener('click', () => {
  if (sessionController.sessionState === 'RUNNING') {
    if (confirm('Stop the active session and return to dashboard?')) {
      sessionController.stopSession();
      showDashboard();
    }
  } else {
    showDashboard();
  }
});

// Wire Quality Profile Selector
qualitySelect.value = CONFIG.qualityMode || 'AUTO';
qualitySelect.addEventListener('change', (e) => {
  const target = e.target as HTMLSelectElement;
  const mode = target.value as QualityMode;
  sessionController.setQualityMode(mode);
  updateSessionUI();
});

// Wire Export Diagnostics Button
document.querySelector('#export-diag-btn')?.addEventListener('click', () => {
  const report = sessionController.exportReport();
  console.info('[Diagnostics Export]', report);

  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(report).then(
      () => alert('Performance diagnostics report copied to clipboard!'),
      () => prompt('Copy diagnostics report:', report)
    );
  } else {
    prompt('Performance diagnostics report:', report);
  }
});

// Wire Country Selector Button
document.querySelector('#toolbar-country-btn')?.addEventListener('click', () => {
  if (sessionController.sessionState === 'RUNNING') {
    alert('Please stop the current session before modifying country selection.');
    return;
  }

  const currentGame = sessionController.activeGameType;
  const gameTitle = currentGame === 'battle'
    ? 'Country Battle Arena'
    : currentGame === 'eliminate'
    ? 'Country Eliminate Arena'
    : 'Country Line Battle Arena';
  const current = sessionController.getSelectedCountries(currentGame);

  countrySelector.open(current, gameTitle, (newSelection) => {
    sessionController.setSelectedCountries(currentGame, newSelection);
    updateSelectedCountryBadge();
    updateCardBadges();
  });
});

// Wire Execution Mode Buttons
const modeOnceBtn = document.querySelector<HTMLButtonElement>('#mode-once-btn')!;
const mode30mBtn = document.querySelector<HTMLButtonElement>('#mode-30m-btn')!;
const mode60mBtn = document.querySelector<HTMLButtonElement>('#mode-60m-btn')!;
const modeInfiniteBtn = document.querySelector<HTMLButtonElement>('#mode-infinite-btn')!;

function highlightModeBtn(btn: HTMLButtonElement): void {
  [modeOnceBtn, mode30mBtn, mode60mBtn, modeInfiniteBtn].forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
}

modeOnceBtn.addEventListener('click', () => {
  highlightModeBtn(modeOnceBtn);
  sessionController.startSession('ONCE');
  updateSessionUI();
});

mode30mBtn.addEventListener('click', () => {
  highlightModeBtn(mode30mBtn);
  sessionController.startSession('TIMED', 30);
  updateSessionUI();
});

mode60mBtn.addEventListener('click', () => {
  highlightModeBtn(mode60mBtn);
  sessionController.startSession('TIMED', 60);
  updateSessionUI();
});

modeInfiniteBtn.addEventListener('click', () => {
  highlightModeBtn(modeInfiniteBtn);
  sessionController.startSession('INFINITE');
  updateSessionUI();
});

stopBtn.addEventListener('click', () => {
  sessionController.stopSession();
  hud.updateStatus('IDLE');
  updateSessionUI();
});

// Session Controller Callbacks
sessionController.onStateChange = (state, countdownVal) => {
  hud.updateStatus(state, countdownVal);
  hud.updateMetrics();
  if (state === 'COUNTDOWN') {
    hud.resetRound();
    if (countdownVal !== undefined) {
      soundSynth.playCountdown(countdownVal);
    }
  } else if (state === 'WINNER_ANNOUNCEMENT') {
    soundSynth.playVictory();
    const activeMgr = sessionController.getActiveManager() as any;
    const winnerName = activeMgr?.winner ? activeMgr.winner.country?.name : 'DRAW';
    const winnerFlag = activeMgr?.winner ? activeMgr.winner.country?.flag : '🏆';
    broadcastMode.pushTickerNews(`👑 ${winnerFlag} ${winnerName.toUpperCase()} WON THE MATCH!`);
  }
};

sessionController.onElimination = (event) => {
  hud.addElimination(event);
  hud.updateLeaderboard();
  soundSynth.playElimination();

  const news = event.customMessage
    ? `${event.victim.flag} ${event.victim.name} ${event.customMessage}`
    : `${event.victim.flag} ${event.victim.name} eliminated by ${event.killer ? event.killer.flag + ' ' + event.killer.name : 'the arena'}`;
  broadcastMode.pushTickerNews(news);
};

sessionController.onRoundEnd = () => {
  const metrics = sessionController.getMetrics();
  hud.updateSessionStats(metrics.winsByCountry, metrics.recentResults);
  hud.updateMetrics();
  hud.updateLeaderboard();
};

sessionController.onProfileChanged = (profile) => {
  bannerProfileVal.textContent = profile.name;
};

function updateSessionUI(): void {
  const metrics = sessionController.getMetrics();
  hud.updateSessionStats(metrics.winsByCountry, metrics.recentResults);
  updateSpeedUI(metrics.gameSpeed);

  bannerModeName.textContent = metrics.mode === 'TIMED' ? `TIMED (${sessionController.timedMinutes}M)` : metrics.mode;
  bannerRoundsVal.textContent = metrics.totalRoundsCompleted.toString();
  bannerProfileVal.textContent = `${metrics.currentProfileName} [${metrics.qualityMode}]`;

  if (metrics.mode === 'TIMED') {
    bannerTimeLabel.textContent = 'SESSION REMAINING';
    bannerTimeVal.textContent = metrics.formattedTime;
    bannerTimeVal.className = metrics.isSessionExpired ? 'banner-val highlight-red' : 'banner-val highlight-gold';
  } else {
    bannerTimeLabel.textContent = 'SESSION ELAPSED';
    bannerTimeVal.textContent = metrics.formattedTime;
    bannerTimeVal.className = 'banner-val highlight-gold';
  }

  if (metrics.state === 'RUNNING') {
    stopBtn.disabled = false;
    globalLiveText.textContent = 'LIVE';
    bannerStatusVal.textContent = 'RUNNING';
    bannerStatusVal.className = 'banner-val highlight-green';

    const activeManager = sessionController.getActiveManager();
    if (activeManager) {
      hud.bindManager(activeManager);
    }
  } else if (metrics.state === 'SESSION_FINISHED') {
    stopBtn.disabled = true;
    globalLiveText.textContent = 'FINISHED';
    bannerStatusVal.textContent = 'SESSION COMPLETE';
    bannerStatusVal.className = 'banner-val highlight-gold';
  } else {
    stopBtn.disabled = true;
    globalLiveText.textContent = 'STANDBY';
    bannerStatusVal.textContent = 'READY';
    bannerStatusVal.className = 'banner-val highlight-cyan';
  }
}

// 1-Second Periodic UI Timer for Session Metrics
setInterval(() => {
  if (sessionController.sessionState === 'RUNNING') {
    updateSessionUI();
    hud.updateMetrics();
  }
}, 1000);

// Audio Volume and Mute Controls
const audioMuteBtn = document.querySelector<HTMLButtonElement>('#btn-audio-mute');
const audioSlider = document.querySelector<HTMLInputElement>('#audio-volume-slider');

function updateAudioUI(): void {
  const isMuted = soundSynth.getIsMuted();
  const volume = soundSynth.getMasterVolume();
  if (audioMuteBtn) {
    audioMuteBtn.textContent = isMuted ? '🔇' : (volume > 0.5 ? '🔊' : volume > 0 ? '🔉' : '🔇');
    audioMuteBtn.classList.toggle('muted', isMuted);
  }
  if (audioSlider) {
    audioSlider.value = isMuted ? '0' : volume.toString();
  }
}

if (audioMuteBtn) {
  audioMuteBtn.addEventListener('click', () => {
    soundSynth.toggleMute();
    updateAudioUI();
  });
}

if (audioSlider) {
  audioSlider.addEventListener('input', (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    soundSynth.setMasterVolume(val);
    updateAudioUI();
  });
}
updateAudioUI();

// Keyboard Shortcut Manager & Interactive Controller
const shortcutManager = new KeyboardShortcutManager({
  switchGameMode: (mode) => {
    showGame(mode);
  },
  setGameSpeed: (speed) => {
    setGameSpeed(speed);
  },
  startSession: (mode, minutes) => {
    if (mode === 'ONCE') {
      highlightModeBtn(modeOnceBtn);
      sessionController.startSession('ONCE');
    } else if (mode === 'TIMED') {
      const m = minutes || 30;
      highlightModeBtn(m === 60 ? mode60mBtn : mode30mBtn);
      sessionController.startSession('TIMED', m);
    } else {
      highlightModeBtn(modeInfiniteBtn);
      sessionController.startSession('INFINITE');
    }
    updateSessionUI();
  },
  stopSession: () => {
    sessionController.stopSession();
    hud.updateStatus('IDLE');
    updateSessionUI();
  },
  toggleFullscreen: () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  },
});

document.querySelector('#btn-shortcuts-help')?.addEventListener('click', () => {
  shortcutManager.toggleHelpModal(true);
});

// Broadcast Mode Button
const broadcastBtn = document.querySelector<HTMLButtonElement>('#toggle-broadcast-btn');
if (broadcastBtn) {
  broadcastBtn.addEventListener('click', () => {
    const isBroadcast = broadcastMode.toggle();
    broadcastBtn.classList.toggle('active', isBroadcast);
  });
}

const debugBtn = document.querySelector<HTMLButtonElement>('#toggle-debug-btn');
if (debugBtn) {
  debugBtn.addEventListener('click', () => {
    CONFIG.debugMode = !CONFIG.debugMode;
    logger.isDebug = CONFIG.debugMode;
    debugBtn.classList.toggle('active', CONFIG.debugMode);
  });
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === 'd' || e.key === 'D') {
    CONFIG.debugMode = !CONFIG.debugMode;
    logger.isDebug = CONFIG.debugMode;
    debugBtn?.classList.toggle('active', CONFIG.debugMode);
  }
});

// Initialize Speed Controller UI with active / restored speed
updateSpeedUI(sessionController.getGameSpeed());

// Initial View: Start at Dashboard or launch via URL parameter
const urlParams = new URLSearchParams(window.location.search);
const requestedGame = urlParams.get('game');

if (requestedGame === 'line') {
  showGame('line');
  sessionController.startSession('INFINITE');
} else if (requestedGame === 'eliminate') {
  showGame('eliminate');
  sessionController.startSession('INFINITE');
} else if (requestedGame === 'battle' || urlParams.has('broadcast') || urlParams.has('stream')) {
  showGame('battle');
  sessionController.startSession('INFINITE');
} else {
  showDashboard();
}

if (urlParams.has('broadcast') || urlParams.has('stream')) {
  if (!broadcastMode.isActive) {
    broadcastMode.toggle();
  }
}

logger.info('Triple Game Management System initialized with Adaptive Performance.');
