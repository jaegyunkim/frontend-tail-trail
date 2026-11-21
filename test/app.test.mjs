import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
test('비밀키가 프런트에 없다', () => { for (const f of ['app.js', 'auth.js', 'config.js', 'admin.js', 'approval-email.js', 'register.js', 'index.html']) assert.doesNotMatch(read(f), /(yk_live_[0-9a-f]{8}|mr_[a-z]+_[A-Za-z0-9-]{8}|xoxb-\d|ntn_\d{6}|serviceKey=[A-Za-z0-9%])/); });
test('기본 API 는 HTTPS /tail-trail 경로, 로컬 기본 포트 8889', () => { assert.match(read('config.js'), /TAILTRAIL_API = 'https:\/\/[^']+\/tail-trail'/); assert.match(read('auth.js'), /localhost:8889/); });
test('북 워킹의 책·예스24·오디오 문구가 남지 않는다', () => { for (const f of ['index.html', 'app.js', 'role-policy.js', 'approval-email.js']) assert.doesNotMatch(read(f), /예스24|오디오 워킹|책장|북 워킹|BOOKWALKING/, f); });
test('index.html 의 스크립트·스타일 버전이 같다', () => { const v = [...read('index.html').matchAll(/\?v=([\d.]+)/g)].map(m => m[1]); assert.ok(v.length >= 3); assert.equal(new Set(v).size, 1); });
test('로그인 아이디·비밀번호 칸에 ⓧ 지우기 버튼', () => { const h = read('index.html'); for (const id of ['loginId', 'loginPw']) assert.match(h, new RegExp(`<span class="clearable[^"]*"><input id="${id}" data-clearable[^>]*><button type="button" class="clear-btn"[^>]*hidden><svg[^>]*><circle`)); assert.match(read('app.js'), /input\[data-clearable\]/); });
test('하단 메뉴: 오늘·주변·꼬리일기·우리 아이·의견', () => { const h = read('index.html'); for (const t of ['plan', 'near', 'diary', 'dogs', 'opinion']) { assert.match(h, new RegExp(`<button data-tab="${t}"`)); assert.match(h, new RegExp(`<section id="tab-${t}"`)); } });
test('app.js 가 쓰는 #id 는 모두 index.html 에 있다', () => {
  const js = read('app.js'), html = read('index.html'), dynamic = new Set(['stepName', 'planQuotaTag', 'btnToDiary', 'placeSaveCur', 'placeManage', 'btnPlay']);
  const ids = new Set([...js.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map(m => m[1])), have = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  assert.deepEqual([...ids].filter(i => !have.has(i) && !dynamic.has(i)), []);
});
test('오늘 화면: 우리 아이 → 출발지 → 날짜 → 판단하기, 한 번에 보내는 값은 출발지·날짜·아이뿐', () => {
  const h = read('index.html'), a = read('app.js');
  assert.ok(h.indexOf('id="dogChips"') < h.indexOf('id="placeChips"') && h.indexOf('id="placeChips"') < h.indexOf('id="dateChips"') && h.indexOf('id="dateChips"') < h.indexOf('id="btnPlan"'));
  assert.match(a, /JSON\.stringify\(\{ origin, date: dateValue\(\), dogId: sel\.dogId \?\? undefined \}\)/);
});
test('결과 화면: 판단 카드·시간대 막대·노면 추정 표시·응급·병원·미용·애견샵·전화 링크', () => {
  const a = read('app.js');
  for (const k of ['dog-hero', 'hour-bars', '노면 최고(추정)', 'sec emergency', '🏥 동물병원', '✂️ 애견 미용', '🛍️ 애견샵·용품', 'href="tel:']) assert.ok(a.includes(k), k);
  
});
test('인허가 확인 표시·미확인 표시·반려동물 동반 조건·약국/펫호텔 종류', () => {
  const a = read('app.js');
  for (const k of ['인허가 확인', '인허가 정보 미확인', 'class="pet-cond"', "id: 'pharmacy'", "id: 'boarding'", 'x.licensed === true', 'x.licensed === false']) assert.ok(a.includes(k), k);
  assert.match(a, /영업시간·휴무와 반려견 출입은 확인하지 못한 정보라/);
});
test('노면 온도는 추정값이라고 항상 밝힌다', () => assert.match(read('app.js'), /기온·하늘 상태로 계산, 실측 아님/));
test('꼬리일기: 장소·시간·기분·배변·한 줄, 사진·정확한 위치는 받지 않는다', () => { const h = read('index.html'); for (const id of ['diaryPlace', 'diaryDog', 'diaryDate', 'diaryMinutes', 'diaryPoop', 'diaryMood', 'diaryNote']) assert.ok(h.includes(`id="${id}"`), id); assert.doesNotMatch(h, /type="file"/); assert.match(h, /사진과 정확한 위치는 저장하지 않아요/); });
test('우리 아이: 크기·나이·단두종·털만 받는다(견종·사진 없음)', () => { const h = read('index.html'); for (const id of ['dogName', 'dogSize', 'dogAge', 'dogFlat', 'dogCoat']) assert.ok(h.includes(`id="${id}"`), id); assert.doesNotMatch(h, /견종 선택|type="file"/); });
test('화면 문구는 해요체(합니다·십시오체가 남지 않음)', () => { for (const f of ['index.html', 'register.html', 'app.js', 'register.js', 'admin.js', 'auth.js', 'role-policy.js']) assert.doesNotMatch(read(f).replace(/감사합니다/g, ''), /[가-힣](습니다|십시오|됩니다|합니다|입니다)(?![가-힣])/, f); });
test('머리줄 로고·이름을 누르면 홈(오늘 탭)으로', () => { assert.match(read('index.html'), /<a class="brand" id="brandHome" href="\.\/"/); assert.match(read('app.js'), /\$\('#brandHome'\)\.onclick = e => \{ e\.preventDefault\(\); go\('plan'\); \}/); });
test('비밀번호 칸: 지우기와 보기 버튼 공존, 로그인 때 다시 가림', () => { const h = read('index.html'), a = read('app.js'); assert.match(h, /class="eye-btn" id="pwToggle" aria-label="비밀번호 보기" aria-pressed="false"/); assert.match(a, /setPwVisible\(false\); \/\/ 보낼 때는 다시 가린다/); });
test('출발지 고르기: 선택 배너 · 현재 위치 · 자주 걷는 곳 타일 · 글자 버튼', () => { const a = read('app.js'); for (const c of ['origin-gps', 'origin-sub', 'origin-places', 'origin-tile', 'origin-actions', 'origin-link']) assert.match(a, new RegExp(`class="${c}"`)); });
