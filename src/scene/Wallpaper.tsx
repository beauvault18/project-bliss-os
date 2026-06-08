import { useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** Draw a Bliss-like wallpaper (blue sky, soft clouds, rolling green hill). */
function makeBlissTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 800;
  const g = c.getContext('2d')!;

  // Sky gradient.
  const sky = g.createLinearGradient(0, 0, 0, c.height);
  sky.addColorStop(0, '#2a6fc9');
  sky.addColorStop(0.45, '#5ba3e6');
  sky.addColorStop(0.62, '#bfe0fb');
  g.fillStyle = sky;
  g.fillRect(0, 0, c.width, c.height);

  // Soft clouds.
  g.fillStyle = '#ffffff';
  const clouds: [number, number, number][] = [
    [200, 120, 70],
    [260, 150, 95],
    [340, 130, 60],
    [900, 90, 80],
    [980, 120, 110],
    [1080, 100, 70],
    [620, 70, 55],
  ];
  for (const [x, y, r] of clouds) {
    g.globalAlpha = 0.55;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // Rolling green hill across the lower third.
  const hillTop = c.height * 0.62;
  const grad = g.createLinearGradient(0, hillTop, 0, c.height);
  grad.addColorStop(0, '#7bbf4a');
  grad.addColorStop(0.5, '#5a9c33');
  grad.addColorStop(1, '#3f7d24');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, c.height);
  g.lineTo(0, hillTop + 40);
  g.bezierCurveTo(
    c.width * 0.3,
    hillTop - 50,
    c.width * 0.7,
    hillTop + 70,
    c.width,
    hillTop - 10,
  );
  g.lineTo(c.width, c.height);
  g.closePath();
  g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function Wallpaper() {
  const texture = useMemo(makeBlissTexture, []);
  const { viewport } = useThree();
  const mesh = useRef<THREE.Mesh>(null);

  // Subtle parallax: the wallpaper drifts opposite the pointer.
  useFrame((state) => {
    if (!mesh.current) return;
    const tx = -state.pointer.x * (viewport.width * 0.02);
    const ty = -state.pointer.y * (viewport.height * 0.02);
    mesh.current.position.x += (tx - mesh.current.position.x) * 0.05;
    mesh.current.position.y += (ty - mesh.current.position.y) * 0.05;
  });

  return (
    <mesh ref={mesh} position={[0, 0, -10]}>
      {/* Oversize by 8% so parallax never reveals an edge. */}
      <planeGeometry args={[viewport.width * 1.08, viewport.height * 1.08]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
