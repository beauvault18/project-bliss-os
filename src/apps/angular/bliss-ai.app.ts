import { AfterViewInit, Component, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { WINDOW_PARAMS } from '../../ng/window-params';
import { SettingsService } from '../../ng/settings.service';
import { aiHasKey } from '../../ng/ai.service';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
}

/** Markdown-lite → HTML-safe segments: we render **bold** and `code` +
 *  fenced blocks ourselves (no innerHTML, no dependency). */
interface Seg {
  kind: 'text' | 'bold' | 'code' | 'block';
  text: string;
}
function renderSegments(src: string): Seg[] {
  const segs: Seg[] = [];
  const fence = src.split(/```(?:\w*\n)?/);
  fence.forEach((chunk, i) => {
    if (i % 2 === 1) {
      segs.push({ kind: 'block', text: chunk.replace(/\n$/, '') });
      return;
    }
    // Inline: split on **bold** and `code`.
    const parts = chunk.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    for (const p of parts) {
      if (!p) continue;
      if (p.startsWith('**') && p.endsWith('**')) segs.push({ kind: 'bold', text: p.slice(2, -2) });
      else if (p.startsWith('`') && p.endsWith('`')) segs.push({ kind: 'code', text: p.slice(1, -1) });
      else segs.push({ kind: 'text', text: p });
    }
  });
  return segs;
}

/**
 * Bliss AI — the OS's resident Claude assistant. Streaming chat over the
 * ai:* IPC bridge (key custody + the Anthropic call live in the main
 * process; this component only consumes typed chunk events). Launchable
 * pre-loaded with a prompt via WINDOW_PARAMS (command palette "Ask AI").
 */
@Component({
  selector: 'bliss-ai',
  standalone: true,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        background: rgba(6, 10, 22, 0.6);
        backdrop-filter: blur(10px);
      }
      .chat {
        box-sizing: border-box;
        height: 100%;
        display: flex;
        flex-direction: column;
        color: var(--text-1);
        font-family: var(--font-body);
        font-size: 0.88rem;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-bottom: 1px solid var(--glass-border);
        flex: none;
      }
      .head .orb {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 10px rgba(var(--accent-rgb), 0.9);
        animation: ai-pulse 2.4s ease-in-out infinite;
      }
      @keyframes ai-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.45; }
      }
      .head .name {
        font: 600 0.78rem var(--font-display);
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      .head .model {
        margin-left: auto;
        font: 500 0.68rem var(--font-mono);
        color: var(--accent);
        opacity: 0.85;
      }
      .scroll {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 0;
      }
      .turn {
        max-width: 86%;
        padding: 8px 12px;
        border-radius: 12px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .turn--user {
        align-self: flex-end;
        background: rgba(var(--accent-rgb), 0.22);
        border: 1px solid rgba(var(--accent-rgb), 0.35);
        border-bottom-right-radius: 4px;
      }
      .turn--ai {
        align-self: flex-start;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid var(--glass-border);
        border-bottom-left-radius: 4px;
      }
      .turn--error {
        border-color: rgba(220, 60, 40, 0.6);
        color: #ff9a8a;
      }
      .caret {
        display: inline-block;
        width: 7px;
        height: 14px;
        background: var(--accent);
        vertical-align: -2px;
        margin-left: 2px;
        animation: ai-pulse 0.9s steps(1) infinite;
      }
      b {
        color: #fff;
      }
      code {
        font-family: var(--font-mono);
        font-size: 0.82em;
        background: rgba(var(--accent-rgb), 0.14);
        border-radius: 4px;
        padding: 1px 5px;
      }
      pre {
        font-family: var(--font-mono);
        font-size: 0.8rem;
        background: rgba(0, 0, 0, 0.45);
        border: 1px solid var(--glass-border);
        border-radius: 8px;
        padding: 10px 12px;
        overflow-x: auto;
        margin: 6px 0;
      }
      .composer {
        display: flex;
        gap: 8px;
        padding: 10px 12px;
        border-top: 1px solid var(--glass-border);
        flex: none;
      }
      textarea {
        flex: 1;
        resize: none;
        height: 44px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid var(--glass-border);
        border-radius: 9px;
        outline: none;
        color: var(--text-1);
        font: inherit;
        padding: 9px 12px;
        caret-color: var(--accent);
      }
      textarea:focus {
        border-color: rgba(var(--accent-rgb), 0.6);
        box-shadow: 0 0 12px rgba(var(--accent-rgb), 0.25);
      }
      .btn {
        border: 1px solid rgba(var(--accent-rgb), 0.5);
        border-radius: 9px;
        background: rgba(var(--accent-rgb), 0.25);
        color: #fff;
        font: 600 0.8rem var(--font-ui);
        padding: 0 16px;
        cursor: pointer;
      }
      .btn:hover {
        background: rgba(var(--accent-rgb), 0.4);
      }
      .btn--stop {
        border-color: rgba(220, 60, 40, 0.6);
        background: rgba(220, 60, 40, 0.3);
      }
      .nokey {
        margin: auto;
        text-align: center;
        opacity: 0.75;
        line-height: 1.7;
        padding: 20px;
      }
    `,
  ],
  template: `
    <div class="chat" data-testid="bliss-ai">
      <div class="head">
        <span class="orb"></span>
        <span class="name">Bliss AI</span>
        <span class="model">{{ settings.aiModel() }}</span>
      </div>
      <div class="scroll" #scroll>
        @if (!hasKey()) {
          <div class="nokey">
            🤖 Bliss AI needs an Anthropic API key.<br />
            Open <b>Control Center → Bliss AI</b> to add one.
          </div>
        }
        @for (t of turns(); track $index) {
          <div
            class="turn"
            [class.turn--user]="t.role === 'user'"
            [class.turn--ai]="t.role === 'assistant'"
            [class.turn--error]="t.error"
            data-testid="ai-turn"
          >@for (s of segs(t); track $index) {@if (s.kind === 'text') {{{ s.text }}} @else if (s.kind === 'bold') {<b>{{ s.text }}</b>} @else if (s.kind === 'code') {<code>{{ s.text }}</code>} @else {<pre>{{ s.text }}</pre>}}@if (t.streaming) {<span class="caret"></span>}</div>
        }
      </div>
      <div class="composer">
        <textarea
          #box
          data-testid="ai-input"
          placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
          [value]="draft()"
          (input)="draft.set($any($event.target).value)"
          (keydown)="onKey($event)"
        ></textarea>
        @if (busy()) {
          <button class="btn btn--stop" (click)="stop()">Stop</button>
        } @else {
          <button class="btn" data-testid="ai-send" (click)="send()">Send</button>
        }
      </div>
    </div>
  `,
})
export class BlissAiApp implements AfterViewInit, OnDestroy {
  private params = inject(WINDOW_PARAMS);
  readonly settings = inject(SettingsService);

  readonly turns = signal<ChatTurn[]>([]);
  readonly draft = signal('');
  readonly busy = signal(false);
  readonly hasKey = signal(true); // optimistic until checked

  @ViewChild('scroll') private scrollEl?: ElementRef<HTMLElement>;
  @ViewChild('box') private box?: ElementRef<HTMLTextAreaElement>;

  private streamId: string | null = null;
  private offChunk: (() => void) | null = null;

  constructor() {
    void aiHasKey().then((v) => this.hasKey.set(v));
  }

  ngAfterViewInit(): void {
    const prompt = this.params['prompt'];
    if (typeof prompt === 'string' && prompt) {
      this.draft.set(prompt);
      setTimeout(() => void this.send(), 100);
    } else {
      setTimeout(() => this.box?.nativeElement.focus(), 80);
    }
  }

  segs(t: ChatTurn): Seg[] {
    return renderSegments(t.content);
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void this.send();
    }
  }

  async send(): Promise<void> {
    const api = window.electronAPI?.ai;
    const content = this.draft().trim();
    if (!api || !content || this.busy()) return;
    this.draft.set('');
    this.turns.update((ts) => [...ts, { role: 'user', content }]);
    const history = this.turns().map((t) => ({ role: t.role, content: t.content }));
    this.turns.update((ts) => [...ts, { role: 'assistant', content: '', streaming: true }]);
    this.busy.set(true);
    this.pinScroll();
    const res = await api.chat({ messages: history, model: this.settings.aiModel() });
    if ('error' in res) {
      this.finishStream(res.error, true);
      return;
    }
    this.streamId = res.streamId;
    this.offChunk = api.onChunk((msg) => {
      if (msg.streamId !== this.streamId) return;
      if (msg.type === 'delta') {
        this.turns.update((ts) => {
          const last = ts[ts.length - 1];
          return [...ts.slice(0, -1), { ...last, content: last.content + (msg.text ?? '') }];
        });
        this.pinScroll();
      } else if (msg.type === 'done') {
        this.finishStream();
      } else {
        this.finishStream(msg.text || 'request failed', true);
      }
    });
  }

  stop(): void {
    if (this.streamId) void window.electronAPI?.ai?.cancel(this.streamId);
  }

  private finishStream(errorText?: string, isError = false): void {
    this.offChunk?.();
    this.offChunk = null;
    this.streamId = null;
    this.busy.set(false);
    this.turns.update((ts) => {
      const last = ts[ts.length - 1];
      if (!last || last.role !== 'assistant') return ts;
      const content = isError ? `⚠ ${errorText}` : last.content;
      return [...ts.slice(0, -1), { ...last, content, streaming: false, error: isError }];
    });
    this.pinScroll();
    setTimeout(() => this.box?.nativeElement.focus(), 60);
  }

  private pinScroll(): void {
    setTimeout(() => {
      const el = this.scrollEl?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  ngOnDestroy(): void {
    this.stop();
    this.offChunk?.();
  }
}
