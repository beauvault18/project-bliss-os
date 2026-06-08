# Project Bliss OS — 30-Second Demo Script

Run it:
```bash
env -u ELECTRON_RUN_AS_NODE npm run dev
```
(Then press **F11** for full-screen so it feels like an OS, not a browser.)

## The flow

1. **Open full-screen.** "This is Project Bliss OS — what if XP evolved with Compiz physics into a customizable OS."
2. **Point at the desktop.** Bliss wallpaper is a real WebGL scene; it parallaxes with the mouse. Icons float on top.
3. **Click the Calculator icon.** It bounces; a window opens with a **wobble**.
4. **Drag the Calculator around.** "Windows are physical — they bend and settle."
5. **Click the ✦ Rapid Control button.** "No more tiny X / minimize / maximize. One button, every action."
6. **Dock Left.** The window snaps to the left half.
7. **Open Notepad** from its icon. It opens on the right.
8. **Open the ✦ menu on Notepad → drag the Transparency slider.** "Every window has live transparency."
9. **Minimize Notepad.** It drops to the taskbar — note the **glowing running dot**.
10. **Close the Calculator with ✕ Close Window.** "Closing doesn't quit — see, the dot is still glowing, the app is still running."
11. **Quit it with ⏻ Quit App.** "Quit actually ends it — dot gone." (Mac-like separation of close vs quit.)
12. **Open Bliss Lab.** "And this is where it gets wild: a live playground to redesign the desktop itself — swap the minimize animation, the titlebar layout, the background — coming next."
13. **Close with:** "It's a customizable desktop UI playground. Every person can redesign how their desktop looks and behaves."

## Talking points if asked
- **Tech:** Electron + a real WebGL/three.js desktop; windows are live, interactive React **and** Angular — same shell, any framework.
- **Why it matters:** the window manager is the product. Controls, animations, and layout are all user-customizable.
- **What's real vs mocked:** the shell, windows, physics, lifecycle, and 4 real apps are real. Settings / Bliss Lab / AI Coder are stubs that prove the surface; backend/AI/face-tracking are future.

## Verify before demoing
```bash
npm run verify   # build + headless smoke test, should print VERDICT PASS
```
