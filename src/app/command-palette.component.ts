import { Component, computed, effect, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { WindowStore } from '../ng/window-store';
import { WorkspaceStore } from '../ng/workspace-store';
import { ThemeService, THEME_IDS, THEME_LABELS } from '../ng/theme.service';
import { APPS } from '../ng/app-registry';
import { askBlissAi, aiAvailable } from '../ng/ai.service';

interface Command {
  id: string;
  glyph: string;
  label: string;
  hint?: string;
  run: () => void;
}

/** In-house subsequence fuzzy scorer: every query char must appear in order;
 *  consecutive matches and word starts score higher. */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      streak++;
      score += 2 + streak + (ti === 0 || t[ti - 1] === ' ' ? 4 : 0);
      qi++;
    } else {
      streak = 0;
    }
  }
  return qi === q.length ? score - t.length * 0.05 : -1;
}

/**
 * The Ctrl+K command palette — fuzzy launcher over apps ("Open Notepad"),
 * live windows ("Focus: Market Analytics — WS2"), OS actions (Expo,
 * workspaces, themes), and a free-text "Ask AI" escape hatch that opens the
 * assistant pre-loaded with the prompt.
 */
@Component({
  selector: 'app-command-palette',
  standalone: true,
  template: `
    @if (open()) {
      <div class="palette-scrim" (click)="close()"></div>
      <div class="palette" data-testid="command-palette">
        <input
          #box
          class="palette__input"
          data-testid="palette-input"
          placeholder="Type a command, app, or window…  (Esc to close)"
          [value]="query()"
          (input)="query.set($any($event.target).value); index.set(0)"
          (keydown)="onKey($event)"
          autocomplete="off"
          spellcheck="false"
        />
        <div class="palette__list">
          @for (c of results(); track c.id; let i = $index) {
            <button
              class="palette__item"
              [class.palette__item--sel]="i === index()"
              data-testid="palette-item"
              (click)="run(c)"
              (mouseenter)="index.set(i)"
            >
              <span class="palette__glyph">{{ c.glyph }}</span>
              <span class="palette__label">{{ c.label }}</span>
              @if (c.hint) {
                <span class="palette__hint">{{ c.hint }}</span>
              }
            </button>
          } @empty {
            <div class="palette__empty">No matches</div>
          }
        </div>
      </div>
    }
  `,
})
export class CommandPaletteComponent {
  private store = inject(WindowStore);
  private ws = inject(WorkspaceStore);
  private themes = inject(ThemeService);

  readonly open = signal(false);
  readonly query = signal('');
  readonly index = signal(0);

  @ViewChild('box') private box?: ElementRef<HTMLInputElement>;

  constructor() {
    effect(() => {
      if (this.open()) setTimeout(() => this.box?.nativeElement.focus(), 30);
    });
  }

  toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) {
      this.query.set('');
      this.index.set(0);
    }
  }

  close(): void {
    this.open.set(false);
  }

  private allCommands(): Command[] {
    const cmds: Command[] = [];
    for (const a of APPS) {
      cmds.push({
        id: `open:${a.id}`,
        glyph: a.icon,
        label: `Open ${a.title}`,
        hint: 'app',
        run: () => this.store.open(a.id),
      });
    }
    for (const w of this.store.windows()) {
      cmds.push({
        id: `focus:${w.id}`,
        glyph: w.icon,
        label: `Focus: ${w.title}`,
        hint: `WS ${w.workspace + 1}${w.minimized ? ' · minimized' : ''}`,
        run: () => {
          if (w.minimized) this.store.requestRestore(w.id);
          this.store.focus(w.id);
          if (w.workspace !== this.ws.active()) this.ws.switchTo(w.workspace);
        },
      });
    }
    cmds.push({
      id: 'expo',
      glyph: '▦',
      label: 'Toggle Expo overview',
      hint: 'Ctrl+Alt+↑',
      run: () => this.ws.toggleExpo(),
    });
    for (let i = 0; i < 4; i++) {
      cmds.push({
        id: `ws:${i}`,
        glyph: '◻',
        label: `Go to workspace ${i + 1}`,
        run: () => this.ws.switchTo(i),
      });
    }
    for (const t of THEME_IDS) {
      cmds.push({
        id: `theme:${t}`,
        glyph: '🎨',
        label: `Theme: ${THEME_LABELS[t]}`,
        run: () => this.themes.setTheme(t),
      });
    }
    return cmds;
  }

  readonly results = computed<Command[]>(() => {
    const q = this.query().trim();
    const cmds = this.allCommands();
    let out: Command[];
    if (!q) {
      out = cmds.slice(0, 10);
    } else {
      out = cmds
        .map((c) => ({ c, s: fuzzyScore(q, c.label) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 10)
        .map((x) => x.c);
    }
    // Free-text AI escape hatch — always offered when there's a query.
    if (q && aiAvailable()) {
      out.push({
        id: 'ai',
        glyph: '🤖',
        label: `Ask AI: "${q}"`,
        hint: 'Bliss AI',
        run: () => this.askAi(q),
      });
    }
    return out;
  });

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.index.set(Math.min(this.results().length - 1, this.index() + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.index.set(Math.max(0, this.index() - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = this.results()[this.index()];
      if (c) this.run(c);
    }
  }

  run(c: Command): void {
    this.close();
    c.run();
  }

  private askAi(prompt: string): void {
    // Open the assistant primed with the prompt (it reads WINDOW_PARAMS).
    this.store.open('bliss-ai', { params: { prompt } });
    void askBlissAi; // (one-shot path lives in the terminal; the app streams)
  }
}
