import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 준비자료의 정합성 검사입니다. 실제 앱·네트워크·전체 타입 검사가 아닙니다.
const root = path.dirname(fileURLToPath(import.meta.url));
const failures = [];
let checks = 0;
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}
async function read(name) {
  return (await readFile(path.join(root, name), 'utf8')).replace(/^\uFEFF/, '');
}
function parseCsv(text) {
  const records = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some(value => value !== '')) records.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (field.length || row.length) { row.push(field); records.push(row); }
  check(!quoted, 'CSV 인용부호 미종료');
  const headers = records.shift() ?? [];
  for (const row of records) check(row.length === headers.length, 'CSV 열 수 불일치');
  return { headers, rows: records.map(values => Object.fromEntries(headers.map((key, i) => [key, values[i]]))) };
}
function uniqueIds(rows, key, label) {
  const ids = rows.map(row => row[key]);
  check(ids.every(Boolean) && new Set(ids).size === ids.length, `${label} ID 중복/누락`);
}

const content = JSON.parse(await read('공통설정/content.json'));
const settings = JSON.parse(await read('공통설정/settings.json'));
const contracts = await read('공통설정/contracts.ts');
check(content.schemaVersion === 1 && settings.schemaVersion === 1, '설정 schemaVersion');
check(content.emotions.length === 5, '감정 개수');
check(content.worries.length === 6, '고민 범주 개수');
check(content.supportMessages.length === 6, '응원 개수');
for (const [rows, type] of [[content.emotions, 'EmotionId'], [content.worries, 'WorryId'], [content.supportMessages, 'SupportMessageId']]) {
  uniqueIds(rows, 'id', type);
  const declaration = contracts.match(new RegExp(`export type ${type} = ([\\s\\S]*?);`));
  const typeIds = declaration ? [...declaration[1].matchAll(/'([^']+)'/g)].map(match => match[1]) : [];
  check([...typeIds].sort().join(',') === rows.map(row => row.id).sort().join(','), `${type} JSON/타입 불일치`);
}
const zoneIds = settings.world.zones.map(zone => zone.id);
check(zoneIds.join(',') === 'entry,forest,lake,plaza', '구역 ID');
for (const emotion of content.emotions) {
  check(emotion.recommendedZone === null || ['forest', 'lake', 'plaza'].includes(emotion.recommendedZone), '추천 구역 오류');
  check(Boolean(emotion.label && emotion.guidance), '감정 문구 누락');
}
for (const message of content.supportMessages) check(Boolean(message.text) && message.text.length <= 100, '응원 문구 누락/길이');
check(settings.activities.breathingDurationMs === 60000, '호흡 시간');
check(settings.network.maxPlayers === 5, '최대 접속자');
check(settings.network.supportAckTimeoutMs < settings.network.requestCacheTtlMs, 'ack/중복 보관 시간');
check(settings.activities.fogDensityStart > settings.activities.fogDensityEnd, '안개 진행 방향');
check(settings.audio.initiallyMuted === true, '초기 무음');
check(settings.targets.routeCompletionPercent === 80 && settings.targets.averageFps === 30, '목표값');
const bounds = settings.world.bounds;
for (const zone of settings.world.zones) {
  const b = zone.bounds;
  check(b.minX < b.maxX && b.minZ < b.maxZ, `${zone.id} 구역 범위`);
  check(b.minX >= bounds.minX && b.maxX <= bounds.maxX && b.minZ >= bounds.minZ && b.maxZ <= bounds.maxZ, `${zone.id} 맵 이탈`);
  check(zone.center.x >= b.minX && zone.center.x < b.maxX && zone.center.z >= b.minZ && zone.center.z < b.maxZ, `${zone.id} 중심`);
}
for (let i = 0; i < settings.world.zones.length; i++) {
  for (let j = i + 1; j < settings.world.zones.length; j++) {
    const a = settings.world.zones[i], b = settings.world.zones[j];
    const overlap = Math.max(a.bounds.minX, b.bounds.minX) < Math.min(a.bounds.maxX, b.bounds.maxX)
      && Math.max(a.bounds.minZ, b.bounds.minZ) < Math.min(a.bounds.maxZ, b.bounds.maxZ);
    check(!overlap, `구역 중복 ${a.id}/${b.id}`);
  }
}
const networkContract = contracts.slice(contracts.indexOf('export interface ClientToServerEvents'), contracts.indexOf('export interface EmotionOption'));
check(!/emotionId|worryId|SessionState|Ratings|BreathingView/.test(networkContract), '개인 타입의 네트워크 계약 유입');

const requirementDoc = await read('01_요구사항명세서.md');
const requirementIds = new Set([...requirementDoc.matchAll(/^\|\s*((?:FR|NFR)-\d+)\s*\|/gm)].map(match => match[1]));
check(requirementIds.size === 20, '14개 기능·6개 비기능 요구');
const taskTable = parseCsv(await read('작업목록.csv'));
const testTable = parseCsv(await read('테스트케이스.csv'));
const assetTable = parseCsv(await read('에셋목록.csv'));
check(taskTable.rows.length === 30, '작업 개수');
check(testTable.rows.length === 28, '테스트 개수');
check(assetTable.rows.length === 12, '에셋 개수');
uniqueIds(taskTable.rows, '작업ID', '작업');
uniqueIds(testTable.rows, '테스트ID', '테스트');
uniqueIds(assetTable.rows, '에셋ID', '에셋');
const owners = new Set(['최주영', '장재혁', '심가현']);
for (const table of [taskTable, testTable]) {
  for (const row of table.rows) {
    for (const id of row['요구ID'].split(';')) check(requirementIds.has(id), `없는 요구 ID: ${id}`);
    check(owners.has(row['담당자']) && owners.has(row['검토자']), '담당/검토 이름');
    check(row['담당자'] !== row['검토자'], '자기 검토 배정');
  }
  const covered = new Set(table.rows.flatMap(row => row['요구ID'].split(';')));
  for (const id of requirementIds) check(covered.has(id), `작업/테스트에 없는 요구: ${id}`);
}
const taskMap = new Map(taskTable.rows.map(row => [row['작업ID'], row]));
const dependencies = new Map();
for (const task of taskTable.rows) {
  const id = task['작업ID'];
  const deps = task['선행작업'] ? task['선행작업'].split(';') : [];
  dependencies.set(id, deps);
  check(task['시작일'] >= '2026-10-13' && task['시작일'] <= task['완료기한'] && task['완료기한'] <= '2026-12-07', `${id} 날짜`);
  check(Number(task['예상시간_h']) > 0, `${id} 예상시간`);
  for (const dep of deps) {
    check(taskMap.has(dep) && dep !== id, `${id} 선행작업 ${dep}`);
    if (taskMap.has(dep)) check(taskMap.get(dep)['완료기한'] <= task['시작일'], `${id} 선행작업 일정`);
  }
}
const visited = new Set(), active = new Set();
function visit(id) {
  if (active.has(id)) { check(false, `선행작업 순환: ${id}`); return; }
  if (visited.has(id)) return;
  active.add(id);
  for (const dep of dependencies.get(id) ?? []) visit(dep);
  active.delete(id); visited.add(id);
}
for (const id of dependencies.keys()) visit(id);

for (const name of ['평가기록_빈양식.csv', '버그기록_빈양식.csv']) {
  const table = parseCsv(await read(name));
  check(table.headers.length > 5, `${name} 헤더`);
  // 추후 실제 기록이 추가되면 행 수가 0인지 강제하지 않습니다.
}
const files = (await readdir(root)).filter(name => name.endsWith('.md'));
for (const name of files) {
  const text = await read(name);
  check(!text.includes('\uFFFD'), `${name} 문자 인코딩`);
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^[a-z]+:\/\//i.test(target)) continue;
    try { await access(path.resolve(root, target)); check(true, '문서 링크'); }
    catch { check(false, `${name} 없는 링크: ${target}`); }
  }
}
if (failures.length) {
  console.error(`준비자료 검사 실패: ${failures.length}/${checks}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  const hours = {};
  for (const task of taskTable.rows) hours[task['담당자']] = (hours[task['담당자']] ?? 0) + Number(task['예상시간_h']);
  console.log(`준비자료 검사 통과: ${checks}개 조건`);
  console.log('요구사항 20개 / 작업 30개 / 에셋 12개 / 테스트 28개');
  console.log(`초기 예상 인시: ${JSON.stringify(hours)}`);
  console.log('앱 실행·전체 TypeScript 검사·네트워크·FPS·사용자 평가는 별도 검증이 필요합니다.');
}
