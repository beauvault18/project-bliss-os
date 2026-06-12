# Bliss OS — IPC contract & security policy

The renderer is sandboxed (`contextIsolation: true`, `nodeIntegration: false`,
packaged builds load `file://` only — no remote content) and talks to the main
process exclusively through the named wrappers on `window.electronAPI`
(`electron/preload.ts`). It never holds `ipcRenderer`, so it can invoke exactly
the channels below and nothing else.

All handlers live in `electron/ipc/` — a shared module built to
`dist-electron/ipc.js` that BOTH real main processes register
(`electron/main.ts` and the smoke harness `scripts/smoke.cjs`), so the
handlers under test are byte-identical to the handlers that ship.

## Channel table

| Channel | Kind | Payload → Result | Guards |
|---|---|---|---|
| `get-system-stats` | invoke | — → `{cores[], cpu, ramUsed, ramTotal}` | delta-sampled from `node:os`; additive-only shape |
| `window:toggle-fullscreen` | invoke | — → boolean | sender-resolved window |
| `window:set-fullscreen` | invoke | value → boolean | `!!value` coercion |
| `window:is-fullscreen` | invoke | — → boolean | — |
| `settings:get` | invoke | — → settings object | read of `settings.json` (userData) |
| `settings:set` | invoke | partial → boolean | **key-whitelisted** merge, scalars only, atomic write |
| `session:load` | invoke | — → versioned layout \| null | unknown/corrupt schema → null (seed fallback) |
| `session:save` | invoke | state → boolean | `version === 1`, ≤256 KB, shape-checked, atomic write |
| `fs:list` | invoke | relPath → entries \| null | **read-only**; realpath-contained in sandbox root (home or `BLISS_SANDBOX_ROOT`); ≤500 entries |
| `fs:read` | invoke | relPath → content \| error | sandbox + ≤1 MB + utf-8 + NUL-sniff binary rejection |
| `dialog:open-file` | invoke | — → `{path,name,content}` \| null | native dialog = user consent; main does the read; path added to session allowlist |
| `dialog:save-file` | invoke | `{path?,content}` → `{path,name}` \| null | quiet re-save ONLY to a previously consented path; everything else routes through Save As |
| `market:candles` | invoke | `{symbol,interval}` → live candles \| `{source:'fallback'}` | **hardcoded host** (api.binance.com), symbol/interval allowlists, numbers-only validation, 45 s cache, `BLISS_MARKET_OFFLINE=1` pin |
| `market:ticker` | invoke | symbols[] → live prices \| fallback | same guards |
| `ai:set-key` | invoke | key → boolean | encrypted with `safeStorage` → `ai-key.bin`; empty string clears |
| `ai:has-key` | invoke | — → boolean | never returns the key |
| `ai:chat` | invoke | `{messages,model}` → `{streamId}` \| error | model allowlist; messages sanitized/bounded; **hardcoded host** (api.anthropic.com); `BLISS_AI_MOCK=1` canned stream |
| `ai:cancel` | invoke | streamId → ack | AbortController |
| `ai:chunk` | **main→renderer push** | `{streamId, type: delta\|done\|error, text?}` | sent only to the requesting sender |

## Forbidden capabilities (policy, not just current state)

These must never be added — they would collapse the security posture:

- **No shell execution.** No `child_process`/PTY anywhere in the repo. The
  terminal app is a renderer-side interpreter over the whitelisted channels.
- **No generic fetch proxy.** Network channels are purpose-specific with
  hardcoded hosts. A `fetch(url)` channel is a full-network primitive.
- **No filesystem writes outside dialog consent.** `fs:*` stays read-only and
  sandbox-rooted; writes happen only through `dialog:save-file`.
- **No remote renderer content.** No `<webview>`, no `http(s)` page loads, no
  browser-lite app. Packaged builds are `file://` only.
- **The AI key never crosses to the renderer.** Set-only over the bridge,
  encrypted at rest, used exclusively by the main process.
- **`nodeIntegration` stays false, `contextIsolation` stays true.**

The CSP in `index.html` keeps `'unsafe-eval'` solely because Angular runs in
JIT mode (templates compiled at runtime); every other wall above is what makes
that tradeoff acceptable.
