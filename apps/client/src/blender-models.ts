import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const blenderAssetIds = [
  'tree-canopy', 'tree-pine', 'flower-patch', 'rock-cluster',
  'garden-bench', 'floating-leaf', 'garden-lantern', 'garden-visitor',
] as const;
export type BlenderAssetId = typeof blenderAssetIds[number];

/** 모델 원본은 asset-sources/blender/maeum-garden.blend에서 편집합니다. */
export class BlenderModels {
  private templates = new Map<BlenderAssetId, THREE.Group>();
  private disposed = false;

  async load(): Promise<BlenderAssetId[]> {
    const loader = new GLTFLoader();
    const failed: BlenderAssetId[] = [];
    await Promise.all(blenderAssetIds.map(async (id) => {
      try {
        const gltf = await loader.loadAsync(`/assets/models/blender/${id}.glb`);
        if (this.disposed) { disposeObjectResources(gltf.scene); return; }
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
        });
        this.templates.set(id, gltf.scene);
      } catch { failed.push(id); }
    }));
    return failed;
  }

  create(id: BlenderAssetId): THREE.Group | null {
    const instance = this.templates.get(id)?.clone(true) ?? null;
    if (instance) instance.userData.blenderAsset = id;
    return instance;
  }

  dispose() {
    this.disposed = true;
    const root = new THREE.Group();
    for (const template of this.templates.values()) root.add(template);
    disposeObjectResources(root);
    this.templates.clear();
  }
}

/** 같은 GLB를 여러 번 배치해 공유한 geometry/material/texture는 한 번만 정리합니다. */
export function disposeObjectResources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) geometries.add(object.geometry);
    if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}
