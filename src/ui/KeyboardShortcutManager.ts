/**
 * Centralized Keyboard Shortcut Manager & Interactive Controller
 * Handles hotkeys for instant mode switching, session lifecycle triggers,
 * multi-key sequence combos, floating toast notifications, and help modal overlay.
 */

export interface KeyboardActions {
  switchGameMode: (mode: 'battle' | 'eliminate' | 'line') => void;
  startSession: (sessionMode: 'ONCE' | 'TIMED' | 'INFINITE', durationMinutes?: number) => void;
  stopSession: () => void;
  toggleFullscreen: () => void;
  toggleBroadcast?: () => void;
}

export class KeyboardShortcutManager {
  private actions: KeyboardActions;
  private keySequence: Array<{ key: string; time: number }> = [];
  private sequenceWindowMs: number = 2200;
  private isDestroyed: boolean = false;
  private keydownHandler: (e: KeyboardEvent) => void;
  private toastContainer: HTMLElement | null = null;
  private helpModal: HTMLElement | null = null;
  private activeTimeouts: Array<ReturnType<typeof setTimeout>> = [];

  constructor(actions: KeyboardActions) {
    this.actions = actions;
    this.initToastContainer();
    this.initHelpModal();

    this.keydownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);
    window.addEventListener('keydown', this.keydownHandler);
  }

  private initToastContainer(): void {
    if (typeof document === 'undefined') return;
    let container = document.getElementById('shortcut-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'shortcut-toast-container';
      container.className = 'shortcut-toast-container';
      document.body.appendChild(container);
    }
    this.toastContainer = container;
  }

  private initHelpModal(): void {
    if (typeof document === 'undefined') return;
    let modal = document.getElementById('shortcut-help-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'shortcut-help-modal';
      modal.className = 'shortcut-modal-overlay hidden';
      modal.innerHTML = `
        <div class="shortcut-modal-dialog">
          <div class="shortcut-modal-header">
            <h3>⚡ Keyboard Shortcuts & Commands</h3>
            <button class="shortcut-modal-close" id="shortcut-modal-close-btn" aria-label="Close">✕</button>
          </div>
          <div class="shortcut-modal-body">
            <div class="shortcut-section">
              <h4>🎯 Arena Modes</h4>
              <div class="shortcut-row"><kbd>B</kbd> <span>Country Battle Arena</span></div>
              <div class="shortcut-row"><kbd>E</kbd> <span>Country Eliminate Arena</span></div>
              <div class="shortcut-row"><kbd>L</kbd> <span>Country Line Battle Arena</span></div>
            </div>
            <div class="shortcut-section">
              <h4>⏱️ Session Control</h4>
              <div class="shortcut-row"><kbd>O</kbd> <span>Start ONCE (Single Round)</span></div>
              <div class="shortcut-row"><kbd>M</kbd> <span>Start TIMED (30 Minutes)</span></div>
              <div class="shortcut-row"><kbd>A</kbd> <span>Start TIMED (1 Hour / 60 Min)</span></div>
              <div class="shortcut-row"><kbd>I</kbd> <span>Start INFINITE (Continuous 24/7)</span></div>
              <div class="shortcut-row"><kbd>S</kbd> <span>STOP Active Session</span></div>
            </div>
            <div class="shortcut-section">
              <h4>🔥 Quick Combos (Press in sequence)</h4>
              <div class="shortcut-row"><kbd>B</kbd> + <kbd>O</kbd> <span>Switch to Battle & Start Once</span></div>
              <div class="shortcut-row"><kbd>E</kbd> + <kbd>I</kbd> <span>Switch to Eliminate & Start Infinite</span></div>
              <div class="shortcut-row"><kbd>L</kbd> + <kbd>M</kbd> <span>Switch to Line Battle & Start 30m</span></div>
            </div>
            <div class="shortcut-section">
              <h4>📺 Utility</h4>
              <div class="shortcut-row"><kbd>F</kbd> <span>Toggle Fullscreen</span></div>
              <div class="shortcut-row"><kbd>T</kbd> <span>Toggle Broadcast / Stream View</span></div>
              <div class="shortcut-row"><kbd>?</kbd> / <kbd>H</kbd> <span>Toggle Shortcuts Help</span></div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const closeBtn = modal.querySelector('#shortcut-modal-close-btn');
      closeBtn?.addEventListener('click', () => this.toggleHelpModal(false));
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.toggleHelpModal(false);
      });
    }
    this.helpModal = modal;
  }

  public showToast(message: string, icon: string = '⚡'): void {
    if (!this.toastContainer || typeof document === 'undefined') return;

    const toast = document.createElement('div');
    toast.className = 'shortcut-toast';
    toast.innerHTML = `<span class="shortcut-toast-icon">${icon}</span> <span class="shortcut-toast-msg">${message}</span>`;
    this.toastContainer.appendChild(toast);

    const t1 = setTimeout(() => {
      if (this.isDestroyed) return;
      toast.classList?.add('fade-out');
      const t2 = setTimeout(() => {
        try {
          toast.remove?.();
        } catch {}
      }, 350);
      this.activeTimeouts.push(t2);
    }, 2200);
    this.activeTimeouts.push(t1);
  }

  public toggleHelpModal(force?: boolean): void {
    if (!this.helpModal) return;
    const isHidden = this.helpModal.classList.contains('hidden');
    const shouldShow = force !== undefined ? force : isHidden;
    if (shouldShow) {
      this.helpModal.classList.remove('hidden');
    } else {
      this.helpModal.classList.add('hidden');
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.isDestroyed) return;

    // Guard: ignore typing inside input elements or during IME composition
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
        return;
      }
    }

    const key = e.key.toUpperCase();
    const now = performance.now();

    // Clean old keys from buffer
    this.keySequence = this.keySequence.filter((item) => now - item.time < this.sequenceWindowMs);
    this.keySequence.push({ key, time: now });

    // Check sequence combos (last 2 keys)
    if (this.keySequence.length >= 2) {
      const prev = this.keySequence[this.keySequence.length - 2].key;
      const curr = key;

      // Mode + Session combos
      if ((prev === 'B' || prev === 'E' || prev === 'L') && (curr === 'O' || curr === 'M' || curr === 'A' || curr === 'I')) {
        const mode = prev === 'B' ? 'battle' : prev === 'E' ? 'eliminate' : 'line';
        const modeName = prev === 'B' ? 'Battle Arena' : prev === 'E' ? 'Eliminate Arena' : 'Line Battle Arena';
        this.actions.switchGameMode(mode);

        if (curr === 'O') {
          this.actions.startSession('ONCE');
          this.showToast(`${modeName}: ONCE Session started`, '⚔️');
        } else if (curr === 'M') {
          this.actions.startSession('TIMED', 30);
          this.showToast(`${modeName}: TIMED 30m Session started`, '⏱️');
        } else if (curr === 'A') {
          this.actions.startSession('TIMED', 60);
          this.showToast(`${modeName}: TIMED 1h Session started`, '⏱️');
        } else if (curr === 'I') {
          this.actions.startSession('INFINITE');
          this.showToast(`${modeName}: INFINITE Session started`, '♾️');
        }
        this.keySequence = [];
        e.preventDefault();
        return;
      }
    }

    // Single Key Actions
    switch (key) {
      case 'B':
        this.actions.switchGameMode('battle');
        this.showToast('Country Battle Arena selected', '⚔️');
        break;

      case 'E':
        this.actions.switchGameMode('eliminate');
        this.showToast('Country Eliminate Arena selected', '🌀');
        break;

      case 'L':
        this.actions.switchGameMode('line');
        this.showToast('Country Line Battle Arena selected', '⚡');
        break;

      case 'O':
        this.actions.startSession('ONCE');
        this.showToast('ONCE Session started (1 Round)', '🎯');
        break;

      case 'M':
        this.actions.startSession('TIMED', 30);
        this.showToast('TIMED Session started (30m)', '⏱️');
        break;

      case 'A':
        this.actions.startSession('TIMED', 60);
        this.showToast('TIMED Session started (1 Hour)', '⏱️');
        break;

      case 'I':
        this.actions.startSession('INFINITE');
        this.showToast('INFINITE Session started (24/7)', '♾️');
        break;

      case 'S':
        this.actions.stopSession();
        this.showToast('Session Stopped', '🛑');
        break;

      case 'F':
        this.actions.toggleFullscreen();
        break;

      case 'T':
        this.actions.toggleBroadcast?.();
        this.showToast('Toggled Stream View', '📺');
        break;

      case '?':
      case 'H':
        this.toggleHelpModal();
        break;

      case 'ESCAPE':
        this.toggleHelpModal(false);
        break;

      default:
        break;
    }
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    for (const t of this.activeTimeouts) {
      clearTimeout(t);
    }
    this.activeTimeouts = [];
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keydownHandler);
    }
    this.toastContainer?.remove();
    this.helpModal?.remove();
    this.toastContainer = null;
    this.helpModal = null;
  }
}
