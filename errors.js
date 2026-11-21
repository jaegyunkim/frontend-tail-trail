// 일반 보호자가 알아듣는 오류 문구. 화면에 'x is not defined', 'Failed to fetch', 'HTTP 500' 같은 개발자용 문장이 그대로 보이지 않게 한다.
// 서버가 사람을 위해 쓴 한국어 문장(예: '아이디 또는 비밀번호가 맞지 않아요')은 그대로 보여 주고,
// 그 밖의 오류는 쉬운 말 + 짧은 오류 번호(예: 화면 APP-3F2A, 연결 NET, 서버 E500)를 붙인다. 번호는 문의할 때 알려 주면 원인을 찾는 데 쓴다.

const HANGUL = /[가-힣]/;
const NET = /Failed to fetch|NetworkError|Network request failed|Load failed|TimeoutError|AbortError|signal timed out|ERR_|net::|fetch failed/i;
const CODE_BUG = /is not defined|is not a function|is not iterable|Cannot read|Cannot access|undefined|\bnull\b|Unexpected token|SyntaxError|ReferenceError|TypeError|RangeError|Illegal|Maximum call|before initialization|InvalidState|NotAllowed|is not an? (object|element)/i;

/** 같은 오류는 같은 번호가 되게 하는 4자리 코드(문장 속 숫자·따옴표는 빼고 계산) */
export function shortHash(text) {
  let h = 5381; const s = String(text ?? '').replace(/[\d'"`]+/g, '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).toUpperCase().padStart(4, '0').slice(-4);
}

const HTTP = {
  400: '입력한 내용을 다시 확인해 주세요.',
  401: '로그인 시간이 지났어요. 다시 로그인해 주세요.',
  403: '이 기능을 쓸 수 있는 권한이 없어요.',
  404: '찾는 정보가 없어요. 화면을 새로 고친 뒤 다시 해 보세요.',
  408: '응답이 늦어지고 있어요. 잠시 뒤 다시 시도해 주세요.',
  413: '보내는 내용이 너무 길어요. 조금 줄여 주세요.',
  429: '요청이 너무 많아요. 1분쯤 기다렸다가 다시 시도해 주세요.'
};
const MSG_NET = '인터넷 연결이 불안정하거나 서버가 잠시 응답하지 않아요. 연결을 확인하고 잠시 뒤 다시 시도해 주세요.';
const MSG_APP = '화면을 불러오는 중 문제가 생겼어요. 화면을 새로 고친 뒤 다시 해 보세요.';
const MSG_SERVER = '서버가 잠시 불안정해요. 잠시 뒤 다시 시도해 주세요.';
const MSG_ETC = '일시적인 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.';

/**
 * 오류 → { text, code, tech }.
 *  text: 화면에 보일 문장(기술 오류면 끝에 '(오류 번호 …)' 포함), code: 오류 번호 또는 '', tech: 원래 메시지(보고용, 화면에는 안 보임)
 */
export function friendly(err, fallback = '') {
  const raw = typeof err === 'string' ? err : String(err?.message ?? '');
  const status = Number(err?.status) || 0, name = String(err?.name ?? '');
  const tag = (prefix, msg) => { const code = `${prefix}-${shortHash(raw || name)}`; return { text: `${msg} (오류 번호 ${code})`, code, tech: raw }; };
  if (status >= 500) { const code = `E${status}`; return { text: `${MSG_SERVER} (오류 번호 ${code})`, code, tech: raw }; }
  // 서버가 사람을 위해 쓴 한국어 문장은 그대로(로그인 실패, 한도 안내, 입력 확인 등)
  if (raw && HANGUL.test(raw) && !CODE_BUG.test(raw) && !NET.test(raw)) return { text: raw, code: '', tech: raw };
  if (NET.test(raw) || name === 'TimeoutError' || name === 'AbortError' || (status === 0 && !raw && name === 'TypeError')) return tag('NET', MSG_NET);
  if (HTTP[status]) return { text: HTTP[status], code: status >= 400 ? `E${status}` : '', tech: raw };
  if (CODE_BUG.test(raw) || /^(Reference|Type|Syntax|Range)Error$/.test(name)) return tag('APP', MSG_APP);
  if (raw && !HANGUL.test(raw)) return tag('ETC', MSG_ETC);        // 영문 메시지·알 수 없는 문장
  return { text: fallback || MSG_ETC, code: '', tech: raw };
}
export const errText = (err, fallback) => friendly(err, fallback).text;
