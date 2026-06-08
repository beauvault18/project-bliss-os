import type { AppDef } from './types';
import { NotepadApp } from '../apps/react/NotepadApp';
import { MinesweeperApp } from '../apps/react/MinesweeperApp';
import { CalculatorApp } from '../apps/angular/calculator.app';
import { FileExplorerApp } from '../apps/angular/file-explorer.app';

export const APPS: AppDef[] = [
  {
    id: 'notepad',
    title: 'Notepad',
    icon: '📝',
    defaultSize: { w: 380, h: 300 },
    body: { framework: 'react', component: NotepadApp },
  },
  {
    id: 'minesweeper',
    title: 'Minesweeper',
    icon: '💣',
    defaultSize: { w: 300, h: 360 },
    body: { framework: 'react', component: MinesweeperApp },
  },
  {
    id: 'calculator',
    title: 'Calculator',
    icon: '🧮',
    defaultSize: { w: 260, h: 340 },
    body: { framework: 'angular', component: CalculatorApp },
  },
  {
    id: 'file-explorer',
    title: 'File Explorer',
    icon: '📁',
    defaultSize: { w: 440, h: 320 },
    body: { framework: 'angular', component: FileExplorerApp },
  },
];

const byId = new Map(APPS.map((a) => [a.id, a]));

export function getApp(id: string): AppDef | undefined {
  return byId.get(id);
}
