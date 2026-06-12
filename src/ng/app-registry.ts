import type { Type } from '@angular/core';
import { CalculatorApp } from '../apps/angular/calculator.app';
import { FileExplorerApp } from '../apps/angular/file-explorer.app';
import { NotepadApp } from '../apps/angular/notepad.app';
import { FractalEngineApp } from '../apps/angular/fractal-engine.app';
import { SystemTerminalApp } from '../apps/angular/system-terminal.app';
import { SpaceTrackerApp } from '../apps/angular/space-tracker.app';
import { MarketChartsApp } from '../apps/angular/market-charts.app';
import { MediaStreamerApp } from '../apps/angular/media-streamer.app';
import { DiagnosticsApp } from '../apps/angular/diagnostics.app';
import { SettingsApp } from '../apps/angular/settings.app';
import { BlissAiApp } from '../apps/angular/bliss-ai.app';
import { SynthApp } from '../apps/angular/synth.app';

export interface AppDef {
  id: string;
  title: string;
  icon: string;
  defaultSize: { w: number; h: number };
  /** Standalone, zoneless Angular component shown as the window body. */
  component: Type<unknown>;
  showOnDesktop?: boolean;
  /** Only one instance ever — launching focuses the existing window. */
  singleton?: boolean;
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
  // Cyberpunk UI modules (video layout).
  {
    id: 'fractal-engine',
    title: 'XaoS',
    icon: '🌀',
    defaultSize: { w: 600, h: 480 },
    component: FractalEngineApp,
    showOnDesktop: true,
  },
  {
    id: 'system-terminal',
    title: 'Terminal Emulator',
    icon: '🖥️',
    defaultSize: { w: 800, h: 400 },
    component: SystemTerminalApp,
    showOnDesktop: true,
  },
  {
    id: 'space-tracker',
    title: 'Celestia Engine',
    icon: '🪐',
    defaultSize: { w: 700, h: 400 },
    component: SpaceTrackerApp,
    showOnDesktop: true,
  },
  {
    id: 'market-charts',
    title: 'Market Analytics',
    icon: '📈',
    defaultSize: { w: 700, h: 450 },
    component: MarketChartsApp,
    showOnDesktop: true,
  },
  {
    id: 'media-streamer',
    title: 'Media Engine',
    icon: '🎛️',
    defaultSize: { w: 800, h: 500 },
    component: MediaStreamerApp,
    showOnDesktop: true,
  },
  {
    id: 'diagnostics',
    title: 'Core Node Diagnostics',
    icon: '🩺',
    defaultSize: { w: 900, h: 600 },
    component: DiagnosticsApp,
    showOnDesktop: true,
  },
  {
    id: 'synth',
    title: 'BlissWave Synth',
    icon: '🎹',
    defaultSize: { w: 620, h: 420 },
    component: SynthApp,
    showOnDesktop: true,
  },
  {
    id: 'bliss-ai',
    title: 'Bliss AI',
    icon: '🤖',
    defaultSize: { w: 480, h: 560 },
    component: BlissAiApp,
    showOnDesktop: true,
  },
  {
    id: 'settings',
    title: 'Control Center',
    icon: '⚙️',
    defaultSize: { w: 560, h: 620 },
    component: SettingsApp,
    showOnDesktop: true,
    singleton: true,
  },
];

const byId = new Map(APPS.map((a) => [a.id, a]));

export function getApp(id: string): AppDef | undefined {
  return byId.get(id);
}
