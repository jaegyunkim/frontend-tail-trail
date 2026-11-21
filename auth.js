// 로그인 세션 공용 모듈(app.js, admin.js). 토큰은 sessionStorage(탭을 닫으면 사라짐)에만 둔다.
// 서버가 만료를 최종 판단하고(401 SESSION_EXPIRED), 화면은 남은 시간을 세어 0초에 자동 로그아웃한다.
const KEY = 'tailtrail.auth';
const params = new URLSearchParams(location.search);
if (params.get('api')) localStorage.setItem('tailtrail.api', params.get('api').replace(/\/$/, ''));
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

export const state = {
  api: localStorage.getItem('tailtrail.api') || window.TAILTRAIL_API || (isLocal ? 'http://localhost:8889' : ''),
  authMode: null,                 // 'required' | 'off' | null(서버 미연결)
  roleLimits: null,               // 서버 /healthz 의 역할 기본 한도(로그인 전 안내용)
  auth: JSON.parse(sessionStorage.getItem(KEY) || 'null') // { token, expiresAtLocal, user }
};
// 외부 수집기가 없거나 고장 나도 인증/요청 동작은 그대로 유지한다.
function telemetry(kind, message, actualBase = state.api) {
  try { window.TAILTRAIL_TELEMETRY?.report(kind, message, '', actualBase); } catch { /* best effort */ }
}
function syncTelemetryBase() {
  try { window.TAILTRAIL_TELEMETRY?.setApiBase(state.api); } catch { /* best effort */ }
}
syncTelemetryBase();
export function setApi(v) { state.api = String(v || '').trim().replace(/\/$/, ''); localStorage.setItem('tailtrail.api', state.api); syncTelemetryBase(); }
export function saveAuth(a) { state.auth = a; if (a) sessionStorage.setItem(KEY, JSON.stringify(a)); else sessionStorage.removeItem(KEY); }
/** 서버가 알려 준 남은 초로 로컬 만료 시각을 맞춘다(기기 시계가 틀려도 안전). */
export function syncAccount(me) {
  if (!state.auth || !me.user) return;
  saveAuth({ ...state.auth, user: { ...state.auth.user, ...me.user, role: me.role ?? me.user.role, limits: me.limits },
    minutes: me.limits.sessionMinutes, ...(me.logins ? { logins: me.logins } : {}), expiresAtLocal: Number.isFinite(me.remainingSec) ? Date.now() + me.remainingSec * 1000 : state.auth.expiresAtLocal });
}
export const sessionMinutes = () => state.auth?.minutes ?? state.auth?.user?.limits?.sessionMinutes;
/** 최근 24시간 로그인 현황 { limit, used, left, nextAt } (서버가 알려 준 값, 없으면 null) */
export const loginQuota = () => state.auth?.logins ?? null;
export const remaining = () => state.auth ? Math.max(0, Math.round((state.auth.expiresAtLocal - Date.now()) / 1000)) : 0;

let onAuthLost = () => {};
export function setOnAuthLost(fn) { onAuthLost = fn; }
let onMustChange = () => {};
export function setOnMustChange(fn) { onMustChange = fn; }

export async function api(path, opts = {}) {
  if (!state.api) throw Object.assign(new Error('백엔드 주소가 설정되지 않았어요'), { status: 0 });
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.auth?.token && !opts.noAuth) headers.Authorization = `Bearer ${state.auth.token}`;
  const requestBase = state.api;
  syncTelemetryBase();
  let r;
  try { r = await fetch(requestBase + path, { ...opts, headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 60000) }); }
  catch (e) {
    telemetry('api_network', e?.name === 'TimeoutError' ? 'API request timed out' : 'API network request failed', requestBase);
    const local = /\/\/(localhost|127\.0\.0\.1)/.test(state.api) && location.protocol === 'https:';
    throw Object.assign(new Error(e.name === 'TimeoutError' ? (local ? '로컬 서버 응답 없음 — 브라우저의 “로컬 네트워크 접근 허용” 팝업을 확인하거나 HTTPS 공개 주소를 쓰세요' : '응답 시간 초과') : '네트워크 오류'), { status: 0 });
  }
  if (r.status >= 500) telemetry('api_5xx', `HTTP ${r.status}`, requestBase);
  const j = await r.json().catch(() => { telemetry('api_json', 'API response JSON parsing failed', requestBase); return {}; });
  if (!r.ok) {
    const e = Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status, code: j.code, usage: j.usage, nextLoginAt: j.nextLoginAt ?? null, loginLimit: j.loginLimit ?? null });
    if (r.status === 401 && state.auth && !opts.noAuth) onAuthLost(e.message, e.code);
    if (r.status === 403 && j.code === 'MUST_CHANGE_PASSWORD') onMustChange();
    throw e;
  }
  return j;
}
/** 인증이 필요한 이미지(네이버 정적 지도)를 Blob URL 로 받아 img 에 넣는다. */
export async function loadAuthImage(img, path) {
  try {
    const r = await fetch(state.api + path, { headers: state.auth?.token ? { Authorization: `Bearer ${state.auth.token}` } : {} });
    if (!r.ok) throw new Error(String(r.status));
    img.src = URL.createObjectURL(await r.blob());
  } catch { img.alt = '지도를 불러오지 못했어요'; }
}
async function probe() {
  const h = await api('/healthz', { timeoutMs: 8000, noAuth: true });
  state.authMode = h.auth?.mode ?? 'off'; state.roleLimits = h.auth?.roleLimits ?? null;
  return h;
}
/** 서버 상태 확인. 기본 주소(config.js)가 안 되면 예비 주소를 차례로 시도한다(기기에 직접 저장한 주소는 그대로 존중). */
export async function health() {
  try { return await probe(); } catch (e) {
    const fromConfig = !localStorage.getItem('tailtrail.api');
    const backups = fromConfig ? (window.TAILTRAIL_API_FALLBACKS || []).filter(u => u && u !== state.api) : [];
    const primary = state.api;
    for (const u of backups) { state.api = u; try { return await probe(); } catch { /* 다음 예비 주소 */ } }
    state.api = primary; syncTelemetryBase(); state.authMode = null; return { error: e.message };
  }
}
export async function login(loginId, password) {
  const r = await api('/v1/auth/login', { method: 'POST', body: JSON.stringify({ loginId, password, client: 'pages' }), noAuth: true });
  saveAuth({ token: r.token, expiresAtLocal: Date.now() + r.session.minutes * 60000, minutes: r.session.minutes, user: r.user, logins: r.logins ?? null });
  return r;
}
export async function logout(reason = 'logout') {
  const a = state.auth; saveAuth(null);
  if (a?.token) fetch(state.api + '/v1/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }).catch(() => {});
}
/** 1초 타이머: 표시 갱신, 60초 전 경고, 0초 자동 로그아웃. 탭이 다시 보일 때 즉시 확인. */
export function startTimer(el, { onWarn, onExpire }) {
  let warned = false;
  const tick = () => {
    if (!state.auth) return;
    const s = remaining();
    el.hidden = false; el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    el.classList.toggle('warn', s <= 120 && s > 60); el.classList.toggle('crit', s <= 60);
    if (s <= 60 && !warned) { warned = true; onWarn?.(s); }
    if (s <= 0) { stop(); onExpire?.(); }
  };
  const id = setInterval(tick, 1000);
  const vis = () => document.visibilityState === 'visible' && tick();
  document.addEventListener('visibilitychange', vis);
  function stop() { clearInterval(id); document.removeEventListener('visibilitychange', vis); el.hidden = true; }
  tick();
  return { stop, reset() { warned = false; tick(); } };
}
