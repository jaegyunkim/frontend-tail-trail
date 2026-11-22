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
globalThis.__app = { drawForm, renderPlaces, drawDogChips, renderDogs, openDogForm, renderPlan, renderQuota, setOrigin, originValue, locateHere, logoutText, go, findDupDog, dogNameKey, checkDogName, characterCandidates, characterFor, comboLabel, caricatureSrc, BREEDS, drawAvatarPicker, setDraft: d => { dogDraft = d; }, getDraft: () => dogDraft, agentSay, applyTheme,
  setDogs: d => { dogs = d; }, setPlaces: p => { places = p; }, getSel: () => sel, isArtId, artEntry, pickerCands, saveAvatar, draftBody, setOptions: o => { dogOptions = o; } };`;
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

test('캐리커처: 저장된 id(종류-번호)는 모두 실제 그림 파일로 보이고, 깨지지 않는다(상대 경로)', () => {
  const app = load(async () => OPTIONS);
  for (const size of ['small', 'medium', 'large']) for (const age of ['puppy', 'adult', 'senior']) for (const flatFace of [false, true]) for (const thickCoat of [false, true])
    for (let n = 1; n <= 5; n++) { const d = { size, age, flatFace, thickCoat, avatar: `${flatFace ? 'flat' : thickCoat ? 'coat' : size}-${n}` };
      const src = app.caricatureSrc(app.characterFor(d).art); assert.match(src, /^assets\/caricatures\/[a-z0-9-]+\.webp$/); assert.ok(fs.existsSync(new URL('../' + src, import.meta.url)), src); }
  assert.equal(app.characterFor({ avatar: '엉뚱한값', size: 'large' }).art, 'retriever');
  for (const [id, b] of Object.entries(app.BREEDS)) for (const art of b.art) assert.ok(fs.existsSync(new URL(`../assets/caricatures/${art}.webp`, import.meta.url)), id + ':' + art);
});
test('캐릭터 매칭: 크기가 최우선 — 대형+단두종+이중모에 소형(말티즈·푸들·포메·비숑)이 나오지 않는다', () => {
  const app = load(async () => OPTIONS), small = ['maltese', 'poodle', 'pomeranian', 'bichon', 'french_bulldog'];
  const big = app.characterCandidates({ size: 'large', age: 'adult', flatFace: true, thickCoat: true });
  assert.equal(big[0].breed, 'saint_bernard'); assert.ok(big.every(c => !small.includes(c.breed)), JSON.stringify(big));
  for (const age of ['puppy', 'adult', 'senior']) for (const f of [false, true]) for (const t of [false, true]) {
    const c = app.characterCandidates({ size: 'large', age, flatFace: f, thickCoat: t }); assert.ok(c.length >= 1 && c.every(x => !small.includes(x.breed)), age + f + t);
    const s2 = app.characterCandidates({ size: 'small', age, flatFace: f, thickCoat: t }); assert.ok(s2.length && s2.every(x => x.breed !== 'retriever'), 'small' + age + f + t);
  }
  const senior = app.characterCandidates({ size: 'large', age: 'senior' }); assert.equal(senior[0].art, 'husky-senior'); assert.equal(senior[0].ageVariant, null); const oldRetriever = senior.find(c => c.breed === 'retriever'); assert.equal(oldRetriever.ageVariant, 'senior'); assert.equal(oldRetriever.label, '어르신 리트리버');
  const pup = app.characterCandidates({ size: 'small', age: 'puppy' }); const pv = pup.find(c => c.ageVariant); assert.equal(pv.ageVariant, 'puppy'); assert.match(pv.label, /^아기 /);
  assert.equal(app.characterCandidates({ size: 'small', age: 'adult', thickCoat: true })[0].breed, 'pomeranian'); // 이중모 소형은 포메 먼저
  assert.equal(app.characterCandidates({ size: 'medium', age: 'adult' })[0].breed, 'corgi');
  assert.equal(app.comboLabel({ size: 'large', age: 'senior', flatFace: true, thickCoat: true }), '대형 · 노령견 · 단두종 · 이중모');
  for (const d of [{ size: 'small' }, { size: 'medium' }, { size: 'large' }]) assert.ok(app.characterCandidates(d).length <= 5);
});
test('새 견종은 표 한 줄(그림 이름)만 넣으면 후보가 된다', () => {
  const app = load(async () => OPTIONS);
  app.BREEDS.saint_bernard.art = ['saint_bernard'];
  const c = app.characterCandidates({ size: 'large', age: 'adult', flatFace: true, thickCoat: true }); assert.equal(c[0].breed, 'saint_bernard');
  app.BREEDS.saint_bernard.ages = { senior: ['saint_bernard-senior'] };
  const s = app.characterCandidates({ size: 'large', age: 'senior', flatFace: true, thickCoat: true }); assert.equal(s[0].art, 'saint_bernard-senior'); assert.equal(s[0].ageVariant, null);
});
test('수정 창: 특성이 바뀌면 후보 다시 계산, 고른 그림이 새 후보에 없으면 1번, 있으면 유지', () => {
  const app = load(async () => OPTIONS); app.setDogs(DOGS);
  app.setDraft({ size: 'small', age: 'adult', variant: 2, picked: true }); app.drawAvatarPicker(); // 소형 2번을 직접 고름
  const before = app.characterCandidates({ size: 'small', age: 'adult' })[1].art;
  app.setDraft({ ...app.getDraft(), size: 'large' }); app.drawAvatarPicker(); assert.equal(app.getDraft().variant, 1, '대형 후보에 없는 소형 그림이면 1번으로');
  const second = app.characterCandidates({ size: 'large', age: 'adult' })[1].art; app.setDraft({ ...app.getDraft(), variant: 2 }); app.drawAvatarPicker(); // 대형 2번을 직접 고른 뒤
  app.setDraft({ ...app.getDraft(), age: 'senior' }); app.drawAvatarPicker(); // 노령견으로 바꿔도
  const old = app.characterCandidates({ size: 'large', age: 'senior' }), kept = old[app.getDraft().variant - 1];
  assert.equal(kept.breed, app.characterCandidates({ size: 'large', age: 'adult' })[1].breed, '고른 견종 유지(노령 전용 그림이 있으면 그 그림)');
  assert.equal(kept.art, second + '-senior');
  assert.ok(before);
  // 직접 고르지 않은 기본값(추가 창의 중형 1번=코기)은 대형으로 바꾸면 새 1번(리트리버)
  app.setDraft({ size: 'medium', age: 'adult', variant: 1, picked: false }); app.drawAvatarPicker();
  app.setDraft({ ...app.getDraft(), size: 'large' }); app.drawAvatarPicker(); assert.equal(app.getDraft().variant, 1);
  // 소형은 같은 크기 그림을 이웃 크기(코기)보다 먼저
  assert.ok(app.characterCandidates({ size: 'small', age: 'puppy' }).every(c => c.breed !== 'corgi'));
});
test('서비스워커가 미리 받아 두는 캐리커처 파일이 모두 있다', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const names = [...sw.match(/const CARICATURES = \[([^\]]+)\]/)[1].matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]);
  assert.equal(names.length, 28);
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
  // 600px 이상은 기본으로 버튼 가로 한 줄(스위치 속성 없이), 분기 흔적이 남지 않는다
  const wide = css.match(/@media \(min-width: 600px\) \{\n  \.split-side, [^\n]*\{ flex-direction: row;[\s\S]*?\n\}/); assert.ok(wide, '600px 이상 .split-side 가로 배치');
  assert.match(wide[0], /\.split-side \.links[^{]*\{ flex-direction: row;/);
  assert.doesNotMatch(css + src, /data-wide-actions|wideActions/);
});

test('새 유화 캐리커처 12종: 파일·견종 표 연결, 크기·단두종·이중모·나이별로 후보에 오른다', () => {
  const app = load(async () => OPTIONS);
  const want = { saint_bernard: ['saint-bernard', 'saint-bernard-puppy', 'saint-bernard-senior'], pug: ['pug', 'pug-puppy', 'pug-senior'], shih_tzu: ['shih-tzu', 'shih-tzu-puppy', 'shih-tzu-senior'], husky: ['husky', 'husky-puppy', 'husky-senior'], shiba: ['shiba', 'shiba-puppy', 'shiba-senior'] };
  for (const [id, files] of Object.entries(want)) { const b = app.BREEDS[id]; assert.deepEqual([...b.art, ...Object.values(b.ages).flat()].sort(), [...files].sort(), id); for (const f of files) assert.ok(fs.existsSync(new URL(`../assets/caricatures/${f}.webp`, import.meta.url)), f); }
  const first = d => app.characterCandidates(d)[0];
  assert.equal(first({ size: 'small', age: 'adult', flatFace: true }).art, 'french-bulldog');
  assert.equal(first({ size: 'small', age: 'puppy', flatFace: true }).art, 'french-bulldog-puppy');
  assert.equal(first({ size: 'small', age: 'senior', flatFace: true, thickCoat: true }).art, 'shih-tzu-senior');
  assert.equal(first({ size: 'large', age: 'puppy', thickCoat: true }).art, 'husky-puppy');
  assert.equal(first({ size: 'large', age: 'senior', flatFace: true, thickCoat: true }).art, 'saint-bernard-senior');
  assert.ok(app.characterCandidates({ size: 'medium', age: 'adult', thickCoat: true }).some(c => c.art === 'shiba'));
  // 예전에 저장된 id 는 그대로 읽히고 항상 실제 그림이 나온다
  for (const avatar of ['small-1', 'medium-3', 'large-5', 'flat-2', 'coat-4']) assert.ok(fs.existsSync(new URL('../' + app.caricatureSrc(app.characterFor({ avatar, size: 'small' }).art), import.meta.url)));
});
test('#24 새 유화 12장 매칭: 조합별 1순위·전용 그림·같은 견종 중복 없음', () => {
  const app = load(async () => OPTIONS), c = d => app.characterCandidates(d), small = ['maltese', 'poodle', 'pomeranian', 'bichon', 'pug', 'shih_tzu'];
  assert.equal(c({ size: 'large', age: 'adult', flatFace: true, thickCoat: true })[0].art, 'saint-bernard');
  const ls = c({ size: 'large', age: 'senior', flatFace: true }); assert.equal(ls[0].art, 'saint-bernard-senior'); assert.equal(ls[0].ageVariant, null); assert.equal(ls[0].label, '어르신 세인트버나드');
  assert.ok(ls.every(x => x.ageVariant === null || x.ageVariant === 'senior'), '전용 그림이거나 어르신 변형');
  const lp = c({ size: 'large', age: 'puppy' }); assert.equal(lp.slice(0, 2).map(x => x.art).sort().join(), 'husky-puppy,saint-bernard-puppy'); assert.equal(lp[0].label.startsWith('아기 '), true);
  assert.equal(c({ size: 'small', age: 'senior', flatFace: true }).slice(0, 2).map(x => x.art).join(), 'pug-senior,shih-tzu-senior');
  assert.equal(c({ size: 'small', age: 'puppy', flatFace: true }).slice(0, 3).map(x => x.art).join(), 'french-bulldog-puppy,pug-puppy,shih-tzu-puppy');
  assert.equal(c({ size: 'medium', age: 'adult', thickCoat: true }).slice(0, 2).map(x => x.art).join(), 'corgi,shiba');
  for (const size of ['small', 'medium', 'large']) for (const age of ['puppy', 'adult', 'senior']) for (const f of [false, true]) for (const t of [false, true]) {
    const list = c({ size, age, flatFace: f, thickCoat: t }); assert.equal(new Set(list.map(x => x.breed)).size, list.length, `${size}/${age}/${f}/${t} 같은 견종 중복`);
    if (size === 'large') assert.ok(list.every(x => !small.includes(x.breed)));
  }
  // 비어 있는 칸은 나이 변형으로 폴백: 프렌치불독 노령
  assert.equal(c({ size: 'small', age: 'senior', flatFace: true }).find(x => x.breed === 'french_bulldog').ageVariant, 'senior');
});
test('#25 2차 유화 8장: 프렌치불독(소형·단두종)·시바 아기/노령·허스키 노령·차우차우 노령(성견·아기 칸은 비움)', () => {
  const app = load(async () => OPTIONS), c = d => app.characterCandidates(d), arts = d => c(d).map(x => x.art);
  for (const f of ['french-bulldog', 'french-bulldog-puppy', 'shiba-puppy', 'shiba-senior', 'husky-senior', 'chow-chow-senior', 'saint-bernard-senior', 'pug-senior']) assert.ok(fs.existsSync(new URL(`../assets/caricatures/${f}.webp`, import.meta.url)), f);
  assert.equal(app.BREEDS.french_bulldog.size, 'small'); assert.equal(app.BREEDS.french_bulldog.brachy, true);
  assert.equal(arts({ size: 'small', age: 'adult', flatFace: true })[0], 'french-bulldog');
  assert.equal(arts({ size: 'small', age: 'puppy', flatFace: true })[0], 'french-bulldog-puppy');
  assert.ok(arts({ size: 'large', age: 'adult' }).every(a => !a.startsWith('french-bulldog')), '대형에는 소형 프렌치불독이 나오지 않는다');
  const fs2 = c({ size: 'small', age: 'senior', flatFace: true }).find(x => x.breed === 'french_bulldog'); assert.equal(fs2.art, 'french-bulldog'); assert.equal(fs2.ageVariant, 'senior'); // 노령 그림 없음 → 은빛 변형
  const sp = c({ size: 'medium', age: 'puppy', thickCoat: true }); assert.equal(sp[0].art, 'shiba-puppy'); assert.equal(sp[0].ageVariant, null); assert.equal(sp[0].label, '아기 시바');
  const ss = c({ size: 'medium', age: 'senior', thickCoat: true }); assert.equal(ss[0].art, 'shiba-senior'); assert.equal(ss[0].label, '어르신 시바');
  const hs = c({ size: 'large', age: 'senior', thickCoat: true }); assert.equal(hs[0].art, 'husky-senior'); assert.equal(hs[0].ageVariant, null);
  const cs = c({ size: 'medium', age: 'senior', flatFace: true, thickCoat: true }); assert.equal(cs[0].art, 'chow-chow-senior'); assert.equal(cs[0].label, '어르신 차우차우');
  // 차우차우 성견·아기 그림이 아직 없으니 성견·아기 후보에는 노령 그림이 나오지 않는다('어르신' 그림이 성견에 붙지 않게)
  for (const age of ['puppy', 'adult']) for (const size of ['small', 'medium', 'large']) for (const f of [false, true]) for (const t of [false, true])
    assert.ok(!arts({ size, age, flatFace: f, thickCoat: t }).includes('chow-chow-senior'), `${size}/${age}/${f}/${t}`);
  // 같은 견종 중복 없음·크기 두 단계 차이 없음
  for (const size of ['small', 'medium', 'large']) for (const age of ['puppy', 'adult', 'senior']) for (const f of [false, true]) for (const t of [false, true]) {
    const list = c({ size, age, flatFace: f, thickCoat: t }); assert.equal(new Set(list.map(x => x.breed)).size, list.length);
    assert.ok(list.every(x => Math.abs({ small: 0, medium: 1, large: 2 }[app.BREEDS[x.breed].size] - { small: 0, medium: 1, large: 2 }[size]) <= 1));
  }
});

// ===== #26 캐릭터 저장 id = 그림 이름 =====
const COMBOS = []; for (const size of ['small', 'medium', 'large']) for (const age of ['puppy', 'adult', 'senior']) for (const flatFace of [false, true]) for (const thickCoat of [false, true]) COMBOS.push({ size, age, flatFace, thickCoat });
const kind = d => d.flatFace ? 'flat' : d.thickCoat ? 'coat' : d.size;
test('그림 id 형식: 백엔드와 같은 모양 검사(옛 형식·경로·대문자·긴 값은 그림 이름이 아님)', () => {
  const app = load(async () => OPTIONS);
  for (const ok of ['saint-bernard-senior', 'husky-puppy', 'maltese-3', 'retriever', 'saint_bernard-senior']) assert.ok(app.isArtId(ok), ok);
  for (const no of ['small-3', 'coat-5', 'small-9', '../x', 'Husky', '<b>', 'a'.repeat(41), '', null, 'husky.webp']) assert.equal(app.isArtId(no), false, String(no));
});
test('저장 id 안정성: 후보 표에 그림을 더해 순서가 바뀌어도 그림 이름으로 저장된 아이의 그림은 그대로', () => {
  const app = load(async () => OPTIONS), saved = [];
  for (const d of COMBOS) for (const c of app.characterCandidates(d)) saved.push({ ...d, avatar: c.art });
  const before = saved.map(d => app.characterFor(d).art);
  assert.deepEqual(before, saved.map(d => d.avatar), '그림 이름은 그대로 읽힌다');
  // 모든 크기에 점수가 높은 새 견종·나이 전용 그림을 맨 앞에 끼워 넣는다(후보 순서·5개 컷이 모두 바뀜)
  app.BREEDS.zz_large = { size: 'large', brachy: true, doubleCoat: true, label: '새대형', art: ['zz-large', 'zz-large-2'], ages: { puppy: ['zz-large-puppy'], senior: ['zz-large-senior'] } };
  app.BREEDS.zz_small = { size: 'small', brachy: true, doubleCoat: true, label: '새소형', art: ['zz-small', 'zz-small-2'], ages: { puppy: ['zz-small-puppy'], senior: ['zz-small-senior'] } };
  app.BREEDS.zz_medium = { size: 'medium', brachy: true, doubleCoat: true, label: '새중형', art: ['zz-medium'], ages: {} };
  assert.deepEqual(saved.map(d => app.characterFor(d).art), before, '새 그림이 추가돼도 저장된 그림 그대로');
  // 후보 5개 밖으로 밀린 그림도 나이 변형(은빛·아기)은 그 아이 나이로
  const senior = saved.find(d => d.age === 'senior' && d.avatar === 'retriever'); assert.equal(app.characterFor(senior).ageVariant, 'senior');
});
test('옛 형식 {종류}-{번호}는 지금 운영과 같은 그림(후보 순번)으로 읽는다', () => {
  const app = load(async () => OPTIONS);
  for (const d of COMBOS) { const c = app.characterCandidates(d); for (let n = 1; n <= 5; n++) assert.equal(app.characterFor({ ...d, avatar: `${kind(d)}-${n}` }).art, (c[n - 1] ?? c[0]).art); }
  assert.equal(app.characterFor({ id: 7, size: 'large', age: 'adult' }).art, app.characterCandidates({ size: 'large', age: 'adult' })[2].art, '고르기 전(없음)은 id 로 순번');
});
test('없는 그림 id(삭제·미생성)는 깨지지 않고 후보 1번 → 실제 파일', () => {
  const app = load(async () => OPTIONS);
  for (const avatar of ['deleted-art', 'samoyed', 'cat-1']) for (const d of COMBOS) { const ch = app.characterFor({ ...d, avatar }); assert.equal(ch.art, app.characterCandidates(d)[0].art);
    assert.ok(fs.existsSync(new URL('../' + app.caricatureSrc(ch.art), import.meta.url))); }
  const src = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'); assert.match(src, /document\.addEventListener\('error', ev => \{ const t = ev\.target; if \(t\?\.tagName === 'IMG' && \/assets\\\/caricatures\\\//);
});
test('수정 창: 옛 형식 아이는 지금 보이는 그림이 골라져 있고, 저장하면 그 그림 이름으로 바뀐다(서버가 받을 때만)', () => {
  const app = load(async () => OPTIONS); app.setDogs(DOGS);
  // 가짜 화면은 체크박스 두 개가 한 노드를 같이 써서(단두종=털) 두 값이 같은 조합만 돈다
  for (const d of COMBOS.filter(x => x.flatFace === x.thickCoat)) for (let n = 1; n <= 5; n++) {
    const dog = { id: 3, name: 'x', ...d, avatar: `${kind(d)}-${n}` }, shown = app.characterFor(dog).art;
    app.setOptions({ ...OPTIONS, avatar: { kinds: [], variants: 5, art: { maxLength: 40 } } }); app.openDogForm(dog);
    const b = app.draftBody();
    assert.equal(app.getDraft().art, shown, JSON.stringify(dog)); assert.equal(app.saveAvatar(b), shown);
    app.setOptions(OPTIONS); assert.match(app.saveAvatar(b), /^(small|medium|large|flat|coat)-[1-5]$/, '그림 이름을 모르는(되돌린) 서버에는 옛 형식');
  }
});
test('수정 창: 저장된 그림이 후보 5개 밖으로 밀려도 특성 그대로면 계속 고를 수 있고, 특성을 바꾸면 새 후보 규칙(없으면 1번)', () => {
  const app = load(async () => OPTIONS); app.setDogs(DOGS);
  const d = { size: 'large', age: 'adult', flatFace: false, thickCoat: false }, dog = { id: 4, name: 'y', ...d, avatar: 'husky' };
  for (const k of ['a', 'b', 'c', 'd', 'e']) app.BREEDS['zz' + k] = { size: 'large', brachy: false, doubleCoat: false, label: k, art: ['zz-' + k], ages: {} };
  assert.ok(!app.characterCandidates(d).some(c => c.art === 'husky'), '허스키가 후보 밖');
  assert.equal(app.characterFor(dog).art, 'husky', '화면은 그대로');
  app.openDogForm(dog); assert.equal(app.getDraft().art, 'husky'); assert.equal(app.pickerCands(d).at(-1).art, 'husky');
  app.drawAvatarPicker(); app.setDraft({ ...app.getDraft(), size: 'small' }); app.drawAvatarPicker();
  assert.equal(app.getDraft().variant, 1); assert.equal(app.getDraft().art, app.characterCandidates({ ...d, size: 'small' })[0].art, '새 조합 후보에 없으면 새 1번');
});
