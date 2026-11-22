// app.js 를 가짜 화면(어떤 요소든 받아 주는 Proxy)에서 실제로 실행해 본다.
// 글자 검사만으로는 못 잡는 '정의가 빠진 함수·변수'(ReferenceError)를 잡기 위한 시험이다
// (출발지 고르기 블록이 지워진 채 배포돼 오늘 화면이 통째로 멈췄던 사고의 재발 방지).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function makeNode() {
  const store = { dataset: {}, style: {}, children: [], value: '', textContent: '', innerHTML: '', innerText: '', placeholder: '', hidden: false, checked: false, disabled: false, open: false, returnValue: '', type: 'text' };
  const noop = () => {};
  const fn = function () { return node; };
  const node = new Proxy(fn, {
    get(_t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k in store) return store[k];
      if (k === 'classList') return { toggle: noop, add: noop, remove: noop, contains: () => false };
      if (k === 'querySelectorAll') return () => [];
      if (k === 'querySelector' || k === 'firstElementChild' || k === 'parentElement' || k === 'insertAdjacentElement') return typeof k === 'string' && k !== 'querySelector' && k !== 'insertAdjacentElement' ? node : () => node;
      if (k === 'closest' || k === 'getAttribute') return () => null;
      if (k === 'getBoundingClientRect') return () => ({ x: 0, y: 0, width: 0, height: 0 });
      if (k === 'then') return undefined;
      return noop;
    },
    set(_t, k, v) { store[k] = v; return true; }
  });
  return node;
}
function makeContext(apiImpl) {
  const node = makeNode(), listeners = [];
  const doc = { querySelector: () => node, querySelectorAll: () => [], getElementById: () => node, createElement: () => makeNode(), addEventListener: noopFn, body: node, head: node, visibilityState: 'visible', activeElement: node };
  function noopFn() {}
  const state = { api: 'http://fake', auth: { token: 't', expiresAtLocal: Date.now() + 3600000, minutes: 60, user: { id: 1, role: 'user', limits: { dailyMessages: 10, sessionMessages: 10, sessionMinutes: 10, dailySessions: 1, dailyTokens: 100 } } }, authMode: 'required' };
  const ctx = {
    document: doc, localStorage: { getItem: () => null, setItem: noopFn, removeItem: noopFn }, sessionStorage: { getItem: () => null, setItem: noopFn, removeItem: noopFn },
    navigator: {}, location: { protocol: 'http:', hostname: 'localhost' }, setTimeout: () => 0, clearTimeout: noopFn, setInterval: () => 0, clearInterval: noopFn,
    console, Date, JSON, Math, Number, String, Array, Object, Promise, Set, Map, Intl, URL, URLSearchParams, Event: class { }, AbortSignal: { timeout: () => ({}) }, innerWidth: 390, scrollTo: noopFn, confirm: () => true,
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }), encodeURIComponent, parseInt, isNaN,
    // app.js 가 import 하는 것들(이 시험에서는 동작을 보지 않는다)
    ROLE_LABEL: {}, DAY_NOTE: '', policyText: () => '', logoutUsage: () => '', nextLoginText: () => '', timesKo: v => String(v), errText: e => String(e?.message ?? e),
    mountShelter: () => () => {}, state, api: apiImpl, health: async () => ({ error: 'x' }), login: async () => ({}), logout: noopFn, startTimer: () => ({ stop: noopFn }), setOnAuthLost: noopFn, setOnMustChange: noopFn, saveAuth: noopFn, syncAccount: noopFn,
    remaining: () => 600, sessionMinutes: () => 10, loginQuota: () => null
  };
  ctx.window = ctx; ctx.addEventListener = noopFn;
  return vm.createContext(ctx);
}
const FOOTER = `
globalThis.__app = { drawForm, renderPlaces, drawDogChips, renderDogs, openDogForm, renderPlan, renderQuota, setOrigin, originValue, locateHere, logoutText, go, findDupDog, dogNameKey, checkDogName, caricatureOf, caricatureSrc, AVATAR_SET, agentSay, applyTheme,
  setDogs: d => { dogs = d; }, setPlaces: p => { places = p; }, getSel: () => sel };`;
const load = apiImpl => { const ctx = makeContext(apiImpl); vm.runInContext(SRC.replace(/^import .*$/gm, '') + FOOTER, ctx, { filename: 'app.js' }); return ctx.__app; };

const DOGS = [{ id: 1, name: '앤비', size: 'small', age: 'adult', flatFace: false, thickCoat: true, selected: true, care: { summary: '알맞은 산책 약 30분 · 28℃ 넘으면 조심', maxC: 28, minutes: 30, traits: [{ icon: '🧊', key: 'small', note: '소형견은 …' }] } },
  { id: 2, name: '보리', size: 'large', age: 'senior', flatFace: false, thickCoat: false, selected: false, care: { summary: 'x', maxC: 22, minutes: 25, traits: [] } }];
const OPTIONS = { sizes: [{ id: 'small', label: '소형', hint: '약 10kg 미만' }, { id: 'medium', label: '중형', hint: '' }, { id: 'large', label: '대형', hint: '' }], ages: [{ id: 'puppy', label: '강아지', hint: '' }, { id: 'adult', label: '성견', hint: '' }, { id: 'senior', label: '노령견', hint: '' }], moods: [], maxDogs: 5 };
const PLAN = {
  dateLabel: '2026.11.22(일)', place: '서울 성동구', dog: { name: '앤비', size: 'small', age: 'adult' }, card: ['a', 'b', 'c'], attribution: '출처', sources: [{ provider: 'x', status: 'ok' }],
  weather: { basis: '단기예보', short: { temp: { min: 10, max: 20 }, popMax: 10, hourly: [{ hour: 8, time: '08:00', temp: 12, sky: '맑음', precip: '없음', pop: 0 }] }, air: { gradeName: '좋음', pm10: 20, pm25: 10 } },
  walk: { score: 88, gate: 'time', gateName: '시간대 바꾸기', headline: '06:00~09:00에 나가세요', minutes: 30, window: { from: '06:00', to: '09:00' }, reasons: ['r'], tips: ['t'], dog: { name: '앤비', size: 'small', age: 'adult' }, pavement: { maxEstimatedC: 50, warnC: 45 }, hourly: [{ hour: 8, time: '08:00', temp: 12, level: 'ok', reasons: [], pavement: 15 }] },
  courses: [{ id: 'c', name: '코스', level: 1, levelName: '쉬움', travelKm: 1, distanceKm: 5, sigun: 'x', suggestNote: '0.5km', start: { lat: 37.5, lon: 127 } }],
  courseSearch: { radiusKm: 30 }, nearby: { parks: [{ name: '공원', distanceM: 300, lat: 37.5, lon: 127, phone: '02-1', licensed: true }], vets: [{ name: '병원', distanceM: 400, licensed: false, open24: true }], groomers: [], shops: [], petPlaces: [{ name: '장소', type: '관광지', pet: { allowed: '가능', breeds: '전 견종', need: '목줄' } }] },
  emergency: { nearest: [{ name: '병원', distanceM: 400 }], open24: [{ name: '24시', distanceM: 900, open24: true }], note: 'n' }
};

test('app.js 를 실행해도 정의가 빠진 이름이 없다(첫 화면 그리기)', async () => {
  const app = load(async () => ({}));
  assert.doesNotThrow(() => app.drawForm());
  assert.doesNotThrow(() => app.renderPlaces());
  assert.equal(typeof app.originValue(), 'string');
  assert.doesNotThrow(() => app.setOrigin('서울 성동구'));
  assert.doesNotThrow(() => app.locateHere());
});
test('우리 아이: 한 마리도 없을 때·여러 마리일 때 화면 그리기와 등록·수정 시트 열기', () => {
  const app = load(async () => OPTIONS);
  assert.doesNotThrow(() => { app.setDogs([]); app.drawDogChips(); app.renderDogs(); app.openDogForm(); });
  assert.doesNotThrow(() => { app.setDogs(DOGS); app.drawDogChips(); app.renderDogs(); app.openDogForm(DOGS[0]); app.openDogForm(); });
  assert.doesNotThrow(() => { app.setDogs([...DOGS, ...DOGS, ...DOGS].slice(0, 5).map((d, i) => ({ ...d, id: i + 1 }))); app.drawDogChips(); app.renderDogs(); });
});
test('결과 화면 그리기(renderPlan)와 이용 한도 표시, 탭 이동', () => {
  const app = load(async () => ({}));
  assert.doesNotThrow(() => app.renderPlan({ id: 'abc', plan: PLAN }));
  assert.doesNotThrow(() => app.renderQuota());
  assert.doesNotThrow(() => app.logoutText());
  for (const tab of ['plan', 'near', 'shelter', 'diary', 'dogs', 'opinion']) assert.doesNotThrow(() => app.go(tab), tab);
});

test('아이 이름 중복: 공백·대소문자 정규화, 수정 중인 자기 자신 제외, 빈 이름은 검사 안 함', () => {
  const app = load(async () => OPTIONS);
  const list = [...DOGS, { ...DOGS[1], id: 3, name: 'Bori  Kim' }];
  assert.equal(app.findDupDog('  앤비 ', list, null)?.id, 1);
  assert.equal(app.findDupDog('앤비', list, 1), null);
  assert.equal(app.findDupDog('bori kim', list, null)?.id, 3);
  assert.equal(app.findDupDog('', list, null), null);
  assert.equal(app.findDupDog('   ', list, null), null);
  assert.equal(app.findDupDog('앤비2', list, null), null);
  assert.equal(app.dogNameKey(' A  b<> '), 'a b');
  app.setDogs(DOGS); assert.doesNotThrow(() => app.checkDogName());
});
test('로그아웃 확인창 문구는 짧게(규칙 설명 없음)', () => {
  const app = load(async () => ({}));
  const t = app.logoutText();
  assert.ok(t.split('\n').length <= 2, t);
  assert.doesNotMatch(t, /15분|초기화|60분/);
});
test('꼬리일기 시간: 시간·분 고르기를 분으로 환산(기본 30분), 기분 뒤에 배변', () => {
  const src = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'), h = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(src, /const DIARY_DEFAULT_MIN = 30;/);
  assert.match(src, /Number\(\$\('#diaryHours'\)\.value \|\| 0\) \* 60 \+ Number\(\$\('#diaryMins'\)\.value \|\| 0\)/);
  assert.match(src, /minutes: diaryMinutes\(\) \|\| null/);
  assert.ok(h.indexOf('id="diaryMood"') < h.indexOf('id="diaryPoop"'));
  assert.match(h, /class="row diary-trio">.*id="diaryDog".*id="diaryDate".*id="diaryHours"/);
});

test('캐리커처: 저장된 예전 아이콘 id(종류-번호 25개)가 모두 실제 그림 파일로 바뀌고, 모르는 값은 리트리버', () => {
  const app = load(async () => OPTIONS);
  for (const k of ['small', 'medium', 'large', 'flat', 'coat']) for (let n = 1; n <= 5; n++) {
    const src = app.caricatureSrc(app.caricatureOf(`${k}-${n}`));
    assert.match(src, /^assets\/caricatures\/[a-z0-9-]+\.webp$/); // 상대 경로(GitHub Pages 하위 경로에서도 동작)
    assert.ok(fs.existsSync(new URL('../' + src, import.meta.url)), src);
  }
  assert.equal(app.caricatureOf('엉뚱한값'), 'retriever'); assert.equal(app.caricatureOf(null), 'retriever');
  assert.equal(new Set(Object.values(app.AVATAR_SET).flat()).size, 10);
});
test('서비스워커가 미리 받아 두는 캐리커처 파일이 모두 있다', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const names = [...sw.match(/const CARICATURES = \[([^\]]+)\]/)[1].matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]);
  assert.equal(names.length, 10);
  for (const n of names) assert.ok(fs.existsSync(new URL(`../assets/caricatures/${n}.webp`, import.meta.url)), n);
});
test('에이전트 말풍선·신호등·화면 모드', () => {
  const app = load(async () => OPTIONS); app.setDogs(DOGS);
  const html = app.agentSay(PLAN.walk, PLAN);
  assert.match(html, /class="agent-say"/); assert.match(html, /assets\/caricatures\//); assert.match(html, /앤비/);
  assert.doesNotThrow(() => { app.applyTheme('dark'); app.applyTheme('auto'); });
  assert.doesNotThrow(() => app.renderPlan({ id: 'x', plan: { ...PLAN, walk: { ...PLAN.walk, gate: 'indoor' } } }));
});
test('꼬리일기 배변: 기분 칩과 같은 줄의 작은 체크(별도 카드 없음), 저장 값은 그대로 poop: 체크 여부', () => {
  const h = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), src = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(h, /<div class="mood-row"><div id="diaryMood"[^>]*><\/div><label class="poop-chip"><input id="diaryPoop" type="checkbox">/);
  assert.doesNotMatch(h, /diary-poop/);
  assert.match(src, /poop: \$\('#diaryPoop'\)\.checked/);
});
test('가까운 곳 장소 칸: 왼쪽 [이름·배지·주소] | 오른쪽 [거리 + 버튼 세로], 빈 값은 그리지 않음', () => {
  const src = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'), css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(src, /<li class="place split"><div class="pl-info split-main"><h4 class="pl-name">/); assert.match(src, /<div class="pl-side split-side"><span class="d pl-dist">/);
  assert.match(css, /\.split-side \.links \{ display: flex; flex-direction: column;/);
  assert.match(css, /\.places li\.place \.pl-name \{[^}]*-webkit-line-clamp: 2;/);
  assert.doesNotMatch(css, /grid-template-areas: "name dist"/);
  const app = load(async () => ({})); assert.doesNotThrow(() => app.renderPlan({ id: 'x', plan: PLAN }));
});
test('맞춤 산책 코스 항목도 장소 카드와 같은 2열(.split): 왼쪽 정보, 오른쪽 버튼 세로', () => {
  const src = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'), css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(src, /<li class="tc-item split"><span class="tc-rank"[^>]*>[^<]*<\/span><div class="tc-body split-main">/);
  assert.match(src, /<div class="split-side"><div class="links">\$\{tcLinks\(it\)\}/);
  assert.match(css, /:root\[data-wide-actions="row"\] \.split-side \{/); // 넓은 화면 스위치 한 곳
});
