import type { CSSProperties } from 'react';
import type { MinimizeStyle } from '../core/animationPresets';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * "Somersault token" minimize: the window tilts forward, rolls a full forward
 * somersault (rotateX 0→360), and shrinks toward its landing point on the
 * desktop. progress 1 = full window, 0 = landed token. CSS 3D only.
 */
export const somersaultTokenStyle: MinimizeStyle = (progress, geo): CSSProperties => {
  const t = 1 - progress; // 0 = window, 1 = token
  const tx = geo.dx * t;
  const ty = geo.dy * t;
  const scale = lerp(1, geo.targetScale, t);
  const flip = t * 360; // full forward somersault
  const sway = Math.sin(t * Math.PI) * 8; // slight Z sway mid-roll

  return {
    transform: `perspective(1000px) translate(${tx}px, ${ty}px) rotateX(${flip}deg) rotateZ(${sway}deg) scale(${scale})`,
    transformOrigin: '50% 50%',
    opacity: lerp(1, 0.9, t),
    clipPath: 'none',
    borderRadius: `${lerp(8, 12, t)}px`,
    filter: 'none',
    willChange: 'transform, opacity',
  };
};
