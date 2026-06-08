// Renderer entry. Project Bliss OS is a React application; the WebGL desktop is
// driven by react-three-fiber. Angular is bootstrapped lazily, per window, by
// the AngularWindowHost — not globally here.
import './styles.css';

// Angular runs in JIT mode, so its compiler must be present before any Angular
// component is created at runtime (see framework-bridges/AngularWindowHost).
import '@angular/compiler';

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Desktop } from './Desktop';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');
createRoot(container).render(createElement(Desktop));
