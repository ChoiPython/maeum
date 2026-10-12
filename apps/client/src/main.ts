import './style.css';
import { content, emotions, recommend, settings, zoneLabel } from '../../../shared/runtime.js';
import type { EmotionId, Rating, SessionState, ZoneId } from '../../../shared/contracts.js';
import { GardenView } from './garden.js';
import { GardenConnection } from './network.js';

const app = document.querySelector<HTMLDivElement>('#app')!;
const canvas = document.querySelector<HTMLCanvasElement>('#garden')!;
const initialSession = (): SessionState => ({
  emotionId: null, worryId: null, before: { tension: null, comfort: null }, after: { tension: null, comfort: null },
  visitedZones: [], breathing: { status: 'idle', elapsedMs: 0 }, lake: { status: 'idle' },
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
    <section class="location-card"><span class="eyebrow">지금 머무는 곳</span><h1 id="zone-name">시작의 정원</h1><p id="zone-description">마음이 가는 길을 천천히 걸어보세요.</p></section>
    <aside class="side-panel" aria-label="정원 안내">
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
      <p class="quiet-note">활동은 준비 중이에요.<br>지금은 정원을 자유롭게 둘러볼 수 있어요.</p>
    </aside>
    <footer class="control-guide"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 또는 방향키로 이동</span><span>정원 화면을 누르면 산책을 이어갈 수 있어요</span></footer>
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
  <div class="notice" id="notice" role="status" hidden></div>`;

const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const welcome = get<HTMLDialogElement>('welcome');
const checkin = get<HTMLDialogElement>('checkin');
const showNotice = (message: string) => { get('notice').textContent = message; get('notice').hidden = false; };
const descriptions: Record<ZoneId, string> = {
  entry: '마음이 가는 길을 천천히 걸어보세요.', path: '조금 천천히, 나의 속도로 걸어요.',
  forest: '나무 사이의 빛을 바라보며 잠시 머물러보세요.',
  lake: '잔잔한 물결을 바라보며 잠시 쉬어가세요.',
  plaza: '같은 정원을 걷는 다른 방문자를 만날 수 있어요.',
};
let lastZone: ZoneId | null = null;
try {
  view = new GardenView(canvas, (position, zone) => {
    connection?.move(position);
    get('map-player').style.left = `${(position.x + 25) * 2}%`;
    get('map-player').style.top = `${(position.z + 25) * 2}%`;
    if (zone !== lastZone) {
      lastZone = zone; get('zone-name').textContent = zoneLabel(zone); get('zone-description').textContent = descriptions[zone];
      if (['forest', 'lake', 'plaza'].includes(zone) && !session.visitedZones.includes(zone as 'forest' | 'lake' | 'plaza')) session.visitedZones.push(zone as 'forest' | 'lake' | 'plaza');
    }
  }, (ready) => { if (!ready) showNotice('일부 나무를 불러오지 못해 기본 모양으로 보여드려요. 산책은 계속할 수 있어요.'); });
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
    }, (snapshot, selfId) => view.snapshot(snapshot, selfId), () => view.resetPlayer());
  }
  view.setEnabled(true);
}
function openCheckin() {
  view?.setEnabled(false);
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
  connection?.dispose(); connection = null; entered = false; session = initialSession();
  view?.snapshot({ players: [], serverTimeMs: Date.now() }, ''); view?.resetPlayer(); view?.setEnabled(false);
  get('hud').hidden = true; get('connection').textContent = '혼자 둘러보는 정원';
  welcome.showModal();
});
get('app')?.querySelector('.brand')?.addEventListener('click', (event) => { event.preventDefault(); get('reset').click(); });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-destination]')) {
  button.addEventListener('click', () => { get('destination').textContent = `${zoneLabel(button.dataset.destination as ZoneId)} 방향으로 산책해보세요.`; });
}
window.addEventListener('beforeunload', () => { connection?.dispose(); view?.dispose(); });
welcome.showModal();
