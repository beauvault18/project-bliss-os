# Project Bliss OS

> *A high-gloss Compiz-Fusion desktop, rebuilt for 2026 — a rotating workspace cube, wobbly windows, genie/fire lifecycle effects, a galaxy skybox with bloom, and live system telemetry.*

An interactive **spatial desktop shell** built in **Electron** with a **pure, zoneless Angular 19** UI layer over a direct **Three.js** WebGL background. The workspace "cube" is a CSS‑3D layer that floats above a WebGL galaxy; windows are live, fully‑interactive DOM that wobble, pop off the cube faces in 3D, and animate through their whole lifecycle.

## Features

**Workspace cube & environment**
- 4‑workspace **CSS‑3D cube** with a perspective camera, parallax + camera‑dolly synced to each spin
- Procedural **galaxy skydome** + neon floor grid; a **see‑through glass cube** while rotating
- **WebGL bloom** (`EffectComposer` / `UnrealBloomPass`), gated to hardware GL so it never destabilizes software rendering

**Window management & physics**
- **Edge‑flip** — drag a window past a screen edge to spin to the adjacent workspace, carrying it along
- **Wobbly windows** — velocity‑driven skew with an underdamped‑spring snap‑back
- **3D Z‑pop** — windows float off the cube faces during rotation (Compiz "3D Windows")
- **Drag‑to‑resize**, **maximize/restore** (with tear‑loose), and a **focused‑window neon halo + lift**

**Lifecycle effects**
- **Genie** minimize/restore (suck into the taskbar), **fire** close (incinerate), and a **window‑open** map animation

**Shell & apps**
- A top glass **"Tube" panel** with an **Applications menu**, left‑aligned window list, and system tray
- **Expo overview** — re‑project the cube into a 2×2 grid of live workspace thumbnails
- Nine standalone apps (fractal engine, terminal, space tracker, market charts, media streamer, diagnostics + a calculator/notepad/file‑explorer)
- **Conky** desktop widgets + **live CPU/RAM telemetry** over IPC (Node `os`, zero deps)

**Engineering**
- Per‑window **visibility gate** pauses off‑screen / minimized / backgrounded animation loops; the WebGL scene pauses when hidden
- Headless **smoke suite** ([scripts/smoke.cjs](scripts/smoke.cjs)) that drives the whole app and polls for animation settle

## Architecture

| Concern | Choice | Why |
| --- | --- | --- |
| UI framework | **Pure Angular 19, standalone, zoneless** (`provideExperimentalZonelessChangeDetection`) | Signals drive all change detection — no zone.js |
| Compilation | **JIT** (`@angular/compiler` at runtime) | esbuild builds the renderer; decorator `@Input`s (signal inputs aren't wired in JIT) |
| Background | **Three.js** directly (no react‑three‑fiber) | Perspective camera, galaxy, grid, bloom |
| Workspace cube | **CSS‑3D** layer composited *on top of* the WebGL `<canvas>` | The two layers never share a coordinate space — the "compositor wall" is used deliberately for depth |
| State | Signal stores — [`WindowStore`](src/ng/window-store.ts), [`WorkspaceStore`](src/ng/workspace-store.ts) | Single source of truth; every mutation returns a fresh array |
| App hosting | [`window-body.directive.ts`](src/app/window-body.directive.ts) → `vcr.createComponent` | Each window body is a standalone app component, with a per‑window visibility signal |
| Telemetry | `electron/main.ts` IPC (`get-system-stats`) → preload bridge | Real per‑core CPU + RAM with no external dependency |

Notable files: [desktop.component.ts](src/app/desktop.component.ts) (the cube engine + all interaction/animation), [desktop-scene.ts](src/three/desktop-scene.ts) (WebGL galaxy + bloom), [app-registry.ts](src/ng/app-registry.ts), [taskbar.component.ts](src/app/taskbar.component.ts).

## Getting started

```bash
npm install
npm run dev      # Vite + Electron with hot reload
npm run build    # production build → dist/ + dist-electron/
npm run verify   # build, then run the headless smoke test
```

> **Note:** if your shell exports `ELECTRON_RUN_AS_NODE=1`, prefix the run/verify
> commands with `env -u ELECTRON_RUN_AS_NODE` so Electron launches a real window
> instead of booting as plain Node. The smoke test forces software WebGL
> (SwiftShader) so it runs headless.

## What the smoke test verifies

Boot (canvas + panel + `__bliss` control API) · the 6 seeded apps render on the right cube faces · calculator interactivity (`7 + 8 = 15`, zoneless signals) · file‑explorer DI · cube spin geometry · **edge‑flip + wobble** · **genie minimize/restore** · **fire close** · the **visibility gate** (off‑face loops freeze, on‑face run) · **live telemetry** over IPC · **Expo overview** · **resize / maximize / tear‑loose** · zero console errors.

## Built with Claude Code

This project was developed iteratively with [Claude Code](https://claude.com/claude-code) — the full milestone history (R1 cube → R2 interaction → R3 lifecycle → Compiz polish → telemetry → window management) lives in the squashed commit and the development log.
