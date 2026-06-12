import { Component, computed, inject, signal } from '@angular/core';
import { WINDOW_PARAMS } from '../../ng/window-params';

/**
 * Notepad with REAL file I/O. Two routes in, one route out:
 *   - Launched from File Explorer with WINDOW_PARAMS.path → loaded over the
 *     read-only fs:read sandbox channel.
 *   - Open… / Save / Save As… go through the consent-gated native dialogs
 *     (dialog:* IPC) — the main process does all I/O, and quiet re-save
 *     (Ctrl+S) only works on a path the user already picked this session.
 */
@Component({
  selector: 'bliss-notepad',
  standalone: true,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #fff;
      }
      .bar {
        display: flex;
        gap: 4px;
        padding: 4px 6px;
        background: linear-gradient(#fbfbfb, #ece9d8);
        border-bottom: 1px solid #d6d2c4;
        flex: none;
      }
      .bar button {
        border: 1px solid transparent;
        background: none;
        font: 0.78rem var(--font-ui, Tahoma, sans-serif);
        padding: 3px 9px;
        border-radius: 3px;
        cursor: pointer;
        color: #222;
      }
      .bar button:hover {
        border-color: #adacac;
        background: #fff;
      }
      .bar .dirty {
        margin-left: auto;
        align-self: center;
        color: #b04000;
        font-size: 0.75rem;
        padding-right: 6px;
      }
      textarea {
        flex: 1;
        border: 0;
        outline: none;
        resize: none;
        padding: 10px 12px;
        font-family: var(--font-mono, 'Consolas', monospace);
        font-size: 0.95rem;
        line-height: 1.45;
        color: #1a1a1a;
      }
      .status {
        border-top: 1px solid #d6d2c4;
        background: #ece9d8;
        padding: 2px 8px;
        font: 0.72rem var(--font-ui, Tahoma, sans-serif);
        color: #555;
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }
      .status .file {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `,
  ],
  template: `
    <div class="bar">
      <button data-testid="np-open" (click)="openFile()">Open…</button>
      <button data-testid="np-save" (click)="save()">Save</button>
      <button data-testid="np-saveas" (click)="saveAs()">Save As…</button>
      @if (dirty()) {
        <span class="dirty">● unsaved</span>
      }
    </div>
    <textarea
      data-testid="notepad-text"
      [value]="text()"
      (input)="onInput($event)"
      (keydown)="onKey($event)"
      spellcheck="false"
      placeholder="Type here…"
    ></textarea>
    <div class="status">
      <span class="file">{{ fileLabel() }}</span>
      <span>{{ text().length }} chars · {{ lineCount() }} lines</span>
    </div>
  `,
})
export class NotepadApp {
  private params = inject(WINDOW_PARAMS);
  readonly text = signal('');
  readonly dirty = signal(false);
  /** Absolute path with save consent (from Open…/Save As…). */
  private savePath = signal<string | null>(null);
  /** Sandbox-relative path (launched from Explorer) — read-only provenance. */
  private sandboxPath = signal<string | null>(null);
  readonly lineCount = computed(() => this.text().split('\n').length);
  readonly fileLabel = computed(() => {
    const p = this.savePath() ?? this.sandboxPath();
    return p ? p : 'untitled';
  });

  constructor() {
    const p = this.params['path'];
    if (typeof p === 'string' && p && window.electronAPI?.fs) {
      this.sandboxPath.set(p);
      void window.electronAPI.fs.read(p).then((res) => {
        if (res && 'content' in res) {
          this.text.set(res.content);
          this.dirty.set(false);
        } else if (res && 'error' in res) {
          this.text.set(`⚠ could not open ~/${p}: ${res.error}`);
        }
      });
    }
  }

  onInput(e: Event): void {
    this.text.set((e.target as HTMLTextAreaElement).value);
    this.dirty.set(true);
  }

  onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void this.save();
    }
  }

  async openFile(): Promise<void> {
    const res = await window.electronAPI?.dialog?.openFile().catch(() => null);
    if (!res) return;
    this.text.set(res.content);
    this.savePath.set(res.path);
    this.sandboxPath.set(null);
    this.dirty.set(false);
  }

  /** Quiet save to a consented path, else fall through to Save As. */
  async save(): Promise<void> {
    const path = this.savePath();
    const res = await window.electronAPI?.dialog
      ?.saveFile({ path: path ?? undefined, content: this.text() })
      .catch(() => null);
    if (res) {
      this.savePath.set(res.path);
      this.dirty.set(false);
    }
  }

  async saveAs(): Promise<void> {
    const res = await window.electronAPI?.dialog
      ?.saveFile({ content: this.text() })
      .catch(() => null);
    if (res) {
      this.savePath.set(res.path);
      this.dirty.set(false);
    }
  }
}
