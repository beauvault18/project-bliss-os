const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
// Isolate all persisted state (settings/session files land in userData) so a
// smoke run never reads or pollutes a real profile — the fresh-profile seed
// path is itself what the suite asserts on.
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'bliss-smoke-')));
// Point the read-only fs sandbox at a fixture dir so the terminal/explorer
// tests are deterministic and never touch the real home directory.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'bliss-sb-'));
fs.writeFileSync(path.join(sandbox, 'hello.txt'), 'greetings from the sandbox\n');
fs.mkdirSync(path.join(sandbox, 'docs'));
process.env.BLISS_SANDBOX_ROOT = sandbox;
// Exercise the full AI streaming pipeline keylessly (canned main-process stream).
process.env.BLISS_AI_MOCK = '1';
// Pin market data to the deterministic SIM fallback — the gate test asserts on
// the SIM ticker's churn, and CI runs must never depend on the network.
process.env.BLISS_MARKET_OFFLINE = '1';
// The smoke harness is its own main process — register the SAME built IPC
// bundle that electron/main.ts uses, so the handlers under test are
// byte-identical to the handlers that ship (they can never drift).
let smokeWindow = null;
require(path.join(__dirname, '..', 'dist-electron', 'ipc.js')).registerAllIpc({
  getMainWindow: () => smokeWindow,
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
  smokeWindow = win;
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

      // --- R4: interactive terminal + sandboxed fs --------------------------
      // Drive the terminal's real command line: help, ls (fixture dir), open,
      // cat. The fs commands exercise the realpath-sandboxed fs:* channels.
      const term = await run(`(async () => {
        const root = document.querySelector('[data-appid="system-terminal"]');
        const input = root.querySelector('[data-testid="term-input"]');
        const logs = () => Array.from(root.querySelectorAll('.logs p')).map(p => p.textContent);
        const type = async (cmd) => {
          input.value = cmd;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          await new Promise(r => setTimeout(r, 400));
        };
        await type('help');
        const helpShown = logs().some(t => t.includes('built-in commands'));
        await type('ls');
        const lsHasFixture = logs().some(t => t.includes('hello.txt')) && logs().some(t => t.includes('docs/'));
        await type('cat hello.txt');
        const catHas = logs().some(t => t.includes('greetings from the sandbox'));
        await type('cat ../../etc/passwd');
        const escaped = logs().some(t => t.includes('root:'));
        await type('open calculator');
        await new Promise(r => setTimeout(r, 400));
        const calcOpen = window.__bliss.windows().some(w => w.appId === 'calculator');
        const w = window.__bliss.windows().find(x => x.appId === 'calculator');
        if (w) window.__bliss.close(w.id);
        return { helpShown, lsHasFixture, catHas, escaped, calcOpen };
      })()`);
      console.log('TERMINAL ' + JSON.stringify(term));

      // --- R4: Notepad launched on a file via WINDOW_PARAMS ------------------
      await run(`window.__bliss.open('notepad', { params: { path: 'hello.txt' } })`);
      await wait(500);
      const notepad = await run(`(() => {
        const ta = document.querySelector('[data-appid="notepad"] [data-testid="notepad-text"]');
        const loaded = !!ta && ta.value.includes('greetings from the sandbox');
        const w = window.__bliss.windows().find(x => x.appId === 'notepad');
        if (w) window.__bliss.close(w.id);
        return { loaded };
      })()`);
      console.log('NOTEPAD ' + JSON.stringify(notepad));
      await wait(300);

      // --- R7: market SIM badge (offline-pinned) + toast lifecycle ----------
      const market = await run(`(() => {
        const badge = document.querySelector('[data-appid="market-charts"] [data-testid="market-src"]');
        return { src: badge ? badge.textContent.trim() : null };
      })()`);
      console.log('MARKET ' + JSON.stringify(market));
      const toast = await run(`(async () => {
        window.__bliss.notify('🔔', 'Smoke toast', 'lifecycle check');
        await new Promise(r => setTimeout(r, 250));
        const shown = !!document.querySelector('[data-testid="toast"]');
        await new Promise(r => setTimeout(r, 4600));
        const gone = !document.querySelector('[data-testid="toast"]');
        return { shown, gone };
      })()`);
      console.log('TOAST ' + JSON.stringify(toast));

      // --- R6: Bliss AI — streamed chat over the ai:* bridge (mock mode) ----
      await run(`window.__bliss.open('bliss-ai', { params: { prompt: 'hello there' } })`);
      let aiText = '';
      for (let i = 0; i < 40; i++) {
        aiText = await run(`(() => {
          const turns = document.querySelectorAll('[data-appid="bliss-ai"] [data-testid="ai-turn"]');
          return turns.length ? turns[turns.length - 1].textContent : '';
        })()`);
        if (aiText.includes('chunk plumbing is live')) break;
        await wait(150);
      }
      const ai = await run(`(() => {
        const userTurn = document.querySelector('[data-appid="bliss-ai"] [data-testid="ai-turn"]');
        const w = window.__bliss.windows().find(x => x.appId === 'bliss-ai');
        if (w) window.__bliss.close(w.id);
        return { prompted: !!userTurn && userTurn.textContent.includes('hello there') };
      })()`);
      ai.streamed = aiText.includes('Hello from Bliss AI (mock stream). All chunk plumbing is live.');
      console.log('AI ' + JSON.stringify(ai));
      await wait(300);

      // --- R6: terminal one-shot ai command rides the same pipeline ---------
      const termAi = await run(`(async () => {
        const root = document.querySelector('[data-appid="system-terminal"]');
        const input = root.querySelector('[data-testid="term-input"]');
        input.value = 'ai ping';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 150));
          const txt = Array.from(root.querySelectorAll('.logs p')).map(p => p.textContent).join('\\n');
          if (txt.includes('mock stream')) return { answered: true };
        }
        return { answered: false };
      })()`);
      console.log('TERMAI ' + JSON.stringify(termAi));

      // --- R6: head-tracking parallax (camera-free injection seam) ----------
      // The camera never opens headless (document.hidden gate); inject a pose
      // and assert it propagates to the perspective-origin + the CSS vars.
      const head = await run(`(async () => {
        window.__bliss.setHead(0.8, -0.5, 0);
        await new Promise(r => setTimeout(r, 700)); // smoother eases ~10%/frame
        const vp = document.querySelector('.cube-viewport');
        const origin = vp.style.perspectiveOrigin || '';
        const hx = Number(getComputedStyle(document.documentElement).getPropertyValue('--head-x'));
        window.__bliss.setHead(0, 0, 0);
        await new Promise(r => setTimeout(r, 700));
        const hxBack = Number(getComputedStyle(document.documentElement).getPropertyValue('--head-x'));
        return { shifted: origin.includes('calc') && !origin.includes('50% + 0.00%'), hx, hxBack };
      })()`);
      console.log('HEAD ' + JSON.stringify(head));

      // --- R5: cinematic switcher (one step + commit = second-MRU focus) ----
      const altTab = await run(`(async () => {
        const before = window.__bliss.windows().slice().sort((a, b) => b.z - a.z).map(w => w.id);
        window.__bliss.altTab();
        await new Promise(r => setTimeout(r, 300));
        const focused = window.__bliss.windows().find(w => w.focused);
        return { switched: !!focused && focused.id === before[1] };
      })()`);
      await settle(); // the commit may ride a cross-face cube spin
      console.log('ALTTAB ' + JSON.stringify(altTab));

      // --- R6: Cube Free-Look (the held floating cube) -----------------------
      // Enter, confirm all faces are on display + windows Z-popped, steer one
      // face to the right, snap out — lands on workspace 1 like the video's
      // arrow-key flow.
      await run(`window.__bliss.switchWorkspace(0)`);
      await settle();
      await run(`window.__bliss.freeLook()`);
      await wait(900); // enter ease (rAF engine)
      const freeOn = await run(`({
        mode: window.__bliss.mode(),
        hint: !!document.querySelector('[data-testid="free-hint"]'),
        facesShown: [...document.querySelectorAll('.cube-viewport--free .cube-face')].length,
        cubeScaled: (document.querySelector('.cube')?.style.transform || '').includes('scale('),
      })`);
      await run(`window.__bliss.freeRotate(-90)`); // ArrowRight: next face
      await wait(700);
      await run(`window.__bliss.freeLook()`); // toggle again → snap out
      for (let i = 0; i < 40 && (await run(`window.__bliss.mode()`)) !== 'CUBE'; i++) await wait(150);
      await wait(300);
      const freeOff = await run(`({ mode: window.__bliss.mode(), active: window.__bliss.workspace() })`);
      console.log('FREELOOK ' + JSON.stringify({ freeOn, freeOff }));

      // --- R5: magnetic snap zones (drag into the left band → left half) ----
      await run(`window.__bliss.switchWorkspace(0)`);
      await settle();
      const snap = await run(`(async () => {
        const tb = document.querySelector('[data-appid="fractal-engine"] [data-testid="titlebar"]');
        tb.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300, clientY: 60, bubbles: true }));
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 300, bubbles: true }));
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: 25, clientY: 300, bubbles: true }));
        await new Promise(r => setTimeout(r, 120)); // let the preview render (zoneless flush)
        const preview = !!document.querySelector('.snap-preview');
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        await new Promise(r => setTimeout(r, 300)); // snap glide
        const w = window.__bliss.windows().find(x => x.appId === 'fractal-engine');
        return { preview, x: w.x, y: w.y, w: w.w, h: w.h,
                 expW: Math.floor(window.innerWidth / 2), expH: window.innerHeight - 32 };
      })()`);
      console.log('SNAP ' + JSON.stringify(snap));

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

      // --- Persistence: settings + session round-trip over the bridge ------
      // (userData is a temp dir, so nothing leaks between runs.)
      const persist = await run(`(async () => {
        const api = window.electronAPI;
        await api.settings.set({ theme: 'cyber', volume: 0.7, bogusKey: 'rejected' });
        const s = await api.settings.get();
        const saved = await api.session.save({ version: 1, active: 1, windows: [
          { appId: 'notepad', title: 'T', x: 1, y: 2, w: 300, h: 200, workspace: 1,
            minimized: false, maximized: false, prevGeom: null },
        ] });
        const loaded = await api.session.load();
        return { theme: s.theme, vol: s.volume, bogus: 'bogusKey' in s, saved,
                 loadedCount: loaded.windows.length, loadedActive: loaded.active };
      })()`);
      console.log('PERSIST ' + JSON.stringify(persist));

      // --- Theme switching: data-theme attribute + token cascade -----------
      // (effects flush in a microtask under zoneless — yield between writes)
      const themed = await run(`(async () => {
        const tick = () => new Promise(r => setTimeout(r, 50));
        window.__bliss.setTheme('matrix');
        await tick();
        const attr = document.documentElement.dataset.theme;
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        window.__bliss.setTheme('bliss');
        await tick();
        return { attr, accent, back: document.documentElement.dataset.theme };
      })()`);
      console.log('THEME ' + JSON.stringify(themed));

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
        persist.theme === 'cyber' && persist.vol === 0.7 && persist.bogus === false &&
        persist.saved === true && persist.loadedCount === 1 && persist.loadedActive === 1 &&
        themed.attr === 'matrix' && themed.accent === '#00ff66' && themed.back === 'bliss' &&
        head.shifted === true && head.hx > 0.5 && Math.abs(head.hxBack) < 0.1 &&
        freeOn.mode === 'FREE' && freeOn.hint === true && freeOn.facesShown === 4 &&
        freeOn.cubeScaled === true &&
        freeOff.mode === 'CUBE' && freeOff.active === 1 &&
        term.helpShown === true && term.lsHasFixture === true && term.catHas === true &&
        term.escaped === false && term.calcOpen === true &&
        notepad.loaded === true &&
        market.src === 'SIM' && toast.shown === true && toast.gone === true &&
        ai.prompted === true && ai.streamed === true && termAi.answered === true &&
        altTab.switched === true &&
        snap.preview === true && snap.x === 0 && snap.y === 32 &&
        snap.w === snap.expW && snap.h === snap.expH &&
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
