// Renderer entry. Project Bliss OS is now a PURE ANGULAR application: the WebGL
// desktop is driven directly by Three.js (no React / react-three-fiber), and
// every window body is a standalone, zoneless Angular component.
import './styles.css';

// Angular runs in JIT mode (templates compiled at runtime), so its compiler
// must be present before any component is created.
import '@angular/compiler';

import {
  createComponent,
  provideExperimentalZonelessChangeDetection,
} from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { DesktopComponent } from './app/desktop.component';

const host = document.getElementById('root');
if (!host) throw new Error('#root not found');

createApplication({
  providers: [provideExperimentalZonelessChangeDetection()],
})
  .then((appRef) => {
    const comp = createComponent(DesktopComponent, {
      hostElement: host,
      environmentInjector: appRef.injector,
    });
    appRef.attachView(comp.hostView);
  })
  .catch((err) => console.error('Angular bootstrap failed:', err));
