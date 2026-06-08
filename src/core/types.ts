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
  focused: boolean;
  minimized: boolean;
  maximized: boolean;
  /** Pre-maximize rect, restored on un-maximize. */
  restore?: { x: number; y: number; w: number; h: number };
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
}
