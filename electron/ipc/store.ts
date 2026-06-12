import { app, type IpcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Settings + session persistence. Two small JSON files in userData:
 *   settings.json — theme, motion, quality, sound, AI model (NEVER the key)
 *   session.json  — the serialized window layout (versioned schema)
 * Writes are atomic (tmp + rename) so a crash mid-write can't corrupt state.
 * Reads are defensive: any parse/shape failure returns null and the renderer
 * falls back to the seeded demo layout — persistence must never break boot.
 */

export const STORE_CH = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  sessionLoad: 'session:load',
  sessionSave: 'session:save',
} as const;

/** Whitelisted settings keys — `settings:set` merges ONLY these. */
const SETTINGS_KEYS = new Set([
  'theme',
  'quality',
  'motionScale',
  'volume',
  'muted',
  'aiModel',
  'bootAnimation',
  'soundEnabled',
  'headTracking',
]);

const MAX_SESSION_BYTES = 256 * 1024;

const file = (name: string) => path.join(app.getPath('userData'), name);

function readJson(name: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(name: string, value: unknown): void {
  const target = file(name);
  const tmp = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, target);
}

export function registerStore(ipcMain: IpcMain): void {
  ipcMain.handle(STORE_CH.settingsGet, () => {
    const raw = readJson('settings.json');
    return raw && typeof raw === 'object' ? raw : {};
  });

  ipcMain.handle(STORE_CH.settingsSet, (_e, partial: unknown) => {
    if (!partial || typeof partial !== 'object') return false;
    const current = (readJson('settings.json') as Record<string, unknown>) ?? {};
    const merged: Record<string, unknown> = { ...current };
    for (const [k, v] of Object.entries(partial as Record<string, unknown>)) {
      if (!SETTINGS_KEYS.has(k)) continue;
      // Settings values are scalars only — reject objects/functions outright.
      if (v !== null && typeof v === 'object') continue;
      merged[k] = v;
    }
    writeJsonAtomic('settings.json', merged);
    return true;
  });

  ipcMain.handle(STORE_CH.sessionLoad, () => {
    const raw = readJson('session.json') as { version?: unknown } | null;
    if (!raw || typeof raw !== 'object') return null;
    if (raw.version !== 1) return null; // unknown schema → seed fallback
    return raw;
  });

  ipcMain.handle(STORE_CH.sessionSave, (_e, state: unknown) => {
    if (!state || typeof state !== 'object') return false;
    const s = state as { version?: unknown; windows?: unknown };
    if (s.version !== 1 || !Array.isArray(s.windows)) return false;
    const json = JSON.stringify(state);
    if (json.length > MAX_SESSION_BYTES) return false;
    writeJsonAtomic('session.json', state);
    return true;
  });
}
