import * as THREE from 'three';

/** The WebGL-side palette, mirrored from the CSS --scene-* tokens (parsed by
 *  ThemeService). All scene modules lerp toward these targets in the render
 *  loop, so a theme switch is a ~1s cinematic morph rather than a hard cut. */
export interface ScenePaletteColors {
  skyTop: THREE.Color;
  skyBot: THREE.Color;
  grid: THREE.Color;
  gridDim: THREE.Color;
  building: THREE.Color;
  star: THREE.Color;
  nebulaA: THREE.Color;
  nebulaB: THREE.Color;
  nebulaC: THREE.Color;
  flags: Set<string>;
}

export interface ScenePaletteInput {
  skyTop: string;
  skyBot: string;
  grid: string;
  gridDim: string;
  building: string;
  star: string;
  nebulaA: string;
  nebulaB: string;
  nebulaC: string;
  flags: Set<string>;
}

export const BLISS_PALETTE: ScenePaletteInput = {
  skyTop: '#0a1a4d',
  skyBot: '#03081f',
  grid: '#2ad0ff',
  gridDim: '#10416e',
  building: '#2ad0ff',
  star: '#9ec3ff',
  nebulaA: '#3a1d6e',
  nebulaB: '#1d3a6e',
  nebulaC: '#6e1d52',
  flags: new Set(['aurora']),
};

export function toColors(p: ScenePaletteInput): ScenePaletteColors {
  return {
    skyTop: new THREE.Color(p.skyTop),
    skyBot: new THREE.Color(p.skyBot),
    grid: new THREE.Color(p.grid),
    gridDim: new THREE.Color(p.gridDim),
    building: new THREE.Color(p.building),
    star: new THREE.Color(p.star),
    nebulaA: new THREE.Color(p.nebulaA),
    nebulaB: new THREE.Color(p.nebulaB),
    nebulaC: new THREE.Color(p.nebulaC),
    flags: new Set(p.flags),
  };
}
