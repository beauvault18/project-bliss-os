// Single renderer entry point that boots BOTH frameworks into the same page.
import './styles.css';

// --- React ---------------------------------------------------------------
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReactApp } from './react/ReactApp';

const reactContainer = document.getElementById('react-root');
if (reactContainer) {
  createRoot(reactContainer).render(React.createElement(ReactApp));
}

// --- Angular -------------------------------------------------------------
// zone.js must be imported before Angular bootstraps.
import 'zone.js';
// @angular/compiler enables JIT template compilation in the browser.
import '@angular/compiler';
import { bootstrapApplication } from '@angular/platform-browser';
import { AngularAppComponent } from './angular/app.component';

bootstrapApplication(AngularAppComponent).catch((err) =>
  console.error('Angular bootstrap failed:', err),
);
