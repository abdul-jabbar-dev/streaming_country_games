/**
 * Broadcast Mode Controller
 * Adapts viewport for 1280x720 16:9 OBS capture and handles clean streaming presentation
 */

export class BroadcastMode {
  private isBroadcast: boolean = false;

  constructor(initialBroadcast: boolean = false) {
    this.isBroadcast = initialBroadcast;
    this.applyMode();
    this.bindKeyShortcuts();
  }

  public toggle(): boolean {
    this.isBroadcast = !this.isBroadcast;
    this.applyMode();
    return this.isBroadcast;
  }

  private applyMode(): void {
    const app = document.querySelector('#app');
    if (app) {
      if (this.isBroadcast) {
        app.classList.add('broadcast-mode');
      } else {
        app.classList.remove('broadcast-mode');
      }
    }
  }

  private bindKeyShortcuts(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'b' || e.key === 'B') {
        this.toggle();
      }
    });
  }
}
