import { app, type IpcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { isString } from './validate';

/**
 * Read-only, sandboxed filesystem browsing for the File Explorer and the
 * terminal's ls/cat. The sandbox root is the user's home directory (or
 * BLISS_SANDBOX_ROOT for tests). Security invariants:
 *   - READ ONLY — there is no write/delete/rename channel here, ever.
 *   - Path containment is checked on the REALPATH (after resolving symlinks),
 *     so neither `..` traversal nor a symlink pointing outside can escape.
 *   - Listings are capped (500 entries) and reads are capped (1 MB, utf-8,
 *     binary rejected by NUL sniff) so the renderer can't be flooded.
 */

export const FS_CH = {
  list: 'fs:list',
  read: 'fs:read',
} as const;

const MAX_ENTRIES = 500;
const MAX_READ_BYTES = 1024 * 1024;

export interface FsEntry {
  name: string;
  kind: 'dir' | 'file';
  size: number;
  mtime: number;
}

function sandboxRoot(): string {
  return process.env['BLISS_SANDBOX_ROOT'] || app.getPath('home');
}

/** Resolve `rel` inside the sandbox and assert the REALPATH stays inside.
 *  Returns null for any escape attempt or unresolvable path. */
function resolveInSandbox(rel: unknown): string | null {
  if (!isString(rel)) return null;
  const root = sandboxRoot();
  let rootReal: string;
  try {
    rootReal = fs.realpathSync(root);
  } catch {
    return null;
  }
  const abs = path.resolve(rootReal, rel.replace(/^[/\\]+/, ''));
  let real: string;
  try {
    real = fs.realpathSync(abs);
  } catch {
    return null; // nonexistent
  }
  if (real !== rootReal && !real.startsWith(rootReal + path.sep)) return null;
  return real;
}

export function registerFs(ipcMain: IpcMain): void {
  ipcMain.handle(FS_CH.list, (_e, rel: unknown): { entries: FsEntry[]; truncated: boolean } | null => {
    const dir = resolveInSandbox(rel);
    if (!dir) return null;
    let names: fs.Dirent[];
    try {
      names = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    const entries: FsEntry[] = [];
    for (const d of names) {
      if (entries.length >= MAX_ENTRIES) break;
      try {
        const st = fs.statSync(path.join(dir, d.name));
        entries.push({
          name: d.name,
          kind: st.isDirectory() ? 'dir' : 'file',
          size: st.size,
          mtime: st.mtimeMs,
        });
      } catch {
        /* unstat-able entry (permissions) — skip */
      }
    }
    entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1));
    return { entries, truncated: names.length > MAX_ENTRIES };
  });

  ipcMain.handle(FS_CH.read, (_e, rel: unknown): { content: string } | { error: string } => {
    const file = resolveInSandbox(rel);
    if (!file) return { error: 'not found' };
    let st: fs.Stats;
    try {
      st = fs.statSync(file);
    } catch {
      return { error: 'not found' };
    }
    if (!st.isFile()) return { error: 'not a file' };
    if (st.size > MAX_READ_BYTES) return { error: 'file too large (>1 MB)' };
    try {
      const buf = fs.readFileSync(file);
      if (buf.includes(0)) return { error: 'binary file' };
      return { content: buf.toString('utf8') };
    } catch {
      return { error: 'unreadable' };
    }
  });
}
