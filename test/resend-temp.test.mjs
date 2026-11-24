import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { approvalMailto } from '../approval-email.js';
import { canResend, maskEmail, confirmText, doneText, failText, mailFailText, resendTempPassword, resendPath } from '../resend-temp.js';

const active = { id: 7, loginId: 'dewey@gmail.com', displayName: '두이', status: 'active' };
function deps(over = {}) {
  const calls = [], notes = [], busy = [], mails = [];
  return { calls, notes, busy, mails, openMail: u => mails.push(u), api: async (p, o) => { calls.push([p, o]); return over.apiResult ?? { ok: true, tempPassword: 'pw-default' }; }, confirm: over.confirm ?? (() => true), note: (t, bad) => notes.push([t, !!bad]), setBusy: b => busy.push(b), ...over.extra };
}

test('버튼은 승인(활성) 계정에만 — 중지·승인 대기·거절은 숨김', () => {
  assert.equal(canResend(active), true);
  for (const status of ['disabled', 'pending', 'rejected', undefined]) assert.equal(canResend({ ...active, status }), false, String(status));
  assert.equal(canResend(null), false);
});
test('admin.js 사용자 표에서 canResend 일 때만 버튼을 그리고, 라이트 전용(다크 스타일 없음)', () => {
  const a = fs.readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
  assert.match(a, /\$\{canResend\(u\) \? `<button data-a="resend"/);
  assert.match(a, /임시 비밀번호 메일 다시 보내기|RESEND_LABEL/);
  assert.equal(fs.readFileSync(new URL('../resend-temp.js', import.meta.url), 'utf8').includes('prefers-color-scheme'), false);
  assert.match(fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8'), /admin\.js\?v=0\.1\.6-29/);
});
test('경로·가린 메일·확인 문구', () => {
  assert.equal(resendPath(7), '/v1/admin/users/7/resend-temp-password');
  assert.equal(maskEmail('dewey@gmail.com'), 'de***@gmail.com');
  assert.equal(maskEmail('a@x.kr'), 'a***@x.kr');
  assert.equal(maskEmail('admin'), 'ad***');
  assert.equal(confirmText('두이'), '두이님에게 새 임시 비밀번호를 메일로 보낼까요? 기존 비밀번호는 더 이상 쓸 수 없어요.');
});
test('확인 창에서 취소하면 호출하지 않아요', async () => {
  const d = deps({ confirm: () => false });
  assert.equal(await resendTempPassword(active, d), false);
  assert.equal(d.calls.length, 0); assert.equal(d.mails.length, 0); assert.equal(d.notes.length, 0); assert.equal(d.busy.length, 0);
});
test('활성이 아니면 확인 창도 호출도 없어요', async () => {
  let asked = 0; const d = deps({ confirm: () => { asked++; return true; } });
  assert.equal(await resendTempPassword({ ...active, status: 'disabled' }, d), false);
  assert.equal(asked, 0); assert.equal(d.calls.length, 0);
});
test('성공: POST 한 번 · 승인 메일과 같은 mailto 로 메일 앱 열기 · 화면 어디에도 비밀번호 없음', async () => {
  const d = deps({ apiResult: { ok: true, maskedEmail: 'de***@gmail.com', tempPassword: 'Zx9-SECRET-pw' } });
  assert.equal(await resendTempPassword(active, d), true);
  assert.equal(d.calls.length, 1); assert.equal(d.calls[0][0], '/v1/admin/users/7/resend-temp-password'); assert.equal(d.calls[0][1].method, 'POST');
  assert.deepEqual(d.mails, [approvalMailto('dewey@gmail.com', 'Zx9-SECRET-pw')]);
  assert.match(d.mails[0], /^mailto:dewey%40gmail\.com\?subject=/); assert.ok(d.mails[0].includes(encodeURIComponent('Zx9-SECRET-pw')));
  assert.deepEqual(d.notes, [[doneText('de***@gmail.com'), false]]);
  assert.match(d.notes[0][0], /de\*\*\*@gmail\.com/); assert.doesNotMatch(d.notes[0][0], /dewey@|SECRET/);
  assert.deepEqual(d.busy, [true, false]);
});
test('비밀번호는 화면·저장소·콘솔에 남지 않아요(모듈에 console·localStorage 없음)', () => {
  const src = fs.readFileSync(new URL('../resend-temp.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /console\.|localStorage|sessionStorage|innerHTML|textContent/);
  assert.doesNotMatch(src, /MAIL_FAILED|MAIL_NOT_CONFIGURED/);
});
test('오류별 쉬운 문구(없는 계정·승인 아님·너무 잦음·권한)와 버튼 복구, 메일 앱은 열지 않아요', async () => {
  const E = (status, code) => Object.assign(new Error('x'), { status, code });
  assert.match(failText(E(404, 'NOT_FOUND')), /찾지 못했어요/); assert.match(failText(E(409, 'NOT_ACTIVE')), /승인된 계정/); assert.match(failText(E(429, 'RATE_LIMITED')), /몇 분 뒤/); assert.match(failText(E(403)), /권한/); assert.match(failText(E(429)), /몇 분 뒤/);
  assert.match(failText(E(500)), /E500/);
  for (const e of [E(429, 'RATE_LIMITED'), E(403), E(409, 'NOT_ACTIVE'), E(404, 'NOT_FOUND')]) {
    const d = deps({ extra: { api: async () => { throw e; } } });
    assert.equal(await resendTempPassword(active, d), false);
    assert.equal(d.notes.length, 1); assert.equal(d.notes[0][1], true); assert.doesNotMatch(d.notes[0][0], /dewey@/);
    assert.equal(d.mails.length, 0); assert.deepEqual(d.busy, [true, false]);
  }
});
test('비밀번호가 응답에 없거나 메일 앱 열기가 실패하면 안내하고 버튼을 되돌려요', async () => {
  const d1 = deps({ apiResult: { ok: true, maskedEmail: 'de***@gmail.com' } });
  assert.equal(await resendTempPassword(active, d1), false);
  assert.deepEqual(d1.notes, [[mailFailText, true]]); assert.deepEqual(d1.busy, [true, false]);
  const d2 = deps({ apiResult: { tempPassword: 'pw-1' }, extra: { openMail: () => { throw new Error('x'); } } });
  assert.equal(await resendTempPassword(active, d2), false);
  assert.deepEqual(d2.notes, [[mailFailText, true]]); assert.doesNotMatch(d2.notes[0][0], /pw-1/);
});
test('진행 중에는 같은 계정을 다시 눌러도 호출이 겹치지 않아요', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const d = deps({ extra: { api: async (p) => { d.calls.push([p]); await gate; return { tempPassword: 'pw-x' }; } } });
  const first = resendTempPassword(active, d);
  assert.equal(await resendTempPassword(active, d), false);
  release(); assert.equal(await first, true); assert.equal(d.calls.length, 1);
  assert.equal(await resendTempPassword(active, deps()), true); // 끝난 뒤에는 다시 가능
});
