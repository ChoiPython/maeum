import * as THREE from 'three';
import { isWalkable, settings } from '../../../shared/runtime.js';

const origin = new THREE.Vector2();
const movementKey = /^(Key[WASD]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/;

export class GardenNavigation {
  private enabled = false;
  private firstPerson = false;
  private keys = new Set<string>();
  private zoom = 1;
  private pitch = -0.04;
  private pointer: number | null = null;
  private lastPointer = new THREE.Vector2();
  private direction = new THREE.Vector2();
  private cameraTarget = new THREE.Vector3();
  private listeners = new AbortController();

  constructor(
    private canvas: HTMLCanvasElement,
    private player: THREE.Group,
    private camera: THREE.PerspectiveCamera,
    private onView: (firstPerson: boolean) => void,
  ) {
    const options = { signal: this.listeners.signal };
    window.addEventListener('keydown', this.keyDown, options);
    window.addEventListener('keyup', (event) => this.keys.delete(event.code), options);
    window.addEventListener('blur', this.clearInput, options);
    document.addEventListener('visibilitychange', this.clearInput, options);
    canvas.addEventListener('pointerdown', this.pointerDown, options);
    canvas.addEventListener('pointermove', this.pointerMove, options);
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      canvas.addEventListener(event, (e) => { if (e.pointerId === this.pointer) this.endDrag(); }, options);
    }
    canvas.addEventListener('wheel', (event) => {
      if (!this.enabled || this.firstPerson) return;
      event.preventDefault();
      this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(event.deltaY * 0.001), 0.5, 1.4);
    }, { ...options, passive: false });
    this.canvas.dataset.perspective = 'third';
    this.camera.rotation.order = 'YXZ';
  }

  private keyDown = (event: KeyboardEvent) => {
    if (!this.enabled || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest('input,select,textarea,dialog'))) return;
    if (event.code === 'KeyV') {
      event.preventDefault();
      if (!event.repeat) this.togglePerspective();
    } else if (movementKey.test(event.code)) {
      // Shift alone still participates in native Shift+Tab navigation.
      if (!event.code.startsWith('Shift')) event.preventDefault();
      this.keys.add(event.code);
    }
  };

  private pointerDown = (event: PointerEvent) => {
    if (!this.enabled || event.button !== 0 || !event.isPrimary) return;
    this.canvas.focus({ preventScroll: true });
    if (!this.firstPerson) return;
    this.pointer = event.pointerId;
    this.lastPointer.set(event.clientX, event.clientY);
    this.canvas.setPointerCapture(event.pointerId);
  };

  private pointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.pointer) return;
    this.turn(-(event.clientX - this.lastPointer.x) * 0.004);
    this.pitch = THREE.MathUtils.clamp(this.pitch - (event.clientY - this.lastPointer.y) * 0.003, -1.15, 1.15);
    this.lastPointer.set(event.clientX, event.clientY);
  };

  private turn(radians: number) {
    const yaw = this.player.rotation.y + radians;
    this.player.rotation.y = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  }

  private endDrag() {
    const id = this.pointer;
    this.pointer = null;
    if (id !== null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }

  private clearInput = () => { this.keys.clear(); this.endDrag(); };

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.clearInput();
    if (enabled) this.canvas.focus({ preventScroll: true });
  }

  togglePerspective() {
    if (this.enabled) this.setPerspective(!this.firstPerson);
  }

  private setPerspective(firstPerson: boolean) {
    this.endDrag();
    this.firstPerson = firstPerson;
    this.pitch = -0.04;
    this.player.visible = !firstPerson;
    this.camera.fov = firstPerson ? settings.world.camera.firstPersonFov : settings.world.camera.followFov;
    this.camera.updateProjectionMatrix();
    this.canvas.dataset.perspective = firstPerson ? 'first' : 'third';
    this.updateCamera(1);
    this.onView(firstPerson);
  }

  respawn() {
    const { x, z, yaw } = settings.world.spawn;
    this.player.position.set(x, 0, z);
    this.player.rotation.y = yaw;
    this.clearInput();
    this.updateCamera(1);
  }

  reset() {
    this.zoom = 1;
    this.setPerspective(false);
    this.respawn();
  }

  update(delta: number) {
    if (this.enabled && document.visibilityState === 'visible') this.move(delta);
    this.updateCamera(1 - Math.exp(-4 * delta));
  }

  private move(delta: number) {
    const horizontal = Number(this.keys.has('ArrowRight')) - Number(this.keys.has('ArrowLeft'));
    const strafe = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    const back = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'));
    if (this.firstPerson && horizontal) this.turn(-horizontal * 2.1 * delta);
    const lateral = this.firstPerson ? strafe : Math.sign(strafe + horizontal);
    if (!lateral && !back) return;

    const direction = this.direction.set(lateral, back).normalize();
    if (this.firstPerson) direction.rotateAround(origin, Math.PI - this.player.rotation.y);
    else this.player.rotation.y = Math.atan2(direction.x, direction.y);
    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const step = (running ? settings.world.runSpeedMps : settings.world.walkSpeedMps) * delta;
    const position = this.player.position;
    const nextX = position.x + direction.x * step;
    const nextZ = position.z + direction.y * step;
    if (isWalkable(nextX, position.z)) position.x = nextX;
    if (isWalkable(position.x, nextZ)) position.z = nextZ;
  }

  private updateCamera(blend: number) {
    const { x, z } = this.player.position;
    if (this.firstPerson) {
      this.camera.position.set(x, settings.world.camera.eyeHeightM, z);
      this.camera.rotation.set(this.pitch, this.player.rotation.y - Math.PI, 0);
    } else {
      this.camera.position.lerp(this.cameraTarget.set(x, 25 * this.zoom, z + 30 * this.zoom), blend);
      this.camera.lookAt(x, 0, z - 7);
    }
  }

  dispose() {
    this.clearInput();
    this.listeners.abort();
  }
}
