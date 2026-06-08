const { app, BrowserWindow } = require('electron');
const path = require('node:path');
// Force software WebGL (SwiftShader) so the R3F canvas can get a GL context in
// this headless/sandboxed environment. Modern Chromium needs the explicit
// unsafe-swiftshader opt-in to allow SwiftShader for WebGL.
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
    webPreferences: { preload: path.join(ROOT, 'dist-electron', 'preload.js'), contextIsolation: true, nodeIntegration: false },
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

  win.loadFile(path.join(ROOT, 'dist', 'index.html'));
  win.webContents.on('did-finish-load', async () => {
    try {
      await wait(1200); // let R3F canvas + first paint settle

      const base = await run(`({
        canvas: !!document.querySelector('canvas'),
        start: !!document.querySelector('[data-testid="start-button"]'),
        clock: !!document.querySelector('[data-testid="clock"]'),
        bliss: typeof window.__bliss,
      })`);
      console.log('BASE ' + JSON.stringify(base));

      // Reset persisted preferences so the run starts from known defaults.
      await run(`window.__bliss.resetPrefs && window.__bliss.resetPrefs()`);
      await wait(100);

      // Open a React app (Notepad) and an Angular app (Calculator) + File Explorer.
      await run(`window.__bliss.open('notepad')`);
      await run(`window.__bliss.open('calculator')`);
      await run(`window.__bliss.open('file-explorer')`);
      await wait(1200); // Angular createApplication is async

      const opened = await run(`({
        windows: window.__bliss.windows().length,
        notepad: !!document.querySelector('[data-appid="notepad"] [data-testid="notepad-text"]'),
        calcDisplay: document.querySelector('[data-appid="calculator"] [data-testid="calc-display"]')?.textContent ?? null,
        fsRows: document.querySelectorAll('[data-appid="file-explorer"] [data-testid="fs-row"]').length,
        tasks: document.querySelectorAll('[data-testid="task-button"]').length,
      })`);
      console.log('OPENED ' + JSON.stringify(opened));

      // Interact with the Angular calculator: click 7, +, 8, = -> expect 15.
      // Zoneless Angular flushes change detection asynchronously, so read after a wait.
      const beforeCalc = await run(`document.querySelector('[data-appid="calculator"] [data-testid="calc-display"]').textContent.trim()`);
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
      const calcResult = await run(`document.querySelector('[data-appid="calculator"] [data-testid="calc-display"]').textContent.trim()`);
      console.log('CALC ' + JSON.stringify({ before: beforeCalc, after: calcResult }));

      // Angular DI/navigation: click first folder row -> breadcrumb grows.
      const fsBefore = await run(`document.querySelectorAll('[data-appid="file-explorer"] .crumbs button').length`);
      await run(`(() => {
        const root = document.querySelector('[data-appid="file-explorer"]');
        const folder = [...root.querySelectorAll('[data-testid="fs-row"].folder')][0];
        folder && folder.click();
      })()`);
      await wait(200);
      const fsAfter = await run(`document.querySelectorAll('[data-appid="file-explorer"] .crumbs button').length`);
      console.log('FS_NAV ' + JSON.stringify({ before: fsBefore, after: fsAfter }));

      // Drag: move the notepad window and confirm its stored position changed.
      const drag = await run(`(() => {
        const w = window.__bliss.windows().find(w => w.appId === 'notepad') || window.__bliss.windows()[0];
        const before = { x: w.x, y: w.y };
        window.__bliss.move(w.id, 60, 40);
        const after = window.__bliss.windows().find(x => x.id === w.id);
        return { before, after: { x: after.x, y: after.y } };
      })()`);
      console.log('DRAG ' + JSON.stringify(drag));

      // Teardown: close the Angular calculator, reopen, confirm clean re-mount.
      await run(`(() => { const c = window.__bliss.windows().find(w => w.appId === 'calculator'); window.__bliss.closeWindow(c.id); })()`);
      await wait(400);
      await run(`window.__bliss.open('calculator')`);
      await wait(900);
      const remount = await run(`({
        calcDisplay: document.querySelector('[data-appid="calculator"] [data-testid="calc-display"]')?.textContent ?? null,
        angularWindows: document.querySelectorAll('[data-testid="window"][data-appid="calculator"]').length,
      })`);
      console.log('REMOUNT ' + JSON.stringify(remount));

      // --- v2 Phase A: fullscreen bridge + desktop icons launch/focus -------
      const v2base = await run(`({
        fsBridge: typeof window.electronAPI?.toggleFullscreen,
        icons: document.querySelectorAll('[data-testid="desktop-icon"]').length,
      })`);
      console.log('V2_BASE ' + JSON.stringify(v2base));

      // Click the Settings desktop icon twice: should launch once, then focus (no dup).
      await run(`document.querySelector('[data-testid="desktop-icon"][data-appid="settings"]').click()`);
      await wait(300);
      const afterFirstClick = await run(`window.__bliss.windows().filter(w => w.appId === 'settings').length`);
      await run(`document.querySelector('[data-testid="desktop-icon"][data-appid="settings"]').click()`);
      await wait(300);
      const afterSecondClick = await run(`window.__bliss.windows().filter(w => w.appId === 'settings').length`);
      console.log('ICON_LAUNCH ' + JSON.stringify({ afterFirstClick, afterSecondClick }));

      // --- v2 Phase B: Rapid Control menu -> Dock Left ----------------------
      const vp = await run(`({ w: window.innerWidth, h: window.innerHeight })`);
      await run(`document.querySelector('[data-appid="notepad"] [data-testid="rapid-btn"]').click()`);
      await wait(250);
      const menuOpen = await run(`!!document.querySelector('[data-testid="rapid-menu"]')`);
      await run(`document.querySelector('[data-testid="rcm-dock-left"]').click()`);
      await wait(250);
      const docked = await run(`(() => { const w = window.__bliss.windows().find(w => w.appId === 'notepad'); return { x: w.x, w: w.w }; })()`);
      console.log('RAPID_DOCK ' + JSON.stringify({ menuOpen, docked, halfW: Math.round(vp.w / 2) }));

      // --- v2 Phase B: transparency slider ----------------------------------
      await run(`document.querySelector('[data-appid="notepad"] [data-testid="rapid-btn"]').click()`);
      await wait(200);
      await run(`(() => {
        const s = document.querySelector('[data-testid="rcm-opacity"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(s, '0.5');
        s.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await wait(200);
      const opacity = await run(`window.__bliss.windows().find(w => w.appId === 'notepad').opacity`);
      console.log('OPACITY ' + JSON.stringify(opacity));
      // Close the Rapid menu so later interactions start from a clean state.
      await run(`document.querySelector('[data-testid="rcm-scrim"]')?.click()`);
      await wait(150);

      // --- v2 Phase B: close vs quit ----------------------------------------
      await run(`(() => { const w = window.__bliss.windows().find(w => w.appId === 'minesweeper'); if (!w) window.__bliss.open('minesweeper'); })()`);
      await wait(300);
      await run(`(() => { const w = window.__bliss.windows().find(w => w.appId === 'minesweeper'); window.__bliss.closeWindow(w.id); })()`);
      await wait(150);
      const afterClose = await run(`({
        hasWindow: window.__bliss.windows().some(w => w.appId === 'minesweeper'),
        running: window.__bliss.running().includes('minesweeper'),
      })`);
      await run(`window.__bliss.quitApp('minesweeper')`);
      await wait(150);
      const afterQuit = await run(`window.__bliss.running().includes('minesweeper')`);
      console.log('CLOSE_QUIT ' + JSON.stringify({ afterClose, afterQuit }));

      // --- v2 Phase C: genie minimize / restore (timing + state machine) -----
      // Trigger minimize via the Notepad Rapid menu.
      await run(`document.querySelector('[data-appid="notepad"] [data-testid="rapid-btn"]').click()`);
      await wait(250);
      await run(`document.querySelector('[data-testid="rcm-minimize"]').click()`);
      // Mid-animation (~60ms): window must STILL be rendered and NOT yet minimized.
      await wait(70);
      const midMin = await run(`(() => {
        const w = window.__bliss.windows().find(w => w.appId === 'notepad');
        return {
          status: w ? window.__bliss.animStatus(w.id) : null,
          minimized: w ? w.minimized : null,
          domPresent: !!document.querySelector('[data-testid="window"][data-appid="notepad"]'),
        };
      })()`);
      // After the animation completes: minimized true, DOM gone.
      await wait(1000);
      const afterMin = await run(`(() => {
        const w = window.__bliss.windows().find(w => w.appId === 'notepad');
        return { minimized: w ? w.minimized : null, domPresent: !!document.querySelector('[data-testid="window"][data-appid="notepad"]') };
      })()`);
      // Restore via the taskbar button; expands back.
      await run(`document.querySelector('[data-testid="task-button"][data-appid="notepad"]').click()`);
      await wait(1000);
      const afterRestore = await run(`(() => {
        const w = window.__bliss.windows().find(w => w.appId === 'notepad');
        return { minimized: w ? w.minimized : null, domPresent: !!document.querySelector('[data-testid="window"][data-appid="notepad"]') };
      })()`);
      console.log('MINIMIZE ' + JSON.stringify({ midMin, afterMin }));
      console.log('RESTORE ' + JSON.stringify(afterRestore));

      // --- v2 Phase D: Bliss Lab live controls -------------------------------
      await run(`window.__bliss.open('bliss-lab')`);
      await wait(500);
      const labPresent = await run(`!!document.querySelector('[data-testid="bliss-lab"]')`);

      // Control side: move the ✦ button to the left.
      const sideBefore = await run(`!!document.querySelector('[data-appid="notepad"] .titlebar--left')`);
      await run(`document.querySelector('[data-testid="lab-control-side"] [data-value="left"]').click()`);
      await wait(200);
      const sideAfter = await run(`!!document.querySelector('[data-appid="notepad"] .titlebar--left')`);

      // Glass mode: toggle on -> window gets the glass class.
      await run(`document.querySelector('[data-testid="lab-glass"]').click()`);
      await wait(150);
      const glassOn = await run(`!!document.querySelector('[data-appid="notepad"] .window--glass')`);

      // Default opacity: set to 60% then open a fresh app -> inherits 0.6.
      await run(`(() => {
        const s = document.querySelector('[data-testid="lab-default-opacity"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(s, '60');
        s.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await wait(120);
      await run(`window.__bliss.open('ai-coder')`);
      await wait(250);
      const newOpacity = await run(`window.__bliss.windows().find(w => w.appId === 'ai-coder').opacity`);

      // Demo toggle: hide desktop icons.
      const iconsBefore = await run(`!!document.querySelector('[data-testid="desktop-icons"]')`);
      await run(`document.querySelector('[data-testid="lab-show-icons"]').click()`);
      await wait(150);
      const iconsAfter = await run(`!!document.querySelector('[data-testid="desktop-icons"]')`);

      // Reset Demo Layout: re-cascades windows (notepad was docked to x:0 earlier).
      await run(`document.querySelector('[data-testid="lab-reset-layout"]').click()`);
      await wait(150);
      const notepadX = await run(`window.__bliss.windows().find(w => w.appId === 'notepad').x`);

      console.log('BLISS_LAB ' + JSON.stringify({
        labPresent, sideBefore, sideAfter, glassOn, newOpacity, iconsBefore, iconsAfter, notepadX,
      }));

      // --- v2 Phase E1: Fire Close (ember) vs Fire Quit (fire) ---------------
      await run(`window.__bliss.open('minesweeper')`);
      await wait(300);
      // Close Window -> ember burn; the app must STAY running.
      await run(`document.querySelector('[data-appid="minesweeper"] [data-testid="rapid-btn"]').click()`);
      await wait(220);
      await run(`document.querySelector('[data-testid="rcm-close-window"]').click()`);
      await wait(90);
      const closeMid = await run(`(() => {
        const w = window.__bliss.windows().find(w => w.appId === 'minesweeper');
        return {
          status: w ? window.__bliss.animStatus(w.id) : null,
          domPresent: !!document.querySelector('[data-testid="window"][data-appid="minesweeper"]'),
          overlay: !!document.querySelector('[data-appid="minesweeper"] [data-testid="fire-overlay"]'),
          running: window.__bliss.running().includes('minesweeper'),
        };
      })()`);
      await wait(1500);
      const afterCloseAnim = await run(`({
        inWindows: window.__bliss.windows().some(w => w.appId === 'minesweeper'),
        running: window.__bliss.running().includes('minesweeper'),
      })`);

      // Reopen, then Quit App -> fire burn; running indicator must clear.
      await run(`window.__bliss.open('minesweeper')`);
      await wait(300);
      await run(`document.querySelector('[data-appid="minesweeper"] [data-testid="rapid-btn"]').click()`);
      await wait(220);
      await run(`document.querySelector('[data-testid="rcm-quit-app"]').click()`);
      await wait(90);
      const quitMid = await run(`(() => {
        const w = window.__bliss.windows().find(w => w.appId === 'minesweeper');
        return {
          status: w ? window.__bliss.animStatus(w.id) : null,
          overlay: !!document.querySelector('[data-appid="minesweeper"] [data-testid="fire-overlay"]'),
        };
      })()`);
      await wait(1600);
      const afterQuitAnim = await run(`({
        inWindows: window.__bliss.windows().some(w => w.appId === 'minesweeper'),
        running: window.__bliss.running().includes('minesweeper'),
      })`);
      console.log('FIRE_CLOSE ' + JSON.stringify({ closeMid, afterCloseAnim }));
      console.log('FIRE_QUIT ' + JSON.stringify({ quitMid, afterQuitAnim }));

      // --- v2 Phase E2: Somersault Token minimize ---------------------------
      // Select the preset via the Bliss Lab picker (Bliss Lab is already open).
      await run(`document.querySelector('[data-testid="lab-minimize-preset"] [data-preset="somersault-token"]').click()`);
      await wait(150);
      const presetSelected = await run(`window.__bliss.prefs().minimizePreset`);

      const nid = await run(`(window.__bliss.windows().find(w => w.appId === 'notepad') || {}).id || null`);
      // Minimize Notepad -> somersault onto the desktop as a token.
      await run(`window.__bliss.minimizeAnimated(${JSON.stringify(nid)}, 'notepad')`);
      await wait(1300);
      const somerMin = await run(`(() => {
        const w = window.__bliss.windows().find(w => w.appId === 'notepad');
        return {
          minimized: w ? w.minimized : null,
          hasToken: !!(w && w.tokenPos),
          tokenDom: !!document.querySelector('[data-testid="desktop-token"][data-appid="notepad"]'),
          windowDom: !!document.querySelector('[data-testid="window"][data-appid="notepad"]'),
          running: window.__bliss.running().includes('notepad'),
        };
      })()`);

      // Double-click the token to restore.
      await run(`document.querySelector('[data-testid="desktop-token"][data-appid="notepad"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
      await wait(1300);
      const somerRestore = await run(`(() => {
        const w = window.__bliss.windows().find(w => w.appId === 'notepad');
        return {
          minimized: w ? w.minimized : null,
          tokenDom: !!document.querySelector('[data-testid="desktop-token"][data-appid="notepad"]'),
          windowDom: !!document.querySelector('[data-testid="window"][data-appid="notepad"]'),
        };
      })()`);

      // Minimize again -> token; then Quit App should remove the token too.
      await run(`window.__bliss.minimizeAnimated(${JSON.stringify(nid)}, 'notepad')`);
      await wait(1300);
      const tokenBeforeQuit = await run(`!!document.querySelector('[data-testid="desktop-token"][data-appid="notepad"]')`);
      await run(`window.__bliss.quitApp('notepad')`);
      await wait(200);
      const afterTokenQuit = await run(`({
        tokenDom: !!document.querySelector('[data-testid="desktop-token"][data-appid="notepad"]'),
        running: window.__bliss.running().includes('notepad'),
      })`);
      console.log('SOMERSAULT ' + JSON.stringify({ presetSelected, somerMin, somerRestore, tokenBeforeQuit, afterTokenQuit }));

      console.log('ERRORS ' + JSON.stringify(errors));
      const ok =
        base.canvas && base.start && opened.notepad && opened.fsRows > 0 &&
        calcResult === '15' && fsAfter === fsBefore + 1 &&
        drag.after.x === drag.before.x + 60 && remount.calcDisplay === '0' &&
        v2base.fsBridge === 'function' && v2base.icons >= 7 &&
        afterFirstClick === 1 && afterSecondClick === 1 &&
        menuOpen === true && docked.x === 0 && Math.abs(docked.w - Math.round(vp.w / 2)) <= 1 &&
        Math.abs(opacity - 0.5) < 0.01 &&
        afterClose.hasWindow === false && afterClose.running === true && afterQuit === false &&
        midMin.status === 'minimizing' && midMin.minimized === false && midMin.domPresent === true &&
        afterMin.minimized === true && afterMin.domPresent === false &&
        afterRestore.minimized === false && afterRestore.domPresent === true &&
        labPresent === true && sideBefore === false && sideAfter === true &&
        glassOn === true && Math.abs(newOpacity - 0.6) < 0.01 &&
        iconsBefore === true && iconsAfter === false && notepadX >= 120 &&
        closeMid.status === 'closing' && closeMid.domPresent === true &&
        closeMid.overlay === true && closeMid.running === true &&
        afterCloseAnim.inWindows === false && afterCloseAnim.running === true &&
        quitMid.status === 'quitting' && quitMid.overlay === true &&
        afterQuitAnim.inWindows === false && afterQuitAnim.running === false &&
        presetSelected === 'somersault-token' &&
        somerMin.minimized === true && somerMin.hasToken === true &&
        somerMin.tokenDom === true && somerMin.windowDom === false && somerMin.running === true &&
        somerRestore.minimized === false && somerRestore.tokenDom === false && somerRestore.windowDom === true &&
        tokenBeforeQuit === true &&
        afterTokenQuit.tokenDom === false && afterTokenQuit.running === false &&
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
setTimeout(() => { console.log('HARD_TIMEOUT'); console.log('ERRORS ' + JSON.stringify(errors)); app.exit(9); }, 60000);
