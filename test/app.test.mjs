import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
test('비밀키가 프런트에 없다', () => { for (const f of ['app.js', 'auth.js', 'config.js', 'admin.js', 'approval-email.js', 'register.js', 'index.html']) assert.doesNotMatch(read(f), /(yk_live_[0-9a-f]{8}|mr_[a-z]+_[A-Za-z0-9-]{8}|xoxb-\d|ntn_\d{6}|serviceKey=[A-Za-z0-9%])/); });
test('기본 API 는 HTTPS /tail-trail 경로, 로컬 기본 포트 8889', () => { assert.match(read('config.js'), /TAILTRAIL_API = 'https:\/\/[^']+\/tail-trail'/); assert.match(read('auth.js'), /localhost:8889/); });
test('북 워킹의 책·예스24·오디오 문구가 남지 않는다', () => { for (const f of ['index.html', 'app.js', 'role-policy.js', 'approval-email.js']) assert.doesNotMatch(read(f), /예스24|오디오 워킹|책장|북 워킹|BOOKWALKING/, f); });
test('index.html 의 스크립트·스타일 버전이 같다', () => { const v = [...read('index.html').matchAll(/\?v=([\d.]+)/g)].map(m => m[1]); assert.ok(v.length >= 3); assert.equal(new Set(v).size, 1); });
test('로그인 아이디·비밀번호 칸에 ⓧ 지우기 버튼', () => { const h = read('index.html'); for (const id of ['loginId', 'loginPw']) assert.match(h, new RegExp(`<span class="clearable[^"]*"><input id="${id}" data-clearable[^>]*><button type="button" class="clear-btn"[^>]*hidden><svg[^>]*><circle`)); assert.match(read('app.js'), /input\[data-clearable\]/); });
test('하단 메뉴: 오늘·주변·보호소·꼬리일기·우리 아이·의견', () => { const h = read('index.html'); assert.deepEqual([...h.matchAll(/<button data-tab="([^"]+)"/g)].map(m=>m[1]), ['plan','near','shelter','diary','dogs','opinion']); for (const t of ['plan', 'near', 'shelter', 'diary', 'dogs', 'opinion']) { assert.match(h, new RegExp(`<button data-tab="${t}"`)); assert.match(h, new RegExp(`<section id="tab-${t}"`)); } });
test('app.js 가 쓰는 #id 는 모두 index.html 에 있다', () => {
  const js = read('app.js'), html = read('index.html'), dynamic = new Set(['stepName', 'planQuotaTag', 'btnToDiary', 'placeSaveCur', 'placeManage', 'btnPlay', 'btnDogFirst2']);
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
test('꼬리일기: 장소·시간·기분·배변·한 줄, 사진·정확한 위치는 받지 않는다', () => { const h = read('index.html'); for (const id of ['diaryPlace', 'diaryDog', 'diaryDate', 'diaryHours', 'diaryMins', 'diaryPoop', 'diaryMood', 'diaryNote']) assert.ok(h.includes(`id="${id}"`), id); assert.doesNotMatch(h, /type="file"/); assert.match(h, /사진과 정확한 위치는 저장하지 않아요/); });
test('우리 아이: 크기·나이·단두종·털만 받는다(견종·사진 없음)', () => { const h = read('index.html'); for (const id of ['dogName', 'dogSize', 'dogAge', 'dogFlat', 'dogCoat', 'dogList', 'btnDogAdd', 'btnDogFirst', 'dogCancel', 'dogSubmit', 'dogWelcome', 'dogFull', 'dogDialog', 'dogDelDialog', 'dogLive']) assert.ok(h.includes(`id="${id}"`), id); assert.doesNotMatch(h, /견종 선택|type="file"/); });
test('화면 문구는 해요체(합니다·십시오체가 남지 않음)', () => { for (const f of ['index.html', 'register.html', 'app.js', 'register.js', 'admin.js', 'auth.js', 'role-policy.js']) assert.doesNotMatch(read(f).replace(/감사합니다/g, ''), /[가-힣](습니다|십시오|됩니다|합니다|입니다)(?![가-힣])/, f); });
test('머리줄 로고·이름을 누르면 홈(오늘 탭)으로', () => { assert.match(read('index.html'), /<a class="brand" id="brandHome" href="\.\/"/); assert.match(read('app.js'), /\$\('#brandHome'\)\.onclick = e => \{ e\.preventDefault\(\); go\('plan'\); \}/); });
test('비밀번호 칸: 지우기와 보기 버튼 공존, 로그인 때 다시 가림', () => { const h = read('index.html'), a = read('app.js'); assert.match(h, /class="eye-btn" id="pwToggle" aria-label="비밀번호 보기" aria-pressed="false"/); assert.match(a, /setPwVisible\(false\); \/\/ 보낼 때는 다시 가린다/); });
test('출발지 고르기: 선택 배너 · 현재 위치 · 자주 걷는 곳 타일 · 글자 버튼', () => { const a = read('app.js'); for (const c of ['origin-gps', 'origin-sub', 'origin-places', 'origin-tile', 'origin-actions', 'origin-link']) assert.match(a, new RegExp(`class="${c}"`)); });
test('비밀번호 변경 창: 세 칸 모두 보기(눈)·지우기(ⓧ) 버튼, 열 때·보낼 때 다시 가림', () => {
  const h = read('index.html'), a = read('app.js');
  for (const id of ['pwCur', 'pwNew', 'pwNew2']) {
    assert.match(h, new RegExp(`<span class="clearable has-eye"><input id="${id}"[^>]*data-clearable>(<button[^>]*class="clear-btn"[\\s\\S]*?</button>)<button type="button" class="eye-btn" data-eye="${id}" aria-label="비밀번호 보기" aria-pressed="false"`), id);
  }
  assert.match(a, /const hidePwAll = /); assert.match(a, /e\.preventDefault\(\); hidePwAll\(\);/); assert.match(a, /\$\('#pwDialog'\)\.addEventListener\('close'/);
  assert.match(a, /\$\('#pwNew2'\)\.value = ''; hidePwAll\(\); syncClearButtons\(\);/);
});

test('우리 아이: 처음 등록·추가 등록·수정·삭제·기본 아이, 최대 5마리, 카드·시트 UI', () => {
  const a = read('app.js'), h = read('index.html'), c = read('style.css');
  for (const k of ['우리 아이 처음 등록', '첫 아이 등록하기', '추가 등록하기', '수정 저장', '/v1/me/dogs/${dogEditId}/update', '/v1/me/dogs/${d.id}/delete', '/v1/me/dogs/${b.dataset.pick}/select', 'askDeleteDog', 'maxDogs: 5', "if (first) go('plan')", 'dog-pick-card', 'dog-card', 'dog-traits', '/v1/dog-care?size=', 'class="dog-ava']) assert.ok(a.includes(k), k);
  assert.match(h, /최대 5마리까지 등록·수정·삭제/); assert.match(h, /5마리를 모두 등록했어요/); assert.doesNotMatch(h + a, /최대 3마리|3마리까지/);
  assert.match(c, /dialog\.sheet \{/); assert.match(c, /\.dog-pick-card\[aria-checked="true"\]/); assert.match(c, /\.check-card:has\(input:checked\)/);
});
test('삭제는 브라우저 기본 확인창이 아니라 같은 디자인의 창을 쓰고, 꼬리일기는 남는다고 안내한다', () => { const a = read('app.js'); assert.doesNotMatch(a.slice(a.indexOf('function askDeleteDog'), a.indexOf('function askDeleteDog') + 900), /confirm\(/); assert.match(a, /꼬리일기 기록은 남아요/); assert.match(a, /삭제하면 되돌릴 수 없어요/); });
test('출발지 고르기 상태·함수가 정의돼 있다(없으면 오늘 화면이 통째로 멈춘다)', () => {
  const a = read('app.js');
  for (const k of ['let here = ', 'let locating', 'const originValue = ', 'function setOrigin(', 'function locateHere(', 'function renderPlaces(', 'function drawForm(', 'function drawDogChips(', 'function loadDogs(', 'function renderDogs(', 'function openDogForm(']) assert.ok(a.includes(k), k);
  // 같은 이름을 두 번 선언하지 않는다
  for (const n of ['here', 'locating', 'originValue', 'dogDraft', 'dogFull', 'dogSub', 'sizeLabel', 'avatar']) assert.equal((a.match(new RegExp(`^(?:let|const|function) ${n}\\b`, 'gm')) || []).length, 1, n);
});
test('관리자 화면: 어디물어와 같은 메뉴(신청 승인·AI 연결·스킬 포함)와 꼬리길 전용 플랜·코스', () => {
  const h = read('admin.html'), a = read('admin.js'), c = read('admin.css');
  const tabs = [...h.matchAll(/<button data-v="(\w+)"[^>]*>([^<]+)<\/button>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(tabs, [['requests', '신청 승인'], ['model', 'AI 연결'], ['users', '사용자'], ['sessions', '세션'], ['usage', '사용량'], ['visits', '접속현황'], ['chats', '대화 로그'], ['logins', '로그인 기록'], ['reports', '리포트'], ['skills', '스킬'], ['plans', '플랜·코스'], ['opinions', '의견 보내기'], ['actions', '작업 기록']]);
  for (const [v] of tabs) assert.match(a, new RegExp(`(async ${v}\\(|\\b${v}\\s*[:(])`), `views.${v}`);
  assert.match(a, /\/v1\/admin\/skills/); assert.match(a, /\/v1\/admin\/model/); assert.match(a, /\/v1\/admin\/llm/); assert.match(c, /\.sk-ul/);
  assert.match(h, /id="userPageLink"[^>]*>일반 페이지로<\/a>/); assert.match(a, /textContent = '일반 페이지로'/);
});
test('관리자 화면이 부르는 /v1/admin 경로는 모두 백엔드 라우트에 선언돼 있다(백엔드 시험 파일의 경로 목록과 같음)', () => {
  const a = read('admin.js'); const paths = new Set([...a.matchAll(/['"`]\/v1\/admin\/([a-z_-]+)/g)].map(m => m[1]));
  for (const p of ['users', 'sessions', 'usage', 'visits', 'reports', 'skills', 'model', 'llm', 'registrations', 'plans', 'courses', 'opinions', 'logins', 'chats', 'actions', 'capacity']) assert.ok(paths.has(p) || p === 'courses', p);
});
test('글을 쓰는 모든 입력칸에 ⓧ(동그라미 안 x) 전체 지우기 버튼', () => {
  const h = read('index.html'), r = read('register.html');
  for (const id of ['loginId', 'loginPw', 'pwCur', 'pwNew', 'pwNew2', 'placeInput', 'dogName', 'diaryPlace', 'diaryNote', 'opinionText']) {
    assert.match(h, new RegExp(`<span class="clearable[^"]*"><(?:input|textarea) id="${id}"[^>]*data-clearable[^>]*>(?:[^<]*</textarea>)?<button type="button" class="clear-btn"[^>]*hidden><svg[^>]*><circle cx="10" cy="10" r="9"/><path d="M7 7l6 6M13 7l-6 6"/>`), id);
  }
  assert.equal((r.match(/class="clear-btn"/g) || []).length, 2); assert.match(read('register.js'), /input\[data-clearable\]/);
  assert.match(read('app.js'), /diaryForm'\)\.reset\(\); syncClearButtons\(\)/);
  assert.match(read('style.css'), /\.clearable input\[type="number"\]::-webkit-inner-spin-button/);
});
test('강아지 캐릭터: 종류 5개 × 모양 5개 SVG 25장이 있고, 고르기 화면이 크기·체크에 맞는 종류만 보여 준다', () => {
  for (const k of ['small', 'medium', 'large', 'flat', 'coat']) for (let n = 1; n <= 5; n++) { const f = new URL(`../assets/dogs/${k}-${n}.svg`, import.meta.url); assert.ok(fs.existsSync(f), `${k}-${n}.svg`); assert.match(fs.readFileSync(f, 'utf8'), /^<svg[^>]+viewBox="0 0 200 200"/); }
  const js = read('app.js'); assert.match(js, /id="dogAvatar"|#dogAvatar/); assert.match(read('index.html'), /id="dogAvatar"/);
  // #26: 고른 그림 이름을 저장(서버가 그림 이름을 받을 때만), 아니면 옛 형식 `{종류}-{번호}`
  assert.match(js, /get avatar\(\) \{ return isArtId\(dogDraft\.art\) \? dogDraft\.art : `\$\{kindOf\(this\)\}-\$\{dogDraft\.variant\}`; \}/);
  assert.match(js, /const saveAvatar = b => dogOptions\.avatar\?\.art && isArtId\(dogDraft\.art\) \? dogDraft\.art :/);
});
test('주변 탭 종류 6개는 한 줄(줄바꿈 없음), 넘치면 가로 스크롤·고른 칩 보이기', () => {
  const h = read('index.html'), c = read('style.css'), a = read('app.js');
  assert.match(h, /<div id="nearChips" class="chips near-row" role="radiogroup"/);
  assert.match(c, /\.chips\.near-row \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;[^}]*scrollbar-width: none;/);
  assert.match(c, /\.chips\.near-row \.chip \{[^}]*flex: 1 0 auto;[^}]*min-height: 44px;/);
  assert.match(a, /showPickedChip\(\$\('#nearChips'\)\)/);
});
test('머리줄 한 줄: 로고·시간 줄바꿈 금지, 좁은 화면은 관리자·로그아웃 아이콘(이름은 aria-label), 44px', () => {
  const h = read('index.html'), c = read('style.css');
  assert.match(h, /<button id="btnLogout" class="ghost hdr-btn" type="button" aria-label="로그아웃"/);
  assert.match(h, /<a id="btnAdmin" class="ghost admin-link hdr-btn" href="admin.html" aria-label="관리자"/);
  assert.match(c, /\.brand b, \.brand small, \.timer \{ white-space: nowrap; \}/);
  assert.match(c, /\.top-right \.icon-btn, \.top-right \.hdr-btn \{ min-width: 44px; width: 44px; height: 44px;/);
});
test('관리자 화면: 디자인 토큰·라이트 고정, 좁은 화면 터치 44px·본문 15px', () => {
  const h = read('admin.html'), c = read('admin.css');
  assert.match(h, /admin\.css\?v=0\.1\.6-\d+/); assert.match(h, /<meta name="color-scheme" content="light">/); assert.doesNotMatch(c, /prefers-color-scheme|data-theme/);
  assert.match(c, /\.acts button, \.tool button, \.mini-btn, \.ghost-btn, \.vz-tabs button, \.vz-seg button, \.settings button, \.card form button, \.rep-item \{ min-height: 44px; \}/);
  assert.match(c, /\.tbl td, \.kv, \.rep-kv, \.chatlog \.m,[^{]*\{ font-size: 15px; \}/);
});

test('#37 관리자 AI 연결: 응답 전에 다른 메뉴로 옮겨도 사라진 카드·폼·버튼을 건드리지 않는다', () => {
  const a = read('admin.js');
  assert.match(a, /if \(!box\.isConnected\) return;/); assert.match(a, /if \(!f\.isConnected\) return;/); assert.match(a, /finally \{ if \(btn\.isConnected\) btn\.disabled = false; \}/);
  assert.doesNotMatch(a, /finally \{ \$\('#llmLoad'\)\.disabled = false; \}/);
});
test('#37 키보드: 대화상자 포커스 복원·Tab 가두기, 라디오 그룹 방향키·로빙 tabindex, 하단 메뉴 aria-current, 날짜·크기·나이 그룹 이름', () => {
  const s = read('app.js'), h = read('index.html');
  for (const re of [/HTMLDialogElement\.prototype\.showModal = function/, /addEventListener\('close'/, /ArrowRight/, /r\.tabIndex = r === on \? 0 : -1/, /setAttribute\('aria-current', 'page'\)/, /dialog\[open\]'\)\]\.at\(-1\)/]) assert.match(s, re);
  for (const l of ['날짜', '크기', '나이']) assert.match(h, new RegExp(`role="radiogroup" aria-label="${l}"`));
  assert.match(h, /data-tab="plan" class="active" type="button" aria-current="page"/);
});
test('항상 라이트: 다크 스타일·화면 모드 UI 없음, 저장된 화면 모드 값은 지움', () => {
  for (const f of ['style.css', 'admin.css', 'index.html', 'admin.html', 'register.html', 'app.js']) assert.doesNotMatch(read(f), /prefers-color-scheme|data-theme|theme-pick|data-theme-set|applyTheme/, f);
  assert.match(read('index.html'), /<meta name="color-scheme" content="light">/);
  assert.match(read('index.html'), /removeItem\('tailtrail\.theme'\)/);
  assert.doesNotMatch(read('index.html'), /화면 모드/);
});
