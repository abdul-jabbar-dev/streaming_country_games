/**
 * Advanced Broadcast & Streaming Mode Controller
 * Delivers professional, distraction-free 16:9 OBS and live stream presentation
 * with floating stream controls, breaking news event ticker, audio toggle, and fullscreen API.
 */

import { soundSynth } from '../audio/SoundSynthesizer.ts';

export class BroadcastMode {
  private isBroadcast: boolean = false;
  private tickerElem: HTMLElement | null = null;
  private tickerEvents: string[] = [];

  constructor(initialBroadcast: boolean = false) {
    this.isBroadcast = initialBroadcast;
    this.createBroadcastOverlay();
    this.applyMode();
    this.bindKeyShortcuts();
  }

  public get isActive(): boolean {
    return this.isBroadcast;
  }

  public toggle(): boolean {
    this.isBroadcast = !this.isBroadcast;
    this.applyMode();
    return this.isBroadcast;
  }

  public pushTickerNews(message: string): void {
    this.tickerEvents.unshift(message);
    if (this.tickerEvents.length > 8) {
      this.tickerEvents.pop();
    }
    this.updateTickerDisplay();
  }

  public updateSpeedBadge(speed: number): void {
    const pill = document.querySelector<HTMLElement>('#stream-speed-pill');
    if (pill) {
      pill.textContent = `⚡ ${speed}x SPEED`;
    }
  }

  private updateTickerDisplay(): void {
    if (!this.tickerElem) return;
    const tickerTextElem = this.tickerElem.querySelector('.stream-ticker-content');
    if (tickerTextElem) {
      if (this.tickerEvents.length === 0) {
        tickerTextElem.innerHTML = `<span>⚡ 24/7 AUTONOMOUS COUNTRY SURVIVAL LEAGUE • CONTINUOUS BROADCAST • NO RESTART NEEDED</span>`;
      } else {
        const text = this.tickerEvents.map((ev) => `<span>⚡ ${ev}</span>`).join(' &nbsp;•&nbsp; ');
        tickerTextElem.innerHTML = text;
      }
    }
  }

  private createBroadcastOverlay(): void {
    if (typeof document === 'undefined') return;

    // Check if overlay already exists
    if (document.querySelector('#broadcast-stream-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'broadcast-stream-overlay';
    overlay.className = 'broadcast-stream-overlay hidden';

    overlay.innerHTML = `
      <!-- Floating Top Stream Banner -->
      <div class="stream-top-banner">
        <div class="stream-live-pill">
          <span class="stream-live-dot"></span>
          <strong>LIVE STREAM • 60 FPS</strong>
        </div>
         
        <div class="stream-match-headline" id="stream-match-headline">
          WORLD ARENA • AUTONOMOUS LEAGUE
        </div>
        <div class="stream-quick-actions">
          <button id="stream-audio-btn" class="stream-btn" title="Toggle Sound FX (M)">
            ${soundSynth.isMuted ? '🔇 MUTED' : '🔊 AUDIO'}
          </button>
          <button id="stream-fullscreen-btn" class="stream-btn" title="Toggle Fullscreen (F)">
            ⛶ FULLSCREEN
          </button>
          <button id="stream-exit-btn" class="stream-btn stream-exit" title="Exit Stream Mode (B)">
            ✕ EXIT STREAM
          </button>
        </div>
      </div>

      <!-- Bottom Broadcast News Ticker -->
      <div class="stream-ticker-bar" id="stream-ticker-bar">
        <div class="stream-ticker-badge">LIVE NEWS</div>
        <div class="stream-ticker-marquee">
          <div class="stream-ticker-content">
            <span>⚡ 24/7 AUTONOMOUS COUNTRY SURVIVAL LEAGUE • CONTINUOUS BROADCAST • NO RESTART NEEDED</span>
          </div>
        </div>
        <div class="stream-hotkey-hint">
          <span>[B] Stream</span>
          <span>[M] Mute</span>
          <span>[F] Fullscreen</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.tickerElem = overlay.querySelector('#stream-ticker-bar');

    // Wire stream actions
    const audioBtn = overlay.querySelector<HTMLButtonElement>('#stream-audio-btn');
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        const isMuted = soundSynth.toggleMute();
        audioBtn.textContent = isMuted ? '🔇 MUTED' : '🔊 AUDIO';
        audioBtn.classList.toggle('muted', isMuted);
      });
    }

    const fsBtn = overlay.querySelector<HTMLButtonElement>('#stream-fullscreen-btn');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        this.toggleFullscreen();
      });
    }

    const exitBtn = overlay.querySelector<HTMLButtonElement>('#stream-exit-btn');
    if (exitBtn) {
      exitBtn.addEventListener('click', () => {
        this.toggle();
      });
    }
  }

  public toggleFullscreen(): void {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  private applyMode(): void {
    const app = document.querySelector('#app');
    const overlay = document.querySelector('#broadcast-stream-overlay');
    const globalToggleBtn = document.querySelector<HTMLButtonElement>('#toggle-broadcast-btn');

    if (this.isBroadcast) {
      app?.classList.add('broadcast-mode');
      document.body.classList.add('in-broadcast');
      overlay?.classList.remove('hidden');
      if (globalToggleBtn) {
        globalToggleBtn.classList.add('active');
        globalToggleBtn.textContent = '📺 EXIT STREAM MODE';
      }
    } else {
      app?.classList.remove('broadcast-mode');
      document.body.classList.remove('in-broadcast');
      overlay?.classList.add('hidden');
      if (globalToggleBtn) {
        globalToggleBtn.classList.remove('active');
        globalToggleBtn.textContent = '📺 BROADCAST MODE';
      }
    }
  }

  private bindKeyShortcuts(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      // Ignore if typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'f' || e.key === 'F') {
        this.toggleFullscreen();
      }
    });
  }
}
