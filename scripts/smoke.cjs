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

app.whenReady().then(() => {
  const win = new BrowserWindow({
    show: false,
    width: 1280, height: 800,
    webPreferences: { preload: path.resolve('dist-electron/preload.js'), contextIsolation: true, nodeIntegration: false },
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

  win.loadFile('dist/index.html');
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
      await run(`(() => { const c = window.__bliss.windows().find(w => w.appId === 'calculator'); window.__bliss.close(c.id); })()`);
      await wait(400);
      await run(`window.__bliss.open('calculator')`);
      await wait(900);
      const remount = await run(`({
        calcDisplay: document.querySelector('[data-appid="calculator"] [data-testid="calc-display"]')?.textContent ?? null,
        angularWindows: document.querySelectorAll('[data-appid="calculator"]').length,
      })`);
      console.log('REMOUNT ' + JSON.stringify(remount));

      console.log('ERRORS ' + JSON.stringify(errors));
      const ok = base.canvas && base.start && opened.notepad && opened.fsRows > 0 && calcResult === '15' && fsAfter === fsBefore + 1 && drag.after.x === drag.before.x + 60 && remount.calcDisplay === '0' && errors.length === 0;
      console.log('VERDICT ' + (ok ? 'PASS' : 'FAIL'));
      app.exit(ok ? 0 : 2);
    } catch (e) {
      console.log('TEST_ERR ' + (e && e.message));
      console.log('ERRORS ' + JSON.stringify(errors));
      app.exit(3);
    }
  });
});
setTimeout(() => { console.log('HARD_TIMEOUT'); console.log('ERRORS ' + JSON.stringify(errors)); app.exit(9); }, 30000);
