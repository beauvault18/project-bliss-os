# Project Bliss OS

> *What if Windows XP had evolved with Compiz physics instead of dying?*

An interactive desktop demo built in **Electron**: a real **WebGL** scene
(three.js / react-three-fiber) renders the Bliss-wallpapered desktop, and
**wobbly draggable windows** float above it. App windows are powered by **both
React and Angular** — in the same app, side by side.

## v1 features

- **XP desktop shell** — procedural Bliss wallpaper (WebGL, with pointer parallax), Luna taskbar, system tray + live clock.
- **Wobbly draggable windows** — Compiz-style jelly: windows lean into motion, squash-and-stretch, and overshoot back to rest. Magnetic snapping to screen edges and neighboring windows.
- **Living Start menu** — animated XP-style menu with search and one-click app launching.
- **Dual-framework apps** — Notepad + Minesweeper (React); Calculator + File Explorer (Angular). Each Angular window is a standalone, zoneless, signal-only component.

## Architecture

| Concern | Choice | Why |
| --- | --- | --- |
| Desktop scene | Orthographic react-three-fiber `<Canvas>` (1 unit = 1 px) | Real WebGL; trivial screen↔world math |
| Windows | Live DOM via `drei <Html>`, anchored to 3D points | Content stays fully interactive |
| Wobble | `@react-spring/web` skew/squash/overshoot driven by `@use-gesture` velocity | Convincing jelly without rasterizing DOM (which would kill interactivity) |
| Window manager | `zustand` store | Single source of truth for position/size/z/focus |
| React vs Angular | React owns scene + shell + window manager; Angular powers 2 apps | r3f is a React renderer; Angular does real work in its windows |
| Angular mounting | `createApplication` + `createComponent(host)`, **zoneless** | Supports multiple instances; clean teardown; no zone.js |

See [src/](src/) — notable files: [windowStore.ts](src/core/windowStore.ts),
[DesktopScene.tsx](src/scene/DesktopScene.tsx), [WindowView.tsx](src/windows/WindowView.tsx),
[AngularWindowHost.tsx](src/framework-bridges/AngularWindowHost.tsx).

### Build constraints (don't break these)

- **Angular runs in JIT** (`@angular/compiler` imported in [renderer.ts](src/renderer.ts)). Do **not** add `@analogjs/vite-plugin-angular` — two AOT compilers in one Vite build silently drop the bundle.
- The React plugin **excludes `src/angular/**`** in [vite.config.ts](vite.config.ts). Angular components stay decorator-light and use `inject()` (no constructor DI) so esbuild needs no `emitDecoratorMetadata`.
- CSP keeps `'unsafe-eval'` (required for Angular JIT). See [index.html](index.html).
- Electron main/preload are CommonJS (no `"type": "module"`).

## Getting started

```bash
npm install
npm run dev      # Vite + Electron with hot reload
npm run build    # production build → dist/ + dist-electron/
npm run verify   # build, then run the headless smoke test
```

> **Note:** `npm run dev` needs a GPU for WebGL. The smoke test
> ([scripts/smoke.cjs](scripts/smoke.cjs)) forces software WebGL (SwiftShader)
> so it runs headless. If your shell exports `ELECTRON_RUN_AS_NODE=1`, prefix
> commands with `env -u ELECTRON_RUN_AS_NODE` so Electron launches a real window.

## What the smoke test verifies

WebGL canvas + taskbar mount · a React window renders · the Angular Calculator
computes `7 + 8 = 15` (zoneless signals) · the Angular File Explorer navigates
(DI service) · windows drag · closing and reopening an Angular window leaves no
leaked roots · zero console errors.

## Roadmap (future milestones)

3D workspace cube/sphere · "Bliss World" zoom (desktop → room → world) · live
window-stack previews · AI side panel · physics-everywhere (elastic folders,
throw-files-into-folders) · Mission Control. The architecture leaves seams for
these (e.g. a workspace dimension in the window store).
