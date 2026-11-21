// 접속현황(v0.4.14~): visit.js(메인·신청 화면만 방문 알림) + admin-visits.js(대시보드 HTML·SVG 차트) + 관리자 탭
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict'; import test from 'node:test';
import { visitsHtml, lineChart, barChart, niceScale, changeText, delta, num, pct, SECTIONS, C } from '../admin-visits.js';
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const V = JSON.parse(read('package.json')).version, VE = V.replace(/\./g, '\\.'); // 버전은 package.json 기준(올릴 때마다 테스트를 고치지 않게)

// visit.js: auth.js 를 빼고 실행(가짜 api·document)
function loadVisit(api, { pathname = '/frontend-tail-trail/', prerendering = false } = {}) {
  const code = read('visit.js').replace(/^import .*;\n/m, '').replace(/^export /gm, '');
  const listeners = {}; const ctx = { api, location: { pathname }, document: { prerendering, addEventListener: (k, fn) => { listeners[k] = fn; } }, JSON, Promise, String };
  vm.runInNewContext(code + '\n;globalThis.__x={pageOf,countVisit};', ctx); return { ...ctx.__x, listeners };
}
test('방문 알림: 화면 구분·한 번 전송·실패해도 조용히·미리 렌더링 땐 보일 때', async () => {
  const calls = []; const ok = async (p, o) => { calls.push([p, JSON.parse(o.body).page, o.method]); return { ok: true }; };
  const v = loadVisit(ok, { pathname: '/frontend-tail-trail/register.html' });
  assert.deepEqual(calls, [['/v1/visits', 'register', 'POST']]);
  assert.equal(v.pageOf('/frontend-tail-trail/'), 'main'); assert.equal(v.pageOf('/index.html'), 'main'); assert.equal(v.pageOf('/register'), 'register');
  assert.equal(await v.countVisit('main', async () => { throw new Error('네트워크 오류'); }), false);
  assert.equal(await v.countVisit('main', () => { throw new Error('백엔드 주소 없음'); }), false);
  const later = []; const p = loadVisit(async (_p, o) => { later.push(JSON.parse(o.body).page); }, { prerendering: true });
  assert.equal(later.length, 0); p.listeners.prerenderingchange(); assert.deepEqual(later, ['main']);
});
test('visit.js 는 index.html·register.html 에만(관리자 화면은 세지 않음), 모듈(지연 실행)로 같은 버전', () => {
  for (const f of ['index.html', 'register.html']) assert.match(read(f), new RegExp(`<script src="visit\\.js\\?v=${VE}" type="module"><\\/script>`), f);
  for (const f of ['admin.html', 'admin.js', 'app.js', 'register.js']) assert.doesNotMatch(read(f), /visit\.js/, f);
  assert.match(read('visit.js'), new RegExp(`from '\\./auth\\.js\\?v=${VE}'`)); assert.match(read('visit.js'), /timeoutMs: 5000/);
});
test('관리자 화면에 접속현황 탭·화면·버전', () => {
  assert.match(read('admin.html'), /<button data-v="visits">접속현황<\/button>/);
  const a = read('admin.js'); assert.match(a, new RegExp(`import \\{ visitsHtml \\} from '\\./admin-visits\\.js\\?v=${VE}'`)); assert.match(a, /async visits\(opt = \{\}\) \{/); assert.match(a, /api\(`\/v1\/admin\/visits\?days=\$\{days\}`\)/);
  for (const f of ['index.html', 'admin.html', 'register.html', 'app.js', 'admin.js', 'register.js', 'package.json']) { assert.ok(read(f).includes(V), f); }
  assert.match(read('sw.js'), /'tailtrail-shell-v\d+'/);
});
test('디자인: 메인 진초록·신청 하늘색, 외부 차트 라이브러리 없음', () => {
  assert.deepEqual(C, { main: '#2F6B4F', register: '#3B82C4' });
  const css = read('admin.css'); assert.match(css, /\.vz-tabs button\.on \{[^}]*background: var\(--acc\)/); assert.match(css, /\.vz-kpi \{[^}]*border-radius: var\(--r\)/);
  assert.doesNotMatch(read('admin.html') + read('admin-visits.js'), /chart\.js|d3\.|echarts|apexcharts|<script src="http/i);
});
test('숫자·증감 표기: 사람 수 먼저, 비교 불가 안내', () => {
  assert.equal(num(1234567), '1,234,567'); assert.equal(num(12.34), '12.3'); assert.equal(num(null), '-'); assert.equal(pct(0.125), '12.5%');
  assert.match(delta(15, 12), /3명 늘었어요.*▲ 25%/); assert.match(delta(10, 12), /2명 줄었어요.*▼ 16\.7%/); assert.match(delta(5, 5), /같아요/); assert.match(delta(3, 0), /3명 늘었어요<\/span>$/); assert.match(delta(null, 3), /비교 전/);
  assert.match(changeText(0.2), /▲ 20%/); assert.match(changeText(null), /아직 없어요/);
  assert.deepEqual(niceScale(0), { top: 1, ticks: [0, 1] }); assert.equal(niceScale(7).top, 8);
});
test('차트: 집계 전 날짜는 선을 끊고, 집계 없는 막대는 그리지 않음', () => {
  const day = (d, main, register, covered = true, ma7Main = null) => ({ day: d, covered, main, register, ma7Main });
  const svg = lineChart([day('2026-11-17', 0, 0, false), day('2026-11-18', 3, 1), day('2026-11-19', 1234, 2, true, 5.5)], 360);
  assert.match(svg, /11\.17\(화\) · 집계 전이에요/); assert.match(svg, /메인 1,234명 · 신청 2명/);
  const lines = [...svg.matchAll(/<path d="([^"]*)" fill="none" stroke="#(2F6B4F|3B82C4)" stroke-width="2"/g)].map(m => m[1]);
  assert.equal(lines.length, 2); for (const d of lines) assert.equal((d.match(/M/g) ?? []).length, 1);
  const bars = barChart([{ label: '9월', values: [null, null], tip: '9월 · 집계 전이에요' }, { label: '10월', values: [10, 0], tip: 't' }], 360);
  assert.equal((bars.match(/<path d="M/g) ?? []).length, 1); assert.match(bars, /fill="#2F6B4F"/);
});

// 백엔드 summarize() 결과 모양의 가짜 데이터
const hours = f => Array.from({ length: 24 }, (_, h) => ({ hour: h, ...f(h) }));
const v = () => ({ today: '2026-11-19', firstDay: '2026-11-15', policy: { rawDays: 2, dailyYears: 5 },
  kpi: { today: { main: 12, register: 3, internal: 1, sameTimeYesterday: { upToHour: 14, main: 9, register: 3 } },
    last7: { start: '2026-11-12', end: '2026-11-18', main: 40, register: 4, comparable: false, prev: { main: 0, register: 0 }, changeMain: null, changeRegister: null },
    month: { main: 50, register: 5, compare: { main: 45, register: 4, comparable: true, prev: { main: 40, register: 4 } }, changeMain: 0.125, changeRegister: 0 },
    funnel30: { main: 50, both: 5, rate: 0.1, register: 6, directRegister: 1 }, last30: { internal: 2, hitsMain: 80, hitsRegister: 9 } },
  hourly: { days: 30, start: '2026-10-20', end: '2026-11-18', coveredDays: 4, nowHour: 14, today: hours(h => ({ main: h === 9 ? 3 : 0, register: h === 10 ? 1 : 0 })), avg: hours(h => ({ main: h === 9 ? 2.5 : 0, register: 0 })), peak: { main: { hour: 9, avg: 2.5 }, register: null } },
  daily: Array.from({ length: 30 }, (_, i) => ({ day: new Date(Date.UTC(2026, 9, 21 + i)).toISOString().slice(0, 10), covered: i >= 25, main: 10, register: 2, ma7Main: null })),
  weekday: { weeks: 12, start: '2026-08-27', end: '2026-11-18', rows: Array.from({ length: 7 }, (_, i) => ({ weekday: i, days: i < 4 ? 1 : 0, avgMain: i < 4 ? 10 : null, avgRegister: i < 4 ? 1 : null })) },
  weekly: [{ week: '2026-W47', isoYear: 2026, isoWeek: 47, start: '2026-11-16', end: '2026-11-19', fullEnd: '2026-11-22', ongoing: true, days: 4, main: 48, register: 2, avgMain: 12, avgRegister: 0.5, prevDays: 0, changeMain: null, changeRegister: null }],
  monthly: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, main: i === 10 ? 50 : 0, register: i === 10 ? 5 : 0, days: i === 10 ? 5 : 0, monthDays: 30, partial: true, avgMain: i === 10 ? 10 : null, avgRegister: i === 10 ? 1 : null })),
  seasons: [{ key: 'recent3', label: '최근 3개월', start: '2026-08-20', end: '2026-11-19', ongoing: true, days: 5, totalDays: 92, main: 50, register: 5, avgMain: 10, avgRegister: 1, prev: { days: 0 }, changeMain: null, changeRegister: null },
    { key: 'winter', label: '2025~26 겨울', months: '12~2월', start: '2025-12-01', end: '2026-02-28', ongoing: false, days: 0, totalDays: 90, main: 0, register: 0, avgMain: null, avgRegister: null, prev: { days: 0 } }],
  yearly: [{ year: 2026, start: '2026-01-01', end: '2026-11-19', ongoing: true, days: 5, yearDays: 365, main: 58, register: 3, avgMain: 11.6, avgRegister: 0.6, prev: { days: 0 }, changeMain: null, changeRegister: null }] });
const spell = h => { for (const m of h.matchAll(/([가-힣])예요/g)) assert.equal((m[1].charCodeAt(0) - 0xac00) % 28, 0, m[0]); for (const m of h.matchAll(/([가-힣])이에요/g)) assert.notEqual((m[1].charCodeAt(0) - 0xac00) % 28, 0, m[0]); };
test('대시보드: 시간별·요일별·주간별·일간·월간·시즌별·연간 탭, 핵심 수치는 해요체·사람 수', () => {
  assert.deepEqual(SECTIONS.map(s => s[1]), ['시간별', '일간', '요일별', '주간별', '월간', '시즌별', '연간', '기기', '지역']);
  const h = visitsHtml(v(), 30, 360, { sec: 'seasons' });
  assert.match(h, /<h2>접속현황<\/h2>/); assert.match(h, /오늘 방문자/); assert.match(h, /어제 같은 시간\(0~14시\)보다 <span class="vz-dl">메인 <span class="vz-chg up">3명 늘었어요/);
  assert.match(h, /관리자·내부 테스터 1명은 빼고 셌어요/); assert.match(h, /신청 화면 이동률\(30일\)/); assert.match(h, /10%/);
  assert.match(h, /지난달 같은 기간\(1일~어제\)보다 <span class="vz-dl">메인 <span class="vz-chg up">5명 늘었어요/);
  assert.match(h, /직전 7일보다 <span class="vz-dl">메인 <span class="vz-chg none">비교 전/); // 직전 7일이 집계 전
  assert.match(h, /2025~26 겨울\(12~2월\)/); assert.match(h, /data-vsec="seasons"[^>]*aria-selected="true"/);
  for (const [s] of SECTIONS) assert.match(h, new RegExp(`data-vsec-pane="${s}"`));
  assert.match(h, /<table class="tbl vz-tbl">/); // 모바일 카드형 표 규칙(.tbl) 적용
  assert.match(h, /2일 뒤 지워요/); assert.doesNotMatch(h, /ip_hash|undefined|NaN|\d+\.\d+\.\d+\.\d+/);
  assert.doesNotMatch(h.replace(/<[^>]+>/g, ''), /[가-힣](습니다|십시오|됩니다|합니다|입니다)(?![가-힣])/);
  spell(h);
});
test('기기·지역 탭 분리: 기기 탭(기기·운영체제·브라우저), 지역 탭(시·도), 명·비율·메인/신청, 7일 버튼', () => {
  const dims = { from: '2026-11-13', to: '2026-11-19', since: '2026-11-19',
    region: { list: [{ value: '부산', main: 5, register: 1 }, { value: '알 수 없음', main: 3, register: 1 }], main: 8, register: 2 },
    device: { list: [{ value: '아이폰', main: 6, register: 2 }, { value: '알 수 없음', main: 2, register: 0 }], main: 8, register: 2 },
    os: { list: [{ value: 'iOS 26', main: 4, register: 1 }, { value: 'iOS 18', main: 2, register: 1 }, { value: '알 수 없음', main: 2, register: 0 }], main: 8, register: 2 },
    browser: { list: [{ value: 'Safari', main: 8, register: 2 }], main: 8, register: 2 } };
  const h = visitsHtml({ ...v(), dims }, 7, 360, { sec: 'devices' });
  assert.match(h, /data-vdays="7" class="on"/); assert.match(h, /data-vsec="devices"[^>]*>기기<\/button><button[^>]*data-vsec="regions"[^>]*>지역<\/button>/);
  const dev = h.slice(h.indexOf('id="vz-devices"'), h.indexOf('id="vz-regions"')), reg = h.slice(h.indexOf('id="vz-regions"'));
  assert.ok(dev.indexOf('<h4>기기</h4>') < dev.indexOf('<h4>운영체제</h4>') && dev.indexOf('<h4>운영체제</h4>') < dev.indexOf('<h4>브라우저</h4>')); assert.doesNotMatch(dev, /지역\(시·도\)/);
  assert.match(dev, /<b>iOS<\/b><span class="sub">8명 · 80%<\/span>/); assert.match(dev, /메인 6 · 신청 2/); assert.match(dev, /그전 방문 2명은 '알 수 없음'/);
  assert.match(reg, /<h4>지역\(시·도\)<\/h4>/); assert.match(reg, /<b>부산<\/b><span class="sub">6명 · 60%<\/span>/); assert.match(reg, /hidden/); // 기기 탭이 열려 있으면 지역은 숨김
  assert.match(visitsHtml(v(), 30, 360, { sec: 'regions' }), /백엔드를 v0\.1\.21 이상으로/);
});
