// 일반 보호자가 보는 오류 문구: 개발자용 영문 메시지가 그대로 나가지 않고, 문의용 오류 번호가 붙는다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { friendly, errText, shortHash } from '../errors.js';

const hangul = /[가-힣]/;
test('화면 오류(x is not defined 등)는 쉬운 말 + 오류 번호(APP-XXXX), 영문 원문은 화면에 없다', () => {
  for (const m of ['originValue is not defined', "Cannot read properties of undefined (reading 'x')", 'x is not a function', 'Unexpected token < in JSON']) {
    const f = friendly(new ReferenceError(m));
    assert.match(f.text, /화면을 불러오는 중 문제가 생겼어요/); assert.match(f.code, /^APP-[0-9A-F]{4}$/); assert.match(f.text, new RegExp(`\\(오류 번호 ${f.code}\\)`));
    assert.ok(!/defined|undefined|function|token|Cannot/i.test(f.text), f.text); assert.equal(f.tech, m);
  }
});
test('같은 오류는 같은 번호, 다른 오류는 다른 번호(숫자·따옴표 차이는 무시)', () => {
  assert.equal(friendly(new Error('a is not defined')).code, friendly(new Error('a is not defined')).code);
  assert.notEqual(friendly(new Error('a is not defined')).code, friendly(new Error('b is not defined')).code);
  assert.equal(shortHash("x 12 'q'"), shortHash('x 99 "q"')); assert.match(shortHash('abc'), /^[0-9A-F]{4}$/);
});
test('인터넷·서버 연결 문제는 NET 번호와 쉬운 안내', () => {
  for (const e of [new TypeError('Failed to fetch'), Object.assign(new Error('x'), { name: 'TimeoutError' }), new Error('NetworkError when attempting to fetch resource.'), new Error('Load failed')]) {
    const f = friendly(e); assert.match(f.text, /인터넷 연결이 불안정/); assert.match(f.code, /^NET-/);
  }
});
test('서버 오류(5xx)는 E번호, 기술 문구는 숨긴다', () => {
  const f = friendly(Object.assign(new Error('HTTP 502'), { status: 502 })); assert.equal(f.code, 'E502'); assert.match(f.text, /서버가 잠시 불안정/); assert.ok(!/HTTP/.test(f.text));
  assert.equal(friendly(Object.assign(new Error('서버 처리 오류'), { status: 500 })).code, 'E500');
});
test('4xx 영문 HTTP 오류는 상황별 쉬운 문장', () => {
  assert.match(errText(Object.assign(new Error('HTTP 401'), { status: 401 })), /로그인 시간이 지났어요/);
  assert.match(errText(Object.assign(new Error('HTTP 403'), { status: 403 })), /권한이 없어요/);
  assert.match(errText(Object.assign(new Error('HTTP 404'), { status: 404 })), /찾는 정보가 없어요/);
  assert.match(errText(Object.assign(new Error('HTTP 429'), { status: 429 })), /요청이 너무 많아요/);
});
test('서버가 사람을 위해 쓴 한국어 문장은 그대로 보인다(로그인 실패·한도·입력 확인)', () => {
  for (const m of ['아이디 또는 비밀번호가 맞지 않아요 (1/5)', "'앤비'은(는) 이미 저장되어 있어요", '오늘 만들 수 있는 산책 판단 횟수를 모두 썼어요.']) { const f = friendly(Object.assign(new Error(m), { status: 400 })); assert.equal(f.text, m); assert.equal(f.code, ''); }
});
test('영문뿐인 알 수 없는 메시지도 쉬운 말(ETC 번호), 빈 오류는 기본 문장', () => {
  assert.match(friendly(new Error('Something broke')).code, /^ETC-/); assert.ok(hangul.test(errText('weird failure')));
  assert.ok(hangul.test(errText(undefined))); assert.equal(errText(null, '직접 정한 문장'), '직접 정한 문장');
});
test('화면·관리자·신청 코드가 오류 문장을 errText 로 바꿔 보여 준다(e.message 를 그대로 화면에 넣지 않는다)', () => {
  for (const f of ['app.js', 'admin.js', 'register.js']) {
    const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.match(src, /from '\.\/errors\.js\?v=[\d.]+'/, f); assert.doesNotMatch(src, /\b(?:err|e)\.message\b(?!s)/, f + ' 에 e.message 가 남아 있어요');
  }
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /window\.addEventListener\('unhandledrejection'/); assert.match(app, /try \{ drawForm\(\); \} catch \(e\) \{ uiError\(e\); \}/);
});
