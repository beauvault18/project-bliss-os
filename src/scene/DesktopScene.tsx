import { Canvas } from '@react-three/fiber';
import { Wallpaper } from './Wallpaper';
import { WindowLayer } from './WindowLayer';

/**
 * The WebGL desktop. An orthographic camera with zoom 1 maps 1 world unit to
 * 1 CSS pixel and centers world origin on screen center (+y up) — which makes
 * the screen→world math for window placement and dragging trivial.
 */
export function DesktopScene() {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 1000], zoom: 1, near: 0.1, far: 5000 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[4, 8, 6]} intensity={0.5} />
      <Wallpaper />
      <WindowLayer />
    </Canvas>
  );
}
