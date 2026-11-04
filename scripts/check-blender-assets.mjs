import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'apps/client/public/assets/models/blender');
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
const sourceManifest = JSON.parse(await readFile(path.join(root, 'asset-sources/blender/manifest.json'), 'utf8'));
assert.deepEqual(manifest, sourceManifest, '원본/배포 manifest가 다릅니다.');
assert.equal(manifest.generator, 'Blender bpy');
assert.equal(manifest.runtimeUpAxis, 'Y');
const ids = ['tree-canopy', 'tree-pine', 'flower-patch', 'rock-cluster', 'garden-bench', 'floating-leaf', 'garden-lantern', 'garden-visitor'];
assert.deepEqual(manifest.assets.map((asset) => asset.id), ids);
const blend = await readFile(path.join(root, manifest.source));
assert.equal(createHash('sha256').update(blend).digest('hex'), manifest.sourceSha256,
  '.blend가 변경되었습니다. Blender에서 GLB를 다시 내보내세요.');
let bytes = 0;
let triangles = 0;
for (const asset of manifest.assets) {
  const file = path.join(directory, asset.file);
  const buffer = await readFile(file);
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF', asset.id);
  assert.equal(buffer.readUInt32LE(4), 2, `${asset.id}: glTF 버전`);
  assert.equal(buffer.readUInt32LE(8), buffer.length, `${asset.id}: 파일 길이`);
  assert.equal(buffer.length, asset.bytes, `${asset.id}: manifest 용량`);
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a, `${asset.id}: JSON chunk`);
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12)));
  assert.match(json.asset.generator, /Blender/i, `${asset.id}: Blender exporter 확인`);
  assert.equal(json.meshes.length, 1, `${asset.id}: 웹용 메시 결합`);
  assert.ok(json.meshes[0].primitives.length > 0, `${asset.id}: 빈 모델`);
  assert.ok(!json.images?.length, `${asset.id}: 외부 텍스처 없는 기본 재질`);
  assert.ok(!json.animations?.length, `${asset.id}: 현재 정적 모델`);
  assert.ok(asset.blenderDimensionsXYZ.every((value) => Number.isFinite(value) && value > 0), `${asset.id}: 크기`);
  assert.ok(asset.bytes < 2_000_000, `${asset.id}: 모델당 2MB 예산`);
  bytes += buffer.length;
  triangles += asset.triangles;
}
assert.ok((await stat(path.join(root, manifest.source))).size > 1000, 'Blender 원본 누락');
console.log(`Blender 모델 ${ids.length}종 검증 통과 / GLB ${(bytes / 1024).toFixed(1)} KiB / 원본 모델 합계 ${triangles} triangles`);
