import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForestBreathing } from '../src/forest-breathing.js';
import { settings } from '../../../shared/runtime.js';

test('호흡은 활성 시간만 누적하고 명시적으로 재개한 뒤 한 번 완료한다', () => {
  const breath = new ForestBreathing();
  breath.start(100);
  breath.pause(20_100);
  breath.advance(90_100);
  assert.equal(breath.status, 'paused');
  assert.equal(breath.elapsedMs, 20_000);
  breath.resume(90_100);
  breath.advance(130_099);
  assert.equal(breath.status, 'running');
  breath.advance(130_100);
  assert.equal(breath.status, 'completed');
  breath.pause(150_000);
  assert.equal(breath.elapsedMs, settings.activities.breathingDurationMs);
  assert.equal(breath.progress, 1);
});

test('건너뛰기·다시 시작·새 산책과 다른 방문자는 각각 독립된 상태를 갖는다', () => {
  const a = new ForestBreathing(), b = new ForestBreathing();
  a.start(0); a.advance(5000);
  assert.equal(a.light, 1);
  a.skip(6000); a.advance(90_000); a.resume(91_000);
  assert.equal(a.status, 'skipped');
  assert.equal(a.elapsedMs, 6000);
  a.start(100_000);
  assert.equal(a.progress, 0);
  a.advance(161_000);
  assert.equal(a.status, 'completed');
  assert.equal(b.status, 'idle');
  assert.equal(b.elapsedMs, 0);
  a.start(170_000);
  assert.equal(a.elapsedMs, 0);
  a.reset();
  assert.equal(a.status, 'idle');
});
