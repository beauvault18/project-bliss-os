import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';

// Single Vite build for the renderer. Project Bliss OS is a PURE ANGULAR app:
// Angular runs in JIT mode (templates compiled at runtime by @angular/compiler),
// so no Angular build plugin is needed. esbuild handles the @Component
// decorators via `experimentalDecorators` in tsconfig.json. Components use
// inject()/signals (no constructor-type DI), so emitDecoratorMetadata isn't
// required. No React plugin — there is no React in the tree anymore.
export default defineConfig({
  root: '.',
  base: './',
  plugins: [
    electron([
      {
        // Main process
        entry: 'electron/main.ts',
      },
      {
        // Preload script
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload();
        },
      },
      {
        // Shared IPC handler module — built standalone so the smoke harness
        // (scripts/smoke.cjs, its own main process) can require() the exact
        // bundle the app registers. main.ts also imports it (inlined there).
        entry: 'electron/ipc/index.ts',
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            rollupOptions: {
              output: { entryFileNames: 'ipc.js', exports: 'named' },
            },
          },
        },
      },
    ]),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
