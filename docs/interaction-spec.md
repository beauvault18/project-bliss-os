# Project Bliss OS — Interaction Spec

Reference for how each interaction behaves today. Source of truth for tests in
[`scripts/smoke.cjs`](../scripts/smoke.cjs).

## Global
| Input | Result |
|---|---|
| `F11` | Toggle native full-screen demo mode |
| `Esc` | Close open menu → else close Start menu → else exit full-screen |
| Move mouse | Living Parallax Desktop shifts depth layers, particles, and icons (premium, subtle) |

## Living Parallax Desktop (Phase F)
A futuristic floating background behind everything: a WebGL drifting starfield +
DOM depth layers (digital horizon, perspective grid, mist). Bliss Lab → **Living
Desktop** controls: Parallax on/off, Parallax strength, Particle density
(Low/Med/High), Particle speed (Slow/Normal/Fast), and **Hacker Mode** (green
grid + scanlines + glow — the intense variant). Honors prefers-reduced-motion.

## Desktop icons (`src/shell/DesktopIcons.tsx`)
- Hover → icon scales 1.12× and glows.
- Click → squash-and-pop bounce, then **launch-or-focus** the app (never duplicates).
- A small green **running dot** appears on the icon while its app is running.

## Windows (`src/windows/WindowView.tsx`)
- Drag the **titlebar** to move; window **wobbles** (skew/squash, springy settle).
- Release near a screen edge or another window → **magnetic snap**.
- Double-click titlebar → toggle maximize.
- Focus by clicking anywhere on the window (raises z-order).

## Rapid Control menu (`✦` → `src/shell/RapidControlMenu.tsx`)
The single ✦ button (right of the titlebar) opens an animated popover:
| Item | Action |
|---|---|
| ◧ Dock Left | Snap to left half of the screen |
| ◨ Dock Right | Snap to right half |
| ⛶ Fullscreen | Maximize (toggle) |
| ▁ Minimize | Hide to taskbar (still running) |
| ✕ Close Window | Remove the window; **app stays running** |
| ⏻ Quit App | Remove all its windows; **app stops running** |
| Opacity slider | Live window transparency, 20–100% |
- Closes on action, outside-click, or `Esc` (Esc is captured so it doesn't also exit fullscreen).

## Taskbar (`src/shell/Taskbar.tsx`)
- One button per **running app** (including apps with no open window).
- **Glowing dot** = running. Click focuses/restores; click the active app to minimize it.
- Windowless running app → click re-opens a fresh window.

## Minimize / Restore (modular presets)
Choose the minimize preset in Bliss Lab. The window only becomes `minimized`
**after** the animation finishes — it never vanishes early.
- **Genie** → collapses toward its **taskbar button**; restore by clicking that taskbar button.
- **Somersault Token** → flips a full forward somersault and shrinks onto the **desktop as a live process token** (icon + name + pulsing "live" dot). **Double-click the token** to restore. The taskbar dot still works too.
- Presets live in `src/core/animationPresets.ts` (`genie`, `somersault-token` active; gravity / cube are registered stubs). Tokens are derived from window state (`minimized && tokenPos`) so they never desync — closing/quitting the app removes the token.

## Close vs Quit (the key model + Fire animation)
- **Close Window** → soft **Ember Close** burn (blue/orange ember line travels top→bottom, gentle fade). The visible window goes away, but the app is still "running" (dot persists). Reopening starts **fresh**.
- **Quit App** → dramatic **Fire Quit** burn (top-down flame line, falling embers, char/darken). The app fully ends; its dot and all windows disappear.
- The burn finalizes deterministically when the animation ends — the window never leaves early. Toggle off via Bliss Lab → "Fire close effects" for instant close/quit. Dramatic mode intensifies the fire.

## Bliss Lab (Phase D — the control room)
Open the **Bliss Lab** app to change desktop/window behavior **live** (settings
persist via localStorage in `src/core/preferencesStore.ts`):
- **Animation Presets:** minimize/restore preset (Genie active; Somersault/Gravity/Cube shown as "soon"), animation speed (slow/normal/fast), dramatic mode.
- **Window Behavior:** wobble strength, wobble speed, snap strength.
- **Desktop Feel:** default window opacity, glass mode.
- **Controls:** window control side (Left/Right) — moves the ✦ button.
- **Debug / Demo Tools:** show desktop icons, show taskbar dots, show animation labels, Reset Demo Layout, Reset All Settings.

## Apps
- **React:** Notepad, Minesweeper, **Bliss Lab** (real control panel). **Angular (zoneless):** Calculator, File Explorer.
- **Stubs (later phases):** Settings, AI Coder — open a placeholder window today.
