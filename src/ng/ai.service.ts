/**
 * Renderer-side helpers for Bliss AI (the Claude assistant). The heavy lifting
 * — API key custody, the network call, SSE parsing — all happens in the main
 * process; the renderer only sees the whitelisted ai:* channels exposed on
 * the preload bridge. These helpers stay inert (aiAvailable() === false) when
 * the bridge or a key is absent, so consumers degrade gracefully.
 */

interface AiBridge {
  hasKey: () => Promise<boolean>;
  chat: (req: { messages: Array<{ role: string; content: string }>; model?: string }) => Promise<{ streamId: string } | { error: string }>;
  cancel: (streamId: string) => Promise<void>;
  onChunk: (cb: (msg: { streamId: string; type: 'delta' | 'done' | 'error'; text?: string }) => void) => () => void;
}

const bridge = (): AiBridge | undefined =>
  (window.electronAPI as unknown as { ai?: AiBridge } | undefined)?.ai;

/** Whether the AI bridge exists at all (key presence is checked per call). */
export function aiAvailable(): boolean {
  return !!bridge();
}

export async function aiHasKey(): Promise<boolean> {
  try {
    return (await bridge()?.hasKey()) ?? false;
  } catch {
    return false;
  }
}

/**
 * One-shot ask (terminal `ai`, command palette): streams internally and
 * resolves with the full answer.
 */
export function askBlissAi(prompt: string, model?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const api = bridge();
    if (!api) {
      reject(new Error('Bliss AI is not available'));
      return;
    }
    void (async () => {
      const res = await api.chat({ messages: [{ role: 'user', content: prompt }], model });
      if ('error' in res) {
        reject(new Error(res.error));
        return;
      }
      let acc = '';
      const off = api.onChunk((msg) => {
        if (msg.streamId !== res.streamId) return;
        if (msg.type === 'delta') acc += msg.text ?? '';
        else if (msg.type === 'done') {
          off();
          resolve(acc);
        } else {
          off();
          reject(new Error(msg.text || 'AI request failed'));
        }
      });
    })().catch(reject);
  });
}
