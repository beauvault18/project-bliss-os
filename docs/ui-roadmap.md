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

## ⏭️ Phase C — Minimize / close animations (next)
Replace instant minimize with a real effect — **genie** (fold into taskbar) or
**somersault** (flip into icon). Reserve true mesh-vertex wobble for this
non-interactive moment. Add a `minimizeStyle` to preferences so Bliss Lab can swap it.

## Phase D — Maximize physics + Settings
Rubber-band maximize (corners overshoot, snap) and un-maximize "bend down from
top". Real **Settings** app: window-controls **handedness** (left/right moves the
✦ button), default wobble strength, snap distance, theme.

## Phase E — Living background
Parallax particle / depth-layer background ("Parallax Space Desktop") reacting to
the mouse; later upgrade to webcam face-tracking. No camera work yet.

## Phase F — Bliss Lab playground
Live-tweak panel: minimize style · close animation · taskbar style · icon style ·
wobble strength · transparency · titlebar layout · Start-menu style · background.
This is the "redesign your own desktop" core.

## Explicitly later (product/backend, not prototype)
AI agents, real app mounting, Wayland/compositor, filesystem indexing, face
tracking, app-to-app negotiation.

## Seams already in place
`windowStore.running` (lifecycle) · `AppDef.showOnDesktop` · stub apps · the
`__bliss` debug hook · centralized geometry in `windowStore` (mirror for new docks).
