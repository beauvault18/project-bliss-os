import type { ComponentType } from 'react';
import type { Type } from '@angular/core';

export type Framework = 'react' | 'angular';

export interface WindowState {
  id: string;
  appId: string;
  title: string;
  x: number; // top-left, screen pixels
  y: number;
  w: number;
  h: number;
  z: number; // stacking order; higher = closer to camera / on top
  workspace: number; // virtual desktop this window lives on (0-based)
  focused: boolean;
  minimized: boolean;
  maximized: boolean;
  opacity: number; // 0.4 – 1, controlled by the Rapid Control transparency slider
  /** Pre-maximize rect, restored on un-maximize. */
  restore?: { x: number; y: number; w: number; h: number };
  /** Desktop landing position when minimized as a "somersault token". */
  tokenPos?: { x: number; y: number };
  /** Preset used to minimize (so restore reverses the same animation). */
  minimizedWith?: string;
}

export interface ReactAppDef {
  framework: 'react';
  component: ComponentType<{ windowId: string }>;
}

export interface AngularAppDef {
  framework: 'angular';
  /** A standalone, zoneless, signal-only Angular component. */
  component: Type<unknown>;
}

export interface AppDef {
  id: string;
  title: string;
  icon: string; // emoji glyph for v1
  defaultSize: { w: number; h: number };
  body: ReactAppDef | AngularAppDef;
  /** Show a launcher icon on the desktop. */
  showOnDesktop?: boolean;
}
