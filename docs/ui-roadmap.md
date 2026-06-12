# Bliss OS — UI roadmap

Build order is **one feature at a time**, `npm run verify` after each.

## ✅ v1 — "Compiz core" (done)

- 4-face workspace **CSS-3D cube** over a WebGL galaxy, parallax + camera dolly
- **Wobbly windows** (velocity→skew + underdamped snap-back spring), edge-flip
  drag-to-spin, 3D Z-pop during rotation
- **Genie** minimize/restore, **fire** close, window-open map animation
- Expo 2×2 overview, maximize/tear-loose/resize, glass Tube panel + Applications
  menu, Conky telemetry, UnrealBloom (hardware-GL gated)
- Headless smoke harness (`npm run verify`)

## ✅ v2 — "Holographic Emerald" (done — this release)

**Foundations**
- Shared IPC module (`electron/ipc/`) registered by both the app and the smoke
  harness (handlers can never drift); dead React-era deps removed; the desktop
  monolith decomposed into `CubeProjector` / `DragController` / `EffectsPlayer`
  / `GenieManager` / `ConkyComponent` / `installBlissApi`.

**Design system**
- Design tokens ([src/styles/tokens.css](../src/styles/tokens.css)) across the
  entire shell chrome; **five themes** — Bliss Classic, Cyber Night, Synthwave
  Sunset, Hologram White, Matrix — switching morphs the WebGL sky over ~1 s.
- Vendored type system: Orbitron (display) / Rajdhani (UI) / Inter (body) /
  JetBrains Mono (terminal/telemetry).

**Scene 2.0** ([src/three/](../src/three/))
- Shader nebula skydome (FBM + domain warp, twinkling hash-grid stars), shader
  floor grid with horizon fog + **window-light pooling** (focused windows light
  the world), GPU dust with **warp streaks during spins**, shooting stars,
  aurora ribbons, synthwave sun, Matrix digital rain.
- Post pipeline: bloom + grade pass (**chromatic aberration surging at
  mid-spin**, film grain, vignette).
- Quality tiers LOW/MED/HIGH/ULTRA with fps auto-detection + adaptive DPR;
  SwiftShader stays pinned to the original no-composer contract.

**Window-manager parity** (incl. the old Phase G)
- **Ctrl+Tab cinematic coverflow switcher** (MRU; cross-face commits ride the
  cube spin), **magnetic snap zones** (halves/quarters/maximize) with
  holographic previews, right-click **context menus**, **Ctrl+K command
  palette** with fuzzy search, always-on-top, aero-shake, taskbar peek,
  Expo cross-face window drag.

**Real apps**
- Terminal → interactive sandboxed interpreter (`help/ls/cat/open/theme/ai/…`)
- File Explorer → real read-only home browsing; opens files into Notepad
- Notepad → real open/save through consent-gated native dialogs
- Market Analytics + Diagnostics → live Binance feed with LIVE/SIM badges and
  a deterministic offline fallback
- Media Engine → real looping video + WebAudio spectrum visualizer
- BlissWave Synth → 16-step WebAudio sequencer
- **Bliss AI** → streaming Claude assistant (safeStorage key custody,
  main-process SSE, `BLISS_AI_MOCK=1` for CI)

**Shell**
- Session persistence (layout + settings survive restarts), Control Center
  (themes/quality/motion/sound/AI), **synthesized UI sound design** (zero
  assets), notification toasts, cinematic **boot sequence**, **Ctrl+L lock
  screen**, motion-scale + reduced-motion support.

## ⏭️ v3 candidates

- Window-content thumbnails in the switcher/Expo (app-provided snapshots)
- AI tool-use: let Bliss AI drive `__bliss` ("move my terminal to workspace 3")
- Wallpaper packs: user imagery blended into the shader sky
- Multi-monitor: per-display workspaces, cross-display edge-flip
- Per-app audio routing + mixer; tiling auto-layouts per face

## Explicitly never (see [ipc-contract.md](ipc-contract.md))

Real shell exec/PTY · generic fetch proxy · fs writes outside dialog consent ·
webview/browser app · Wayland/real compositor.
