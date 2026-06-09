import type { Type } from '@angular/core';
import { CalculatorApp } from '../apps/angular/calculator.app';
import { FileExplorerApp } from '../apps/angular/file-explorer.app';
import { NotepadApp } from '../apps/angular/notepad.app';

export interface AppDef {
  id: string;
  title: string;
  icon: string;
  defaultSize: { w: number; h: number };
  /** Standalone, zoneless Angular component shown as the window body. */
  component: Type<unknown>;
  showOnDesktop?: boolean;
}

export const APPS: AppDef[] = [
  {
    id: 'notepad',
    title: 'Notepad',
    icon: '📝',
    defaultSize: { w: 380, h: 300 },
    component: NotepadApp,
    showOnDesktop: true,
  },
  {
    id: 'calculator',
    title: 'Calculator',
    icon: '🧮',
    defaultSize: { w: 260, h: 340 },
    component: CalculatorApp,
    showOnDesktop: true,
  },
  {
    id: 'file-explorer',
    title: 'File Explorer',
    icon: '📁',
    defaultSize: { w: 440, h: 320 },
    component: FileExplorerApp,
    showOnDesktop: true,
  },
];

const byId = new Map(APPS.map((a) => [a.id, a]));

export function getApp(id: string): AppDef | undefined {
  return byId.get(id);
}
