# Project Bliss OS

> *A high-gloss Compiz-Fusion desktop, rebuilt for 2026 — a rotating workspace cube over a living shader galaxy, five holographic themes, wobbly windows, genie/fire effects, real apps, synthesized sound, and a streaming Claude assistant.*

An interactive **spatial desktop shell** built in **Electron** with a **pure, zoneless Angular 19** UI layer over a direct **Three.js** WebGL background. The workspace "cube" is a CSS-3D layer that floats above a WebGL galaxy; windows are live, fully-interactive DOM that wobble, pop off the cube faces in 3D, and animate through their whole lifecycle.

## Features

**Themes & environment**
- **Five themes** (Bliss Classic · Cyber Night · Synthwave Sunset · Hologram White · Matrix) over a design-token system — switching morphs the entire shell *and* the WebGL galaxy in ~1 s
- **Scene 2.0**: procedural shader nebula (FBM + domain warp), neon shader floor with horizon fog, GPU dust with **warp streaks during cube spins**, shooting stars, aurora, a synthwave sun, digital rain — plus bloom, **chromatic aberration that surges at mid-spin**, film grain and vignette
- **Quality tiers** (LOW→ULTRA) chosen by live fps sampling + adaptive resolution; software GL stays on the lean path
- Focused windows **cast their accent glow onto the WebGL floor** — the DOM lights the world

**Window management & physics**
- 4-workspace **CSS-3D cube**, edge-flip drag-to-spin, **wobbly windows**, 3D Z-pop
- **Ctrl+Tab cinematic switcher** (coverflow cards; cross-face commits ride the cube spin)
- **Magnetic snap zones** (halves/quarters/maximize) with holographic previews
- **Ctrl+K command palette** (apps, windows, actions, themes, "Ask AI")
- Right-click **context menus**, always-on-top, aero-shake, taskbar peek, Expo cross-face drag
- **Genie** minimize/restore, **fire** close, window-open map animation

**Real apps**
- **Bliss AI** — streaming Claude assistant (Fable 5 / Sonnet 4.6; key encrypted via safeStorage, never in the renderer)
- Interactive **terminal** (sandboxed interpreter — `ls`, `cat`, `open`, `theme`, `ai`, …)
- **File Explorer** (real read-only home browsing) → opens files in **Notepad** (real open/save via native dialogs)
- **Market Analytics** + Diagnostics with a **live Binance feed** (LIVE/SIM badge, deterministic offline fallback)
- **Media Engine** (real looping video + WebAudio spectrum visualizer) and **BlissWave Synth** (16-step sequencer)
- **Control Center**: themes, quality, motion speed (incl. reduced motion), sound, AI model + key

**Shell**
- **Session persistence** — your layout and settings survive restarts
- **Synthesized sound design** (pure WebAudio, zero assets): genie schloops, fire whooshes, panned cube-spin air, snap thunks
- Notification toasts, cinematic **boot sequence**, **Ctrl+L lock screen**, Conky telemetry over real IPC

## Architecture

| Concern | Choice | Why |
| --- | --- | --- |
| UI framework | **Pure Angular 19, standalone, zoneless** | Signals drive all change detection — no zone.js |
| Compilation | **JIT** (`@angular/compiler` at runtime) | esbuild builds the renderer; decorator `@Input`s |
| Background | **Three.js** directly, modular ([src/three/](src/three/)) | sky/floor/particles/aurora/post + quality governor |
| Workspace cube | **CSS-3D** composited over the WebGL `<canvas>` | The "compositor wall": CSS glow stays razor-sharp, real bloom lives in GL |
| State | Signal stores ([src/ng/](src/ng/)) | Single source of truth; every mutation returns a fresh array |
| Theming | CSS custom properties ([tokens.css](src/styles/tokens.css)) + a `--scene-*` bridge | One attribute switch re-skins DOM and GL together |
| IPC | Shared module ([electron/ipc/](electron/ipc/)) used by the app **and** the smoke harness | 19 whitelisted channels; see [docs/ipc-contract.md](docs/ipc-contract.md) |

**Security posture:** `contextIsolation: true`, `nodeIntegration: false`, no remote content, no shell exec anywhere, network only from the main process against hardcoded hosts (api.anthropic.com, api.binance.com), fs read-only + realpath-sandboxed except dialog-consented saves, AI key encrypted at rest and never exposed to the renderer. The forbidden-capabilities policy lives in [docs/ipc-contract.md](docs/ipc-contract.md).

## Getting started

```bash
npm install
npm run dev        # Vite + Electron with hot reload
npm run build      # production build → dist/ + dist-electron/
npm run verify     # build, then run the headless smoke test
npm run gpu-check  # hardware-GL sanity pass (shader sky, grade pass, theme morphs)
```

> **Note:** if your shell exports `ELECTRON_RUN_AS_NODE=1`, prefix the run/verify
> commands with `env -u ELECTRON_RUN_AS_NODE` so Electron launches a real window
> instead of booting as plain Node. The smoke test forces software WebGL
> (SwiftShader) so it runs headless, isolates `userData` into a temp dir, points
> the fs sandbox at a fixture, and runs the AI in mock-stream mode.

## What the smoke test verifies

Boot (canvas + panel + `__bliss` API) · the 6 seeded apps on the right cube faces · calculator interactivity (`7 + 8 = 15`) · **settings/session persistence round-trip** · **theme switching** (token cascade) · **interactive terminal** (help/ls/cat + sandbox-escape rejection + `open`) · **Notepad launched on a file** via `WINDOW_PARAMS` · market **SIM badge** (offline-pinned) · **toast lifecycle** · **Bliss AI streamed chat** (mock) + the terminal `ai` one-shot · **Ctrl+Tab switcher** (second-MRU focus) · **magnetic snap geometry** · cube spin geometry · edge-flip + wobble · genie minimize/restore · fire close · the visibility gate · live telemetry · Expo · resize/maximize/tear-loose · zero console errors.

## Media attribution

The bundled demo clip is trimmed from **Big Buck Bunny** © Blender Foundation, [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) — peach.blender.org. Fonts (Orbitron, Rajdhani, Inter, JetBrains Mono) are OFL-licensed, vendored as latin WOFF2 subsets.

## Built with Claude Code

This project was developed iteratively with [Claude Code](https://claude.com/claude-code) — v1 (R1 cube → R2 interaction → R3 lifecycle → Compiz polish → telemetry → window management) and the v2 "Holographic Emerald" release (tokens/themes, Scene 2.0, real apps, Bliss AI, persistence, sound).
