import { Component, Injectable, computed, inject, signal } from '@angular/core';

interface FsNode {
  name: string;
  kind: 'folder' | 'file';
  size?: string;
  children?: FsNode[];
}

/** A tiny in-memory filesystem service, provided at the app root and injected. */
@Injectable({ providedIn: 'root' })
export class FileSystemService {
  readonly root: FsNode = {
    name: 'My Computer',
    kind: 'folder',
    children: [
      {
        name: 'My Documents',
        kind: 'folder',
        children: [
          { name: 'resume.doc', kind: 'file', size: '42 KB' },
          { name: 'bliss-notes.txt', kind: 'file', size: '3 KB' },
          {
            name: 'Projects',
            kind: 'folder',
            children: [
              { name: 'blissOS.sln', kind: 'file', size: '12 KB' },
              { name: 'todo.md', kind: 'file', size: '1 KB' },
            ],
          },
        ],
      },
      {
        name: 'My Pictures',
        kind: 'folder',
        children: [
          { name: 'Bliss.bmp', kind: 'file', size: '1.4 MB' },
          { name: 'sunset.jpg', kind: 'file', size: '820 KB' },
        ],
      },
      { name: 'Local Disk (C:)', kind: 'folder', children: [] },
    ],
  };
}

@Component({
  selector: 'bliss-file-explorer',
  standalone: true,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #fff;
        font-family: Tahoma, 'Segoe UI', sans-serif;
        font-size: 0.85rem;
      }
      .crumbs {
        display: flex;
        gap: 4px;
        padding: 6px 10px;
        background: linear-gradient(#fbfbfb, #ece9d8);
        border-bottom: 1px solid #adacac;
        align-items: center;
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
      }
      li.folder {
        cursor: pointer;
      }
      li:hover {
        background: #e8f0fe;
      }
      .glyph {
        font-size: 1.1rem;
      }
      .size {
        margin-left: auto;
        color: #777;
      }
      .status {
        border-top: 1px solid #adacac;
        padding: 3px 10px;
        background: #ece9d8;
        color: #444;
      }
    `,
  ],
  template: `
    <div class="crumbs">
      @for (crumb of path(); track $index; let last = $last) {
        <button (click)="goto($index)">{{ crumb.name }}</button>
        @if (!last) {
          <span>›</span>
        }
      }
    </div>
    <ul>
      @for (node of current().children ?? []; track node.name) {
        <li
          [class.folder]="node.kind === 'folder'"
          (click)="open(node)"
          data-testid="fs-row"
        >
          <span class="glyph">{{ node.kind === 'folder' ? '📁' : '📄' }}</span>
          <span>{{ node.name }}</span>
          @if (node.size) {
            <span class="size">{{ node.size }}</span>
          }
        </li>
      }
    </ul>
    <div class="status">{{ count() }} item(s)</div>
  `,
})
export class FileExplorerApp {
  private fs = inject(FileSystemService);
  readonly path = signal<FsNode[]>([this.fs.root]);
  readonly current = computed(() => this.path()[this.path().length - 1]);
  readonly count = computed(() => this.current().children?.length ?? 0);

  open(node: FsNode): void {
    if (node.kind === 'folder') {
      this.path.set([...this.path(), node]);
    }
  }

  goto(index: number): void {
    this.path.set(this.path().slice(0, index + 1));
  }
}
