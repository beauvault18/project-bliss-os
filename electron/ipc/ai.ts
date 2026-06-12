import { app, safeStorage, type IpcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { isString } from './validate';
import type { IpcContext } from './index';

/**
 * Bliss AI — the Claude assistant bridge. Everything privileged lives HERE:
 *   - The API key is encrypted with safeStorage into ai-key.bin and never
 *     crosses to the renderer after the Settings field is cleared.
 *   - The network call goes from the MAIN process to exactly one hardcoded
 *     host (api.anthropic.com) — no CSP change, no generic fetch proxy.
 *   - The SSE stream is parsed here; the renderer receives typed ai:chunk
 *     push events (the project's first main→renderer channel).
 * BLISS_AI_MOCK=1 streams a canned reply with no key and no network, so the
 * whole pipeline is testable headlessly.
 *
 * Model notes (Fable 5 request shape): no temperature/top_p/top_k, and no
 * `thinking` field (omitting it = snappy chat); max_tokens 8192.
 */

export const AI_CH = {
  setKey: 'ai:set-key',
  hasKey: 'ai:has-key',
  chat: 'ai:chat',
  cancel: 'ai:cancel',
  chunk: 'ai:chunk', // main → renderer push
} as const;

const MODELS = new Set(['claude-fable-5', 'claude-sonnet-4-6']);
const DEFAULT_MODEL = 'claude-fable-5';
const MAX_MESSAGES = 60;
const MAX_CONTENT_CHARS = 32_000;
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT =
  'You are Bliss AI, the ambient intelligence of Bliss OS — a Compiz-style spatial ' +
  'desktop with a workspace cube, wobbly windows and a neon galaxy. Be concise, ' +
  'warm, and a little futuristic. Plain text or minimal markdown (bold, code fences).';

const keyFile = () => path.join(app.getPath('userData'), 'ai-key.bin');

function storeKey(key: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(keyFile(), safeStorage.encryptString(key));
  } else {
    // No OS keystore (some Linux setups) — degraded but functional; documented.
    console.warn('safeStorage unavailable — storing AI key obfuscated only.');
    fs.writeFileSync(keyFile(), Buffer.from('b64:' + Buffer.from(key).toString('base64')));
  }
}

function loadKey(): string | null {
  try {
    const buf = fs.readFileSync(keyFile());
    const asText = buf.toString('utf8');
    if (asText.startsWith('b64:')) return Buffer.from(asText.slice(4), 'base64').toString('utf8');
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : null;
  } catch {
    return null;
  }
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

function sanitizeMessages(raw: unknown): ChatMsg[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out: ChatMsg[] = [];
  for (const m of raw) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if ((role !== 'user' && role !== 'assistant') || !isString(content)) return null;
    out.push({ role, content: content.slice(0, MAX_CONTENT_CHARS) });
  }
  return out;
}

export function registerAi(ipcMain: IpcMain, ctx: IpcContext): void {
  let streamSeq = 0;
  const aborts = new Map<string, AbortController>();

  ipcMain.handle(AI_CH.setKey, (_e, key: unknown) => {
    if (!isString(key)) return false;
    const trimmed = key.trim();
    if (!trimmed) {
      try {
        fs.unlinkSync(keyFile());
      } catch {
        /* nothing to clear */
      }
      return true;
    }
    storeKey(trimmed);
    return true;
  });

  ipcMain.handle(AI_CH.hasKey, () => process.env['BLISS_AI_MOCK'] === '1' || loadKey() !== null);

  ipcMain.handle(AI_CH.cancel, (_e, streamId: unknown) => {
    if (isString(streamId)) aborts.get(streamId)?.abort();
    return true;
  });

  ipcMain.handle(AI_CH.chat, (e, req: unknown): { streamId: string } | { error: string } => {
    const messages = sanitizeMessages((req as { messages?: unknown })?.messages);
    if (!messages) return { error: 'invalid messages' };
    const reqModel = (req as { model?: unknown })?.model;
    const model = isString(reqModel) && MODELS.has(reqModel) ? reqModel : DEFAULT_MODEL;
    const streamId = `s${++streamSeq}`;
    const sender = e.sender;
    const send = (type: 'delta' | 'done' | 'error', text?: string) => {
      if (!sender.isDestroyed()) sender.send(AI_CH.chunk, { streamId, type, text });
    };

    if (process.env['BLISS_AI_MOCK'] === '1') {
      // Canned stream — exercises the full pipeline keylessly (smoke harness).
      const parts = ['Hello from ', 'Bliss AI ', '(mock stream). ', 'All chunk plumbing ', 'is live.'];
      void (async () => {
        for (const p of parts) {
          await new Promise((r) => setTimeout(r, 25));
          send('delta', p);
        }
        send('done');
      })();
      return { streamId };
    }

    const key = loadKey();
    if (!key) return { error: 'no API key — set one in Control Center' };

    const ac = new AbortController();
    aborts.set(streamId, ac);
    void (async () => {
      try {
        const resp = await fetch(API_URL, {
          method: 'POST',
          signal: ac.signal,
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 8192,
            system: SYSTEM_PROMPT,
            messages,
            stream: true,
          }),
        });
        if (!resp.ok || !resp.body) {
          let detail = `HTTP ${resp.status}`;
          try {
            const j = (await resp.json()) as { error?: { message?: string } };
            if (j?.error?.message) detail = j.error.message;
          } catch {
            /* non-JSON error body */
          }
          send('error', detail);
          return;
        }
        // Minimal SSE parser: split on newlines, handle `data: {...}` events.
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const ev = JSON.parse(data) as {
                type?: string;
                delta?: { type?: string; text?: string };
                error?: { message?: string };
              };
              if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
                send('delta', ev.delta.text ?? '');
              } else if (ev.type === 'error') {
                send('error', ev.error?.message ?? 'stream error');
                return;
              }
            } catch {
              /* keep-alive / partial line — skip */
            }
          }
        }
        send('done');
      } catch (err) {
        send('error', ac.signal.aborted ? 'cancelled' : err instanceof Error ? err.message : 'network error');
      } finally {
        aborts.delete(streamId);
      }
    })();
    return { streamId };
  });

  void ctx; // window resolution not needed — chunks go to the requesting sender
}
