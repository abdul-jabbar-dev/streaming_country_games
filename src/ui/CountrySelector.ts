/**
 * Country Selection Modal Component
 * Allows players to select, filter, and persist participating countries per game mode
 */

import { COUNTRIES } from '../config/countries.ts';
import type { CountryData } from '../config/countries.ts';

export class CountrySelector {
  private modalElem: HTMLDivElement | null = null;
  private selectedIds = new Set<string>();
  private currentSearch = '';
  private onSaveCallback?: (countries: CountryData[]) => void;

  constructor() {
    this.createModal();
  }

  private createModal(): void {
    const modal = document.createElement('div');
    modal.className = 'country-selector-backdrop hidden';
    modal.innerHTML = `
      <div class="country-selector-dialog">
        <header class="selector-header">
          <div>
            <h2>SELECT COUNTRIES</h2>
            <p id="selector-subtitle">Choose participating nations (Minimum 2 required)</p>
          </div>
          <button class="selector-close-btn" id="selector-close-btn">&times;</button>
        </header>

        <div class="selector-toolbar">
          <input
            type="text"
            id="selector-search-input"
            class="selector-search"
            placeholder="Search countries by name or ISO..."
          />
          <div class="selector-actions">
            <button id="selector-select-all" class="btn-secondary">Select All</button>
            <button id="selector-deselect-all" class="btn-secondary">Deselect All</button>
          </div>
        </div>

        <div class="selector-meta">
          <span id="selector-count-badge" class="count-badge">0 / 24 Selected</span>
          <span id="selector-error-msg" class="error-msg hidden">Please select at least 2 countries!</span>
        </div>

        <div class="selector-grid" id="selector-grid"></div>

        <footer class="selector-footer">
          <button id="selector-cancel-btn" class="btn-secondary">Cancel</button>
          <button id="selector-confirm-btn" class="btn-primary">Apply & Save Selection</button>
        </footer>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalElem = modal;
    this.bindEvents();
  }

  private bindEvents(): void {
    if (!this.modalElem) return;

    // Close on backdrop or X or Cancel
    this.modalElem.querySelector('#selector-close-btn')?.addEventListener('click', () => this.close());
    this.modalElem.querySelector('#selector-cancel-btn')?.addEventListener('click', () => this.close());
    this.modalElem.addEventListener('click', (e) => {
      if (e.target === this.modalElem) this.close();
    });

    // Search filter
    const searchInput = this.modalElem.querySelector<HTMLInputElement>('#selector-search-input');
    searchInput?.addEventListener('input', (e) => {
      this.currentSearch = (e.target as HTMLInputElement).value.trim().toLowerCase();
      this.renderGrid();
    });

    // Select All
    this.modalElem.querySelector('#selector-select-all')?.addEventListener('click', () => {
      COUNTRIES.forEach((c) => this.selectedIds.add(c.id));
      this.updateSelectionState();
      this.renderGrid();
    });

    // Deselect All
    this.modalElem.querySelector('#selector-deselect-all')?.addEventListener('click', () => {
      this.selectedIds.clear();
      this.updateSelectionState();
      this.renderGrid();
    });

    // Confirm & Save
    this.modalElem.querySelector('#selector-confirm-btn')?.addEventListener('click', () => {
      if (this.selectedIds.size < 2) {
        this.showError('Select at least 2 countries to start!');
        return;
      }

      const selectedCountries = COUNTRIES.filter((c) => this.selectedIds.has(c.id));
      this.onSaveCallback?.(selectedCountries);
      this.close();
    });
  }

  public open(currentCountries: CountryData[], gameTitle: string, onSave: (countries: CountryData[]) => void): void {
    this.selectedIds = new Set(currentCountries.map((c) => c.id));
    this.onSaveCallback = onSave;
    this.currentSearch = '';

    if (this.modalElem) {
      const searchInput = this.modalElem.querySelector<HTMLInputElement>('#selector-search-input');
      if (searchInput) searchInput.value = '';

      const subtitle = this.modalElem.querySelector('#selector-subtitle');
      if (subtitle) {
        subtitle.textContent = `Choose participating nations for ${gameTitle}`;
      }

      this.updateSelectionState();
      this.renderGrid();
      this.modalElem.classList.remove('hidden');
    }
  }

  public close(): void {
    if (this.modalElem) {
      this.modalElem.classList.add('hidden');
    }
  }

  private updateSelectionState(): void {
    if (!this.modalElem) return;
    const badge = this.modalElem.querySelector('#selector-count-badge');
    if (badge) {
      badge.textContent = `${this.selectedIds.size} / ${COUNTRIES.length} Selected`;
    }

    const errorMsg = this.modalElem.querySelector('#selector-error-msg');
    if (errorMsg) {
      if (this.selectedIds.size >= 2) {
        errorMsg.classList.add('hidden');
      }
    }
  }

  private showError(msg: string): void {
    if (!this.modalElem) return;
    const errorMsg = this.modalElem.querySelector('#selector-error-msg');
    if (errorMsg) {
      errorMsg.textContent = msg;
      errorMsg.classList.remove('hidden');
    }
  }

  private renderGrid(): void {
    if (!this.modalElem) return;
    const grid = this.modalElem.querySelector('#selector-grid');
    if (!grid) return;

    const filtered = COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(this.currentSearch) ||
        c.iso.toLowerCase().includes(this.currentSearch)
    );

    grid.innerHTML = filtered
      .map((c) => {
        const isSelected = this.selectedIds.has(c.id);
        return `
          <div class="selector-card ${isSelected ? 'selected' : ''}" data-id="${c.id}">
            <span class="selector-flag">${c.flag}</span>
            <div class="selector-card-info">
              <span class="selector-card-name">${c.name}</span>
              <span class="selector-card-iso">${c.iso}</span>
            </div>
            <input type="checkbox" class="selector-checkbox" ${isSelected ? 'checked' : ''} />
          </div>
        `;
      })
      .join('');

    // Attach card click handlers
    const cards = grid.querySelectorAll('.selector-card');
    cards.forEach((card) => {
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT') return; // Handled by checkbox change
        const id = card.getAttribute('data-id');
        if (!id) return;

        if (this.selectedIds.has(id)) {
          this.selectedIds.delete(id);
        } else {
          this.selectedIds.add(id);
        }
        this.updateSelectionState();
        this.renderGrid();
      });

      const cb = card.querySelector<HTMLInputElement>('.selector-checkbox');
      cb?.addEventListener('change', () => {
        const id = card.getAttribute('data-id');
        if (!id) return;
        if (cb.checked) {
          this.selectedIds.add(id);
        } else {
          this.selectedIds.delete(id);
        }
        this.updateSelectionState();
        this.renderGrid();
      });
    });
  }
}
