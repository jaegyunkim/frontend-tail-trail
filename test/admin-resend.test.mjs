import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { regResendButton, findAccountId, resendPath, resendConfirmHtml, resendDone, resendFail } from '../admin-resend.js';

const r = { id: 3, login_id: 'na@naver.com', display_name: '나', status: 'approved' };
test('승인 완료 카드에만 버튼, 이름은 임시 비밀번호 생성', () => {
  assert.match(regResendButton(r), /data-resend-reg="3"[^>]*>임시 비밀번호 생성<\/button>/);
  for (const status of ['pending', 'rejected']) assert.equal(regResendButton({ ...r, status }), '');
});
test('로그인 이메일로 계정 찾기: 대소문자 무시, 없으면 404, 사용 중 아님 409', () => {
  const users = [{ id: 9, loginId: 'Na@Naver.com', status: 'active' }, { id: 10, loginId: 'x@y.kr', status: 'disabled' }];
  assert.equal(findAccountId(users, 'na@naver.com'), 9);
  assert.equal(assert.throws(() => findAccountId(users, 'no@y.kr')) , undefined);
  try { findAccountId(users, 'x@y.kr'); } catch (e) { assert.equal(e.status, 409); }
  try { findAccountId(users, 'no@y.kr'); } catch (e) { assert.equal(e.status, 404); }
});
test('경로와 문구', () => {
  assert.equal(resendPath(7), '/v1/admin/users/7/resend-temp-password');
  assert.match(resendConfirmHtml({ displayName: '나' }), /나님의 새 임시 비밀번호를 만들까요/);
  assert.equal(resendDone({ displayName: '나' }, { maskedEmail: 'na***@naver.com' }), '나님의 새 임시 비밀번호를 만들었어요 (na***@naver.com). 메일 앱에서 직접 보내 주세요. 기존 비밀번호는 더 이상 쓸 수 없어요.');
  assert.doesNotMatch(resendDone({ displayName: '나' }, {}), /\(/);
  const E = (status, code) => Object.assign(new Error('x'), { status, code });
  assert.match(resendFail(E(404)), /찾지 못했어요/); assert.match(resendFail(E(409)), /승인된 계정/); assert.match(resendFail(E(429)), /몇 분 뒤/); assert.match(resendFail(E(403)), /권한/);
});
test('admin.js: 신청 승인 카드에서만 연결, 사용자 표에는 다시 보내기 버튼 없음', () => {
  const a = fs.readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
  assert.match(a, /regResendButton\(r\)\+'<button class="danger" data-revoke-reg/);
  assert.match(a, /data-resend-reg/); assert.doesNotMatch(a, /data-a="resend"/);
});
