import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';

// Single Vite build for the renderer:
//   - React  → compiled by @vitejs/plugin-react
//   - Angular → runs in JIT mode (compiled at runtime by @angular/compiler),
//     so no Angular-specific build plugin is needed and there is no clash
//     between two AOT compilers in one Vite pipeline.
// Angular's @Component decorators are handled by esbuild via the
// `experimentalDecorators` option in tsconfig.json.
export default defineConfig({
  root: '.',
  base: './',
  plugins: [
    react({
      // Angular components live under src/angular/** and must NOT go through
      // React's Babel transform.
      exclude: [/src\/angular\//],
    }),
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
    ]),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
