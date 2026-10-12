import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { settings, isWalkable, zoneAt } from '../../../shared/runtime.js';
import type { AvatarMove, GardenSnapshot, ZoneId } from '../../../shared/contracts.js';

const makeMaterial = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
const pineGreen = makeMaterial('#718966');
const trunkBrown = makeMaterial('#89745b');
const trunkGeometry = new THREE.CylinderGeometry(0.17, 0.23, 1.6, 7);
const crownGeometry = new THREE.ConeGeometry(1.3, 2.8, 7);
function tree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeometry, trunkBrown);
  trunk.position.y = 0.8;
  const crown = new THREE.Mesh(crownGeometry, pineGreen);
  crown.position.y = 2.2;
  group.add(trunk, crown);
  return group;
}
function avatar(color: string) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.55, 4, 8), makeMaterial(color));
  body.position.y = 0.7;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), makeMaterial('#f3dec2'));
  head.position.y = 1.34;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.48, 20),
    new THREE.MeshBasicMaterial({ color: '#3e5c46', transparent: true, opacity: 0.22 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.045;
  group.add(body, head, shadow);
  return group;
}
function label(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 112;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f9f7ee';
  ctx.beginPath(); ctx.roundRect(12, 12, 488, 88, 30); ctx.fill();
  ctx.fillStyle = '#2c4c3b'; ctx.font = '600 38px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 56);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, fog: false, toneMapped: false }));
  sprite.scale.set(7.5, 1.65, 1);
  return sprite;
}

export class GardenView {
  private scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer;
  private camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 180);
  private player = avatar('#355e4b');
  private remotes = new Map<string, { group: THREE.Group; target: THREE.Vector3 }>();
  private keys = new Set<string>();
  private zone: ZoneId = 'entry';
  private enabled = false;
  private previous = performance.now();
  private frame = 0;
  private disposed = false;
  private callback: (position: Omit<AvatarMove, 'seq'>, zone: ZoneId) => void;

  constructor(private canvas: HTMLCanvasElement, onMove: GardenView['callback'], onAsset: (ready: boolean) => void) {
    this.callback = onMove;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color('#e8eddd');
    this.scene.fog = new THREE.FogExp2('#e8eddd', 0.012);
    this.scene.add(new THREE.HemisphereLight('#fff6df', '#77816a', 2.4));
    const sun = new THREE.DirectionalLight('#fff2ce', 2.2);
    sun.position.set(-15, 30, 15); this.scene.add(sun);
    this.buildGarden();
    this.scene.add(this.player);
    this.resetPlayer();
    this.camera.position.set(0, 32, 54);
    this.camera.lookAt(0, 0, 6);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.clearKeys);
    document.addEventListener('visibilitychange', this.clearKeys);
    window.addEventListener('resize', this.resize);
    this.canvas.addEventListener('pointerdown', this.focus);
    const glbTrees: THREE.Group[] = [];
    for (const [x, z] of [[-18, -13], [-20, -6], [-11, -17]]) {
      const placeholder = tree(); placeholder.position.set(x, 0, z); this.scene.add(placeholder); glbTrees.push(placeholder);
    }
    new GLTFLoader().loadAsync('/assets/models/tree-demo.glb').then((gltf) => {
      if (this.disposed) return;
      for (const placeholder of glbTrees) {
        const model = gltf.scene.clone(true); model.position.copy(placeholder.position);
        this.scene.remove(placeholder); this.scene.add(model);
      }
      this.canvas.dataset.model = 'ready'; onAsset(true);
    }).catch(() => { if (!this.disposed) { this.canvas.dataset.model = 'fallback'; onAsset(false); } });
    this.animate();
  }

  private buildGarden() {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(35, 64), makeMaterial('#becb9f'));
    ground.rotation.x = -Math.PI / 2; this.scene.add(ground);
    const roadMaterial = makeMaterial('#ece2c6');
    for (const target of [new THREE.Vector3(-14, 0.05, -8), new THREE.Vector3(11, 0.05, -4), new THREE.Vector3(0, 0.05, 19)]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.05, 8), new THREE.Vector3(target.x * 0.3, 0.05, 2 + target.z * 0.3), target]);
      const road = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 1.0, 6, false), roadMaterial);
      road.scale.y = 0.025; this.scene.add(road);
    }
    const forest = new THREE.Mesh(new THREE.CircleGeometry(9, 36), makeMaterial('#a2b78d'));
    forest.rotation.x = -Math.PI / 2; forest.position.set(-14, 0.025, -10); this.scene.add(forest);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(5.6, 48),
      new THREE.MeshStandardMaterial({ color: '#83b8b4', roughness: 0.35, metalness: 0.08 }));
    lake.rotation.x = -Math.PI / 2; lake.position.set(14, 0.07, -10); this.scene.add(lake);
    for (const r of [1.5, 2.9, 4.4]) {
      const ripple = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 3, 48), makeMaterial('#c4e1d0'));
      ripple.rotation.x = -Math.PI / 2; ripple.position.set(14, 0.085, -10); this.scene.add(ripple);
    }
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(4.8, 36), makeMaterial('#d2c1a2'));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.05, 8); this.scene.add(plaza);
    const center = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), makeMaterial('#c7b878'));
    center.position.set(0, 0.85, 8); this.scene.add(center);
    const benchMaterial = makeMaterial('#948064');
    for (const x of [-3.5, 3.5]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 2.5), benchMaterial);
      bench.position.set(x, 0.35, 8); this.scene.add(bench);
    }
    for (let i = 0; i < 22; i++) {
      const angle = i * 2.39996;
      const radius = 7.5 + (i % 3) * 0.9;
      const pine = tree(); pine.position.set(-14 + Math.cos(angle) * radius, 0, -10 + Math.sin(angle) * radius);
      pine.scale.setScalar(0.7 + (i % 4) * 0.12); this.scene.add(pine);
    }
    for (let i = 0; i < 23; i++) {
      const angle = i * (Math.PI * 2 / 23);
      const pine = tree(); pine.position.set(Math.cos(angle) * 28, 0, Math.sin(angle) * 28);
      pine.scale.setScalar(1.1); this.scene.add(pine);
    }
    for (const { id, label: text, center } of settings.world.zones) {
      if (id === 'entry') continue;
      const sign = label(text); sign.position.set(center.x, 3.5, center.z); this.scene.add(sign);
    }
  }
  private keyDown = (event: KeyboardEvent) => {
    if (!this.enabled || document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
    if (document.activeElement && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement.tagName)) return;
    if (/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(event.code)) { event.preventDefault(); this.keys.add(event.code); }
  };
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private clearKeys = () => { this.keys.clear(); };
  private focus = () => { this.canvas.focus({ preventScroll: true }); };
  private resize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
  private animate = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const now = performance.now();
    const delta = Math.min((now - this.previous) / 1000, 0.08); this.previous = now;
    if (this.enabled && document.visibilityState === 'visible') {
      const x = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
      const z = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'));
      const direction = new THREE.Vector2(x, z).normalize();
      const step = settings.world.walkSpeedMps * delta;
      const nextX = this.player.position.x + direction.x * step;
      const nextZ = this.player.position.z + direction.y * step;
      if (isWalkable(nextX, this.player.position.z)) this.player.position.x = nextX;
      if (isWalkable(this.player.position.x, nextZ)) this.player.position.z = nextZ;
      if (x || z) this.player.rotation.y = Math.atan2(x, z);
    }
    const { x, z } = this.player.position;
    this.zone = zoneAt(x, z);
    this.canvas.dataset.zone = this.zone;
    this.canvas.dataset.playerX = x.toFixed(2); this.canvas.dataset.playerZ = z.toFixed(2);
    this.callback({ x, z, yaw: this.player.rotation.y }, this.zone);
    const cameraTarget = new THREE.Vector3(x, 31, z + 34);
    this.camera.position.lerp(cameraTarget, 1 - Math.exp(-3 * delta));
    this.camera.lookAt(x, 0, z - 7);
    for (const { group, target } of this.remotes.values()) group.position.lerp(target, 1 - Math.exp(-12 * delta));
    this.renderer.render(this.scene, this.camera);
  };
  setEnabled(enabled: boolean) { this.enabled = enabled; this.clearKeys(); if (enabled) this.focus(); }
  resetPlayer() { this.player.position.set(settings.world.spawn.x, 0, settings.world.spawn.z); this.player.rotation.y = 0; this.clearKeys(); }
  snapshot(snapshot: GardenSnapshot, selfId: string) {
    const present = new Set<string>();
    for (const player of snapshot.players) {
      if (player.id === selfId) continue;
      present.add(player.id);
      let remote = this.remotes.get(player.id);
      if (!remote) {
        const group = avatar('#b38a60'); group.position.set(player.x, 0, player.z);
        remote = { group, target: group.position.clone() }; this.remotes.set(player.id, remote); this.scene.add(group);
      }
      remote.target.set(player.x, 0, player.z); remote.group.rotation.y = player.yaw;
    }
    for (const [id, remote] of this.remotes) {
      if (!present.has(id)) { this.scene.remove(remote.group); this.disposeObject(remote.group); this.remotes.delete(id); }
    }
    this.canvas.dataset.remoteCount = String(this.remotes.size);
  }
  private disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame);
    window.removeEventListener('keydown', this.keyDown); window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.clearKeys); window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.clearKeys); this.canvas.removeEventListener('pointerdown', this.focus);
    this.disposeObject(this.scene); this.renderer.dispose();
  }
}
