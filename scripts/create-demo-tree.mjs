import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// 텍스처 없는 자체 생성 샘플. Blender/외부 에셋 확보 전 GLB 로딩을 확인합니다.
globalThis.FileReader = class {
  result = null;
  onloadend = null;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;
      this.onloadend?.();
    });
  }
};
const model = new THREE.Group();
model.name = 'MindGardenDemoTree';
const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.23, 1.6, 7),
  new THREE.MeshStandardMaterial({ color: '#89745b', roughness: 0.9 }));
trunk.position.y = 0.8;
const crown = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.8, 7),
  new THREE.MeshStandardMaterial({ color: '#718966', roughness: 0.9 }));
crown.position.y = 2.2;
model.add(trunk, crown);
const bytes = await new GLTFExporter().parseAsync(model, { binary: true });
if (!(bytes instanceof ArrayBuffer)) throw new Error('GLB 생성 실패');
const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/client/public/assets/models/tree-demo.glb');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, Buffer.from(bytes));
console.log(`자체 생성 GLB: ${bytes.byteLength} bytes`);
