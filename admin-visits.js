// 관리자 '접속현황' 화면: 메인(로그인)·이용 신청 페이지 방문자 지표와 인라인 SVG 차트(외부 라이브러리 없음). 기반: frontend-go-fishing/admin-visits.js
// 색: 메인 = 진초록(디자인 시스템 --acc #2F6B4F), 신청 = 하늘색(#3B82C4). 모든 차트·범례·카드에서 같은 두 색만 쓴다.
// 순수 함수만 둔다(DOM·API 없음) → node 테스트에서 그대로 검사한다.
// 섹션: 시간별 → 일간 → 요일별 → 주간별 → 월간 → 시즌별 → 연간(짧은 단위→긴 단위). 한 번에 한 섹션만 보이게 탭으로 나눈다.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = v => v == null ? '-' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
export const pct = v => v == null ? '-' : (Math.round(v * 1000) / 10).toLocaleString('ko-KR') + '%';
const WD = ['일', '월', '화', '수', '목', '금', '토'];
/** 'MM.DD' */
export const md = d => `${d.slice(5, 7)}.${d.slice(8, 10)}`;
/** 'YYYY.MM.DD' */
export const dot = d => String(d ?? '').replaceAll('-', '.');
const DAY = 86400000;
export const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);
const dayLabel = d => `${md(d)}(${WD[new Date(d + 'T00:00:00Z').getUTCDay()]})`;
const range = (a, b) => a === b ? dayLabel(a) : `${dayLabel(a)}~${dayLabel(b)}`;
export const C = { main: '#2F6B4F', register: '#3B82C4' };
const SERIES = [{ key: 'main', name: '메인(로그인)', color: C.main }, { key: 'register', name: '이용 신청', color: C.register }];
/** 섹션 목록(탭 순서) */
export const SECTIONS = [['hourly', '시간별'], ['daily', '일간'], ['weekday', '요일별'], ['weekly', '주간별'], ['monthly', '월간'], ['seasons', '시즌별'], ['yearly', '연간'], ['devices', '기기'], ['regions', '지역']];

/** 증감 표시: ▲ 12.5% / ▼ 3% / 같아요 / 비교 불가 문구 */
export function changeText(v, none = '비교할 데이터가 아직 없어요') {
  if (v == null) return `<span class="vz-chg none">${esc(none)}</span>`;
  if (v === 0) return '<span class="vz-chg">변화 없어요</span>';
  return `<span class="vz-chg">${v > 0 ? '▲' : '▼'} ${pct(Math.abs(v))}</span>`;
}
/** 사람 수 증감(작은 서비스라 %보다 몇 명인지가 먼저): '3명 늘었어요(▲ 25%)' / '2명 줄었어요' / '같아요' */
export function delta(cur, prev, none = '비교 전') {
  if (cur == null || prev == null) return `<span class="vz-chg none">${esc(none)}</span>`;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return '<span class="vz-chg">같아요</span>';
  const p = prev > 0 ? `<span class="vz-pc">(${d > 0 ? '▲' : '▼'} ${pct(Math.abs(d / prev))})</span>` : '';
  return `<span class="vz-chg ${d > 0 ? 'up' : 'down'}">${num(Math.abs(d))}명 ${d > 0 ? '늘었어요' : '줄었어요'}${p}</span>`;
}
const delta2 = (cm, pm, cr, pr, none) => `<span class="vz-dl">메인 ${delta(cm, pm, none)}</span><span class="vz-dl">신청 ${delta(cr, pr, none)}</span>`;
/** 하루 평균 기준 증감률(두 기간 모두 집계된 날이 있고 비교 기간이 0보다 클 때만) */
export function avgChange(cur, curDays, prev, prevDays) {
  if (!curDays || !prevDays) return null;
  const a = cur / curDays, b = prev / prevDays;
  return b > 0 ? Math.round((a - b) / b * 1000) / 1000 : null;
}
/** 축 눈금: 정수 단위의 보기 좋은 간격(최대 5칸) */
export function niceScale(max) {
  const v = Math.max(1, max), raw = v / 4, p = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 5, 10].map(m => m * p).find(s => s >= raw) ?? 10 * p; step = Math.max(1, Math.ceil(step));
  const top = Math.ceil(v / step) * step, ticks = []; for (let t = 0; t <= top; t += step) ticks.push(t);
  return { top, ticks };
}
/** 세로축 눈금 글자 폭에 맞춘 왼쪽 여백 */
const axisW = top => Math.round(12 + 6.2 * num(top).length);
const legend = () => `<div class="vz-legend">${SERIES.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>`;
const readout = hint => `<p class="vz-read" aria-live="polite" data-hint="${esc(hint)}">${esc(hint)}</p>`;
const barPath = (x, y, w, h) => { const r = Math.min(4, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
/** 가로축 이름표 간격: 글자 폭이 칸보다 넓으면 건너뛴다. anchor='end'면 마지막(최근) 칸을 늘 표시 */
export function labelEvery(labels, gw, every) {
  return every ?? Math.max(1, Math.ceil((Math.max(0, ...labels.map(l => String(l).length)) * 6.4 + 6) / gw));
}

/** 일간 꺾은선: 메인·신청 방문자 + 메인 7일 이동평균(점선). 수집 전 날짜는 선을 그리지 않고 옅게 칠한다. 오늘(진행 중)은 속이 빈 점. */
export function lineChart(daily, width = 360, height = 200, { today = null } = {}) {
  const vals = daily.flatMap(d => [d.main, d.register, d.ma7Main ?? 0]); const { top, ticks } = niceScale(Math.max(0, ...vals));
  const L = axisW(top), R = 8 + 6.5 * num(top).length, T = 12, B = 24, W = width, H = height, n = daily.length, pw = W - L - R, ph = H - T - B;
  const x = i => L + (n > 1 ? i * pw / (n - 1) : pw / 2), y = v => T + ph - v / top * ph;
  const path = get => { let s = '', pen = false; daily.forEach((d, i) => { const v = get(d); if (!d.covered || v == null) { pen = false; return; } s += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; }); return s; };
  const grid = ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="vz-grid"/><text x="${L - 6}" y="${y(t) + 3.5}" text-anchor="end" class="vz-ax">${num(t)}</text>`).join('');
  const marks = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}" class="vz-ax">${md(daily[i].day)}</text>`).join('');
  const step = n > 1 ? pw / (n - 1) : pw;
  // 수집 시작 전 구간: 옅은 배경 + '집계 전'
  const fi = daily.findIndex(d => d.covered), pre = fi === -1 ? n : fi;
  const preW = pre ? Math.min(pw, (n > 1 ? x(pre - 1) + step / 2 : W - R) - L) : 0;
  const preBox = pre ? `<rect x="${L}" y="${T}" width="${preW.toFixed(1)}" height="${ph}" class="vz-pre"/>${preW >= 44 ? `<text x="${(L + preW / 2).toFixed(1)}" y="${T + ph / 2}" text-anchor="middle" class="vz-ax dim">집계 전</text>` : ''}` : '';
  const last = [...daily].reverse().find(d => d.covered), li = daily.lastIndexOf(last), open = last && today && last.day === today;
  const ends = last ? SERIES.map(s => ({ s, v: last[s.key] })).sort((a, b) => b.v - a.v).map((e, k, arr) => { let yy = y(e.v) + 4; if (k === 1 && Math.abs(yy - (y(arr[0].v) + 4)) < 12) yy = y(arr[0].v) + 16; return `<circle cx="${x(li)}" cy="${y(e.v)}" r="3.5" fill="${open ? '#fff' : e.s.color}" stroke="${open ? e.s.color : '#fff'}" stroke-width="2"/><text x="${x(li) + 7}" y="${yy}" class="vz-end">${num(e.v)}</text>`; }).join('') : '';
  const hits = daily.map((d, i) => { const now = today && d.day === today ? '(오늘, 진행 중)' : ''; const tip = d.covered ? `${dayLabel(d.day)}${now} · 메인 ${num(d.main)}명 · 신청 ${num(d.register)}명${d.ma7Main != null ? ` · 메인 7일 평균 ${num(d.ma7Main)}명` : ''}` : `${dayLabel(d.day)} · 집계 전이에요`; return `<rect x="${(x(i) - step / 2).toFixed(1)}" y="${T}" width="${step.toFixed(1)}" height="${ph}" class="vz-hit" data-tip="${esc(tip)}"><title>${esc(tip)}</title></rect>`; }).join('');
  return `<svg class="vz-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="최근 ${n}일 하루 방문자 꺾은선 차트">${preBox}${grid}${marks}
    <path d="${path(d => d.ma7Main)}" fill="none" stroke="${C.main}" stroke-opacity=".45" stroke-width="2" stroke-dasharray="4 3"/>
    ${SERIES.map(s => `<path d="${path(d => d[s.key])}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}${ends}${hits}</svg>`;
}
/**
 * 묶음 막대: groups=[{label, values:[메인, 신청](null=집계 없음), tip, partial(진행 중·일부 집계 → 옅게), future(아직 오지 않음 → '-' 없음)}]
 * opts.every: 이름표 간격(없으면 글자 폭으로 계산), opts.anchor: 'end'(최근 칸 기준) | 'start'
 */
export function barChart(groups, width = 360, height = 190, { aria = '막대 차트', every, anchor = 'end' } = {}) {
  const { top, ticks } = niceScale(Math.max(0, ...groups.flatMap(g => g.values.map(v => v ?? 0))));
  const L = axisW(top), R = 6, T = 12, B = 24, W = width, H = height, pw = W - L - R, ph = H - T - B, n = groups.length, gw = pw / n;
  const y = v => T + ph - v / top * ph, k = SERIES.length, bw = Math.max(3, Math.min(18, (gw * 0.72 - 2 * (k - 1)) / k));
  const grid = ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="vz-grid"/><text x="${L - 6}" y="${y(t) + 3.5}" text-anchor="end" class="vz-ax">${num(t)}</text>`).join('');
  const ev = labelEvery(groups.map(g => g.label), gw, every);
  const body = groups.map((g, i) => {
    const cx = L + gw * i + gw / 2, x0 = cx - (bw * k + 2 * (k - 1)) / 2, empty = g.values.every(v => v == null);
    const bars = g.values.map((v, j) => v == null || v <= 0 ? '' : `<path d="${barPath(x0 + j * (bw + 2), y(v), bw, T + ph - y(v))}" fill="${SERIES[j].color}"${g.partial ? ' fill-opacity=".45"' : ''}/>`).join('');
    const none = empty && !g.future ? `<text x="${cx}" y="${T + ph - 4}" text-anchor="middle" class="vz-ax">-</text>` : '';
    const show = (anchor === 'end' ? n - 1 - i : i) % ev === 0;
    const lab = show ? `<text x="${cx}" y="${H - 6}" text-anchor="middle" class="vz-ax${empty ? ' dim' : ''}">${esc(g.label)}</text>` : '';
    return `${bars}${none}${lab}<rect x="${(L + gw * i).toFixed(1)}" y="${T}" width="${gw.toFixed(1)}" height="${ph}" class="vz-hit" data-tip="${esc(g.tip)}"><title>${esc(g.tip)}</title></rect>`;
  }).join('');
  return `<svg class="vz-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(aria)}">${grid}<line x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}" class="vz-base"/>${body}</svg>`;
}

// ---------- 공통 조각 ----------
const pair = (a, b) => `<b>${num(a)}</b><span class="vz-sep">·</span><b>${num(b)}</b>`;
const val = v => v == null ? '<b>-</b>' : `<b>${num(v)}</b>명`;
const kpi = (title, main, register, sub) => `<div class="vz-kpi"><span class="vz-kt">${title}</span><div class="vz-kv"><span><i style="background:${C.main}"></i>메인 ${val(main)}</span><span><i style="background:${C.register}"></i>신청 ${val(register)}</span></div><div class="vz-ks">${sub}</div></div>`;
const chg2 = (a, b, none) => `<span class="vz-dl">메인 ${changeText(a, none)}</span><span class="vz-dl">신청 ${changeText(b, none)}</span>`;
const pill = t => ` <span class="pill">${t}</span>`;
/** 기간 상태: 수집 전 / 진행 중 / 일부만 집계 */
function periodState({ days, elapsed, ongoing }) {
  if (!days) return '<span class="sub">집계 전이에요</span>';
  const part = days < elapsed ? `집계 ${num(days)}/${num(elapsed)}일` : `${num(days)}일`;
  return `${ongoing ? '<span class="pill">진행 중</span> ' : ''}<span class="sub">${part}</span>`;
}
const tipTail = ({ days, elapsed, ongoing }) => ` · ${ongoing ? '진행 중, ' : ''}집계 ${num(days)}${days < elapsed || ongoing ? `/${num(elapsed)}` : ''}일`;
/** 하루 평균 / 합계 두 차트를 탭처럼 바꿔 보는 버튼 + 판 */
function modes(sec, ui, list, def) {
  const cur = list.some(([k]) => k === ui.modes?.[sec]) ? ui.modes[sec] : def;
  return {
    seg: `<div class="vz-seg" role="group" aria-label="차트 보기 방식">${list.map(([k, name]) => `<button type="button" data-vmode="${k}" aria-pressed="${k === cur}"${k === cur ? ' class="on"' : ''}>${name}</button>`).join('')}</div>`,
    panes: list.map(([k, , chart]) => `<div class="vz-wrap" data-vpane="${k}"${k === cur ? '' : ' hidden'}>${chart}</div>`).join('')
  };
}
const table = (head, rows, open = false) => `<details class="vz-more"${open ? ' open' : ''}><summary>표로 보기</summary><div class="vz-scroll"><table class="tbl vz-tbl"><tr>${head.map(h => `<th${h.startsWith('#') ? ' class="num"' : ''}>${h.replace(/^#/, '')}</th>`).join('')}</tr>${rows.join('')}</table></div></details>`;
const td = (v, cls = '') => `<td${cls ? ` class="${cls}"` : ''}>${v}</td>`;
const legacy = '<p class="sub vz-note">서버가 아직 이 지표를 보내지 않아요. 백엔드를 v0.1.18 이상으로 올리면 보여요.</p>';
function card(sec, ui, title, basis, body) {
  const on = (ui.sec ?? 'daily') === sec;
  return `<section class="card vz-card" id="vz-${sec}" data-vsec-pane="${sec}" role="tabpanel" aria-labelledby="vzt-${sec}"${on ? '' : ' hidden'}><h3>${title}${basis ? ` <span class="sub">${basis}</span>` : ''}</h3>${body}</section>`;
}

// ---------- 섹션 ----------
function hourlySec(v, ui, cw) {
  const h = v.hourly;
  if (!h) return card('hourly', ui, '시간별 방문자', '', legacy);
  const nh = h.nowHour ?? 23, hc = h.coveredDays ?? 0, cut = nh; // 비교: 다 지난 시간(0시~지금 시 직전)만
  const tSum = k => h.today.reduce((a, x) => a + (x[k] ?? 0), 0);
  const upTo = (arr, k) => arr.filter(x => x.hour < cut).reduce((a, x) => a + (x[k] ?? 0), 0);
  const ok = hc && cut > 0, r1 = x => Math.round(x * 10) / 10; // 비교: 오늘 0시~지금 시 직전 vs 평소 같은 시간대 하루 평균(사람 수로)
  const pk = k => h.peak?.[k] ? `${h.peak[k].hour}시(하루 평균 ${num(h.peak[k].avg)}명)` : '-';
  const strip = `<div class="vz-kpis vz-sum">
    ${kpi('오늘 지금까지', tSum('main'), tSum('register'), `${nh}시 기준 · ${cut > 0 ? `평소 0~${cut}시 전 하루 평균보다 ${ok ? delta2(upTo(h.today, 'main'), r1(upTo(h.avg, 'main')), upTo(h.today, 'register'), r1(upTo(h.avg, 'register'))) : delta2(null, null, null, null)}` : '0시대라 아직 비교 전이에요'}`)}
    <div class="vz-kpi"><span class="vz-kt">가장 많이 여는 시간</span><div class="vz-ks vz-peak"><span><i style="background:${C.main}"></i>메인 <b>${pk('main')}</b></span><span><i style="background:${C.register}"></i>신청 <b>${pk('register')}</b></span></div><div class="vz-ks">${hc ? `어제까지 ${num(hc)}일 기준이에요` : '어제까지 집계된 날이 아직 없어요'}</div></div></div>`;
  const avgG = h.avg.map(x => ({ label: `${x.hour}시`, values: hc ? [x.main, x.register] : [null, null], tip: hc ? `${x.hour}시대 · 하루 평균 메인 ${num(x.main)}명 · 신청 ${num(x.register)}명(${num(hc)}일 기준)` : `${x.hour}시대 · 집계 전이에요` }));
  const todG = h.today.map(x => x.hour > nh ? { label: `${x.hour}시`, values: [null, null], future: true, tip: `${x.hour}시대 · 아직이에요` }
    : { label: `${x.hour}시`, values: [x.main, x.register], partial: x.hour === nh, tip: `오늘 ${x.hour}시대${x.hour === nh ? '(진행 중)' : ''} · 메인 ${num(x.main)}명 · 신청 ${num(x.register)}명` });
  const m = modes('hourly', ui, [
    ['avg', `최근 ${num(h.days)}일 평균`, barChart(avgG, cw, 180, { aria: '시간대별 하루 평균 방문자 막대 차트', every: 3, anchor: 'start' })],
    ['today', '오늘', barChart(todG, cw, 180, { aria: '오늘 시간대별 방문자 막대 차트', every: 3, anchor: 'start' })]], hc ? 'avg' : 'today');
  const rows = h.avg.map((x, i) => { const t = h.today[i], fut = t.hour > nh; return `<tr>${td(`${x.hour}시${t.hour === nh ? pill('지금') : ''}`)}${td(hc ? pair(x.main, x.register) : '-', 'num')}${td(fut ? '<span class="sub">아직이에요</span>' : pair(t.main, t.register), 'num')}</tr>`; });
  return card('hourly', ui, '시간별 방문자', `어제까지 최근 ${num(h.days)}일 중 집계 ${num(hc)}일 · 오늘 ${nh}시 기준`, `${strip}${legend()}${m.seg}
    <p class="sub vz-note">방문자는 그날 처음 연 시각에 1번만 세요(같은 날 다시 열어도 다른 시간대에 또 세지 않아요). 옅은 막대는 지금 진행 중인 시간이에요.</p>
    ${m.panes}${readout('막대를 누르면 그 시간 수치를 보여 드려요.')}
    ${table(['시간', '#하루 평균(메인·신청)', '#오늘(메인·신청)'], rows)}`);
}
function dailySec(v, ui, cw, days) {
  const d = v.daily, today = v.today, past = d.filter(x => x.covered && x.day !== today), pd = past.length;
  const s = k => past.reduce((a, x) => a + x[k], 0);
  const yd = d.length >= 2 ? d[d.length - 2] : null, wk = d.length >= 9 ? d[d.length - 9] : null;
  const ok = yd?.covered && wk?.covered;
  const strip = `<div class="vz-kpis vz-sum">
    ${kpi(`어제${yd ? ` ${dayLabel(yd.day)}` : ''}`, yd?.covered ? yd.main : null, yd?.covered ? yd.register : null, `지난주 같은 요일${wk ? `(${md(wk.day)})` : ''}보다 ${ok ? delta2(yd.main, wk.main, yd.register, wk.register) : delta2(null, null, null, null)}`)}
    ${kpi(`하루 평균(어제까지 ${num(pd)}일)`, pd ? Math.round(s('main') / pd * 10) / 10 : null, pd ? Math.round(s('register') / pd * 10) / 10 : null, pd ? `합계 메인 ${num(s('main'))}명 · 신청 ${num(s('register'))}명 · 오늘은 진행 중이라 빼요` : '어제까지 집계된 날이 아직 없어요')}</div>`;
  const rows = [...d].reverse().map(x => `<tr>${td(`${dayLabel(x.day)}${x.day === today ? pill('진행 중') : ''}`)}${td(x.covered ? num(x.main) : '<span class="sub">집계 전</span>', 'num')}${td(x.covered ? num(x.register) : '-', 'num')}${td(num(x.ma7Main), 'num')}</tr>`);
  return card('daily', ui, '일간 방문자', `최근 ${num(days)}일 · 집계 ${num(d.filter(x => x.covered).length)}일`, `${strip}${legend()}
    <p class="sub vz-note">점선은 메인 화면 7일 이동평균이에요(7일이 모두 집계된 날부터). 속이 빈 점은 오늘이라 아직 진행 중이에요.</p>
    <div class="vz-wrap">${lineChart(d, cw, 200, { today })}</div>${readout('차트를 누르면 그날 수치를 보여 드려요.')}
    ${table(['날짜', '#메인', '#신청', '#메인 7일 평균'], rows)}`);
}
function weekdaySec(v, ui, cw) {
  const wk = v.weekday, order = [1, 2, 3, 4, 5, 6, 0], rows = order.map(i => wk.rows[i]);
  const grp = ids => { const r = wk.rows.filter(x => ids.includes(x.weekday) && x.days), dd = r.reduce((a, x) => a + x.days, 0); return { days: dd, main: dd ? Math.round(r.reduce((a, x) => a + x.avgMain * x.days, 0) / dd * 10) / 10 : null, register: dd ? Math.round(r.reduce((a, x) => a + x.avgRegister * x.days, 0) / dd * 10) / 10 : null }; };
  const wd = grp([1, 2, 3, 4, 5]), we = grp([0, 6]);
  const best = wk.rows.filter(x => x.days).sort((a, b) => b.avgMain - a.avgMain)[0];
  const has = wk.rows.some(r => r.days);
  const strip = `<div class="vz-kpis vz-sum">
    ${kpi('주중(월~금) 하루 평균', wd.main, wd.register, wd.days ? `${num(wd.days)}일 기준이에요` : '집계 전이에요')}
    ${kpi('주말(토·일) 하루 평균', we.main, we.register, we.days ? `${num(we.days)}일 기준 · 주중보다 ${chg2(avgChange(we.main ?? 0, 1, wd.main ?? 0, 1), avgChange(we.register ?? 0, 1, wd.register ?? 0, 1), '비교 전')}` : '집계 전이에요')}</div>`;
  const basis = wk.start ? `${dot(wk.start)}~${dot(wk.end)} · 최근 ${num(wk.weeks)}주(어제까지)` : '최근 12주(어제까지)';
  return card('weekday', ui, '요일별 하루 평균', basis, `${strip}${legend()}
    <div class="vz-wrap">${barChart(rows.map(r => ({ label: WD[r.weekday], values: r.days ? [r.avgMain, r.avgRegister] : [null, null], tip: r.days ? `${WD[r.weekday]}요일 · 하루 평균 메인 ${num(r.avgMain)}명 · 신청 ${num(r.avgRegister)}명(${num(r.days)}일 기준)` : `${WD[r.weekday]}요일 · 집계 전이에요` })), cw, 170, { aria: '요일별 하루 평균 방문자 막대 차트' })}</div>${readout('막대를 누르면 요일 수치를 보여 드려요.')}
    <p class="sub vz-note">${has ? `요일마다 집계된 날이 ${num(Math.min(...wk.rows.map(r => r.days)))}~${num(Math.max(...wk.rows.map(r => r.days)))}일이에요. 4주 이상 쌓이면 패턴을 믿을 만해요.${best ? ` 메인 화면은 ${WD[best.weekday]}요일에 가장 많이 열어요.` : ''}` : '어제까지 집계된 날이 아직 없어요.'} 요일 패턴은 기간끼리 비교하는 대신 주중과 주말을 견줘요.</p>
    ${table(['요일', '#하루 평균(메인·신청)', '#집계 일수'], rows.map(r => `<tr>${td(`${WD[r.weekday]}요일`)}${td(r.days ? pair(r.avgMain, r.avgRegister) : '<span class="sub">집계 전</span>', 'num')}${td(`${num(r.days)}일`, 'num')}</tr>`))}`);
}
/** 주간·월간·시즌·연간 공통: 하루 평균/합계 차트 + 표. P=[{label, long, start, end, days, elapsed, ongoing, main, register, avgMain, avgRegister, changeMain, changeRegister}] */
function periodCharts(sec, ui, cw, P, aria, opts = {}) {
  const g = mode => P.map(p => ({ label: p.label, partial: p.days > 0 && (p.ongoing || p.days < p.elapsed), values: p.days ? (mode === 'avg' ? [p.avgMain, p.avgRegister] : [p.main, p.register]) : [null, null],
    tip: p.days ? `${p.long} · ${mode === 'avg' ? '하루 평균' : '합계'} 메인 ${num(mode === 'avg' ? p.avgMain : p.main)}명 · 신청 ${num(mode === 'avg' ? p.avgRegister : p.register)}명${tipTail(p)}` : `${p.long} · 집계 전이에요` }));
  return modes(sec, ui, [['avg', '하루 평균', barChart(g('avg'), cw, 190, { aria: `${aria} 하루 평균 막대 차트`, ...opts })], ['sum', '합계', barChart(g('sum'), cw, 190, { aria: `${aria} 합계 막대 차트`, ...opts })]], 'avg');
}
const periodRows = (P, cmpName) => [...P].reverse().map(p => `<tr>${td(`<b>${esc(p.long)}</b><br><span class="sub">${dot(p.start)}~${dot(p.end)}</span>`)}${td(periodState(p))}${td(p.days ? pair(p.main, p.register) : '-', 'num')}${td(p.days ? pair(p.avgMain, p.avgRegister) : '-', 'num')}${td(p.days && (p.changeMain != null || p.changeRegister != null) ? `메인 ${changeText(p.changeMain)}<br>신청 ${changeText(p.changeRegister)}` : `<span class="sub">${esc(cmpName)} 데이터가 아직 없어요</span>`)}</tr>`);
const PHEAD = cmp => ['기간', '집계', '#합계(메인·신청)', '#하루 평균(메인·신청)', `${cmp} 대비`];
const NOTE_PART = '옅은 막대는 진행 중이거나 수집 시작 전 날이 섞여 일부만 집계된 기간이에요. 길이가 다른 기간도 견줄 수 있게 전기 대비는 하루 평균으로 계산해요.';
const curPrev = (P, title, cmp) => {
  const cur = P[P.length - 1], prev = P[P.length - 2];
  const one = (p, t) => p ? kpi(`${t} 하루 평균`, p.days ? p.avgMain : null, p.days ? p.avgRegister : null, p.days ? `${esc(p.long)} · 집계 ${num(p.days)}일${p.ongoing ? '(진행 중)' : ''} · ${cmp}보다 ${chg2(p.changeMain, p.changeRegister, '비교 전')}` : `${esc(p.long)} · 집계 전이에요`) : '';
  return `<div class="vz-kpis vz-sum">${one(cur, title[0])}${one(prev, title[1])}</div>`;
};
function weeklySec(v, ui, cw) {
  if (!v.weekly) return card('weekly', ui, '주간별 방문자', '', legacy);
  const P = v.weekly.map(w => ({ ...w, label: md(w.start), long: `${w.isoYear}년 ${w.isoWeek}주(${md(w.start)}~${md(w.fullEnd)})`, elapsed: diffDays(w.start, w.end) + 1 }));
  const m = periodCharts('weekly', ui, cw, P, `최근 ${P.length}주`);
  return card('weekly', ui, '주간별 방문자', `최근 ${num(P.length)}주 · 월~일(ISO 주)`, `${curPrev(P, ['이번 주', '지난주'], '전주')}${legend()}${m.seg}<p class="sub vz-note">${NOTE_PART}</p>${m.panes}${readout('막대를 누르면 그 주 수치를 보여 드려요.')}${table(PHEAD('전주'), periodRows(P, '전주'))}`);
}
function monthlySec(v, ui, cw) {
  const cm = v.today.slice(0, 7);
  const P = v.monthly.map((m, i, a) => { const p = a[i - 1]; const start = `${m.month}-01`, ongoing = m.month === cm, end = ongoing ? v.today : `${m.month}-${String(m.monthDays).padStart(2, '0')}`;
    return { ...m, label: `${Number(m.month.slice(5))}월`, long: `${m.month.slice(0, 4)}년 ${Number(m.month.slice(5))}월`, start, end, ongoing, elapsed: diffDays(start, end) + 1,
      changeMain: p ? avgChange(m.main, m.days, p.main, p.days) : null, changeRegister: p ? avgChange(m.register, m.days, p.register, p.days) : null }; });
  const m = periodCharts('monthly', ui, cw, P, '최근 12개월 월별');
  return card('monthly', ui, '월간 방문자', '최근 12개월', `${curPrev(P, ['이번 달', '지난달'], '전월')}${legend()}${m.seg}<p class="sub vz-note">${NOTE_PART} 위 '이번 달' 카드(1일~어제를 지난달 같은 날짜와 비교)와는 기준이 달라요.</p>${m.panes}${readout('막대를 누르면 그달 수치를 보여 드려요.')}${table(PHEAD('전월'), periodRows(P, '전월'))}`);
}
function seasonSec(v, ui, cw) {
  const sl = s => s.key === 'recent3' ? s.label : `${s.label}(${s.months})`;
  const P = v.seasons.map(s => ({ ...s, label: s.key === 'recent3' ? '최근3개월' : s.label.replace(/^\d{4}(~\d{2})? /, ''), long: sl(s), elapsed: s.totalDays ?? diffDays(s.start, s.end) + 1,
    changeMain: s.days && s.prev?.days ? s.changeMain : null, changeRegister: s.days && s.prev?.days ? s.changeRegister : null }));
  const m = periodCharts('seasons', ui, cw, P, '시즌별', { every: 1 });
  const cur = P.find(p => p.key !== 'recent3' && p.ongoing), r3 = P.find(p => p.key === 'recent3');
  const one = (p, t) => p ? kpi(t, p.days ? p.avgMain : null, p.days ? p.avgRegister : null, p.days ? `${esc(p.long)} 하루 평균 · 집계 ${num(p.days)}일 · 1년 전 같은 기간보다 ${chg2(p.changeMain, p.changeRegister, '비교 전')}` : `${esc(p.long)} · 집계 전이에요`) : '';
  // 시즌 표는 시즌 순서 그대로(최근 3개월 → 봄·여름·가을·겨울)
  const rows = P.map(p => `<tr>${td(`<b>${esc(p.long)}</b><br><span class="sub">${dot(p.start)}~${dot(p.end)}</span>`)}${td(periodState({ ...p, ongoing: p.ongoing && p.key !== 'recent3' }))}${td(p.days ? pair(p.main, p.register) : '-', 'num')}${td(p.days ? pair(p.avgMain, p.avgRegister) : '-', 'num')}${td(p.days && p.prev?.days ? `메인 ${changeText(p.changeMain)}<br>신청 ${changeText(p.changeRegister)}` : '<span class="sub">1년 전 데이터가 아직 없어요</span>')}</tr>`);
  return card('seasons', ui, '시즌별 방문자', '봄 3~5월 · 여름 6~8월 · 가을 9~11월 · 겨울 12~2월', `<div class="vz-kpis vz-sum">${one(cur, '이번 시즌')}${one(r3, '최근 3개월')}</div>${legend()}${m.seg}
    <p class="sub vz-note">시즌마다 길이와 집계 일수가 달라서 하루 평균으로 비교해요. 진행 중인 시즌은 오늘까지, 1년 전도 같은 기간끼리 비교해요. 옅은 막대는 진행 중이거나 일부만 집계된 시즌이에요.</p>
    ${m.panes}${readout('막대를 누르면 시즌 수치를 보여 드려요.')}${table(PHEAD('1년 전 같은 기간'), rows, true)}`);
}
function yearlySec(v, ui, cw) {
  if (!v.yearly) return card('yearly', ui, '연간 방문자', '', legacy);
  const P = v.yearly.map(y => ({ ...y, label: `${y.year}년`, long: `${y.year}년`, elapsed: diffDays(y.start, y.end) + 1 }));
  const m = periodCharts('yearly', ui, cw, P, '연도별', { every: 1 });
  return card('yearly', ui, '연간 방문자', `보관 ${num(v.policy?.dailyYears ?? 5)}년 안 · 1월~12월`, `${curPrev(P, ['올해', '작년'], '전년 같은 기간')}${legend()}${m.seg}
    <p class="sub vz-note">전년 대비는 1월 1일부터 같은 날짜까지의 하루 평균끼리 비교해요. 옅은 막대는 진행 중이거나 일부만 집계된 해예요.</p>
    ${m.panes}${readout('막대를 누르면 그해 수치를 보여 드려요.')}${table(PHEAD('전년 같은 기간'), periodRows(P, '전년 같은 기간'), true)}`);
}

// ---------- 기기·지역(frontend-go-fishing 과 같은 화면): 최근 N일(오늘 포함) 외부 방문자를 항목별 막대·비율로(메인·신청 따로) ----------
/** 서버 dims 목록 → [{key, main, register, total}] ('알 수 없음'은 맨 뒤). family=true 면 운영체제를 버전 없이(iOS·Android·Windows·macOS) 묶는다 */
export function groupDims(list, family = false) {
  const m = new Map();
  for (const x of list ?? []) { const k = (family ? String(x.value).split(' ')[0] : x.value) || '알 수 없음'; const g = m.get(k) ?? { key: k, main: 0, register: 0 }; g.main += Number(x.main) || 0; g.register += Number(x.register) || 0; m.set(k, g); }
  return [...m.values()].map(g => ({ ...g, total: g.main + g.register })).sort((a, b) => (a.key === '알 수 없음') - (b.key === '알 수 없음') || b.total - a.total);
}
function segList(title, list, tot) {
  if (!list.length) return '';
  return `<div class="vz-seglist"><h4>${title}</h4>${list.map(g => `<div class="vz-segrow"><div class="vz-segk"><b>${esc(g.key)}</b><span class="sub">${num(g.total)}명 · ${pct(tot ? g.total / tot : null)}</span></div>
    <div class="vz-segbar" aria-hidden="true">${SERIES.map(x => `<i style="width:${tot ? (g[x.key] / tot * 100).toFixed(1) : 0}%;background:${x.color}"></i>`).join('')}</div>
    <div class="vz-segv sub">메인 ${num(g.main)} · 신청 ${num(g.register)}</div></div>`).join('')}</div>`;
}
const NO_DIMS = '<p class="sub vz-note">서버가 아직 이 지표를 보내지 않아요. 백엔드를 v0.1.21 이상으로 올리면 보여요.</p>';
function devicesSec(v, ui) {
  const d = v.dims;
  if (!d) return card('devices', ui, '기기', '', NO_DIMS);
  const tot = (d.device?.main ?? 0) + (d.device?.register ?? 0);
  const platforms = groupDims(d.device?.list), unknown = platforms.find(g => g.key === '알 수 없음')?.total ?? 0;
  const body = !tot ? '<p class="sub vz-note">이 기간에는 방문자가 없어요.</p>' : `${legend()}
    ${unknown ? `<p class="sub vz-note">기기 기록은 ${esc(dot(d.since ?? '2026-11-19'))}부터 시작했어요. 그전 방문 ${num(unknown)}명은 '알 수 없음'으로 보여요.</p>` : ''}
    ${segList('기기', platforms, tot)}
    ${segList('운영체제', groupDims(d.os?.list, true), tot)}
    ${segList('브라우저', groupDims(d.browser?.list), tot)}`;
  return card('devices', ui, '기기', `${esc(range(d.from, d.to))} · 외부 방문자 ${num(tot)}명`, body);
}
function regionsSec(v, ui) {
  const d = v.dims;
  if (!d) return card('regions', ui, '지역', '', NO_DIMS);
  const tot = (d.region?.main ?? 0) + (d.region?.register ?? 0);
  const regions = groupDims(d.region?.list), unknown = regions.find(g => g.key === '알 수 없음')?.total ?? 0;
  const body = !tot ? '<p class="sub vz-note">이 기간에는 방문자가 없어요.</p>' : `${legend()}
    <p class="sub vz-note">IP로 추정한 시·도예요. 휴대폰 통신망은 실제 위치와 다른 시·도로 잡힐 수 있어요.${unknown ? ` 지역 기록은 ${esc(dot(d.since ?? '2026-11-19'))}부터라 그전 방문 등 ${num(unknown)}명은 '알 수 없음'으로 보여요.` : ''}</p>
    ${regions.every(g => g.key === '알 수 없음') ? `${segList('지역(시·도)', regions, tot)}<p class="sub vz-note">아직 시·도를 알아낸 방문이 없어요.</p>` : segList('지역(시·도)', regions, tot)}`;
  return card('regions', ui, '지역', `${esc(range(d.from, d.to))} · 외부 방문자 ${num(tot)}명`, body);
}

/** 화면 전체 HTML. v=GET /v1/admin/visits 의 visits, days=일간 기간, width=차트 폭(px), ui={sec, modes:{섹션: 보기}} */
export function visitsHtml(v, days = 30, width = 360, ui = {}) {
  const k = v.kpi, cw = Math.round(Math.max(300, Math.min(900, width))), sec = SECTIONS.some(([s]) => s === ui.sec) ? ui.sec : 'daily', u = { ...ui, sec, modes: ui.modes ?? {} };
  const started = v.firstDay ? `${dot(v.firstDay)}부터 집계했어요` : '아직 집계된 방문이 없어요';
  const head = `<div class="tool vz-head"><h2>접속현황</h2><div class="acts">${[7, 14, 30, 90].map(d => `<button data-vdays="${d}" class="${d === days ? 'on' : ''}" aria-pressed="${d === days}">${d}일</button>`).join('')}<button id="vRefresh">새로 고침</button></div>
    <p class="sub">메인(로그인) 화면과 이용 신청 화면을 연 방문자 수예요. 같은 IP는 하루에 화면마다 1명으로 세요. ${esc(started)}. 기간 버튼은 시간별·일간·기기·지역에 적용돼요.</p></div>`;
  const st = k.today.sameTimeYesterday, c7 = k.last7.comparable ?? (k.last7.changeMain != null || k.last7.changeRegister != null), mc = k.month.compare;
  const todaySub = st ? `어제 같은 시간(0~${st.upToHour}시)보다 ${delta2(k.today.main, st.main, k.today.register, st.register)}` : '한국 시간 0시부터 지금까지예요';
  const cards = `<div class="vz-kpis">
    ${kpi('오늘 방문자', k.today.main, k.today.register, `${todaySub}${k.today.internal ? `<span class="vz-dl">관리자·내부 테스터 ${num(k.today.internal)}명은 빼고 셌어요</span>` : ''}`)}
    ${kpi('최근 7일', k.last7.main, k.last7.register, `${esc(range(k.last7.start, k.last7.end))} · 직전 7일보다 ${c7 && k.last7.prev ? delta2(k.last7.main, k.last7.prev.main, k.last7.register, k.last7.prev.register) : delta2(null, null, null, null)}`)}
    ${kpi('이번 달', k.month.main, k.month.register, `지난달 같은 기간(1일~어제)보다 ${mc?.comparable && mc.prev ? delta2(mc.main, mc.prev.main, mc.register, mc.prev.register) : delta2(null, null, null, null)}`)}
    <div class="vz-kpi"><span class="vz-kt">신청 화면 이동률(30일)</span><div class="vz-kv"><b class="vz-big">${pct(k.funnel30.rate)}</b></div><div class="vz-ks">메인 방문자 ${num(k.funnel30.main)}명 중 같은 날 신청 화면도 연 분 ${num(k.funnel30.both)}명 · 신청 화면으로 바로 온 분 ${num(k.funnel30.directRegister)}명</div></div>
  </div>`;
  const tabs = `<div class="vz-tabs" role="tablist" aria-label="접속현황 기간 단위">${SECTIONS.map(([s, name]) => `<button type="button" role="tab" id="vzt-${s}" data-vsec="${s}" aria-controls="vz-${s}" aria-selected="${s === sec}"${s === sec ? ' class="on"' : ''}>${name}</button>`).join('')}</div>`;
  const body = [hourlySec(v, u, cw), dailySec(v, u, cw, days), weekdaySec(v, u, cw), weeklySec(v, u, cw), monthlySec(v, u, cw), seasonSec(v, u, cw), yearlySec(v, u, cw), devicesSec(v, u), regionsSec(v, u)].join('');
  const foot = `<details class="card vz-foot"><summary><h3>집계 기준</h3></summary><ul class="sk-ul">
    <li>방문자는 하루(한국 시간 0시~24시) 동안 같은 IP에서 같은 화면을 여러 번 열어도 1명으로 세요. 같은 와이파이·통신사 IP를 함께 쓰는 여러 분은 1명으로 셀 수 있어요.</li>
    <li>시간별은 그날 처음 연 시각에 1명으로 세요. 그래서 시간별을 모두 더하면 그날 방문자 수와 같아요.</li>
    <li>주간은 월요일~일요일(ISO 주)이고, 해가 바뀌는 주는 목요일이 속한 해의 주로 세요.</li>
    <li>관리자·내부 테스터 접속과 검색 로봇 같은 자동 요청은 빼고 세요. 최근 30일 동안 뺀 내부 방문은 ${num(k.last30.internal)}명이에요.</li>
    <li>주간·월간·시즌·연간 합계는 날마다 센 방문자를 더한 값이에요. 같은 분이 여러 날 오면 날마다 1명씩 세요.</li>
    <li>진행 중인 기간은 오늘까지, 수집을 시작하기 전 날은 0명이 아니라 '집계 전'으로 보여 드리고 하루 평균에서도 빼요.</li>
    <li>최근 30일 조회 수(새로 고침 포함)는 메인 ${num(k.last30.hitsMain)}회, 신청 ${num(k.last30.hitsRegister)}회예요.</li>
    <li>오늘 카드는 하루가 다 지나지 않았으니 어제 하루 전체가 아니라 어제 같은 시간까지와 견줘요.</li>
    <li>지역은 그날 처음 온 방문자의 IP로 시·도만 추정해 남기고(IP·좌표는 저장 안 함), 기기·운영체제·브라우저는 브라우저가 알려 주는 정보로 추정해요.</li>
    <li>IP는 저장하지 않아요. 같은 사람인지 가리는 데만 날마다 바뀌는 비밀값으로 만든 해시를 쓰고, 그 해시도 ${num(v.policy.rawDays)}일 뒤 지워요. 날짜·시간별 숫자만 ${num(v.policy.dailyYears)}년 보관해요.</li></ul></details>`;
  return head + cards + tabs + body + foot;
}
