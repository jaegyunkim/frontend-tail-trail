// 오늘의 맞춤 산책 코스 카드: 실제 app.js 를 가짜 화면에서 돌려 렌더링·새 API 없는 서버(404)·늦게 온 응답 버리기를 확인한다.
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
globalThis.__app = { renderTodayCourse, scheduleRecommend, loadRecommend, recReset, rec, recKey, setOrigin, setDogs: d => { dogs = d; }, getSel: () => sel, el: () => $('#todayCourse') };`;
const load = apiImpl => { const ctx = makeContext(apiImpl); vm.runInContext(SRC.replace(/^import .*$/gm, '') + FOOTER, ctx, { filename: 'app.js' }); return ctx.__app; };

const REC = {
  ok: true, basis: 'history', basisLabel: '꼬리일기·자주 걷는 곳 기준', dog: { id: 1, name: '앤비', size: 'small', age: 'senior', flatFace: true, avatar: 'flat-1' }, origin: { label: '서울 성동구' },
  walk: { gate: 'go', gateName: '지금 가기', score: 100, minutes: 15, pavementWarnC: 42 }, weather: { now: { temp: 3, feelsLike: 2, pavement: 27, precip: '없음', pop: 0 }, air: { grade: 1, gradeName: '좋음' } },
  items: [
    { rank: 1, kind: 'diary', name: '서울숲', place: '서울숲', lat: 37.5444, lon: 127.0374, source: '꼬리일기 3번', distanceKm: 0.5, minutes: 15, routeKm: 1, mode: 'walk', when: '지금 출발 좋아요', reasons: ['체감 2℃로 앤비 기준(5℃)보다 추워요', '꼬리일기 3번 · 어제 마지막'] },
    { rank: 2, kind: 'place', name: '성수1가1동 동네 한 바퀴', lat: 37.54, lon: 127.04, approx: true, source: '자주 걷는 곳', distanceKm: 0, minutes: 15, routeKm: 0.9, mode: 'loop', when: '지금 출발 좋아요', reasons: ['a <b>', 'b'] }],
  nudge: { kind: 'write-diary', text: '산책 뒤 꼬리일기에 장소를 남기면' }, quota: { counted: false, note: '오늘 추천은 산책 판단 횟수에 들어가지 않아요' }
};

test('카드: 아이 이름·날씨 칩·추천 1~3곳·시간·거리·이유·지도/길찾기, 입력은 이스케이프', () => {
  const a = load(async () => ({}));
  a.setDogs([{ id: 1, name: '앤비', size: 'small', age: 'senior', flatFace: true, avatar: 'flat-1' }]);
  a.renderTodayCourse(REC);
  const h = a.el().innerHTML;
  assert.match(h, /오늘의 맞춤 산책 코스/); assert.match(h, /앤비와 지금 출발 좋아요/); assert.match(h, /체감 2°/); assert.match(h, /노면 27°/);
  assert.match(h, /서울숲/); assert.match(h, /⏱ 15분/); assert.match(h, /📏 1km/); assert.match(h, /map\.kakao\.com\/link\/to\/서울숲|map\.kakao\.com\/link\/to\/%EC%84%9C%EC%9A%B8%EC%88%B2/);
  assert.match(h, /동네 지도/, '1km 단위 위치(자주 걷는 곳)는 길찾기 대신 동네 지도');
  assert.ok(!h.includes('a <b>') && h.includes('a &lt;b&gt;'));
  assert.match(h, /꼬리일기 쓰기/); assert.match(h, /산책 판단 횟수에 들어가지 않아요/);
});
test('카드: 출발지가 없으면 등록 유도만', () => {
  const a = load(async () => ({}));
  a.renderTodayCourse({ ok: true, needOrigin: true, dog: { name: '우리 아이' }, items: [], nudge: { kind: 'pick-origin', text: '출발지를 고르면' } });
  assert.match(a.el().innerHTML, /출발지를 고르면 바로 골라 드려요/); assert.match(a.el().innerHTML, /자주 걷는 곳 등록/);
});
test('새 API 가 없는 예전 서버(404 not found)면 카드를 숨기고 다시 부르지 않는다', async () => {
  let calls = 0;
  const a = load(async p => { if (p.startsWith('/v1/walk/recommend')) { calls++; throw Object.assign(new Error('not found'), { status: 404 }); } return {}; });
  await a.loadRecommend('k1');
  assert.equal(calls, 1); assert.equal(a.rec.off, true); assert.equal(a.el().hidden, true);
  a.rec.ready = true; a.scheduleRecommend(true); assert.equal(a.rec.timer, null, '꺼진 뒤에는 예약도 하지 않는다');
});
test('오류면 다시 추천받기 버튼, 늦게 온 응답은 버린다', async () => {
  let n = 0, release;
  const a = load(async p => { if (!p.startsWith('/v1/walk/recommend')) return {}; n++; if (n === 1) { await new Promise(r => { release = r; }); return { ...REC, basisLabel: 'OLD' }; } if (n === 2) return { ...REC, basisLabel: 'NEW' }; throw Object.assign(new Error('서버 처리 오류'), { status: 500 }); });
  const first = a.loadRecommend('k1'); await new Promise(r => setImmediate(r));
  await a.loadRecommend('k2'); release(); await first;
  assert.match(a.el().innerHTML, /NEW/); assert.doesNotMatch(a.el().innerHTML, /OLD/);
  await a.loadRecommend('k3'); assert.match(a.el().innerHTML, /다시 추천받기/); assert.equal(a.rec.key, null, '실패하면 같은 조건으로 다시 부를 수 있게 비운다');
});
