import { Component, computed, HostListener, OnDestroy, signal } from '@angular/core';

/**
 * Cosmetic lock screen (Ctrl+L): frosts the whole desktop behind a giant
 * Orbitron clock. Any key or click unlocks — no real auth, it's a vibe.
 */
@Component({
  selector: 'app-lock-screen',
  standalone: true,
  template: `
    @if (locked()) {
      <div class="lock" data-testid="lock-screen" (click)="unlock()">
        <div class="lock__time">{{ time() }}</div>
        <div class="lock__date">{{ date() }}</div>
        <div class="lock__hint">press any key to unlock</div>
      </div>
    }
  `,
})
export class LockScreenComponent implements OnDestroy {
  readonly locked = signal(false);
  private readonly now = signal(new Date());
  readonly time = computed(() => {
    const d = this.now();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  readonly date = computed(() =>
    this.now().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  );
  private timer = setInterval(() => this.now.set(new Date()), 1000);

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (this.locked()) {
      e.preventDefault();
      this.unlock();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      this.locked.set(true);
    }
  }

  unlock(): void {
    this.locked.set(false);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }
}
