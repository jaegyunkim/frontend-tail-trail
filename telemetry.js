// Classic script: config 뒤, 모든 module 앞에서 설치한다. Slack 자격증명은 서버에만 둔다.
(() => {
  'use strict';
  const MAX_PER_MINUTE = 5, MAX_PER_PAGE = 30, DEDUP_MS = 60000;
  const seen = new Map();
  let attempts = [], total = 0, apiBase;

  function base(value) {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) return '';
    return u.origin + u.pathname.replace(/\/$/, '');
  }
  function initialBase() {
    // auth.js 실행 전에도 query/storage/config 우선순위를 동일하게 적용한다.
    try {
      const query = new URLSearchParams(location.search).get('api');
      let stored;
      try { stored = localStorage.getItem('tailtrail.api'); } catch { /* 저장소 차단 */ }
      return base(query || stored || window.TAILTRAIL_API || (['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:8787' : ''));
    } catch { return ''; }
  }
  apiBase = initialBase();

  function clean(value, limit) {
    if (typeof value !== 'string') return '';
    // URL은 경로/자격증명까지 제거한다. query/hash와 자유형 인용문도 보내지 않는다.
    return value.slice(0, 12000)
      .replace(/https?:\/\/[^\s<>"']+/gi, '[url]')
      .replace(/[?#][^\s<>"']*/g, '[redacted]')
      .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
      .replace(/\b(?:password|passwd|pwd|token|access_token|refresh_token|authorization|secret|api[_-]?key|current|next)\b["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/gi, '[redacted]')
      .replace(/(?:\b(?:password|passwd|pwd|token|access_token|refresh_token|authorization|secret|api[_-]?key)\b|비밀번호|토큰)[^\r\n]*/gi, '[redacted]')
      .replace(/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){1,2}\b/g, '[redacted]')
      .replace(/\b(?:sk-|xox[baprs]-)[A-Za-z0-9_-]+/g, '[redacted]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
      .replace(/"[^"\r\n]*"|'[^'\r\n]*'|`[^`]*`/g, '[quoted]')
      .replace(/\b[A-Za-z0-9_=-]{24,}\b/g, '[redacted]')
      .slice(0, limit);
  }
  function safePage() {
    // 이 정적 사이트의 알려진 화면 이름만 전송, 임의 경로·query·hash·origin은 제외.
    const leaf = location.pathname.split('/').pop() || 'index.html';
    return ['index.html', 'admin.html', 'register.html', 'server-settings.html'].includes(leaf) ? leaf : '[page]';
  }
  function safeStack(value) {
    if (typeof value !== 'string') return '';
    // 첫 줄(error.message)과 임의 함수명/경로는 버리고 알려진 앱 파일의 위치만 유지.
    const frames = value.slice(0, 12000).match(/(?:telemetry|auth|app|admin|register|server-settings)\.js(?:\?[^\s):]*)?:\d+:\d+/g) || [];
    return frames.map(frame => frame.replace(/\?[^:]*?(?=:\d+:\d+$)/, '')).join('\n').slice(0, 2000);
  }
  function report(kind, message, stack = '', actualBase) {
    try {
      // 늦게 실패한 이전 요청이 현재 fallback 주소를 되돌리지 않도록 요청별 목적지를 분리한다.
      const targetBase = actualBase === undefined ? apiBase : base(actualBase);
      if (!targetBase || total >= MAX_PER_PAGE) return;
      const payload = { kind: clean(kind, 40), message: clean(message, 1000), stack: safeStack(stack), page: safePage() };
      const key = JSON.stringify(payload);
      const now = Date.now();
      for (const [k, time] of seen) if (now - time >= DEDUP_MS) seen.delete(k);
      attempts = attempts.filter(time => now - time < 60000);
      if (seen.has(key) || attempts.length >= MAX_PER_MINUTE) return;
      seen.set(key, now); attempts.push(now); total++;
      // api()를 쓰지 않는다. await/retry/response parsing도 없어 전송 실패가 재귀하지 않는다.
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
      const finish = () => { if (timer !== null) clearTimeout(timer); };
      try {
        Promise.resolve(fetch(targetBase + '/v1/client-errors', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: key, credentials: 'omit', referrerPolicy: 'no-referrer',
          redirect: 'error', ...(controller ? { signal: controller.signal } : {})
        })).then(finish, finish);
      } catch { finish(); }
    } catch { /* 보고는 본 기능을 절대 방해하지 않는다. */ }
  }
  function setApiBase(value) { try { apiBase = base(value); } catch { apiBase = ''; } }
  window.TAILTRAIL_TELEMETRY = Object.freeze({ report, setApiBase });
  window.addEventListener('error', event => {
    try {
      report('error', event.message || 'Script/resource load failed', event.error?.stack || '');
    } catch { /* 접근 불가능한 오류 객체 */ }
  }, true);
  window.addEventListener('unhandledrejection', event => {
    try {
      const reason = event.reason;
      report('unhandledrejection', typeof reason === 'string' ? reason : (typeof reason?.message === 'string' ? reason.message : 'Unhandled rejection'), reason?.stack || '');
    } catch { /* 임의 객체는 직렬화하지 않는다. */ }
  });
})();
