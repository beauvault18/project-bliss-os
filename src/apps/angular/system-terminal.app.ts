import { AfterViewInit, Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { WINDOW_VISIBLE } from '../../ng/window-visibility';
import { WindowStore } from '../../ng/window-store';
import { WorkspaceStore } from '../../ng/workspace-store';
import { ThemeService, THEME_IDS, type ThemeId } from '../../ng/theme.service';
import { APPS } from '../../ng/app-registry';
import { TerminalInterpreter } from './terminal/interpreter';
import { askBlissAi, aiAvailable } from '../../ng/ai.service';

/**
 * The interactive Bliss terminal: a neofetch banner over a REAL command line.
 * Commands run through a sandboxed renderer-side interpreter (no PTY, no
 * exec — see terminal/interpreter.ts): fs commands reuse the read-only fs:*
 * IPC sandbox, in-OS commands drive the window/workspace/theme stores, and
 * `ai` pipes a one-shot prompt into Bliss AI.
 */
@Component({
  selector: 'bliss-system-terminal',
  standalone: true,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .terminal {
        box-sizing: border-box;
        height: 100%;
        background: rgba(0, 8, 4, 0.6);
        backdrop-filter: blur(10px);
        color: #00ff66;
        font-family: var(--font-mono, 'Consolas', monospace);
        font-size: 12px;
        line-height: 1.4;
        padding: 14px 16px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        text-shadow: 0 0 4px rgba(0, 255, 102, 0.5);
        cursor: text;
      }
      .neofetch {
        display: flex;
        gap: 18px;
        align-items: center;
        flex: none;
      }
      .ascii {
        color: #00ff66;
        font-size: 13px;
        margin: 0;
        white-space: pre;
      }
      .sys-info p {
        margin: 2px 0;
      }
      .sys-info .key {
        color: #6cff9e;
        font-weight: bold;
      }
      hr {
        border: none;
        border-top: 1px solid #0a3;
        margin: 10px 0;
        opacity: 0.5;
        flex: none;
      }
      .scroll {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
      }
      .logs p {
        margin: 1px 0;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .logs .cmd {
        color: #b8ffcb;
      }
      .inline {
        display: flex;
        gap: 6px;
        align-items: baseline;
      }
      .ps1 {
        color: #6cff9e;
        white-space: nowrap;
        flex: none;
      }
      input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: #00ff66;
        font: inherit;
        text-shadow: inherit;
        padding: 0;
        caret-color: #00ff66;
      }
      .busy {
        opacity: 0.6;
      }
    `,
  ],
  template: `
    <div class="terminal" (click)="focusInput()">
      <div class="neofetch">
        <pre class="ascii">   ___
  /( )\\
  \\_^_/   Crystalfoxmaster
   /_\\    &#64; BlissCube</pre>
        <div class="sys-info">
          <p><span class="key">OS:</span> Bliss OS 2026 x86_64</p>
          <p><span class="key">Kernel:</span> 6.12.0-cyber-core</p>
          <p><span class="key">WM:</span> BlissCube (Compiz Engine)</p>
          <p><span class="key">Shell:</span> bliss-term · sandboxed · type <span class="key">help</span></p>
        </div>
      </div>
      <hr />
      <div class="scroll" #scroll>
        <div class="logs">
          @for (line of lines(); track $index) {
            <p [class.cmd]="line.startsWith('$ ') || line.includes('$ ')">{{ line }}</p>
          }
        </div>
        <div class="inline" [class.busy]="busy()">
          <span class="ps1">{{ ps1() }}</span>
          <input
            #cmdline
            data-testid="term-input"
            [value]="draft()"
            (input)="draft.set($any($event.target).value)"
            (keydown)="onKey($event)"
            [disabled]="busy()"
            autocomplete="off"
            spellcheck="false"
            aria-label="terminal command input"
          />
        </div>
      </div>
    </div>
  `,
})
export class SystemTerminalApp implements AfterViewInit {
  readonly lines = signal<string[]>([
    'Bliss OS 2026 — bliss-term (sandboxed shell)',
    "Type 'help' for commands. The filesystem is read-only, rooted at ~.",
  ]);
  readonly draft = signal('');
  readonly busy = signal(false);
  readonly ps1 = signal('crystalfox@bliss:~$');

  private visible = inject(WINDOW_VISIBLE);
  private store = inject(WindowStore);
  private ws = inject(WorkspaceStore);
  private themes = inject(ThemeService);

  @ViewChild('cmdline') private cmdline?: ElementRef<HTMLInputElement>;
  @ViewChild('scroll') private scroll?: ElementRef<HTMLElement>;

  private history: string[] = [];
  private histIdx = -1;

  private interp = new TerminalInterpreter({
    apps: () => APPS.map((a) => ({ id: a.id, title: a.title })),
    openApp: (id) => !!this.store.open(id),
    killApp: (id) => {
      const wins = this.store.windows().filter((w) => w.appId === id);
      wins.forEach((w) => this.store.close(w.id));
      return wins.length > 0;
    },
    switchWorkspace: (n) => this.ws.switchTo(n),
    setTheme: (name) => {
      if (!THEME_IDS.includes(name as ThemeId)) return false;
      this.themes.setTheme(name as ThemeId);
      return true;
    },
    themeNames: () => [...THEME_IDS],
    versions: () => window.electronAPI?.versions ?? null,
    stats: async () => (await window.electronAPI?.getSystemStats?.()) ?? null,
    fsList: async (rel) => (await window.electronAPI?.fs?.list(rel)) ?? null,
    fsRead: async (rel) =>
      (await window.electronAPI?.fs?.read(rel)) ?? { error: 'filesystem unavailable' },
    aiAsk: aiAvailable() ? (prompt) => askBlissAi(prompt) : null,
  });

  ngAfterViewInit(): void {
    // Focus the prompt when this terminal's window is frontmost-visible.
    if (this.visible()) setTimeout(() => this.focusInput(), 50);
  }

  focusInput(): void {
    this.cmdline?.nativeElement.focus();
  }

  async onKey(e: KeyboardEvent): Promise<void> {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.history.length) {
        this.histIdx = this.histIdx < 0 ? this.history.length - 1 : Math.max(0, this.histIdx - 1);
        this.draft.set(this.history[this.histIdx]);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.histIdx >= 0) {
        this.histIdx++;
        if (this.histIdx >= this.history.length) {
          this.histIdx = -1;
          this.draft.set('');
        } else {
          this.draft.set(this.history[this.histIdx]);
        }
      }
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const input = this.draft();
    this.draft.set('');
    this.histIdx = -1;
    if (input.trim()) this.history.push(input);
    this.lines.update((ls) => [...ls, `${this.ps1()} ${input}`]);
    this.busy.set(true);
    try {
      const res = await this.interp.run(input);
      if (res.clear) this.lines.set([]);
      else if (res.lines.length) this.lines.update((ls) => [...ls, ...res.lines]);
    } finally {
      this.busy.set(false);
      this.ps1.set(this.interp.prompt());
      // Cap scrollback; keep the view pinned to the prompt.
      this.lines.update((ls) => (ls.length > 400 ? ls.slice(ls.length - 400) : ls));
      setTimeout(() => {
        const el = this.scroll?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
        this.focusInput();
      });
    }
  }
}
