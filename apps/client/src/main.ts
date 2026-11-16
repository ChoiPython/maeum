import './style.css';
import { content, emotions, recommend, settings, zoneLabel } from '../../../shared/runtime.js';
import type { EmotionId, Rating, SessionState, ZoneId } from '../../../shared/contracts.js';
import { ForestBreathing } from './forest-breathing.js';
import { GardenView } from './garden.js';
import { GardenConnection } from './network.js';

const app = document.querySelector<HTMLDivElement>('#app')!;
const canvas = document.querySelector<HTMLCanvasElement>('#garden')!;
const breathing = new ForestBreathing();
const initialSession = (): SessionState => ({
  emotionId: null, worryId: null, before: { tension: null, comfort: null }, after: { tension: null, comfort: null },
  visitedZones: [], breathing, lake: { status: 'idle' },
  support: { status: 'idle' }, muted: true, volume: settings.audio.defaultVolume,
});
let session = initialSession();
let entered = false;
let connection: GardenConnection | null = null;
let view: GardenView;
const scoreOptions = '<option value="">응답 안 함</option>' + [1, 2, 3, 4, 5].map((value) => `<option value="${value}">${value}</option>`).join('');

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="마음정원 처음으로"><span class="brand-mark">✦</span><span>마음정원<small>MIND GARDEN</small></span></a>
    <div class="top-actions"><span class="connection" id="connection" role="status">혼자 둘러보는 정원</span><button class="text-button" id="reset">새로 시작</button></div>
  </header>
  <main class="garden-ui" hidden id="hud">
    <section class="location-card"><span class="eyebrow">지금 머무는 곳</span><h1 id="zone-name">시작의 정원</h1><p id="zone-description">마음이 가는 길을 천천히 걸어보세요.</p>
      <button class="forest-invite" id="forest-enter" aria-haspopup="dialog" hidden>햇살꽃 피우기 · 60초</button></section>
    <aside id="garden-panel" class="side-panel" aria-label="정원 안내">
      <section class="recommendation"><span class="eyebrow" id="recommendation-label">오늘의 작은 산책</span><h2 id="recommendation-title">마음이 가는 곳으로</h2><p id="recommendation-text">세 공간을 자유롭게 둘러보세요.</p><button class="text-button" id="change-emotion">감정 다시 선택</button></section>
      <section class="map-section"><div class="section-title"><h2>정원 지도</h2><span>길을 골라보세요</span></div>
        <div class="mini-map" aria-label="정원 구역 지도">
          <div class="map-path"></div>
          <button class="map-zone forest" data-destination="forest" aria-label="호흡의 숲 길 안내">♧<span>호흡의 숲</span></button>
          <button class="map-zone lake" data-destination="lake" aria-label="비움의 호수 길 안내">≈<span>비움의 호수</span></button>
          <button class="map-zone plaza" data-destination="plaza" aria-label="연결의 광장 길 안내">✦<span>연결의 광장</span></button>
          <span class="map-player" id="map-player" aria-label="내 위치"></span>
        </div>
        <p id="destination" class="map-caption" aria-live="polite">산책길을 따라 자유롭게 이동해보세요.</p>
      </section>
      <p class="quiet-note">호흡의 숲에 가면 햇살꽃을 피울 수 있어요.</p>
    </aside>
    <footer class="control-guide" aria-label="산책 조작">
      <span><kbd>WASD</kbd> 이동 · <kbd>Shift</kbd> 달리기</span>
      <span id="look-guide">방향키 이동 · 휠 확대</span>
      <button id="perspective" type="button" aria-label="1인칭 시점" aria-pressed="false" aria-keyshortcuts="V"><kbd>V</kbd> 1인칭</button>
      <button id="panel-toggle" type="button" aria-controls="garden-panel" aria-expanded="true">안내 접기</button>
    </footer>
  </main>
  <dialog class="welcome-dialog" id="welcome" aria-labelledby="welcome-title">
    <span class="eyebrow">A LITTLE PAUSE, JUST FOR YOU</span><div class="welcome-symbol">✦</div>
    <h1 id="welcome-title">지금의 마음으로,<br>잠시 쉬어가는 정원</h1>
    <p>서두르지 않아도 괜찮아요.<br>작은 산책에서 나만의 여유를 찾아보세요.</p>
    <div class="welcome-pills"><span>세 개의 작은 공간</span><span>나에게 맞는 산책</span><span>편안한 속도로</span></div>
    <button class="primary" id="start">정원에 들어가기 <span>↗</span></button>
    <small class="purpose">${content.ui.purpose}<br>모든 활동은 건너뛰거나 종료할 수 있어요.</small>
  </dialog>
  <dialog class="checkin-dialog" id="checkin" aria-labelledby="checkin-title">
    <span class="eyebrow">나의 마음 돌아보기</span><h1 id="checkin-title">지금, 어떤 마음인가요?</h1><p>가까운 마음을 하나 골라주세요. 선택하지 않아도 괜찮아요.</p>
    <form id="checkin-form"><fieldset class="emotion-options"><legend class="sr-only">현재 감정</legend>
      ${emotions.map((emotion, index) => `<label class="emotion-option"><input type="radio" name="emotion" value="${emotion.id}" /><span class="emotion-icon">${['◌', '≈', '✦', '☾', '♧'][index]}</span><span>${emotion.label}</span><span class="selection-dot"></span></label>`).join('')}
    </fieldset>
    <div class="rating-row"><label for="tension">${content.ratings.tension.question}<small>1 ${content.ratings.tension.lowLabel} · 5 ${content.ratings.tension.highLabel}</small></label><select id="tension">${scoreOptions}</select></div>
    <div class="rating-row"><label for="comfort">${content.ratings.comfort.question}<small>1 ${content.ratings.comfort.lowLabel} · 5 ${content.ratings.comfort.highLabel}</small></label><select id="comfort">${scoreOptions}</select></div>
    <button class="primary" type="submit">나의 산책 시작하기 <span>↗</span></button><button class="skip" type="button" id="skip">선택 없이 둘러보기</button></form>
  </dialog>
  <dialog id="forest-dialog" class="forest-dialog" aria-labelledby="forest-title">
    <div class="forest-heading"><h2 id="forest-title">햇살꽃 피우기</h2><button type="button" id="forest-leave">산책으로 <span aria-hidden="true">↗</span></button></div>
    <div class="forest-cue"><span class="breath-seed" aria-hidden="true"></span><strong id="forest-cue" role="status"></strong><time id="forest-time"></time></div>
    <progress id="forest-progress" aria-label="햇살꽃 호흡 진행" max="60" value="0"></progress>
    <p id="forest-hint" aria-live="polite">빛이 오가는 동안 편한 속도로 숨을 쉬어보세요.</p>
    <div class="forest-actions"><button type="button" id="forest-offer">햇살 건네기</button><button type="button" id="forest-play">잠시 멈춤</button><button type="button" id="forest-restart">처음부터</button><button type="button" id="forest-skip">건너뛰기</button></div>
  </dialog>
  <div class="notice" id="notice" role="status" hidden></div>`;

const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const welcome = get<HTMLDialogElement>('welcome');
const checkin = get<HTMLDialogElement>('checkin');
const showNotice = (message: string) => { get('notice').textContent = message; get('notice').hidden = false; };
const descriptions: Record<ZoneId, string> = {
  entry: '마음이 가는 길을 천천히 걸어보세요.', path: '조금 천천히, 나의 속도로 걸어요.',
  forest: '숲 한가운데 작은 꽃봉오리가 빛나고 있어요.',
  lake: '잔잔한 물결을 바라보며 잠시 쉬어가세요.',
  plaza: '같은 정원을 걷는 다른 방문자를 만날 수 있어요.',
};
const forestDialog = get<HTMLDialogElement>('forest-dialog');
const forestEntry = get<HTMLButtonElement>('forest-enter');
const durationSec = settings.activities.breathingDurationMs / 1000;
get<HTMLProgressElement>('forest-progress').max = durationSec;
let lastZone: ZoneId | null = null;
let lastForestFrame = '';

function updateForestPanel() {
  const status = breathing.status;
  const seconds = Math.floor(breathing.elapsedMs / 1000);
  const inhale = breathing.phase < .5;
  const journey = breathing.lightJourney;
  const gift = journey === null ? '' : journey < .72 ? '숲의 햇살이 꽃을 향해 모여요.' : '건넨 햇살이 꽃잎에 닿았어요.';
  const key = [status, seconds, inhale, gift].join('/');
  if (key === lastForestFrame) return;
  lastForestFrame = key;
  forestEntry.textContent = status === 'completed' ? '피어난 꽃 보기' : status === 'paused' ? '햇살꽃 이어 피우기' : '햇살꽃 피우기 · 60초';
  const cue = status === 'completed' ? '햇살꽃이 피었어요' : status === 'paused' ? '잠시 쉬는 중' : inhale ? '천천히 들이쉬어요' : '가볍게 내쉬어요';
  if (get('forest-cue').textContent !== cue) get('forest-cue').textContent = cue;
  get('forest-time').textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + ' / 1:00';
  get<HTMLProgressElement>('forest-progress').value = seconds;
  get('forest-offer').hidden = status !== 'running';
  get<HTMLButtonElement>('forest-offer').setAttribute('aria-disabled', String(journey !== null));
  get('forest-play').hidden = status === 'completed';
  get('forest-play').textContent = status === 'paused' ? '이어 하기' : '잠시 멈춤';
  get('forest-skip').hidden = status === 'completed';
  const hint = status === 'completed' ? content.ui.breathingComplete : status === 'paused' ? '준비되면 쉬던 곳부터 이어갈 수 있어요.' : gift || '편한 속도로 쉬어보세요. 꽃에 햇살을 건네도 좋아요.';
  if (get('forest-hint').textContent !== hint) get('forest-hint').textContent = hint;
  forestDialog.dataset.status = status;
  forestDialog.dataset.phase = inhale ? 'inhale' : 'exhale';
}

function leaveForest() {
  breathing.pause(performance.now());
  if (forestDialog.open) forestDialog.close();
  view.setForestFocus(false);
  view.navigation.setEnabled(entered && !checkin.open);
  updateForestPanel();
}

forestEntry.addEventListener('click', () => {
  if (!entered || lastZone !== 'forest' || forestDialog.open) return;
  if (breathing.status === 'paused') breathing.resume(performance.now());
  else if (breathing.status !== 'completed') breathing.start(performance.now());
  view.navigation.setEnabled(false);
  view.setForestFocus(true);
  updateForestPanel();
  forestDialog.showModal();
});
get('forest-leave').addEventListener('click', leaveForest);
forestDialog.addEventListener('cancel', (event) => { event.preventDefault(); leaveForest(); });
get('forest-offer').addEventListener('click', () => { breathing.offerLight(); updateForestPanel(); });
get('forest-play').addEventListener('click', () => {
  if (breathing.status === 'paused') breathing.resume(performance.now());
  else breathing.pause(performance.now());
  updateForestPanel();
});
get('forest-restart').addEventListener('click', () => { breathing.start(performance.now()); updateForestPanel(); });
get('forest-skip').addEventListener('click', () => { breathing.skip(performance.now()); leaveForest(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && forestDialog.open) { breathing.pause(performance.now()); updateForestPanel(); }
});
try {
  view = new GardenView(canvas, breathing, (position, zone) => {
    if (forestDialog.open) {
      if (zone !== 'forest') leaveForest();
      else { breathing.advance(performance.now()); updateForestPanel(); }
    }
    connection?.move(position);
    get('map-player').style.left = `${(position.x + 25) * 2}%`;
    get('map-player').style.top = `${(position.z + 25) * 2}%`;
    get('map-player').style.rotate = `${Math.PI - position.yaw}rad`;
    if (zone !== lastZone) {
      forestEntry.hidden = zone !== 'forest';
      lastZone = zone; get('zone-name').textContent = zoneLabel(zone); get('zone-description').textContent = descriptions[zone];
      if (['forest', 'lake', 'plaza'].includes(zone) && !session.visitedZones.includes(zone as 'forest' | 'lake' | 'plaza')) session.visitedZones.push(zone as 'forest' | 'lake' | 'plaza');
    }
  }, (ready) => { if (!ready) showNotice('일부 정원 모델을 불러오지 못했어요. 기본 모양으로 산책을 계속할 수 있어요.'); }, (firstPerson) => {
    get('perspective').setAttribute('aria-pressed', String(firstPerson));
    get('look-guide').textContent = firstPerson ? '드래그로 둘러보기 · ← → 회전' : '방향키 이동 · 휠 확대';
  });
} catch {
  get<HTMLButtonElement>('start').disabled = true;
  showNotice('3D 정원을 표시하지 못했어요. Chrome·Edge의 그래픽 가속과 WebGL 지원을 확인해주세요.');
}

function updateRecommendation() {
  const result = recommend(session.emotionId);
  get('recommendation-label').textContent = result ? result.label : '오늘의 작은 산책';
  get('recommendation-title').textContent = result?.recommendedZone ? zoneLabel(result.recommendedZone) : '마음이 가는 곳으로';
  get('recommendation-text').textContent = result?.guidance ?? '세 공간을 자유롭게 둘러보세요.';
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-destination]')) {
    button.classList.toggle('recommended', button.dataset.destination === result?.recommendedZone);
  }
}
function enterGarden() {
  if (!view) { showNotice('3D 정원을 표시하지 못했어요. 그래픽 가속과 WebGL 지원을 확인해주세요.'); return; }
  if (checkin.open) checkin.close();
  if (welcome.open) welcome.close();
  get('hud').hidden = false; updateRecommendation();
  if (!entered) {
    entered = true;
    connection = new GardenConnection((status, count) => {
      get('connection').dataset.status = status;
      get('connection').textContent = status === 'online' ? `함께 걷는 ${count}명` : status === 'connecting' ? '정원 연결 중' : status === 'full' ? '정원이 가득 찼어요 · 개인 산책' : '연결 끊김 · 개인 산책 가능';
    }, (snapshot, selfId) => view.snapshot(snapshot, selfId), () => view.navigation.respawn());
  }
  view.navigation.setEnabled(true);
}
function showGardenPanel(visible: boolean) {
  get('garden-panel').hidden = !visible;
  get('panel-toggle').setAttribute('aria-expanded', String(visible));
  get('panel-toggle').textContent = visible ? '안내 접기' : '안내 펼치기';
}
get('perspective').addEventListener('click', () => view.navigation.togglePerspective());
get('panel-toggle').addEventListener('click', () => showGardenPanel(get('garden-panel').hidden));
function openCheckin() {
  view?.navigation.setEnabled(false);
  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="emotion"]')) input.checked = input.value === session.emotionId;
  get<HTMLSelectElement>('tension').value = session.before.tension?.toString() ?? '';
  get<HTMLSelectElement>('comfort').value = session.before.comfort?.toString() ?? '';
  checkin.showModal();
}
get('start').addEventListener('click', () => { welcome.close(); openCheckin(); });
get('change-emotion').addEventListener('click', openCheckin);
get('checkin-form').addEventListener('submit', (event) => {
  event.preventDefault();
  session.emotionId = document.querySelector<HTMLInputElement>('input[name="emotion"]:checked')?.value as EmotionId ?? null;
  const rating = (id: string): Rating | null => {
    const value = Number(get<HTMLSelectElement>(id).value);
    return Number.isInteger(value) && value >= 1 && value <= 5 ? value as Rating : null;
  };
  session.before = { tension: rating('tension'), comfort: rating('comfort') };
  enterGarden();
});
get('skip').addEventListener('click', () => { session.emotionId = null; session.before = { tension: null, comfort: null }; enterGarden(); });
checkin.addEventListener('cancel', (event) => { event.preventDefault(); get('skip').click(); });
welcome.addEventListener('cancel', (event) => { event.preventDefault(); enterGarden(); });
get('reset').addEventListener('click', () => {
  if (forestDialog.open) leaveForest();
  breathing.reset(); updateForestPanel();
  connection?.dispose(); connection = null; entered = false; session = initialSession();
  view?.snapshot({ players: [], serverTimeMs: Date.now() }, ''); view?.navigation.setEnabled(false);
  view?.navigation.reset(); showGardenPanel(true);
  get('hud').hidden = true; get('connection').textContent = '혼자 둘러보는 정원';
  welcome.showModal();
});
get('app')?.querySelector('.brand')?.addEventListener('click', (event) => { event.preventDefault(); get('reset').click(); });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-destination]')) {
  button.addEventListener('click', () => { get('destination').textContent = button.dataset.destination === 'forest' ? '광장에서 왼쪽 위 숲길로 가세요. 숲에 들어가면 햇살꽃 피우기가 열려요.' : `${zoneLabel(button.dataset.destination as ZoneId)} 방향으로 산책해보세요.`; });
}
window.addEventListener('beforeunload', () => { connection?.dispose(); view?.dispose(); });
welcome.showModal();
