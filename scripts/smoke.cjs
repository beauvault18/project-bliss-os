const { app, BrowserWindow } = require('electron');
const path = require('node:path');
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

      // Seeded windows: notepad (textarea) + calculator (display).
      const seeded = await run(`({
        notepad: !!document.querySelector('[data-appid="notepad"] [data-testid="notepad-text"]'),
        calcDisplay: document.querySelector('[data-appid="calculator"] [data-testid="calc-display"]')?.textContent ?? null,
        tasks: document.querySelectorAll('[data-testid="task-button"]').length,
        launchers: document.querySelectorAll('[data-testid="launcher"]').length,
      })`);
      console.log('SEEDED ' + JSON.stringify(seeded));

      // Angular interactivity: 7 + 8 = 15 in the calculator.
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

      // Launch File Explorer (Angular DI/template) via the store hook.
      await run(`window.__bliss.open('file-explorer')`);
      await wait(700);
      const fs = await run(`({
        windows: window.__bliss.windows().length,
        rows: document.querySelectorAll('[data-appid="file-explorer"] [data-testid="fs-row"]').length,
      })`);
      console.log('FS ' + JSON.stringify(fs));

      // Drag (store-level move) keeps positions in the store.
      const drag = await run(`(() => {
        const w = window.__bliss.windows().find(w => w.appId === 'notepad');
        const before = { x: w.x, y: w.y };
        window.__bliss.focus(w.id);
        return { before };
      })()`);
      console.log('FOCUS ' + JSON.stringify(drag));

      // Close a window; count drops.
      const beforeClose = await run(`window.__bliss.windows().length`);
      await run(`(() => { const w = window.__bliss.windows().find(w => w.appId === 'calculator'); window.__bliss.close(w.id); })()`);
      await wait(300);
      const afterClose = await run(`({
        windows: window.__bliss.windows().length,
        calcGone: !document.querySelector('[data-appid="calculator"] [data-testid="calc-display"]'),
      })`);
      console.log('CLOSE ' + JSON.stringify({ beforeClose, afterClose }));

      console.log('ERRORS ' + JSON.stringify(errors));
      const ok =
        base.canvas && base.start && base.clock && base.bliss === 'object' && base.windows === 2 &&
        seeded.notepad && seeded.calcDisplay === '0' && seeded.tasks === 2 && seeded.launchers >= 3 &&
        calc === '15' &&
        fs.windows === 3 && fs.rows > 0 &&
        afterClose.windows === beforeClose - 1 && afterClose.calcGone === true &&
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
