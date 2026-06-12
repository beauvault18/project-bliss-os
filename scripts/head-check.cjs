// Live head-tracking diagnostic: opens a VISIBLE window (the camera only runs
// when the document is visible), then samples __bliss.headState() once per
// second for ~15 s. Sit in front of the camera and move your head — the log
// shows camera state, which detector is active, hit/miss counts, and the live
// smoothed pose. Run: npx electron scripts/head-check.cjs
const { app, BrowserWindow, session, systemPreferences } = require('electron');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

// FAKE_CAM=1: Chromium's synthetic camera (no OS permission involved) —
// proves the video/detection pipeline independent of macOS TCC.
if (process.env.FAKE_CAM) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}

require(path.join(ROOT, 'dist-electron', 'ipc.js')).registerAllIpc({
  getMainWindow: () => win,
});

let win = null;
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) =>
    cb(permission === 'media'),
  );
  if (process.platform === 'darwin') {
    const tcc = systemPreferences.getMediaAccessStatus('camera');
    console.log('TCC camera status:', tcc);
    if (tcc === 'not-determined') {
      systemPreferences.askForMediaAccess('camera').then((ok) => console.log('TCC prompt →', ok));
    }
  }
  win = new BrowserWindow({
    show: true,
    width: 1100,
    height: 700,
    webPreferences: {
      preload: path.join(ROOT, 'dist-electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(ROOT, 'dist', 'index.html'));
  win.webContents.on('did-finish-load', async () => {
    const run = (code) => win.webContents.executeJavaScript(code);
    await new Promise((r) => setTimeout(r, 2500));
    console.log('--- move your head around now ---');
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const s = await run('window.__bliss.headState()');
        console.log(
          `t+${i + 1}s camera=${s.camera} mode=${s.mode} hits=${s.hits} misses=${s.misses}` +
            ` head=(${s.head.x.toFixed(2)}, ${s.head.y.toFixed(2)}, ${s.head.depth.toFixed(2)})` +
            ` [${s.video || ''}]` +
            (s.lastError ? ` err=${s.lastError}` : ''),
        );
      } catch (e) {
        console.log(`t+${i + 1}s probe failed: ${e.message}`);
      }
    }
    app.exit(0);
  });
});
setTimeout(() => app.exit(9), 40000);
