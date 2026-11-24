// 관리자 화면 "임시 비밀번호 메일 다시 보내기": 판단·문구·호출 흐름을 화면 코드와 분리해 둔 모듈(시험이 쉬워요).
// 서버는 메일을 보내지 않아요. 새 임시 비밀번호를 받아 승인 때와 같은 메일(approvalMailto)로 메일 앱만 열어요.
// 비밀번호는 메일 본문에만 쓰고, 화면·저장소·로그에 남기지 않아요.
import { friendly } from './errors.js?v=0.1.6';
import { approvalMailto } from './approval-email.js?v=0.1.6';

export const RESEND_LABEL = '임시 비밀번호 메일 다시 보내기';
export const resendPath = id => `/v1/admin/users/${encodeURIComponent(id)}/resend-temp-password`;

/** 승인(활성) 계정에만 버튼을 보여 줘요. 중지·잠김과 상관없이 status 가 'active' 일 때만. */
export const canResend = u => u?.status === 'active';

/** 메일 주소는 앞 두 글자만 남기고 가려요: de***@gmail.com (영문 아이디면 그대로 가려서 보여요) */
export function maskEmail(loginId) {
  const s = String(loginId ?? ''); const at = s.indexOf('@');
  if (at < 0) return s.length <= 2 ? s.slice(0, 1) + '***' : s.slice(0, 2) + '***';
  const local = s.slice(0, at), domain = s.slice(at + 1);
  return (local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2)) + '***@' + domain;
}

export const confirmText = name => `${name}님에게 새 임시 비밀번호를 메일로 보낼까요? 기존 비밀번호는 더 이상 쓸 수 없어요.`;
export const doneText = masked => `${masked} 로 보낼 메일을 메일 앱에서 열었어요. 내용을 확인하고 직접 보내 주세요. 기존 비밀번호는 더 이상 쓸 수 없어요.`;
export const mailFailText = '새 비밀번호는 만들어졌지만 메일 앱을 열지 못했어요. 기기의 기본 메일 앱 설정을 확인한 뒤, 버튼을 다시 눌러 새로 보내 주세요.';

/** 서버 오류 → 쉬운 문구(없는 계정·승인 아닌 계정·너무 잦은 요청·권한). 그 밖은 공통 오류 문구. */
export function failText(err) {
  const status = Number(err?.status) || 0, code = String(err?.code ?? '').toUpperCase();
  if (code === 'NOT_FOUND' || status === 404) return '계정을 찾지 못했어요. 목록을 새로 고친 뒤 다시 해 보세요.';
  if (code === 'NOT_ACTIVE' || status === 409) return '승인된 계정에만 보낼 수 있어요. 목록을 새로 고쳐 계정 상태를 확인해 주세요.';
  if (code === 'RATE_LIMITED' || status === 429) return '너무 자주 보냈어요. 몇 분 뒤에 다시 해 보세요.';
  if (status === 403 || status === 401) return '이 일을 할 권한이 없어요. 관리자 계정으로 다시 로그인해 주세요.';
  return friendly(err).text;
}

const inflight = new Set();
/**
 * 확인 창 → 호출 → 메일 앱 열기 → 알림. 진행 중인 계정은 다시 누를 수 없어요(중복 호출 없음).
 * deps: { api, confirm, note, openMail, setBusy } — 화면에서 주입해요.
 */
export async function resendTempPassword(u, { api, confirm, note, openMail, setBusy = () => {} }) {
  if (!canResend(u)) return false;
  const key = String(u.id);
  if (inflight.has(key)) return false;
  if (!confirm(confirmText(u.displayName || u.loginId))) return false;
  inflight.add(key); setBusy(true);
  let out = null;
  try {
    try { out = await api(resendPath(u.id), { method: 'POST', body: '{}' }); }
    catch (e) { note(failText(e), true); return false; }
    try { openMail(approvalMailto(u.loginId, out?.tempPassword)); }
    catch { note(mailFailText, true); return false; }
    note(doneText(out?.maskedEmail || maskEmail(u.loginId))); return true;
  } finally { out = null; inflight.delete(key); setBusy(false); }
}
