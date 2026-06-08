# Hello World — Electron + Angular + React

A minimal Electron desktop app that renders **both** React and Angular in a single
window, bundled with [Vite](https://vitejs.dev/).

- **React** panel → [src/react/ReactApp.tsx](src/react/ReactApp.tsx)
- **Angular** panel → [src/angular/app.component.ts](src/angular/app.component.ts)
- Both are booted from one entry point → [src/renderer.ts](src/renderer.ts)
- Electron main/preload → [electron/main.ts](electron/main.ts), [electron/preload.ts](electron/preload.ts)

## How it works

A single Vite build compiles the renderer using two plugins side by side:

| Plugin | Compiles |
| --- | --- |
| `@vitejs/plugin-react` | everything except `src/angular/**` |
| `@analogjs/vite-plugin-angular` | only `src/angular/**` |

`vite-plugin-electron` builds the main and preload processes and launches Electron.

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start Vite + launch Electron (hot reload)
npm run build    # production build into dist/ and dist-electron/
```

## Project layout

```
electron/        Electron main process + preload (Node side)
src/
  renderer.ts    Renderer entry — boots React and Angular
  react/         React component
  angular/       Angular standalone component
  styles.css     Shared styles
index.html       Single HTML host page
vite.config.ts   React + Angular + Electron build wiring
```
