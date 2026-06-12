import { Component, computed, inject, signal } from '@angular/core';
import { WindowStore } from '../../ng/window-store';
import type { FsEntry } from '../../electron-api';

/** Icon by extension — a small touch that makes real listings read at a glance. */
const EXT_ICONS: Record<string, string> = {
  txt: '📄', md: '📝', json: '🧾', js: '🟨', ts: '🟦', css: '🎨', html: '🌐',
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
  mp3: '🎵', wav: '🎵', mp4: '🎬', webm: '🎬', mov: '🎬',
  zip: '🗜️', gz: '🗜️', pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗',
};

const TEXT_EXTS = new Set(['txt', 'md', 'json', 'js', 'ts', 'css', 'html', 'log', 'csv', 'xml', 'yml', 'yaml', 'sh', 'py']);

/**
 * The REAL file explorer: read-only browsing of the home sandbox over the
 * fs:list IPC (realpath-contained in the main process — see electron/ipc/fs.ts).
 * Double-clicking a text file launches Notepad on it via WINDOW_PARAMS.
 */
@Component({
  selector: 'bliss-file-explorer',
  standalone: true,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--win-body-bg, #fff);
        font-family: var(--font-body, Tahoma, sans-serif);
        font-size: 0.85rem;
        color: #1a2436;
      }
      .crumbs {
        display: flex;
        gap: 4px;
        padding: 6px 10px;
        background: linear-gradient(#fbfbfb, #ece9d8);
        border-bottom: 1px solid #adacac;
        align-items: center;
        flex-wrap: wrap;
      }
      .crumbs button {
        border: none;
        background: none;
        cursor: pointer;
        color: #0a3d91;
        text-decoration: underline;
        padding: 0;
        font: inherit;
      }
      .crumbs span {
        color: #555;
      }
      .crumbs .spacer {
        flex: 1;
      }
      .crumbs label {
        display: flex;
        align-items: center;
        gap: 4px;
        color: #555;
        font-size: 0.75rem;
        cursor: pointer;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 4px;
        overflow: auto;
        flex: 1;
      }
      li {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 8px;
        border-radius: 3px;
        cursor: default;
        user-select: none;
      }
      li.dir,
      li.openable {
        cursor: pointer;
      }
      li:hover {
        background: #e8f0fe;
      }
      .glyph {
        font-size: 1.1rem;
        flex: none;
      }
      .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .size {
        margin-left: auto;
        color: #777;
        flex: none;
        font-variant-numeric: tabular-nums;
      }
      .status {
        border-top: 1px solid #adacac;
        padding: 3px 10px;
        background: #ece9d8;
        color: #444;
      }
      .empty {
        padding: 20px;
        text-align: center;
        color: #888;
      }
    `,
  ],
  template: `
    <div class="crumbs">
      <button (click)="goto(-1)">🏠 Home</button>
      @for (crumb of crumbs(); track $index) {
        <span>›</span>
        <button (click)="goto($index)">{{ crumb }}</button>
      }
      <span class="spacer"></span>
      <label>
        <input type="checkbox" [checked]="showHidden()" (change)="toggleHidden()" />
        hidden files
      </label>
    </div>
    <ul>
      @if (!available) {
        <li class="empty">Filesystem bridge unavailable (browser mode)</li>
      } @else {
        @for (e of visibleEntries(); track e.name) {
          <li
            [class.dir]="e.kind === 'dir'"
            [class.openable]="isText(e)"
            (dblclick)="open(e)"
            (click)="e.kind === 'dir' && open(e)"
            data-testid="fs-row"
          >
            <span class="glyph">{{ icon(e) }}</span>
            <span class="name">{{ e.name }}</span>
            @if (e.kind === 'file') {
              <span class="size">{{ fmtSize(e.size) }}</span>
            }
          </li>
        } @empty {
          <li class="empty">(empty folder)</li>
        }
      }
    </ul>
    <div class="status">
      {{ visibleEntries().length }} item(s){{ truncated() ? ' — listing truncated' : '' }}
      · ~/{{ crumbs().join('/') }}
    </div>
  `,
})
export class FileExplorerApp {
  private store = inject(WindowStore);
  readonly available = !!window.electronAPI?.fs;
  readonly crumbs = signal<string[]>([]);
  readonly entries = signal<FsEntry[]>([]);
  readonly truncated = signal(false);
  readonly showHidden = signal(false);
  readonly visibleEntries = computed(() =>
    this.showHidden() ? this.entries() : this.entries().filter((e) => !e.name.startsWith('.')),
  );

  constructor() {
    void this.load();
  }

  private rel(): string {
    return this.crumbs().join('/') || '.';
  }

  private async load(): Promise<void> {
    if (!this.available) return;
    const res = await window.electronAPI!.fs.list(this.rel()).catch(() => null);
    if (res) {
      this.entries.set(res.entries);
      this.truncated.set(res.truncated);
    } else {
      this.entries.set([]);
      this.truncated.set(false);
    }
  }

  open(e: FsEntry): void {
    if (e.kind === 'dir') {
      this.crumbs.update((c) => [...c, e.name]);
      void this.load();
      return;
    }
    if (this.isText(e)) {
      const path = [...this.crumbs(), e.name].join('/');
      this.store.open('notepad', { title: e.name + ' — Notepad', params: { path } });
    }
  }

  goto(index: number): void {
    this.crumbs.update((c) => c.slice(0, index + 1));
    void this.load();
  }

  toggleHidden(): void {
    this.showHidden.update((v) => !v);
  }

  isText(e: FsEntry): boolean {
    if (e.kind !== 'file') return false;
    const ext = e.name.split('.').pop()?.toLowerCase() ?? '';
    return TEXT_EXTS.has(ext) || !e.name.includes('.');
  }

  icon(e: FsEntry): string {
    if (e.kind === 'dir') return '📁';
    const ext = e.name.split('.').pop()?.toLowerCase() ?? '';
    return EXT_ICONS[ext] ?? '📄';
  }

  fmtSize(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
    return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
}
