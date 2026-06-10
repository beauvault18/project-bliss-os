const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const os = require('node:os');
// The smoke harness is its own main process — register the same telemetry handler
// that electron/main.ts provides so the IPC bridge can be exercised end-to-end.
let prevTimes = os.cpus().map((c) => ({ ...c.times }));
ipcMain.handle('get-system-stats', () => {
  const cpus = os.cpus();
  const cores = cpus.map((c, i) => {
    const p = prevTimes[i] ?? c.times, t = c.times;
    const idle = t.idle - p.idle;
    const total = t.user - p.user + (t.nice - p.nice) + (t.sys - p.sys) + idle + (t.irq - p.irq);
    return total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : 0;
  });
  prevTimes = cpus.map((c) => ({ ...c.times }));
  return { cores, cpu: cores.reduce((a, b) => a + b, 0) / (cores.length || 1), ramUsed: os.totalmem() - os.freemem(), ramTotal: os.totalmem() };
});
// Force software WebGL (SwiftShader) so the Three.js canvas gets a GL context in
// this headless/sandboxed environment.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('use-gl', 'angle');
app.commandLine.appendSwitch('use-angle', 'swiftshader');

const errors = [];
const ROOT = path.join(__dirname, '..');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    show: false,
    width: 1280, height: 800,
    // backgroundThrottling off so the apps' setInterval timers fire at their real
    // cadence even though this window is never shown (needed for the gate test).
    webPreferences: { preload: path.join(ROOT, 'dist-electron', 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.webContents.on('console-message', (...a) => {
    const ev = a[0];
    const level = (ev && ev.level) ?? a[1];
    const msg = (ev && ev.message) || a[2];
    if (msg && (level === 'error' || level === 3)) errors.push(msg);
  });
  win.webContents.on('render-process-gone', (_e, d) => { console.log('RENDER_GONE', JSON.stringify(d)); app.exit(1); });

  const run = (code) => win.webContents.executeJavaScript(code);
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  // Poll until the cube has settled — robust to variable spin time under software GL.
  const settle = async () => {
    for (let i = 0; i < 60 && (await run('!!window.__bliss.spinning()')); i++) await wait(150);
    await wait(300); // let the final rest transform paint
  };

  win.loadFile(path.join(ROOT, 'dist', 'index.html'));
  win.webContents.on('did-finish-load', async () => {
    try {
      // Angular bootstrap + JIT compile + dynamic window components are all async.
      await wait(1800);

      const base = await run(`({
        canvas: !!document.querySelector('canvas.desktop-bg'),
        start: !!document.querySelector('[data-testid="start-button"]'),
        clock: !!document.querySelector('[data-testid="clock"]'),
        bliss: typeof window.__bliss,
        windows: window.__bliss ? window.__bliss.windows().length : -1,
      })`);
      console.log('BASE ' + JSON.stringify(base));

      // This window is never shown → document.hidden is true, which would pause
      // every app via the visibility gate. Force "foreground" so the rest of the
      // suite (and the gate test below) sees workspace/minimized-based gating.
      await run(`window.__bliss.setHidden(false)`);

      // Seeded layout: 6 cyberpunk apps across the 4 cube faces (video layout).
      // Windows on every face are mounted in the DOM (off-faces just project
      // edge-on), so these queries resolve regardless of the active workspace.
      const seeded = await run(`({
        fractal: !!document.querySelector('[data-appid="fractal-engine"] canvas'),
        terminal: !!document.querySelector('[data-appid="system-terminal"] .terminal'),
        space: !!document.querySelector('[data-appid="space-tracker"] canvas'),
        charts: document.querySelectorAll('[data-appid="market-charts"] .col').length,
        media: !!document.querySelector('[data-appid="media-streamer"] .player'),
        diagRows: document.querySelectorAll('[data-appid="diagnostics"] .row').length,
        tasks: document.querySelectorAll('[data-testid="task-button"]').length,
        launchers: document.querySelectorAll('[data-testid="launcher"]').length,
      })`);
      console.log('SEEDED ' + JSON.stringify(seeded));

      // Each seeded app landed on its assigned cube face.
      const layout = await run(`(() => {
        const m = {};
        for (const w of window.__bliss.windows()) m[w.appId] = w.workspace;
        return m;
      })()`);
      console.log('LAYOUT ' + JSON.stringify(layout));

      // Angular interactivity / DI: open the calculator, 7 + 8 = 15, then close it.
      await run(`window.__bliss.open('calculator')`);
      await wait(400);
      await run(`(() => {
        const root = document.querySelector('[data-appid="calculator"]');
        const press = (label) => {
          const btn = [...root.querySelectorAll('button')].find(b => b.textContent.trim() === label);
          if (!btn) throw new Error('no calc button ' + label);
          btn.click();
        };
        press('7'); press('+'); press('8'); press('=');
      })()`);
      await wait(200);
      const calc = await run(`document.querySelector('[data-appid="calculator"] [data-testid="calc-display"]').textContent.trim()`);
      console.log('CALC ' + JSON.stringify(calc));

      // Close the calculator; count returns to the seeded 6.
      const beforeClose = await run(`window.__bliss.windows().length`);
      await run(`(() => { const w = window.__bliss.windows().find(w => w.appId === 'calculator'); window.__bliss.close(w.id); })()`);
      await wait(300);
      const afterClose = await run(`({
        windows: window.__bliss.windows().length,
        calcGone: !document.querySelector('[data-appid="calculator"] [data-testid="calc-display"]'),
      })`);
      console.log('CLOSE ' + JSON.stringify({ beforeClose, afterClose }));

      // --- R1b: live-window cube (windows live on rotating faces) -----------
      // 4 faces; at rest the active face is square-on so its windows are full
      // width, while off-workspace windows sit edge-on (≈0 projected width).
      const wsBase = await run(`({
        indicator: !!document.querySelector('[data-testid="workspace-indicator"]'),
        pips: document.querySelectorAll('[data-testid="workspace-pip"]').length,
        active: window.__bliss.workspace(),
        cube: !!document.querySelector('.cube'),
        faces: document.querySelectorAll('.cube-face').length,
        fractalW: Math.round((document.querySelector('[data-appid="fractal-engine"]')?.getBoundingClientRect().width) || 0),
      })`);
      // Switch to workspace 2 (idx 1): cube rotates, then settles. The wait is
      // generous (SPIN_MS is 950) because the smoke harness forces software GL
      // (SwiftShader), where compositing the R1c glass windows is far slower.
      await run(`window.__bliss.switchWorkspace(1)`);
      await settle();
      const onWs1 = await run(`({
        active: window.__bliss.workspace(),
        spinning: window.__bliss.spinning(),
        fractalW: Math.round((document.querySelector('[data-appid="fractal-engine"]')?.getBoundingClientRect().width) || 0),
        spaceW: Math.round((document.querySelector('[data-appid="space-tracker"]')?.getBoundingClientRect().width) || 0),
      })`);
      // New window opens on the active workspace (idx 1), square-on / full width.
      // Poll until the open "map" animation finishes (it's slower under software
      // GL) so the window is measured at full scale, not mid-zoom.
      await run(`window.__bliss.open('calculator')`);
      for (let i = 0; i < 50; i++) {
        const w = await run(`Math.round(document.querySelector('[data-appid="calculator"]')?.getBoundingClientRect().width || 0)`);
        if (w >= 250) break;
        await wait(100);
      }
      const newWin = await run(`(() => {
        const w = window.__bliss.windows().find(x => x.appId === 'calculator');
        const el = document.querySelector('[data-appid="calculator"]');
        return { ws: w ? w.workspace : null, width: Math.round((el?.getBoundingClientRect().width) || 0) };
      })()`);
      // Spin back to workspace 1 (idx 0): fractal returns square-on, calc goes edge-on.
      await run(`window.__bliss.switchWorkspace(0)`);
      await settle();
      const back = await run(`({
        active: window.__bliss.workspace(),
        spinning: window.__bliss.spinning(),
        fractalW: Math.round((document.querySelector('[data-appid="fractal-engine"]')?.getBoundingClientRect().width) || 0),
        calcW: Math.round((document.querySelector('[data-appid="calculator"]')?.getBoundingClientRect().width) || 0),
      })`);
      console.log('WORKSPACE ' + JSON.stringify({ wsBase, onWs1, newWin, back }));

      // --- R2: edge-flip drag-to-spin --------------------------------------
      // Drag a ws0 window's titlebar past the right edge: the workspace flips to
      // 1 and the window migrates with it (survives the @for reconciliation
      // because the drag listeners live on `window`, not the window element).
      const flip = await run(`(() => {
        const before = window.__bliss.workspace();
        const tb = document.querySelector('[data-appid="fractal-engine"] [data-testid="titlebar"]');
        tb.dispatchEvent(new PointerEvent('pointerdown', { clientX: 120, clientY: 70, bubbles: true }));
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: window.innerWidth - 4, clientY: 70, bubbles: true }));
        const w = window.__bliss.windows().find(x => x.appId === 'fractal-engine');
        // Wobble: the fast move should have skewed the window before release.
        const out = { before, after: window.__bliss.workspace(), winWs: w ? w.workspace : null, skewX: w ? w.skewX : null };
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        return out;
      })()`);
      await settle(); // flip spin
      // Poll until the wobble RAF fully stops (it sets skew to exactly 0 when done)
      // — its duration varies under software GL, so don't assert on a fixed wait.
      for (let i = 0; i < 60; i++) {
        if (await run(`(window.__bliss.windows().find(x => x.appId === 'fractal-engine')?.skewX ?? 0) === 0`)) break;
        await wait(100);
      }
      const flipDone = await run(`(() => {
        const w = window.__bliss.windows().find(x => x.appId === 'fractal-engine');
        return { active: window.__bliss.workspace(), spinning: window.__bliss.spinning(), skewX: w ? w.skewX : null };
      })()`);
      console.log('EDGEFLIP ' + JSON.stringify({ flip, flipDone }));

      // --- R3: genie minimize / restore ------------------------------------
      // Minimize a window on the active face (so the genie can measure it),
      // then restore it via the taskbar path. The flag flips around the anim.
      const spaceId = await run(`window.__bliss.windows().find(w => w.appId === 'space-tracker').id`);
      const isMin = (id) => run(`window.__bliss.windows().find(w => w.id === ${JSON.stringify(id)}).minimized`);
      await run(`window.__bliss.minimize(${JSON.stringify(spaceId)})`);
      await wait(1500); // genie suck-in (450ms) — generous for the hidden/software-GL window
      const minimized = await isMin(spaceId);
      await run(`window.__bliss.restore(${JSON.stringify(spaceId)})`);
      await wait(1500); // reverse-genie
      const restored = await isMin(spaceId);
      console.log('MINIMIZE ' + JSON.stringify({ minimized, restored }));

      // --- R3: fire close --------------------------------------------------
      // Incinerate a window via fireClose; it stays during the burn, then the
      // store removes it on the animation's finish.
      const beforeFire = await run(`window.__bliss.windows().length`);
      const calcId = await run(`window.__bliss.windows().find(w => w.appId === 'calculator').id`);
      await run(`window.__bliss.fireClose(${JSON.stringify(calcId)})`);
      await wait(1600); // fire burn (600ms) — generous for the hidden/software-GL window
      const afterFire = await run(`({
        count: window.__bliss.windows().length,
        gone: !window.__bliss.windows().some(w => w.id === ${JSON.stringify(calcId)}),
      })`);
      console.log('FIRECLOSE ' + JSON.stringify({ beforeFire, afterFire }));

      // --- Live telemetry: real CPU/RAM over the Electron bridge -----------
      const tele = await run(`window.electronAPI.getSystemStats().then(s => ({ cores: s.cores.length, cpu: typeof s.cpu, ram: s.ramTotal > 0 }))`);
      console.log('TELEMETRY ' + JSON.stringify(tele));

      // --- Perf: per-window animation gate ---------------------------------
      // Diagnostics is on ws3 (off the active ws1 face) → its loop is gated, so
      // its crypto ticker (mocked random-walk) stays frozen; switching to ws3
      // makes it live again. (Real CPU bars can be static at idle, so we assert
      // on the always-moving ticker instead.)
      const diagW = () => run(`Array.from(document.querySelectorAll('[data-appid="diagnostics"] .tick .v')).map(e => e.textContent).join(',')`);
      const offA = await diagW();
      await wait(1200);
      const offB = await diagW();
      await run(`window.__bliss.switchWorkspace(3)`);
      await settle();
      const onA = await diagW();
      await wait(1200);
      const onB = await diagW();
      const gate = { frozenOff: offA === offB, liveOn: onA !== onB };
      console.log('GATE ' + JSON.stringify(gate));

      // --- Correctness: minimized window closable from the dock + genie purge
      const diagId = await run(`window.__bliss.windows().find(w => w.appId === 'diagnostics').id`);
      const genieBefore = await run(`window.__bliss.__genieSize()`);
      await run(`window.__bliss.minimize(${JSON.stringify(diagId)})`);
      await wait(1500);
      const genieAfterMin = await run(`window.__bliss.__genieSize()`);
      await run(`(() => {
        const x = document.querySelector('[data-taskwin="' + ${JSON.stringify(diagId)} + '"] [data-testid="task-close"]');
        x.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      })()`);
      await wait(600);
      const minClose = await run(`({
        gone: !window.__bliss.windows().some(w => w.id === ${JSON.stringify(diagId)}),
        genieSize: window.__bliss.__genieSize(),
      })`);
      console.log('MINCLOSE ' + JSON.stringify({ genieBefore, genieAfterMin, minClose }));

      // --- Expo overview ---------------------------------------------------
      // Toggle into the 2x2 grid, then click workspace 2's thumbnail → it folds
      // back to the cube on that workspace (windows never unmount).
      await run(`window.__bliss.toggleExpo()`);
      await wait(800);
      const expoOn = await run(`({ mode: window.__bliss.mode(), grid: !!document.querySelector('.cube-viewport--expo'), faces: document.querySelectorAll('.cube-viewport--expo .cube-face').length })`);
      await run(`document.querySelector('.cube-face[data-ws="2"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
      await wait(800);
      const expoSel = await run(`({ mode: window.__bliss.mode(), active: window.__bliss.workspace() })`);
      console.log('EXPO ' + JSON.stringify({ expoOn, expoSel }));

      // --- Window resize + maximize ----------------------------------------
      const rid = await run(`window.__bliss.windows().find(w => w.appId === 'media-streamer').id`);
      const vp = await run(`({ w: window.innerWidth, h: window.innerHeight })`);
      const geom = (id) => run(`(() => { const w = window.__bliss.windows().find(x => x.id === ${JSON.stringify(id)}); return { x: w.x, y: w.y, w: w.w, h: w.h, max: w.maximized }; })()`);
      await run(`window.__bliss.resize(${JSON.stringify(rid)}, 500, 350)`);
      const resized = await geom(rid);
      await run(`window.__bliss.resize(${JSON.stringify(rid)}, 50, 30)`); // below minimum → clamps
      const clamped = await geom(rid);
      await run(`window.__bliss.toggleMaximize(${JSON.stringify(rid)})`);
      const maxed = await geom(rid);
      await run(`window.__bliss.toggleMaximize(${JSON.stringify(rid)})`); // restore
      const unmaxed = await geom(rid);
      console.log('RESIZE ' + JSON.stringify({ resized, clamped, maxed, unmaxed }));

      // Tear-loose: maximizing then dragging the titlebar restores the prior size.
      await run(`window.__bliss.toggleMaximize(${JSON.stringify(rid)})`);
      const tear = await run(`(() => {
        const tb = document.querySelector('[data-winid="' + ${JSON.stringify(rid)} + '"] [data-testid="titlebar"]');
        tb.dispatchEvent(new PointerEvent('pointerdown', { clientX: 400, clientY: 45, bubbles: true }));
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: 430, clientY: 95, bubbles: true }));
        const w = window.__bliss.windows().find(x => x.id === ${JSON.stringify(rid)});
        const out = { max: w.maximized, w: w.w, h: w.h };
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        return out;
      })()`);
      console.log('TEAR ' + JSON.stringify(tear));

      console.log('ERRORS ' + JSON.stringify(errors));
      const ok =
        base.canvas && base.start && base.clock && base.bliss === 'object' && base.windows === 6 &&
        seeded.fractal && seeded.terminal && seeded.space && seeded.charts > 0 &&
        seeded.media && seeded.diagRows >= 24 && seeded.tasks === 6 && seeded.launchers >= 3 &&
        layout['fractal-engine'] === 0 && layout['system-terminal'] === 0 &&
        layout['space-tracker'] === 1 && layout['market-charts'] === 1 &&
        layout['media-streamer'] === 2 && layout['diagnostics'] === 3 &&
        calc === '15' &&
        afterClose.windows === beforeClose - 1 && afterClose.windows === 6 && afterClose.calcGone === true &&
        wsBase.indicator === true && wsBase.pips === 4 && wsBase.active === 0 &&
        wsBase.cube === true && wsBase.faces === 4 && wsBase.fractalW > 200 &&
        onWs1.active === 1 && onWs1.spinning === false && onWs1.fractalW < 150 && onWs1.spaceW > 200 &&
        newWin.ws === 1 && newWin.width > 200 &&
        back.active === 0 && back.spinning === false && back.fractalW > 200 && back.calcW < 150 &&
        flip.before === 0 && flip.after === 1 && flip.winWs === 1 &&
        Math.abs(flip.skewX) > 1 && Math.abs(flipDone.skewX) < 0.1 &&
        flipDone.active === 1 && flipDone.spinning === false &&
        minimized === true && restored === false &&
        afterFire.count === beforeFire - 1 && afterFire.gone === true &&
        gate.frozenOff === true && gate.liveOn === true &&
        tele.cores > 0 && tele.cpu === 'number' && tele.ram === true &&
        minClose.gone === true && genieAfterMin === genieBefore + 1 &&
        minClose.genieSize === genieBefore &&
        expoOn.mode === 'EXPO' && expoOn.grid === true && expoOn.faces === 4 &&
        expoSel.mode === 'CUBE' && expoSel.active === 2 &&
        resized.w === 500 && resized.h === 350 &&
        clamped.w === 200 && clamped.h === 140 &&
        maxed.max === true && maxed.x === 0 && maxed.y === 32 && maxed.w === vp.w && maxed.h === vp.h - 32 &&
        unmaxed.max === false && unmaxed.w === 200 && unmaxed.h === 140 &&
        tear.max === false && tear.w === 200 && tear.h === 140 &&
        errors.length === 0;
      console.log('VERDICT ' + (ok ? 'PASS' : 'FAIL'));
      app.exit(ok ? 0 : 2);
    } catch (e) {
      console.log('TEST_ERR ' + (e && e.message));
      console.log('ERRORS ' + JSON.stringify(errors));
      app.exit(3);
    }
  });
});
setTimeout(() => { console.log('HARD_TIMEOUT'); console.log('ERRORS ' + JSON.stringify(errors)); app.exit(9); }, 90000);
