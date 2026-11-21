import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_LIMITS, policyText, logoutUsage, limitsText, nextLoginText, timesKo, minutesKo } from '../role-policy.js';

for (const [role, values] of Object.entries({ admin: [60,50,100,20,10000], tester: [30,30,50,20,3000], user: [10,10,10,1,1000] })) {
  test(`${role}: 역할 안내와 남은 로그인(최근 24시간)`, () => {
    const [sessionMinutes, sessionMessages, dailyMessages, dailySessions, dailyTokens] = values;
    assert.deepEqual(ROLE_LIMITS[role], {sessionMinutes, sessionMessages, dailyMessages, dailySessions, dailyTokens});
    assert.ok(policyText(role).includes(`24시간에 ${timesKo(dailySessions)} 로그인`));
    assert.ok(policyText(role).includes(`로그인 1회 ${sessionMinutes}분`));
    const left = dailySessions - 1;
    const text = logoutUsage({ limit: dailySessions, used: 1, left, nextAt: left ? null : '2026-11-22T01:00:00Z' }, ROLE_LIMITS[role]);
    assert.ok(left ? text.includes(`${timesKo(left)} 더 로그인`) : text.includes('모두 썼어요'), text);
  });
}
test('서버 기본값을 받으면 그 값으로 안내한다', () => assert.ok(policyText('user', { ...ROLE_LIMITS.user, dailySessions: 3, sessionMinutes: 20 }).includes('24시간에 세 번 로그인, 로그인 1회 20분')));
test('사용량 조회 실패 시 남은 횟수를 추측하지 않는다', () => assert.match(logoutUsage(null, null), /확인할 수 없어요/));
test('한도 창 안내: 입력값을 그대로 풀어 쓴다', () => {
  const t = limitsText({ sessionMinutes: 20, sessionMessages: 10, dailyMessages: 30, dailySessions: 2, dailyTokens: 5000 });
  assert.ok(t.includes('24시간에 두 번 로그인'), t);
  assert.ok(t.includes('20분 동안 이용'), t);
  assert.ok(t.includes('하루 최대 40분'), t);
  assert.ok(t.includes('하루 30건'), t);
  assert.equal(minutesKo(90), '1시간 30분'); assert.equal(minutesKo(120), '2시간'); assert.equal(timesKo(12), '12 번');
});
test('횟수를 다 쓰면 다음 로그인 시각(한국 시간)을 알려 준다', () => {
  const t = nextLoginText({ limit: 2, used: 2, left: 0, nextAt: '2026-11-21T15:30:00Z' });
  assert.match(t, /두 번을 모두 썼어요/); assert.match(t, /다음 로그인: 11\. 22\./);
});
test('서버가 돌려준 역할·한도·만료 시각으로 기존 세션을 동기화한다', async () => {
  globalThis.location = {search: '', hostname: 'localhost'};
  globalThis.window = {};
  const store = new Map();
  globalThis.localStorage = globalThis.sessionStorage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v) };
  const { saveAuth, syncAccount, sessionMinutes, remaining, state, loginQuota } = await import('../auth.js');
  saveAuth({ token: 'test', minutes: 30, user: {role: 'tester'} });
  syncAccount({ role: 'admin', user: {role: 'admin'}, limits: ROLE_LIMITS.admin, remainingSec: 42, logins: { limit: 20, used: 3, left: 17, nextAt: null } });
  assert.equal(sessionMinutes(), 60);
  assert.equal(remaining(), 42);
  assert.equal(state.auth.user.role, 'admin');
  assert.equal(loginQuota().left, 17);
  assert.deepEqual(JSON.parse(store.get('tailtrail.auth')).user.limits, ROLE_LIMITS.admin);
});
