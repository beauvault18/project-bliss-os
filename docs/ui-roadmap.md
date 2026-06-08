# Project Bliss OS — UI Roadmap

Build order is **one visual feature at a time**, `npm run verify` after each,
git commit after every success. Do **not** rebuild the working architecture.

## ✅ v1 — Foundation (done)
WebGL desktop (orthographic r3f Canvas) · Bliss wallpaper w/ parallax · wobbly
draggable windows (live `<Html>` + react-spring/use-gesture) · magnetic snapping ·
Luna taskbar + clock · Start menu · React apps (Notepad, Minesweeper) + Angular
apps (Calculator, File Explorer, zoneless/JIT).

## ✅ v2 Phase A — Demo feel (done)
- F11 / Esc **native full-screen** demo mode (IPC bridge).
- **Desktop icons** with hover-glow + click-bounce that **launch-or-focus** (no duplicates).
- Stub apps so every icon opens something: Settings, Bliss Lab, AI Coder.

## ✅ v2 Phase B — Window controls + lifecycle (done)
- Single **✦ Rapid Control** button replaces `_ ▢ ✕`.
- Animated portal menu: **Dock Left / Right**, **Fullscreen**, **Minimize**, **Close Window**, **Quit App**, **Transparency** slider.
- **Close vs Quit**: closing keeps the app *running* (glowing taskbar dot); quitting clears it.

## ✅ Phase C — Genie minimize / restore (done)
Window collapses toward its taskbar button on minimize and expands back on
restore. State machine commits `minimized` only on `onRest`. Modular preset
registry (`animationPresets.ts`).

## ✅ Phase D — Bliss Lab controls (done)
Real live control panel ([BlissLabApp.tsx](../src/apps/react/BlissLabApp.tsx)) +
persisted `preferencesStore`. Wired live: minimize/restore preset, wobble
strength/speed, snap strength, default opacity, glass mode, **window control side
(moves the ✦ button)**, animation speed, dramatic mode, demo toggles (show icons /
taskbar dots / animation labels), Reset Demo Layout, Reset All Settings.

## ✅ Phase E1 — Fire Close / Fire Quit (done)
Close/quit burn-down animations as modular close presets
([closeEffects.ts](../src/effects/closeEffects.ts),
[FireCloseOverlay.tsx](../src/effects/FireCloseOverlay.tsx)).
**Ember Close** (soft, blue/orange) keeps the app running; **Fire Quit**
(dramatic char/darken) clears the running indicator. Finalization is timer-driven
so the window leaves exactly when the burn ends; respects animation speed +
dramatic mode; toggleable via the Bliss Lab "Fire close effects" switch.

## ⏭️ Phase E2 — Somersault token minimize (next)
Flip-into-icon minimize as another minimize preset, selectable in Bliss Lab.

## Phase F — Parallax particle desktop
Depth-layer particle background reacting to the mouse; later webcam face-tracking.

## Later
Maximize rubber-band physics · real Settings app · Alt-Tab / Mission Control ·
desktop cube · AI Coder mock panel.

## Explicitly later (product/backend, not prototype)
AI agents, real app mounting, Wayland/compositor, filesystem indexing, face
tracking, app-to-app negotiation.

## Seams already in place
`windowStore.running` (lifecycle) · `AppDef.showOnDesktop` · stub apps · the
`__bliss` debug hook · centralized geometry in `windowStore` (mirror for new docks).
