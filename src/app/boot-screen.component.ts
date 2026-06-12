import { Component, inject, OnInit, signal } from '@angular/core';
import { SettingsService } from '../ng/settings.service';
import { reducedMotion } from '../ng/motion';

const BOOT_LINES = [
  'BLISS BIOS v2026.06 — initializing…',
  'cyber-core kernel 6.12.0 ......... OK',
  'compiz engine / blisscube WM ..... OK',
  'galaxy renderer (WebGL2) ......... OK',
  'signal graph (zoneless) .......... OK',
  'workspace cube: 4 faces mounted',
  'bliss-ai bridge: standing by',
];

/**
 * The cinematic boot sequence: a BIOS-style text crawl over black, a logo
 * bloom, then the overlay dissolves to reveal the cube. Cosmetic only — the
 * desktop boots underneath at full speed. Skipped automatically when the
 * window starts hidden (the headless smoke harness), under reduced motion,
 * or when disabled in settings; any key/click skips it instantly.
 */
@Component({
  selector: 'app-boot-screen',
  standalone: true,
  template: `
    @if (visible()) {
      <div class="boot" [class.boot--leaving]="leaving()" (click)="skip()">
        <div class="boot__crawl">
          @for (line of shown(); track $index) {
            <p>{{ line }}</p>
          }
        </div>
        @if (logo()) {
          <div class="boot__logo">
            <span class="boot__mark">◈</span>
            <span class="boot__name">BLISS OS</span>
            <span class="boot__sub">spatial desktop · 2026</span>
          </div>
        }
      </div>
    }
  `,
})
export class BootScreenComponent implements OnInit {
  private settings = inject(SettingsService);
  readonly visible = signal(false);
  readonly leaving = signal(false);
  readonly shown = signal<string[]>([]);
  readonly logo = signal(false);
  private timers: ReturnType<typeof setTimeout>[] = [];

  ngOnInit(): void {
    // Skip: headless (window starts hidden), reduced motion, or user setting.
    if (document.hidden || reducedMotion() || !this.settings.bootAnimation()) return;
    this.visible.set(true);
    BOOT_LINES.forEach((line, i) => {
      this.timers.push(setTimeout(() => this.shown.update((ls) => [...ls, line]), 120 + i * 140));
    });
    this.timers.push(setTimeout(() => this.logo.set(true), 1300));
    this.timers.push(setTimeout(() => this.skip(), 2500));
    const onKey = () => this.skip();
    window.addEventListener('keydown', onKey, { once: true });
  }

  skip(): void {
    if (!this.visible() || this.leaving()) return;
    this.timers.forEach(clearTimeout);
    this.leaving.set(true);
    setTimeout(() => this.visible.set(false), 450);
  }
}
