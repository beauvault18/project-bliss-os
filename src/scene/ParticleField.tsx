import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { usePreferencesStore } from '../core/preferencesStore';

const DENSITY_COUNT = { low: 120, medium: 280, high: 520 } as const;
const SPEED_MULT = { slow: 0.3, normal: 0.8, fast: 1.5 } as const;

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Lightweight drifting starfield (a single THREE.Points). Floats with a slow
 * rotation + bob and parallaxes off the pointer. No per-point CPU work per frame
 * — the whole cloud moves — so it stays cheap even at high density.
 */
export function ParticleField() {
  const enabled = usePreferencesStore((s) => s.parallaxEnabled);
  const density = usePreferencesStore((s) => s.particleDensity);
  const speed = usePreferencesStore((s) => s.particleSpeed);
  const hacker = usePreferencesStore((s) => s.hackerMode);
  const strength = usePreferencesStore((s) => s.parallaxStrength);
  const { viewport } = useThree();
  const ref = useRef<THREE.Points>(null);

  const count = DENSITY_COUNT[density];
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() * 2 - 1) * viewport.width * 0.7;
      arr[i * 3 + 1] = (Math.random() * 2 - 1) * viewport.height * 0.7;
      arr[i * 3 + 2] = -2 - Math.random() * 7;
    }
    return arr;
  }, [count, viewport.width, viewport.height]);

  useFrame((state) => {
    const g = ref.current;
    if (!g || document.hidden) return;
    const t = state.clock.elapsedTime;
    const sp = (reducedMotion() ? 0.15 : 1) * SPEED_MULT[speed];
    const ps = reducedMotion() ? 0 : strength / 100;
    g.rotation.z = t * 0.015 * sp;
    g.position.x = state.pointer.x * ps * 18;
    g.position.y =
      Math.sin(t * 0.15 * sp) * (viewport.height * 0.02) -
      state.pointer.y * ps * 12;
  });

  if (!enabled) return null;

  return (
    <points key={count} ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={hacker ? 2.6 : 1.8}
        sizeAttenuation={false}
        color={hacker ? '#5dff8d' : '#cfe6ff'}
        transparent
        opacity={hacker ? 0.85 : 0.7}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
