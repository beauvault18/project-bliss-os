# Project Bliss OS — Product Brief

## One line
A customizable desktop / window-manager UI prototype: *"what if Windows XP had
evolved with Compiz physics into a personalizable, 3D-composited OS?"*

## What it is (today)
An Electron app rendering a **real WebGL desktop** (three.js / react-three-fiber)
with physically **wobbly windows**, launchable **desktop icons**, a **living Start
menu**, and a redesigned **Rapid Control** window menu. App windows are powered by
**both React and Angular** to prove the shell is framework-agnostic.

This is a **clickable visual prototype**, not an OS backend. The goal is to prove
the concept is exciting enough to invest in.

## Who it's for
- **Demo audience:** the boss / stakeholders who want to *play with it* in 30 seconds.
- **Eventual users:** people who want to redesign how their own desktop looks and behaves.

## The bigger vision (north star, not yet built)
- Users **redesign their own desktop** (layouts, animations, controls, themes).
- Apps **negotiate** with each other and hand off data.
- The UI runs in a **3D composited space** with depth and physics.
- Background reacts to **parallax / eventually face-tracking**.

## What makes it different
| | Windows XP | macOS | Project Bliss OS |
|---|---|---|---|
| Windows | static rectangles | smooth, fixed | **wobbly, physical, throwable** |
| Window controls | fixed `_ ▢ ✕` | fixed traffic lights | **one ✦ Rapid Control menu, user-movable** |
| Close vs Quit | conflated | separate | **separate (running dot)** |
| Customization | themes | limited | **redesign the desktop itself (Bliss Lab)** |
| Rendering | 2D GDI | 2D + effects | **real WebGL 3D scene** |

## Current status
v1 + v2 Phase A/B shipped and verified (`npm run verify` passes). See
[ui-roadmap.md](ui-roadmap.md) for what's next.

## Success criteria for the prototype
- Opens full-screen and *feels* like an OS, not a browser tab.
- A non-technical person can click an icon, open an app, and "get it" instantly.
- Every interaction is demoable in seconds and is visibly cooler than XP/macOS.
