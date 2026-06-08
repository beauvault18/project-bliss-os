import type { AppDef } from './types';
import { NotepadApp } from '../apps/react/NotepadApp';
import { MinesweeperApp } from '../apps/react/MinesweeperApp';
import { SettingsApp, BlissLabApp, AiCoderApp } from '../apps/react/StubApp';
import { CalculatorApp } from '../apps/angular/calculator.app';
import { FileExplorerApp } from '../apps/angular/file-explorer.app';

export const APPS: AppDef[] = [
  {
    id: 'notepad',
    title: 'Notepad',
    icon: '📝',
    defaultSize: { w: 380, h: 300 },
    body: { framework: 'react', component: NotepadApp },
    showOnDesktop: true,
  },
  {
    id: 'calculator',
    title: 'Calculator',
    icon: '🧮',
    defaultSize: { w: 260, h: 340 },
    body: { framework: 'angular', component: CalculatorApp },
    showOnDesktop: true,
  },
  {
    id: 'file-explorer',
    title: 'File Explorer',
    icon: '📁',
    defaultSize: { w: 440, h: 320 },
    body: { framework: 'angular', component: FileExplorerApp },
    showOnDesktop: true,
  },
  {
    id: 'minesweeper',
    title: 'Minesweeper',
    icon: '💣',
    defaultSize: { w: 300, h: 360 },
    body: { framework: 'react', component: MinesweeperApp },
    showOnDesktop: true,
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: '⚙️',
    defaultSize: { w: 420, h: 340 },
    body: { framework: 'react', component: SettingsApp },
    showOnDesktop: true,
  },
  {
    id: 'bliss-lab',
    title: 'Bliss Lab',
    icon: '🧪',
    defaultSize: { w: 460, h: 360 },
    body: { framework: 'react', component: BlissLabApp },
    showOnDesktop: true,
  },
  {
    id: 'ai-coder',
    title: 'AI Coder',
    icon: '🤖',
    defaultSize: { w: 440, h: 360 },
    body: { framework: 'react', component: AiCoderApp },
    showOnDesktop: true,
  },
];

export const DESKTOP_APPS = APPS.filter((a) => a.showOnDesktop);

const byId = new Map(APPS.map((a) => [a.id, a]));

export function getApp(id: string): AppDef | undefined {
  return byId.get(id);
}
