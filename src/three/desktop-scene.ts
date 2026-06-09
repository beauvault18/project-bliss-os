import * as THREE from 'three';

/**
 * The WebGL desktop background, written directly against Three.js (no R3F).
 * A Bliss-style gradient sky + a drifting starfield, an orthographic camera
 * mapping 1 unit ≈ 1px. This is the foundation the Workspace Cube will build on.
 */
export class DesktopScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private stars: THREE.Points;
  private raf = 0;
  private running = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, -1000, 1000);
    this.camera.position.z = 10;

    // Gradient sky as a fullscreen quad behind everything.
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {},
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
        fragmentShader: `
          varying vec2 vUv;
          void main(){
            vec3 top = vec3(0.105, 0.255, 0.74);
            vec3 bot = vec3(0.03, 0.10, 0.40);
            vec3 col = mix(bot, top, smoothstep(0.0, 1.0, vUv.y));
            float glow = smoothstep(0.55, 0.0, distance(vUv, vec2(0.5, 0.78)));
            col += glow * vec3(0.10, 0.18, 0.35);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.scene.add(sky);

    // Drifting starfield.
    const COUNT = 320;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.sin(i * 12.9898) * 43758.5453 % 1) * w - w / 2;
      positions[i * 3 + 1] = (Math.sin(i * 78.233) * 43758.5453 % 1) * h - h / 2;
      positions[i * 3 + 2] = -5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0x9ec3ff, size: 2, transparent: true, opacity: 0.5 }),
    );
    this.scene.add(this.stars);

    this.resize();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.stars.rotation.z += 0.0004;
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.left = -w / 2;
    this.camera.right = w / 2;
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}
