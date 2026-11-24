// 관리자 '신청 승인' 탭 승인 완료 카드의 "임시 비밀번호 생성": 표시 조건·문구·계정 찾기를 화면 코드와 분리한 순수 함수(시험이 쉬워요).
// 서버는 메일을 보내지 않아요. 새 임시 비밀번호를 받아 승인 때와 같은 창(showSecret)에 보여 주고, '메일 보내기'를 눌러야 메일 앱이 열려요.
// 메일 주소는 응답의 마스킹 값만 화면에 써요. 비밀번호는 창에만 쓰고 저장소·로그에 남기지 않아요.
import { friendly } from './errors.js?v=0.1.6';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const resendPath = id => `/v1/admin/users/${encodeURIComponent(id)}/resend-temp-password`;
export const resendName = u => String(u?.displayName || u?.loginId || '이 사용자').trim() || '이 사용자';

/** 승인 완료 신청 행(r: id·login_id·display_name·status)에만 버튼을 그려요. */
export function regResendButton(r) {
  return r?.status === 'approved'
    ? `<button type="button" data-resend-reg="${esc(r.id)}" data-login="${esc(r.login_id)}" data-name="${esc(r.display_name)}" aria-label="${esc(resendName({ displayName: r.display_name, loginId: r.login_id }))}님의 임시 비밀번호 생성">임시 비밀번호 생성</button>`
    : '';
}

/** 신청 행에는 계정 id 가 없어 로그인 이메일(유일)로 사용자 목록에서 찾아요. 없으면 404, 사용 중이 아니면 409. */
export function findAccountId(users, loginId) {
  const key = String(loginId ?? '').trim().toLowerCase();
  const u = (users ?? []).find(x => String(x.loginId ?? '').trim().toLowerCase() === key);
  if (!u) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  if (u.status !== 'active') throw Object.assign(new Error('NOT_ACTIVE'), { status: 409 });
  return u.id;
}

export const resendConfirmHtml = u => `<h2>임시 비밀번호 생성</h2><p>${esc(resendName(u))}님의 새 임시 비밀번호를 만들까요? 기존 비밀번호는 더 이상 쓸 수 없어요.</p>`;

/** 응답의 마스킹 주소만 꺼내요(없으면 빈 문자열) */
export const maskedOf = r => { const v = r?.maskedEmail ?? r?.masked ?? null; return typeof v === 'string' && v ? v : ''; };

export const resendDone = (u, r) => { const m = maskedOf(r); return `${resendName(u)}님의 새 임시 비밀번호를 만들었어요${m ? ` (${m})` : ''}. 메일 앱에서 직접 보내 주세요. 기존 비밀번호는 더 이상 쓸 수 없어요.`; };

export function resendFail(err) {
  const status = Number(err?.status) || 0, code = String(err?.code ?? '').toUpperCase();
  if (code === 'NOT_FOUND' || status === 404) return '계정을 찾지 못했어요. 목록을 새로 고친 뒤 다시 해 보세요.';
  if (code === 'NOT_ACTIVE' || status === 409) return '승인된 계정에만 만들 수 있어요. 목록을 새로 고쳐 계정 상태를 확인해 주세요.';
  if (code === 'RATE_LIMITED' || status === 429) return '너무 자주 만들었어요. 몇 분 뒤에 다시 해 보세요.';
  if (status === 403 || status === 401) return '이 일을 할 권한이 없어요. 관리자 계정으로 다시 로그인해 주세요.';
  return friendly(err).text;
}
