import content from './content.json' with { type: 'json' };
import settings from './settings.json' with { type: 'json' };
import type { EmotionId, EmotionOption, ZoneId } from './contracts.js';

export { content, settings };
export const emotions = content.emotions as EmotionOption[];
export function recommend(emotionId: EmotionId | null) {
  return emotions.find((emotion) => emotion.id === emotionId) ?? null;
}
export function zoneAt(x: number, z: number): ZoneId {
  const zone = settings.world.zones.find(({ bounds }) =>
    x >= bounds.minX && x < bounds.maxX && z >= bounds.minZ && z < bounds.maxZ);
  return zone ? zone.id as ZoneId : 'path';
}
export function zoneLabel(zone: ZoneId): string {
  return settings.world.zones.find(({ id }) => id === zone)?.label ?? '정원의 산책길';
}
export function isWalkable(x: number, z: number): boolean {
  const b = settings.world.bounds;
  // 평면 호수 안쪽은 걷지 않습니다. 정교한 충돌/물리는 이번 범위 밖입니다.
  return x >= b.minX + 1 && x <= b.maxX - 1 && z >= b.minZ + 1 && z <= b.maxZ - 1
    && Math.hypot(x - 14, z + 10) >= 5.6;
}
