// Quick hardware-GL sanity check: boots the built app WITHOUT the SwiftShader
// switches (so the real GPU path — shader sky, grade pass, particles — runs),
// waits a few seconds of rendering, then asserts zero console errors. This is
// the companion to smoke.cjs, which deliberately pins the software-GL path.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'bliss-gpu-')));
let smokeWindow = null;
require(path.join(__dirname, '..', 'dist-electron', 'ipc.js')).registerAllIpc({
  getMainWindow: () => smokeWindow,
});

const errors = [];
const ROOT = path.join(__dirname, '..');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(ROOT, 'dist-electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  smokeWindow = win;
  win.webContents.on('console-message', (...a) => {
    const ev = a[0];
    const level = (ev && ev.level) ?? a[1];
    const msg = (ev && ev.message) || a[2];
    if (msg && (level === 'error' || level === 3)) errors.push(msg);
  });
  const run = (code) => win.webContents.executeJavaScript(code);
  win.loadFile(path.join(ROOT, 'dist', 'index.html'));
  win.webContents.on('did-finish-load', async () => {
    try {
      await new Promise((r) => setTimeout(r, 2500));
      await run('window.__bliss.setHidden(false)');
      const info = await run(`(() => {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
        return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      })()`);
      // Let it render for a while; cycle themes + spin so every shader path runs.
      await run(`window.__bliss.setTheme('synthwave')`);
      await new Promise((r) => setTimeout(r, 1500));
      await run(`window.__bliss.setTheme('matrix')`);
      await run(`window.__bliss.switchWorkspace(1)`);
      await new Promise((r) => setTimeout(r, 2500));
      // Free-Look: hold the cube mid-screen, steer it off-axis, screenshot it.
      await run(`window.__bliss.setTheme('bliss')`);
      await run(`window.__bliss.freeLook()`);
      await new Promise((r) => setTimeout(r, 1200));
      await run(`window.__bliss.freeRotate(-38)`);
      await new Promise((r) => setTimeout(r, 900));
      const shot = await win.webContents.capturePage();
      fs.writeFileSync(path.join(os.tmpdir(), 'bliss-freelook.png'), shot.toPNG());
      const freeMode = await run('window.__bliss.mode()');
      await run(`window.__bliss.freeLook()`);
      await new Promise((r) => setTimeout(r, 1400));
      const base = await run('window.__bliss.windows().length');
      console.log('FREELOOK ' + JSON.stringify({ freeMode, shot: shot.getSize() }));
      console.log('GPU ' + JSON.stringify({ info, base, errors: errors.length }));
      console.log('ERRORS ' + JSON.stringify(errors.slice(0, 5)));
      console.log('VERDICT ' + (base === 6 && errors.length === 0 ? 'PASS' : 'FAIL'));
      app.exit(base === 6 && errors.length === 0 ? 0 : 2);
    } catch (e) {
      console.log('TEST_ERR ' + (e && e.message));
      app.exit(3);
    }
  });
});
setTimeout(() => {
  console.log('HARD_TIMEOUT');
  app.exit(9);
}, 45000);
