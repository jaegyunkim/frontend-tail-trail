// 로그인 전 안내와 관리자의 역할 선택에 사용한다. 실제 한도와 사용량은 서버 응답을 따른다.
export const ROLE_LABEL = Object.freeze({ admin: '관리자', tester: '내부 테스터', user: '베타 테스터' });
export const ROLE_LIMITS = Object.freeze({
  admin: Object.freeze({ sessionMinutes: 60, sessionMessages: 50, dailyMessages: 100, dailySessions: 20, dailyTokens: 10000 }),
  tester: Object.freeze({ sessionMinutes: 30, sessionMessages: 30, dailyMessages: 50, dailySessions: 20, dailyTokens: 3000 }),
  user: Object.freeze({ sessionMinutes: 10, sessionMessages: 10, dailyMessages: 10, dailySessions: 1, dailyTokens: 1000 })
});
// 로그인 횟수는 최근 24시간 기준(백엔드 계정별 로그인 한도), 질문은 한국 시간 날짜 기준이다.
export const DAY_NOTE = '로그인 횟수는 최근 24시간 기준이고, 산책 판단(질문) 횟수는 한국 시간 밤 12시에 초기화돼요.';
const COUNT_KO = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
/** 횟수를 우리말로: 1 → 한 번, 2 → 두 번 … 11 이상은 숫자 */
export const timesKo = v => { const k = Math.trunc(Number(v) || 0); return (COUNT_KO[k] ?? k.toLocaleString('ko-KR')) + ' 번'; };
const num = v => Number(v || 0).toLocaleString('ko-KR');
/** 분을 우리말로: 90 → 1시간 30분 */
export const minutesKo = v => { const m = Math.trunc(Number(v) || 0), h = Math.floor(m / 60), r = m % 60; return h ? `${h}시간${r ? ` ${r}분` : ''}` : `${m}분`; };
const kstShort = v => new Date(v).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 역할 기본값(또는 서버가 알려 준 기본값 L) 안내 한 줄 */
export function policyText(role, L = ROLE_LIMITS[role]) {
  return `${ROLE_LABEL[role]}: 24시간에 ${timesKo(L.dailySessions)} 로그인, 로그인 1회 ${L.sessionMinutes}분, 로그인 1번에 질문 ${L.sessionMessages}건, 하루 질문 ${L.dailyMessages}건`;
}
/** 관리자 한도 창: 입력값을 그대로 풀어 쓴 안내(예: 하루 로그인 2·세션 20분 → 24시간에 두 번, 한 번에 20분·하루 최대 40분) */
export function limitsText(L) {
  const total = Number(L.sessionMinutes) * Number(L.dailySessions);
  return `이 계정은 24시간에 ${timesKo(L.dailySessions)} 로그인할 수 있고, 로그인할 때마다 ${minutesKo(L.sessionMinutes)} 동안 이용할 수 있어요(하루 최대 ${minutesKo(total)}). 산책 판단은 로그인 1번에 ${num(L.sessionMessages)}건·하루 ${num(L.dailyMessages)}건까지예요.`;
}
/** 다음 로그인 안내. logins = 서버의 { limit, used, left, nextAt } (최근 24시간 로그인 현황) */
export function nextLoginText(logins) {
  if (!logins) return '남은 로그인 횟수를 확인할 수 없어요.';
  if (logins.left > 0) return `앞으로 24시간 안에 ${timesKo(logins.left)} 더 로그인할 수 있어요(24시간에 ${timesKo(logins.limit)}).`;
  return `24시간 동안 로그인할 수 있는 ${timesKo(logins.limit)}을 모두 썼어요.${logins.nextAt ? ` 다음 로그인: ${kstShort(logins.nextAt)}` : ' 가장 이른 로그인 시각부터 24시간이 지나면 다시 이용할 수 있어요.'}`;
}
/** 로그아웃 확인창 안내(이용 조건). 서버 응답이 없으면 추측하지 않는다. */
export function logoutUsage(logins, limits) {
  if (!logins || !limits) return `오늘 남은 로그인 횟수를 확인할 수 없어요. ${DAY_NOTE}`;
  return `${nextLoginText(logins)} ${DAY_NOTE}`;
}
