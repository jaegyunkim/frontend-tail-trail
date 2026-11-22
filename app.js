import { mountShelter } from './shelter.js?v=0.1.6-5';
import { ROLE_LABEL, DAY_NOTE, policyText, nextLoginText } from './role-policy.js?v=0.1.6';
// 꼬리길 모바일 웹. 로그인·세션은 frontend-book-walking/auth.js(= frontend-go-fishing/auth.js)를 그대로 쓴다(토큰은 sessionStorage, 서버가 만료 최종 판단).
import { errText } from './errors.js?v=0.1.6';
import { state, api, health, login, logout, startTimer, setOnAuthLost, setOnMustChange, saveAuth, syncAccount, remaining, sessionMinutes, loginQuota } from './auth.js?v=0.1.6';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => /^https?:\/\//.test(u ?? '') ? u : null;
const km = m => m == null ? '-' : m >= 1000 ? (Math.round(m / 100) / 10) + 'km' : Math.round(m) + 'm';
let timer = null, lastPlan = null, dogOptions = { sizes: [], ages: [], moods: [], maxDogs: 5 }, dogs = [];
const sel = { date: 'today', dogId: null };
const GC = { go: 'go', time: 'caution', short: 'caution', indoor: 'indoor' }; // 판정 → 색 계열(초록·주황·빨강)

function toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms); }
function kstDate(offset = 0) { return new Date(Date.now() + 9 * 3600000 + offset * 86400000).toISOString().slice(0, 10); }
function nextSaturday() { const d = new Date(Date.now() + 9 * 3600000); const add = (6 - d.getUTCDay() + 7) % 7; return kstDate(add); }


// ---------- 예상 못 한 오류도 개발자용 문장이 아니라 쉬운 말 + 오류 번호로 안내(서버 보고는 telemetry.js 가 따로 한다) ----------
let lastUiErr = 0;
function uiError(e) { const now = Date.now(); if (now - lastUiErr < 8000) return; lastUiErr = now; try { toast(errText(e), 7000); } catch { /* 화면이 없으면 건너뜀 */ } }
window.addEventListener('error', ev => { if (ev.target && ev.target !== window) return; if (/ResizeObserver/.test(ev.message || '')) return; uiError(ev.error ?? ev.message); });
window.addEventListener('unhandledrejection', ev => uiError(ev.reason));

// ---------- 칩 ----------
function chips(el, items, current, onPick) {
  el.innerHTML = items.map(i => `<button type="button" class="chip${i.sub ? ' two' : ''}" role="radio" aria-checked="${i.id === current}" data-id="${esc(i.id)}">${i.emoji ? `<span class="chip-emo" aria-hidden="true">${i.emoji}</span>` : ''}${i.sub ? `<span class="chip-main">${esc(i.label)}</span><span class="chip-sub">${esc(i.sub)}</span>` : esc(i.label)}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('.chip'); if (!b) return; const id = b.dataset.id; const next = id === current && el.dataset.toggle ? null : id; current = next; el.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-checked', String(c.dataset.id === next))); onPick(next); };
}
function drawForm() {
  const sat = nextSaturday();
  const md = d => `${+d.slice(5, 7)}/${+d.slice(8)} ${'일월화수목금토'[new Date(d + 'T00:00:00Z').getUTCDay()]}`; // 11/18 수
  const sun = kstDate(Math.round((Date.parse(sat) - Date.parse(kstDate(0))) / 86400000) + 1);
  chips($('#dateChips'), [{ id: 'today', label: '오늘', sub: md(kstDate(0)) }, { id: 'tomorrow', label: '내일', sub: md(kstDate(1)) }, { id: 'after', label: '모레', sub: md(kstDate(2)) }, { id: 'sat', label: '토요일', sub: md(sat) }, { id: 'sun', label: '일요일', sub: md(sun) }], sel.date, v => { sel.date = v ?? 'today'; });
  drawDogChips();
  const saved = localStorage.getItem('tailtrail.origin'); if (saved && !$('#origin').value) setOrigin(saved, saved === here?.label); else renderPlaces();
}
const dateValue = () => ({ today: kstDate(0), tomorrow: kstDate(1), after: kstDate(2), sat: nextSaturday(), sun: kstDate(Math.round((Date.parse(nextSaturday()) - Date.parse(kstDate(0))) / 86400000) + 1) })[sel.date];

// ---------- 우리 아이(최대 5마리: 처음 등록·추가 등록·수정·삭제·기본 아이) ----------
// 오늘 탭에는 '아이 고르기 카드', 우리 아이 탭에는 '아이 카드 목록'(맞춤 기준·주의점·수정/삭제), 등록·수정은 아래에서 올라오는 시트(dialog)로 한다.
const SIZE_EX = { small: '예: 치와와·말티즈·푸들·포메라니안·요크셔테리어', medium: '예: 시바·비글·웰시코기·보더콜리·스패니얼', large: '예: 골든·래브라도 리트리버·진돗개·셰퍼드·허스키' };
const AGE_HINT = { puppy: '1살 미만. 예방접종 중이면 짧게, 사람 많은 곳은 피해요', adult: '1~7살. 가장 활동적인 시기예요', senior: '7살 이상(대형견은 5~6살부터). 천천히 평평한 길로 걸어요' };
const sizeLabel = id => dogOptions.sizes.find(s => s.id === id)?.label ?? id, ageLabel = id => dogOptions.ages.find(a => a.id === id)?.label ?? id;
const dogSub = d => [sizeLabel(d.size), ageLabel(d.age), d.flatFace ? '단두종' : '', d.thickCoat ? '두꺼운 털' : ''].filter(Boolean).join(' · ');
// 캐릭터: 종류(크기·단두종·털로 정해짐) 5개 × 모양 5개 = 저장 id `{종류}-{1~5}`(백엔드가 이 형식만 받는다).
// 그림은 견종 유화 캐리커처(assets/caricatures/*.webp). 예전 평면 아이콘 id(small-2 등)도 그대로 아래 표로 새 그림이 된다.
const KIND_LABEL = { small: '소형견', medium: '중형견', large: '대형견', flat: '단두종', coat: '두꺼운 털' };
const CARICATURE = { 'maltese-1': '말티즈', 'maltese-2': '말티 달리기', 'maltese-3': '말티 갸우뚱', 'maltese-4': '말티 윙크', 'maltese-5': '말티 리본', poodle: '푸들', pomeranian: '포메', corgi: '코기', bichon: '비숑', retriever: '리트리버' };
const AVATAR_SET = {
  small: ['maltese-1', 'poodle', 'pomeranian', 'bichon', 'maltese-5'],
  medium: ['corgi', 'poodle', 'bichon', 'maltese-2', 'retriever'],
  large: ['retriever', 'corgi', 'poodle', 'bichon', 'maltese-3'],
  flat: ['maltese-4', 'bichon', 'pomeranian', 'poodle', 'maltese-1'],
  coat: ['pomeranian', 'retriever', 'bichon', 'corgi', 'maltese-2']
};
const DEFAULT_CARICATURE = 'retriever'; // 모르는 값은 대표 마스코트
const caricatureOf = id => { const m = /^(small|medium|large|flat|coat)-([1-5])$/.exec(String(id ?? '')); return m ? AVATAR_SET[m[1]][Number(m[2]) - 1] : DEFAULT_CARICATURE; };
const caricatureSrc = name => `assets/caricatures/${CARICATURE[name] ? name : DEFAULT_CARICATURE}.webp`;
const kindOf = d => d?.flatFace ? 'flat' : d?.thickCoat ? 'coat' : (['small', 'medium', 'large'].includes(d?.size) ? d.size : 'medium');
const avatarId = d => /^(small|medium|large|flat|coat)-[1-5]$/.test(d?.avatar ?? '') ? d.avatar : `${kindOf(d)}-${((Number(d?.id) || 0) % 5) + 1}`;
const AGE_BADGE = { puppy: '아기', senior: '노령' };
const avatar = (d, cls = '') => `<span class="dog-ava ${cls}" aria-hidden="true"><img src="${caricatureSrc(caricatureOf(avatarId(d)))}" alt="" width="96" height="96" loading="lazy" decoding="async">${AGE_BADGE[d?.age] ? `<i class="ava-badge">${AGE_BADGE[d.age]}</i>` : ''}</span>`;
const dogFull = () => dogs.length >= dogOptions.maxDogs;
const curDog = () => dogs.find(d => d.id === sel.dogId) ?? dogs.find(d => d.selected) ?? dogs[0] ?? null;

/** 오늘 탭: 아이 고르기 카드 + 선택한 아이의 맞춤 기준 한 줄 */
function drawDogChips() {
  const el = $('#dogChips');
  if (!dogs.length) {
    el.innerHTML = `<div class="dog-empty-card"><span class="dog-ava lg" style="background:#EAF1EA" aria-hidden="true">🐾</span><div><b>아직 등록한 아이가 없어요</b><p>등록하면 아이 크기·나이에 맞춰 판단해요. 지금은 <b>성견 중형</b> 기준이에요.</p></div></div><button type="button" class="primary block soft" id="btnDogFirst2">＋ 우리 아이 처음 등록하기</button>`;
    $('#btnDogFirst2').onclick = () => { go('dogs'); openDogForm(); };
    return;
  }
  const cur = curDog(); sel.dogId = cur.id;
  el.innerHTML = `<div class="dog-pick" role="radiogroup" aria-label="오늘 산책할 아이">${dogs.map(d => `<button type="button" class="dog-pick-card" role="radio" aria-checked="${d.id === cur.id}" data-id="${d.id}">${avatar(d)}<b>${esc(d.name)}</b><small>${esc(dogSub(d))}</small></button>`).join('')}${dogFull() ? '' : '<button type="button" class="dog-pick-card add" data-add aria-label="아이 추가 등록"><span class="dog-ava" aria-hidden="true">＋</span><b>추가</b><small>새 아이 등록</small></button>'}</div>
    <div class="agent-say mini">${avatar(cur, 'agent sm')}<div class="say-bubble"><b>${esc(cur.name)}</b><p>${esc(cur.care?.summary || '오늘 같이 걸을 준비 됐어요!')}</p></div></div><button type="button" class="origin-link" data-go="dogs">✏️ 아이 정보 수정·삭제</button>`;
  el.querySelectorAll('.dog-pick-card[data-id]').forEach(b => b.onclick = () => { sel.dogId = Number(b.dataset.id); drawDogChips(); });
  const add = el.querySelector('[data-add]'); if (add) add.onclick = () => { go('dogs'); openDogForm(); };
}
async function loadDogs() {
  try { const r = await api('/v1/me/dogs'); dogs = r.dogs; dogOptions.maxDogs = r.max ?? dogOptions.maxDogs; if (!dogs.some(d => d.id === sel.dogId)) sel.dogId = dogs.find(d => d.selected)?.id ?? dogs[0]?.id ?? null; drawDogChips(); renderDogs(); } catch { /* 부가 기능: 못 불러와도 기본 아이로 판단 */ }
}

/** 우리 아이 탭: 아이 카드 목록 */
function renderDogs() {
  $('#dogCount').textContent = dogs.length ? `${dogs.length}/${dogOptions.maxDogs}` : '';
  $('#dogWelcome').hidden = dogs.length > 0;
  $('#dogList').innerHTML = dogs.map(d => `<article class="dog-card${d.selected ? ' is-default' : ''}" aria-label="${esc(d.name)}">
    <div class="dog-card-main">${avatar(d, 'lg sq')}<div class="dog-card-name"><h3>${esc(d.name)}</h3><p>${esc(dogSub(d))}</p></div>
    <div class="dog-card-acts">${d.selected ? `<button type="button" class="ghost is-default-btn" disabled aria-label="${esc(d.name)}는 기본 아이예요">⭐ 기본 아이</button>` : `<button type="button" class="ghost" data-pick="${d.id}" aria-label="${esc(d.name)}를 기본 아이로">☆ 기본 아이로</button>`}<button type="button" class="ghost" data-edit="${d.id}" aria-label="${esc(d.name)} 정보 수정">✏️ 수정</button><button type="button" class="ghost danger" data-del="${d.id}" aria-label="${esc(d.name)} 삭제">🗑 삭제</button></div></div>
    ${d.care?.summary ? `<p class="dog-care">${esc(d.care.summary)}</p>` : ''}${d.care?.traits?.length ? `<ul class="dog-traits">${d.care.traits.map(t => `<li><span aria-hidden="true">${t.icon}</span><span>${esc(t.note)}</span></li>`).join('')}</ul>` : ''}</article>`).join('');
  $('#dogAddWrap').hidden = dogFull() || !dogs.length; $('#dogFull').hidden = !dogFull();
  $('#btnDogAdd').querySelector('.act-label').textContent = `아이 추가 등록 (${dogs.length}/${dogOptions.maxDogs})`;
  $('#dogList').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openDogForm(dogs.find(d => d.id === Number(b.dataset.edit))));
  $('#dogList').querySelectorAll('[data-pick]').forEach(b => b.onclick = async () => { try { dogs = (await api(`/v1/me/dogs/${b.dataset.pick}/select`, { method: 'POST', body: '{}' })).dogs; sel.dogId = Number(b.dataset.pick); drawDogChips(); renderDogs(); toast('기본 아이를 바꿨어요'); } catch (e) { toast(errText(e)); } });
  $('#dogList').querySelectorAll('[data-del]').forEach(b => b.onclick = () => askDeleteDog(dogs.find(d => d.id === Number(b.dataset.del))));
}

/** 삭제 확인(브라우저 기본 창 대신 같은 디자인의 창) */
function askDeleteDog(d) {
  const dlg = $('#dogDelDialog'); $('#dogDelTitle').textContent = `'${d.name}'을(를) 삭제할까요?`;
  $('#dogDelMsg').textContent = `등록한 정보만 지워지고, 꼬리일기 기록은 남아요.${d.selected && dogs.length > 1 ? '\n기본 아이는 남은 아이 중 한 마리로 바뀌어요.' : ''}\n삭제하면 되돌릴 수 없어요.`;
  dlg.returnValue = 'cancel';
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'ok') return;
    try {
      dogs = (await api(`/v1/me/dogs/${d.id}/delete`, { method: 'POST', body: '{}' })).dogs;
      if (!dogs.some(x => x.id === sel.dogId)) sel.dogId = dogs.find(x => x.selected)?.id ?? dogs[0]?.id ?? null;
      drawDogChips(); renderDogs(); toast(`'${d.name}'을(를) 삭제했어요`);
    } catch (e) { toast(errText(e)); }
  };
  dlg.showModal();
}

/** 등록·수정 시트. dog 가 있으면 수정, 없으면 등록(한 마리도 없으면 '처음 등록', 있으면 '추가 등록') */
let dogDraft = { size: 'medium', age: 'adult', variant: 1 }, dogEditId = null, liveTimer = null;
function drawDogDraftChips() {
  chips($('#dogSize'), dogOptions.sizes.map(s => ({ id: s.id, label: s.label, sub: s.hint })), dogDraft.size, v => { dogDraft.size = v ?? dogDraft.size; updateDogHints(); });
  chips($('#dogAge'), dogOptions.ages.map(a => ({ id: a.id, label: a.label, sub: a.hint })), dogDraft.age, v => { dogDraft.age = v ?? dogDraft.age; updateDogHints(); });
  updateDogHints();
}
/** 캐릭터 고르기: 지금 고른 크기·단두종·털에 맞는 종류의 5개 중 1개 */
function drawAvatarPicker() {
  const kind = kindOf(draftBody()), box = $('#dogAvatar'), v = dogDraft.variant;
  $('#dogAvatarKind').textContent = `${KIND_LABEL[kind]} 캐릭터`;
  box.innerHTML = AVATAR_SET[kind].map((name, i) => { const n = i + 1; return `<button type="button" class="ava-opt${n === v ? ' on' : ''}" role="radio" aria-checked="${n === v}" data-n="${n}" aria-label="${CARICATURE[name]}"><span class="ava-img"><img src="${caricatureSrc(name)}" alt="" width="64" height="64" decoding="async"></span><small>${CARICATURE[name]}</small></button>`; }).join('');
  box.querySelectorAll('.ava-opt').forEach(b => b.onclick = () => { dogDraft.variant = Number(b.dataset.n); drawAvatarPicker(); scheduleDogLive(); });
}
function updateDogHints() { drawAvatarPicker(); $('#dogSizeHint').textContent = SIZE_EX[dogDraft.size] ?? ''; $('#dogAgeHint').textContent = AGE_HINT[dogDraft.age] ?? ''; scheduleDogLive(); }
const draftBody = () => ({ name: $('#dogName').value.trim(), size: dogDraft.size, age: dogDraft.age, flatFace: $('#dogFlat').checked, thickCoat: $('#dogCoat').checked, get avatar() { return `${kindOf(this)}-${dogDraft.variant}`; } });
/** 입력하는 동안 '이 아이는 이렇게 판단해요'를 바로 보여 준다(서버의 같은 계산, 저장하지 않음) */
function scheduleDogLive() { clearTimeout(liveTimer); liveTimer = setTimeout(async () => {
  const b = draftBody(), box = $('#dogLive');
  try { const r = await api(`/v1/dog-care?size=${b.size}&age=${b.age}&flatFace=${b.flatFace ? 1 : 0}&thickCoat=${b.thickCoat ? 1 : 0}`, { noAuth: true, timeoutMs: 8000 });
    box.innerHTML = `${avatar({ ...b, avatar: b.avatar, age: b.age }, 'lg')}<div><b>${esc(b.name || '우리 아이')}는 이렇게 판단해요</b><p>${esc(r.care.summary)}</p><p class="small-text">${esc(r.care.traits.map(t => t.icon).join(' '))} ${esc(r.care.traits[0].note)}</p></div>`; box.hidden = false;
  } catch { box.hidden = true; } }, 200); }
$('#dogName').addEventListener('input', scheduleDogLive); ['#dogFlat', '#dogCoat'].forEach(s => $(s).addEventListener('change', () => { drawAvatarPicker(); scheduleDogLive(); }));
/** 이름 중복 검사: 앞뒤·연속 공백, 대소문자, 서버가 지우는 < > 를 맞춰 비교한다. 빈 이름은 검사하지 않는다(선택 입력). */
const dogNameKey = v => String(v ?? '').replace(/[<>]/g, '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
const findDupDog = (name, list = dogs, exceptId = dogEditId) => { const k = dogNameKey(name); return k ? list.find(d => d.id !== exceptId && dogNameKey(d.name) === k) ?? null : null; };
const josaIGa = w => { const c = String(w).charCodeAt(String(w).length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 ? '이' : '가'; };
function checkDogName() {
  const box = $('#dogNameMsg'), name = $('#dogName').value, dup = findDupDog(name);
  if (dup) { box.textContent = `이미 '${dup.name}'${josaIGa(dup.name)} 등록돼 있어요. 다른 이름을 써 주세요.`; box.dataset.kind = 'bad'; }
  else if (dogNameKey(name)) { box.textContent = '✓ 쓸 수 있는 이름이에요'; box.dataset.kind = 'ok'; }
  else { box.textContent = ''; box.dataset.kind = ''; }
  $('#dogName').setAttribute('aria-invalid', dup ? 'true' : 'false');
  return !dup;
}
$('#dogName').addEventListener('input', checkDogName);
function openDogForm(dog = null) {
  dogEditId = dog?.id ?? null; const first = !dogs.length;
  dogDraft = dog ? { size: dog.size, age: dog.age, variant: Number(avatarId(dog).slice(-1)) } : { size: 'medium', age: 'adult', variant: 1 };
  $('#dogName').value = dog?.name ?? ''; $('#dogFlat').checked = Boolean(dog?.flatFace); $('#dogCoat').checked = Boolean(dog?.thickCoat); $('#dogMsg').textContent = '';
  $('#dogFormTitle').textContent = dog ? `${dog.name} 정보 수정` : first ? '우리 아이 처음 등록' : `아이 추가 등록 (${dogs.length + 1}/${dogOptions.maxDogs}번째)`;
  $('#dogSubmit').textContent = dog ? '수정 저장' : first ? '첫 아이 등록하기' : '추가 등록하기';
  drawDogDraftChips(); syncClearButtons(); checkDogName(); const dlg = $('#dogDialog'); if (!dlg.open) dlg.showModal(); setTimeout(() => $('#dogName').focus(), 80);
}
function closeDogForm() { dogEditId = null; const dlg = $('#dogDialog'); if (dlg.open) dlg.close(); $('#dogMsg').textContent = ''; }
$('#btnDogAdd').onclick = () => openDogForm(); $('#btnDogFirst').onclick = () => openDogForm(); $('#dogCancel').onclick = closeDogForm;
$('#dogDialog').addEventListener('click', e => { if (e.target === $('#dogDialog')) closeDogForm(); }); // 바깥을 누르면 닫기
$('#dogForm').onsubmit = async e => {
  e.preventDefault(); const m = $('#dogMsg'); m.textContent = '';
  if (!checkDogName()) { $('#dogName').focus(); return; }
  const body = JSON.stringify(draftBody()), first = !dogs.length, editing = dogEditId != null, btn = $('#dogSubmit'); btn.disabled = true;
  try {
    if (editing) { const r = await api(`/v1/me/dogs/${dogEditId}/update`, { method: 'POST', body }); dogs = r.dogs; drawDogChips(); renderDogs(); closeDogForm(); toast(`'${r.dog.name}' 정보를 수정했어요`); }
    else { const r = await api('/v1/me/dogs', { method: 'POST', body }); dogs = r.dogs; sel.dogId = r.dog.id; drawDogChips(); renderDogs(); closeDogForm(); toast(first ? `'${r.dog.name}'을(를) 등록했어요. 이제 오늘 산책을 판단해 볼까요?` : `'${r.dog.name}'을(를) 추가했어요`); if (first) go('plan'); }
  } catch (err) { m.textContent = errText(err); } finally { btn.disabled = false; }
};

// ---------- 플랜 ----------
// ---------- 출발지: 칩 한 줄로 고른다([◎ 현재 위치] [자주 걷는 곳…] [＋ 주소로 추가]) ----------
// 현재 위치는 화면에 장소 이름(예: 경남 양산 동면 금오13길, 번지 제외)을 보여 주고, 계산에는 좌표를 쓴다.
let here = (() => { try { return JSON.parse(localStorage.getItem('tailtrail.here') || 'null'); } catch { return null; } })(); // { label, coords:'위도,경도' }
let firstShelterOrigin = null, refreshShelter = null;
let locating = false, originRevision = 0;
const originValue = () => { const v = $('#origin').value.trim(); return here && v === here.label ? here.coords : v; };
function setOrigin(v, gps = false) {
  // 위치 확인을 기다리는 중에 주소를 고르면 나중에 온 GPS 응답이 선택을 덮지 않게 한다.
  originRevision++;
  locating = false;
  if (!gps) {
    here = null;
    try { localStorage.removeItem('tailtrail.here'); } catch { /* 저장소 없이도 선택 가능 */ }
  }
  $('#origin').value = String(v ?? '').trim();
  if (!firstShelterOrigin && originValue()) firstShelterOrigin = originValue();
  renderPlaces();
}
function locateHere() {
  if (!navigator.geolocation) return toast('이 기기에서는 위치를 쓸 수 없어요. 주소로 추가해 주세요');
  if (locating) return; locating = true; const rev = ++originRevision; renderPlaces();
  navigator.geolocation.getCurrentPosition(async p => {
    const lat = p.coords.latitude.toFixed(4), lon = p.coords.longitude.toFixed(4), coords = `${lat},${lon}`;
    let label = null;
    try { label = (await api(`/v1/place-name?lat=${lat}&lon=${lon}`, { timeoutMs: 10000 })).label; } catch { /* 이름을 못 찾으면 기본 문구 */ }
    if (rev !== originRevision) return;
    here = { label: label || '현재 위치', coords }; try { localStorage.setItem('tailtrail.here', JSON.stringify(here)); } catch {}
    locating = false; setOrigin(here.label, true);
  }, e => { if (rev !== originRevision) return; locating = false; renderPlaces(); toast(e?.code === 1 ? '위치 권한이 없어요. 주소로 추가해 주세요' : '현재 위치를 찾지 못했어요. 다시 시도하거나 주소로 추가해 주세요'); }, { timeout: 8000, maximumAge: 600000 });
}
// ---------- 오늘의 산책 판단 만들기 ----------

$('#planForm').onsubmit = async e => {
  e.preventDefault();
  if (quotaLocked) { toast(QUOTA_EMPTY_MSG); return; } // 오늘 판단 횟수를 다 쓰면 요청하지 않는다
  const origin = originValue(); if (!origin) { toast('출발지를 먼저 골라 주세요'); return; }
  localStorage.setItem('tailtrail.origin', $('#origin').value.trim());
  const btn = $('#btnPlan'); planning = true; btn.disabled = true; btn.textContent = '데이터 모으는 중…';
  const steps = ['기상청 예보', '에어코리아 미세먼지', '노면 온도 추정', '두루누비 산책 코스', '가까운 공원', '동물병원·미용·애견샵']; let i = 0;
  $('#planResult').innerHTML = `<div class="loading">우리 아이 산책을 살펴보고 있어요 · <b id="stepName">${steps[0]}</b></div>`;
  const tick = setInterval(() => { i = (i + 1) % steps.length; const s = $('#stepName'); if (s) s.textContent = steps[i]; }, 900);
  try {
    const r = await api('/v1/plans', { method: 'POST', body: JSON.stringify({ origin, date: dateValue(), dogId: sel.dogId ?? undefined }), timeoutMs: 60000 });
    lastPlan = r; renderPlan(r); refreshUsage();
  } catch (err) { $('#planResult').innerHTML = `<p class="msg">${esc(errText(err))}</p>`; }
  finally { clearInterval(tick); planning = false; btn.textContent = '오늘 산책 판단하기'; renderQuota(); }
};

// ---------- 산책 예정일의 날씨 카드(캔바 시안 v0.4.18): 상태 칩 + 팁 + 시간별 예보 칸(카드 너비를 고르게 채움) ----------
const WX_ICON = {
  sun: '<circle cx="12" cy="12" r="4.2" class="i-sun"/><path class="i-ray" d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  moon: '<path class="i-moon" d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  partly: '<circle cx="9" cy="9" r="3.4" class="i-sun"/><path class="i-ray" d="M9 2.8v1.5M2.8 9h1.5M4.6 4.6l1 1M13.4 4.6l-1 1"/><path class="i-cloud" d="M8 19h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.3A2.9 2.9 0 0 0 8 19z"/>',
  cloud: '<path class="i-cloud" d="M7 18.5h10a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.8 1.5A3.3 3.3 0 0 0 7 18.5z"/>',
  rain: '<path class="i-cloud" d="M7 15h10a3.8 3.8 0 0 0 .4-7.6 5.4 5.4 0 0 0-10.4 1.4A3.1 3.1 0 0 0 7 15z"/><path class="i-drop" d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>',
  snow: '<path class="i-cloud" d="M7 15h10a3.8 3.8 0 0 0 .4-7.6 5.4 5.4 0 0 0-10.4 1.4A3.1 3.1 0 0 0 7 15z"/><path class="i-snow" d="M8 19h.01M12 20.5h.01M16 19h.01"/>',
};
const wxKind = h => { const p = h.precip && h.precip !== '없음' ? h.precip : ''; if (/눈/.test(p) && !/비/.test(p)) return 'snow'; if (p) return 'rain';
  if (h.sky === '흐림') return 'cloud'; if (h.sky === '구름많음') return 'partly'; return h.hour >= 18 || h.hour < 6 ? 'moon' : 'sun'; };
const wxSvg = k => `<svg class="wx-ico" viewBox="0 0 24 24" aria-hidden="true">${WX_ICON[k]}</svg>`;
const GATE_ICON = { go: '<path d="M7 12.5l3.2 3.2L17 9"/>', caution: '<path d="M12 7.5v5.5M12 16.5h.01"/>', indoor: '<path d="M8 8l8 8M16 8l-8 8"/>' };
function weatherCard(w, hours) {
  const reasons = w.reasons.length ? w.reasons : w.gate === 'caution' ? [`걷기 지수 ${w.score}점: 기온·바람 조건이 조금 아쉬워요`] : [];
  const chips = reasons.map(r => `<span class="wx-chip ${GC[w.gate] ?? 'caution'}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/>${GATE_ICON[GC[w.gate]] ?? GATE_ICON.go}</svg>${esc(r)}</span>`).join('');
  const tips = w.tips.map(t => `<li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>${esc(t)}</li>`).join('');
  const cols = hours.map((h, i) => `<div class="wx-hour${i === 0 ? ' now' : ''}"><span class="t">${esc(h.time)}</span>${wxSvg(wxKind(h))}<b>${h.temp ?? '-'}°</b><span class="sky">${esc(h.precip && h.precip !== '없음' ? h.precip : h.sky ?? '')}</span><span class="pop"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5s-6 6.6-6 10.8a6 6 0 0 0 12 0C18 10.1 12 3.5 12 3.5z"/></svg>${h.pop == null ? '미제공' : esc(h.pop) + '%'}</span></div>`).join('');
  if (!chips && !tips && !cols) return '';
  return `<section class="wx-card" aria-label="산책 예정일의 날씨"><h3>산책 예정일의 날씨</h3>${chips || tips ? `<div class="wx-status">${chips}${tips ? `<ul class="wx-tips">${tips}</ul>` : ''}</div>` : ''}${cols ? `<div class="wx-hours" style="--n:${hours.length}">${cols}</div>` : ''}</section>`;
}

const telLink = p => p ? `<a class="link-btn" href="tel:${esc(String(p).replace(/[^0-9+]/g, ''))}"><span aria-hidden="true">📞</span>전화<b aria-hidden="true">↗</b></a>` : '';
const mapLinks = (name, lat, lon) => Number.isFinite(+lat) && Number.isFinite(+lon) ? `<a class="link-btn" href="https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lon}" target="_blank" rel="noopener"><span aria-hidden="true">🗺️</span>지도<b aria-hidden="true">↗</b></a><a class="link-btn" href="https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lon}" target="_blank" rel="noopener"><span aria-hidden="true">🧭</span>길찾기<b aria-hidden="true">↗</b></a>` : '';
/** 가까운 곳 목록 한 줄(이름·거리·전화·지도). 영업·출입은 확인하지 못한 값이라 안내 문구를 함께 둔다 */
const licBadge = x => x.licensed === true ? ` <span class="tag go" title="행정안전부 영업 중 등록 업소${x.licensedOn ? ' · 인허가 ' + esc(String(x.licensedOn).slice(0, 7).replace('-', '.')) : ''}">인허가 확인</span>` : x.licensed === false ? ' <small class="muted">인허가 정보 미확인</small>' : '';
const petLine = x => x.pet ? `<p class="pet-cond">🐾 ${[x.pet.allowed, x.pet.breeds].filter(Boolean).map(esc).join(' · ')}${x.pet.need ? `<br>필요: ${esc(x.pet.need)}` : ''}${x.pet.etc ? `<br><small class="muted">${esc(x.pet.etc.split('\n')[0])}</small>` : ''}</p>` : '';
const placeRow = x => `<li><span>${safeUrl(x.url) ? `<a class="ext" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a>` : esc(x.name)}${x.open24 ? ' <span class="tag go">24시·응급 표시</span>' : ''}${licBadge(x)} <small class="muted">${esc(x.category ?? x.type ?? '')}</small><br><small class="muted">${esc(x.address ?? '')}</small>${petLine(x)}<div class="links">${telLink(x.phone ?? x.tel)}${mapLinks(x.name, x.lat, x.lon)}</div></span><span class="d">${x.distanceM != null ? km(x.distanceM) : ''}</span></li>`;
const nearSection = (arr, title, note = '') => arr?.length ? `<div class="sec"><h3>${title}<small>${note}</small></h3><ul class="places">${arr.map(placeRow).join('')}</ul></div>` : '';

// 시간대 막대: 06~21시를 색(좋음·주의·위험)으로 한눈에
function hourBars(hourly, window) {
  if (!hourly?.length) return '';
  const LV = { ok: '좋음', warn: '주의', bad: '위험' };
  return `<section class="hour-bars" aria-label="시간대별 산책 판단"><h3>시간대별 판단 <small>${window ? `추천 ${esc(window.from)}~${esc(window.to)}` : '시간대 추천 없음'}</small></h3>
    <div class="hb-row" style="--n:${hourly.length}">${hourly.map(h => `<div class="hb lv-${esc(h.level)}" title="${esc(h.time)} ${esc(LV[h.level])} ${esc(h.reasons.join(', '))}"><span class="hb-t">${h.hour}</span><i></i><b>${h.temp ?? '-'}°</b>${h.pavement != null && h.pavement >= 40 ? `<em>${h.pavement}°</em>` : '<em></em>'}</div>`).join('')}</div>
    <p class="muted small-text">아래 작은 숫자는 노면 온도 추정값이에요(기온·하늘 상태로 계산, 실측 아님). 색: <span class="lg ok">좋음</span> <span class="lg warn">주의</span> <span class="lg bad">위험</span></p></section>`;
}
function courseHtml(c, i) {
  return `<div class="course"><div><b>${esc(c.name)}</b>${c.levelName ? ` <span class="tag ${c.level === 1 ? 'go' : c.level === 2 ? 'caution' : 'indoor'}">${esc(c.levelName)}</span>` : ''}</div>
    <div class="meta">출발지에서 ${c.travelKm}km · 코스 전체 ${c.distanceKm ?? '-'}km · ${esc(c.sigun ?? '')}</div>
    <p class="walk-hint">🐾 ${esc(c.suggestNote)}</p>
    ${c.summary ? `<p>${esc(c.summary.split('\n')[0].replace(/^-\s*/, ''))}</p>` : ''}
    <div class="links">${Number.isFinite(c.start?.lat) ? mapLinks(c.name + ' 시작점', c.start.lat, c.start.lon) : ''}<a class="link-btn" href="https://www.durunubi.kr/" target="_blank" rel="noopener">두루누비<b aria-hidden="true">↗</b></a><a class="link-btn" href="#" data-diary="${i}"><span aria-hidden="true">✍️</span>다녀왔어요</a></div></div>`;
}

/** 산책 신호등 이름(초록·노랑·빨강) */
const SIGNAL_LABEL = { go: '산책 딱 좋아요', caution: '시간·발바닥 주의', indoor: '실내 놀이 추천' };
const AGENT_OPEN = { go: '같이 나가요!', time: '시간만 잘 고르면 돼요!', short: '짧게 다녀와요!', indoor: '오늘은 집에서 놀아요.' };
/** 에이전트 말풍선: 아이 캐리커처가 1인칭으로 오늘 판단을 짧게 전한다 */
function agentSay(w, p) {
  const who = dogs.find(d => d.name === w.dog?.name) ?? curDog() ?? w.dog ?? {};
  const line = p.card?.[0] || w.reasons?.[0] || w.headline || '';
  return `<section class="agent-say" aria-label="${esc(who.name ?? '우리 아이')}의 한마디">${avatar(who, 'agent')}<div class="say-bubble"><b>${esc(who.name ?? '우리 아이')}</b><p>${esc(AGENT_OPEN[w.gate] ?? '')} ${esc(line)}</p></div></section>`;
}
function renderPlan({ id, plan: p }) {
  const w = p.walk, s = p.weather.short, gc = GC[w.gate] ?? 'caution';
  const hours = s?.hourly?.filter(h => h.hour % 2 === 0 || (h.precip && h.precip !== '없음')).slice(0, 9) ?? [];
  const pave = w.pavement?.maxEstimatedC;
  const courses = p.courses ?? [], vets = p.nearby.vets ?? [];
  $('#planResult').innerHTML = `
    <p id="planQuotaTag" class="token-tag" hidden></p>
    <section class="dog-hero ${gc}" aria-label="오늘의 판단"><div class="dh-top"><span class="sig-light" aria-hidden="true"><i class="r"></i><i class="y"></i><i class="g"></i></span><span class="tag ${gc}">${esc(SIGNAL_LABEL[gc] ?? w.gateName)}</span></div>
      <h2>${esc(w.headline)}</h2><p class="dh-sub">${esc(p.dateLabel)} · ${esc(p.place)}${w.minutes ? ` · 알맞은 산책 ${w.minutes}분` : ''}</p>
      <p class="dh-dog">🐕 ${esc(w.dog.name)} · ${esc(dogSub(w.dog))} · ${esc(w.gateName)}</p></section>
    ${agentSay(w, p)}
    <div class="metric-strip">
      <div class="metric"><div class="metric-num ${gc}">${w.score}</div><div class="metric-label">${w.gate === 'time' ? '추천 시간 점수' : '산책 점수'}</div></div>
      <div class="metric"><div class="metric-num">${s?.temp ? `${s.temp.min}~${s.temp.max}°` : p.weather.mid?.temp?.min != null ? `${p.weather.mid.temp.min}~${p.weather.mid.temp.max}°` : '-'}</div><div class="metric-label">${esc(p.dateLabel.slice(5))} 기온</div></div>
      <div class="metric"><div class="metric-num ${pave != null && pave >= w.pavement.warnC ? 'indoor' : ''}">${pave != null ? pave + '°' : '-'}</div><div class="metric-label">노면 최고(추정)</div></div>
    </div>
    <p class="air-line">${p.weather.air ? `😷 미세먼지 ${esc(p.weather.air.gradeName)} (PM10 ${p.weather.air.pm10 ?? '-'} · PM2.5 ${p.weather.air.pm25 ?? '-'})` : s?.popMax != null ? `☔ 강수확률 최대 ${s.popMax}%` : ''}</p>
    <details class="share-card"><summary>공유용 3줄 요약</summary><div class="card-lines">${p.card.map(l => `<p>${esc(l)}</p>`).join('')}</div></details>
    ${hourBars(w.hourly, w.window)}
    ${weatherCard(w, hours)}
    <div class="sec"><h3>🌳 가까운 공원 <small>출발지 3km 안 · 카카오</small></h3>${p.nearby.parks.length ? `<ul class="places">${p.nearby.parks.map(placeRow).join('')}</ul>` : '<p class="empty">가까운 공원을 찾지 못했어요</p>'}</div>
    <div class="sec"><h3>🚶 산책 코스 <small>두루누비 · 출발지 반경 ${p.courseSearch?.radiusKm ?? '-'}km</small></h3>${courses.map(courseHtml).join('') || (w.gate === 'indoor' ? '<p class="empty">오늘은 야외 코스를 추천하지 않아요.</p>' : '<p class="empty">가까운 걷기 코스가 없어요</p>')}</div>
    ${w.gate === 'indoor' ? '<div class="sec"><h3>🏠 집 안 놀이로 에너지 풀기</h3><ul class="reasons"><li>노즈워크: 간식을 수건·종이컵 아래 숨겨 찾게 하세요</li><li>복도·거실에서 5분씩 당기기·가져오기 놀이</li><li>짧은 훈련(앉아·기다려) 10분</li></ul></div>' : ''}
    <div class="sec emergency"><h3>🚨 응급 · 가까운 동물병원 <small>${p.emergency.open24.length ? '24시·응급 표시가 있는 곳 포함' : '가장 가까운 곳'}</small></h3>
      ${p.emergency.open24.length ? `<ul class="places">${p.emergency.open24.map(placeRow).join('')}</ul>` : ''}${p.emergency.nearest.length ? `<ul class="places">${p.emergency.nearest.filter(x => !x.open24).map(placeRow).join('')}</ul>` : '<p class="empty">가까운 동물병원을 찾지 못했어요</p>'}
      <p class="muted small-text">${esc(p.emergency.note)}</p></div>
    ${nearSection(vets.filter(v => !p.emergency.nearest.some(n => n.name === v.name)), '🏥 동물병원', '6km 안 · 인허가 확인')}
    ${nearSection(p.nearby.groomers, '✂️ 애견 미용', '4km 안')}
    ${nearSection(p.nearby.shops, '🛍️ 애견샵·용품', '4km 안')}
    ${p.nearby.petPlaces?.length ? nearSection(p.nearby.petPlaces, '🐾 반려동물 동반 가능 장소', '한국관광공사 · 동반 조건 확인') : ''}
    <p class="muted small-text place-note"><b>인허가 확인</b>은 행정안전부 영업 중 등록 업소와 일치한다는 뜻이에요. 영업시간·휴무와 반려견 출입은 확인하지 못한 정보라 가기 전에 전화나 지도 링크로 확인해 주세요.</p>
    <div class="actions"><button type="button" class="act" id="btnToDiary">${actBtn('꼬리일기에 남기기', '✍️')}</button></div>
    <div class="sources">${p.sources.map(x => `<span class="${x.status === 'ok' ? '' : 'bad'}">${esc(x.provider)} ${x.status === 'ok' ? '✓' : esc(x.status)}</span>`).join('')}<p>${esc(p.attribution)}</p></div>`;
  $('#planResult').querySelectorAll('[data-diary]').forEach(b => b.onclick = e => { e.preventDefault(); const c = courses[Number(b.dataset.diary)]; prefillDiary({ place: c?.name, minutes: w.minutes }); });
  $('#btnToDiary').onclick = () => prefillDiary({ place: p.nearby.parks[0]?.name ?? courses[0]?.name, minutes: w.minutes });
  renderQuota();
  $('#planResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// 버튼 바로 아래 말풍선(안내·오류). 같은 버튼에 다시 띄우면 바꿔 끼운다. 토스트와 같은 디자인
function bubble(anchor, msg, kind = 'warn') {
  anchor.parentElement.querySelectorAll(':scope > .bubble').forEach(b => b.remove());
  const b = document.createElement('p'); b.className = `bubble ${kind}`; b.setAttribute('role', 'alert');
  b.innerHTML = `<span class="bubble-ico" aria-hidden="true">${kind === 'info' ? 'i' : '!'}</span><span>${esc(msg)}</span>`;
  anchor.insertAdjacentElement('afterend', b);
}
// ---------- 주변: 공원·동물병원·미용·애견샵·응급(출발지 기준) ----------
const NEAR_TYPES = [{ id: 'park', emoji: '🌳', label: '공원' }, { id: 'vet', emoji: '🏥', label: '동물병원' }, { id: 'groom', emoji: '✂️', label: '미용' }, { id: 'shop', emoji: '🛍️', label: '애견샵' }, { id: 'pharmacy', emoji: '💊', label: '동물약국' }, { id: 'boarding', emoji: '🏨', label: '펫호텔·유치원' }];
let nearType = 'park';
async function originCoords() {
  const v = originValue(); if (!v) throw new Error('오늘 탭에서 출발지를 먼저 골라 주세요');
  if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(v)) return v;
  const g = await api('/v1/geocode?q=' + encodeURIComponent(v)); return `${g.lat},${g.lon}`;
}
/** 한 줄 칩: 다 안 들어가 가로로 밀릴 때 고른 칩이 보이게 그 줄만 옆으로 스크롤(화면 세로 위치는 그대로) */
function showPickedChip(row) {
  if (!row?.querySelector) return;
  const on = row.querySelector('[aria-checked="true"]'), over = row.scrollWidth > row.clientWidth + 1;
  row.classList?.toggle('is-scroll', over);
  row.onscroll = () => row.classList?.toggle('at-end', row.scrollLeft + row.clientWidth >= row.scrollWidth - 2);
  row.onscroll();
  if (!on || !over) return;
  const left = on.offsetLeft - row.offsetLeft, right = left + on.offsetWidth;
  if (left < row.scrollLeft || right > row.scrollLeft + row.clientWidth) row.scrollTo?.({ left: Math.max(0, left - (row.clientWidth - on.offsetWidth) / 2), behavior: 'smooth' });
}
addEventListener('resize', () => showPickedChip(document.querySelector('#nearChips')));
async function loadNearby(type = nearType) {
  nearType = type; const el = $('#nearList');
  chips($('#nearChips'), NEAR_TYPES, nearType, v => loadNearby(v ?? nearType));
  showPickedChip($('#nearChips'));
  el.innerHTML = '<p class="loading">가까운 곳을 찾는 중…</p>';
  try {
    const c = await originCoords();
    const r = await api(`/v1/nearby?near=${encodeURIComponent(c)}&type=${type}&limit=10`);
    el.innerHTML = r.status !== 'ok' ? `<p class="msg">${esc(r.message ?? '지금은 불러오지 못했어요')}</p>` : (r.items.length ? `<ul class="places">${r.items.map(placeRow).join('')}</ul><p class="muted small-text">${esc(r.note ?? '')}${r.licensed?.checked === false && r.licensed.reason ? `<br>${esc(r.licensed.reason)}` : ''}</p>` : '<p class="empty">가까운 곳을 찾지 못했어요</p>');
  } catch (e) { el.innerHTML = `<p class="msg">${esc(errText(e))}</p>`; }
}
$('#btnEmergency').onclick = async () => {
  const el = $('#nearList'); el.innerHTML = '<p class="loading">가장 가까운 동물병원을 찾는 중…</p>';
  try {
    const r = await api('/v1/emergency?near=' + encodeURIComponent(await originCoords()));
    el.innerHTML = `<div class="sec emergency"><h3>🚨 응급 · 가까운 동물병원</h3>${r.open24.length ? `<h4>24시·응급 표시</h4><ul class="places">${r.open24.map(placeRow).join('')}</ul>` : ''}${r.nearest.length ? `<h4>가장 가까운 곳</h4><ul class="places">${r.nearest.map(placeRow).join('')}</ul>` : '<p class="empty">가까운 동물병원을 찾지 못했어요</p>'}<p class="muted small-text">${esc(r.note)}</p></div>`;
  } catch (e) { el.innerHTML = `<p class="msg">${esc(errText(e))}</p>`; }
};

// ---------- 꼬리일기(산책 한 줄 기록) ----------
let diaryMood = null;
/** 산책 시간: "시간 | 분" 고르기(분은 5분 단위). 서버에는 분으로 보낸다(1~300분, 0이면 비움) */
const DIARY_DEFAULT_MIN = 30;
function setDiaryMinutes(total = DIARY_DEFAULT_MIN) {
  const t = Math.min(300, Math.max(0, Math.round((Number(total) || 0) / 5) * 5));
  $('#diaryHours').value = String(Math.floor(t / 60)); $('#diaryMins').value = String(t % 60);
}
const diaryMinutes = () => Number($('#diaryHours').value || 0) * 60 + Number($('#diaryMins').value || 0);
$('#diaryHours').innerHTML = [0, 1, 2, 3, 4, 5].map(h => `<option value="${h}">${h}시간</option>`).join('');
$('#diaryMins').innerHTML = Array.from({ length: 12 }, (_, i) => i * 5).map(m => `<option value="${m}">${m}분</option>`).join('');
setDiaryMinutes();
function prefillDiary({ place = '', minutes = '' } = {}) {
  $('#diaryPlace').value = place ?? ''; setDiaryMinutes(minutes || DIARY_DEFAULT_MIN); go('diary'); $('#diaryNote').focus();
}
async function loadDiary() {
  $('#diaryDate').value ||= kstDate(0); $('#diaryDate').max = kstDate(0);
  $('#diaryDog').innerHTML = '<option value="">아이 선택(선택)</option>' + dogs.map(d => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');
  if (dogs.length && !$('#diaryDog').value) $('#diaryDog').value = dogs.find(d => d.id === sel.dogId)?.name ?? dogs[0].name;
  chips($('#diaryMood'), dogOptions.moods.map(m => ({ id: m.id, label: m.label })), diaryMood, v => { diaryMood = v; });
  $('#diaryMood').dataset.toggle = '1';
  try {
    const r = await api('/v1/me/diary'), st = r.stats;
    $('#diaryStats').innerHTML = `<div class="metric"><div class="metric-num">${st.streak}</div><div class="metric-label">이어 걷기(일)</div></div><div class="metric"><div class="metric-num">${st.monthDays}</div><div class="metric-label">이번 달 걸은 날</div></div><div class="metric"><div class="metric-num">${st.minutes30}</div><div class="metric-label">최근 30일(분)</div></div><div class="metric"><div class="metric-num">${st.entries}</div><div class="metric-label">전체 기록</div></div>`;
    const moodEmo = { great: '😆', good: '🙂', tired: '😮‍💨' };
    $('#diaryList').innerHTML = r.entries.map(w => `<li><div class="when">${esc(w.walkedOn)} ${moodEmo[w.mood] ?? ''} ${w.dogName ? '· ' + esc(w.dogName) : ''}</div><b>${esc(w.placeName ?? '산책')}</b>${w.minutes ? ` · ${w.minutes}분` : ''}${w.poop ? ' · 💩' : ''}${w.note ? `<p>${esc(w.note)}</p>` : ''}<button type="button" class="ghost small" data-del="${w.id}" aria-label="이 기록 지우기">지우기</button></li>`).join('') || '<li class="empty">오늘 산책을 한 줄로 남겨 보세요.</li>';
    $('#diaryList').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('이 기록을 지울까요?')) return; try { await api('/v1/me/diary/' + b.dataset.del, { method: 'DELETE' }); loadDiary(); } catch (e) { toast(errText(e)); } });
  } catch (e) { $('#diaryList').innerHTML = `<li class="msg">${esc(errText(e))}</li>`; }
}
$('#diaryForm').onsubmit = async e => {
  e.preventDefault();
  if (diaryMinutes() > 300) { toast('산책 시간은 5시간까지 남길 수 있어요'); return; }
  try {
    await api('/v1/me/diary', { method: 'POST', body: JSON.stringify({ planId: lastPlan?.id, dogName: $('#diaryDog').value, placeName: $('#diaryPlace').value.trim(), date: $('#diaryDate').value, minutes: diaryMinutes() || null, mood: diaryMood || undefined, poop: $('#diaryPoop').checked, note: $('#diaryNote').value.trim() }) });
    $('#diaryForm').reset(); syncClearButtons(); diaryMood = null; $('#diaryDate').value = kstDate(0); setDiaryMinutes(); toast('꼬리일기에 남겼어요'); loadDiary();
  } catch (err) { toast(errText(err)); }
};

// ---------- 탭 ----------
function go(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + tab));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'shelter') {
    refreshShelter ??= mountShelter($('#shelterRoot'), { api, origin: () => firstShelterOrigin || places.find(p => p.selected)?.label || places[0]?.label || originValue(), account: state.auth?.user?.id });
    Promise.resolve(refreshShelter()).catch(uiError);
  }
  if (tab === 'near') loadNearby();
  if (tab === 'diary') loadDiary();
  if (tab === 'dogs') renderDogs();
  if (tab === 'history') loadHistory();
  window.scrollTo({ top: 0 });
}
document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => go(b.dataset.tab));
$('#brandHome').onclick = e => { e.preventDefault(); go('plan'); }; // 로고·이름을 누르면 홈(오늘 탭) 맨 위로

// ---------- 자주 걷는 곳(최대 5곳, 어디물어 '출발지'와 같은 역할) ----------
let places = [];
const short = l => String(l).split(' ').slice(-2).join(' ');
const ORIGIN_ICON = {
  gps: '<svg class="o-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.6" class="fill"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  pin: '<svg class="o-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  check: '<svg class="o-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" class="fill"/><path d="M7.8 12.3l2.8 2.8 5.6-5.8" class="on-fill"/></svg>',
  flag: '<svg class="o-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" class="fill"/><circle cx="12" cy="10" r="2.3" class="hole"/></svg>',
  star: '<svg class="o-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>',
  plus: '<svg class="o-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg class="o-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
};
function renderPlaces() {
  const box = $('#placeChips'), cur = $('#origin').value.trim(), full = places.length >= 5;
  $('#placeCount2').textContent = `${places.length}/5`;
  const isHere = Boolean(here && cur && cur === here.label), saved = places.find(p => p.label === cur);
  const temp = cur && !isHere && !saved ? cur : null; // 기록·추천·이번만 쓰기로 정한 출발지(저장 안 된 곳)
  const canSave = !full && (isHere || temp);
  // 위계 v0.4.18: ① 선택 결과(배너) ② 현재 위치(큰 버튼) ③ 자주 걷는 곳(2칸 타일) ④ 저장·추가(글자 버튼)
  const tile = (attrs, label, on, tag = '') => `<button type="button" class="origin-tile" role="radio" aria-checked="${on}" ${attrs}>${ORIGIN_ICON[on ? 'check' : 'pin']}<span>${esc(label)}</span>${tag}</button>`;
  box.innerHTML =
    `<button type="button" class="origin-gps" role="radio" aria-checked="${isHere}" data-here${locating ? ' aria-busy="true"' : ''}>${ORIGIN_ICON.gps}<span><b>${locating ? '현재 위치 찾는 중…' : '현재 위치'}</b><small>${isHere ? esc(here.label) : '지금 있는 곳에서 출발'}</small></span>${isHere ? ORIGIN_ICON.check : ''}</button>`
    + `<div class="origin-sub"><span>자주 걷는 곳</span><em>${places.length}/5</em></div>`
    + `<div class="origin-places">${places.map(p => tile(`data-place="${p.id}"`, short(p.label), p.label === cur)).join('')}${temp ? tile('data-temp', short(temp), true, '<em class="origin-tag">이번만</em>') : ''}${!places.length && !temp ? '<p class="origin-empty">자주 걷는 곳을 저장해 두면 한 번에 고를 수 있어요</p>' : ''}</div>`
    + `<div class="origin-actions">${canSave ? `<button type="button" class="origin-link" id="placeSaveCur">${ORIGIN_ICON.star}이곳 저장</button>` : ''}<button type="button" class="origin-link" id="placeManage">${full ? ORIGIN_ICON.edit + '자주 걷는 곳 고치기' : ORIGIN_ICON.plus + '주소로 검색·추가'}</button></div>`;
  $('#originNow').innerHTML = cur ? `${ORIGIN_ICON.flag}<span><small>여기서 출발해요</small><b>${esc(cur)}</b></span>` : `${ORIGIN_ICON.flag}<span><small>출발지</small><b>아래에서 골라 주세요</b></span>`;
  $('#originNow').classList.toggle('empty', !cur);
  box.querySelector('[data-here]').onclick = locateHere;
  box.querySelectorAll('[data-place]').forEach(b => b.onclick = async () => {
    const p = places.find(x => String(x.id) === b.dataset.place); setOrigin(p.label);
    try { places = (await api(`/v1/me/places/${p.id}/select`, { method: 'POST', body: '{}' })).places; renderPlaces(); } catch { /* 표시만 */ }
  });
  $('#placeManage').onclick = () => openPlaces();
  const sv = $('#placeSaveCur');
  if (sv) sv.onclick = async () => {
    sv.disabled = true;
    if (isHere) { if (await addPlace(here.coords)) setOrigin(places.find(p => p.selected)?.label ?? cur); }
    else if (await addPlace(temp)) setOrigin(places.find(p => p.selected)?.label ?? cur); else openPlaces(temp);
    renderPlaces();
  };
  $('#placeList').innerHTML = places.map(p => `<li><span>${p.selected ? '✓ ' : ''}${esc(p.label)}</span><button type="button" class="ghost small" data-del="${p.id}">지우기</button></li>`).join('') || '<li class="muted">아직 저장한 곳이 없어요.</li>';
  $('#placeList').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { places = (await api(`/v1/me/places/${b.dataset.del}/delete`, { method: 'POST', body: '{}' })).places; renderPlaces(); });
  if ($('#placeAdd')) syncPlaceButtons();
}
async function loadPlaces() { try { places = (await api('/v1/me/places')).places; renderPlaces(); const s = places.find(p => p.selected); if (s && !$('#origin').value) setOrigin(s.label); } catch { /* 부가 기능 */ } }
async function addPlace(text) {
  $('#placeMsg').textContent = '';
  try { const r = await api('/v1/me/places', { method: 'POST', body: JSON.stringify({ text }) }); places = r.places; renderPlaces(); toast(`'${r.place.label}'을 저장했어요`); return true; }
  catch (e) { $('#placeMsg').textContent = errText(e); toast(errText(e)); return false; }
}
// 저장 절차(어디물어 '출발지 추가'와 같음): ① 동네·도로명 입력 → ② 다음(카카오) 우편번호 검색에서 선택 → ③ 저장.
// 서버에는 시·도 시·군·구 읍·면·동까지만 보낸다(도로명·건물번호는 보내지도 저장하지도 않음).
let pickedPlace = null, postcodeLoading = null;
function loadPostcode() {
  if (window.daum?.Postcode) return Promise.resolve();
  return postcodeLoading ??= new Promise((ok, no) => {
    const urls = ['https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js', 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'];
    const tryNext = i => { if (i >= urls.length) { postcodeLoading = null; return no(new Error('주소 검색을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')); }
      const s = document.createElement('script'); s.src = urls[i]; s.async = true; s.onload = () => window.daum?.Postcode ? ok() : (s.remove(), tryNext(i + 1)); s.onerror = () => { s.remove(); tryNext(i + 1); }; document.head.appendChild(s); };
    tryNext(0);
  });
}
function closePostcode() { $('#postcodeWrap').hidden = true; $('#postcodeBox').innerHTML = ''; }
const coarseAddress = d => [d.sido, d.sigungu, d.bname1 || d.bname || ''].filter(Boolean).join(' ');
async function openPostcode(query) {
  try { await loadPostcode(); } catch (e) { $('#placeMsg').textContent = errText(e); return; }
  const wrap = $('#postcodeWrap'), box = $('#postcodeBox'); box.innerHTML = ''; wrap.hidden = false;
  new window.daum.Postcode({ width: '100%', height: '100%', oncomplete: d => {
    closePostcode(); $('#placeInput').value = d.roadAddress || d.jibunAddress || coarseAddress(d); setPicked(coarseAddress(d));
  } }).embed(box, { q: query, autoClose: false });
  wrap.scrollIntoView({ block: 'nearest' });
}
function syncPlaceButtons() {
  const full = places.length >= 5;
  $('#postcodeOpen').disabled = !$('#placeInput').value.trim();
  $('#placeAdd').disabled = full || !pickedPlace; $('#placeOnce').disabled = !pickedPlace;
  if (full) $('#placeInput').placeholder = '5곳이 찼어요(저장은 하나를 지운 뒤, 이번만 쓰기는 가능)';
  else $('#placeInput').placeholder = '동네·도로명 입력 (예: 망원동)';
}
function setPicked(coarse) { syncClearButtons(); pickedPlace = coarse || null; $('#placePicked').hidden = !pickedPlace; $('#placePickedText').textContent = pickedPlace ?? ''; syncPlaceButtons(); if (pickedPlace) $('#placeAdd').focus(); }
function openPlaces(query = '') {
  $('#settingsDialog').open && $('#settingsDialog').close();
  $('#placeMsg').textContent = ''; $('#placeInput').value = query; closePostcode(); renderPlaces(); setPicked(null); $('#placesDialog').showModal();
  if (query) openPostcode(query); else setTimeout(() => $('#placeInput').focus(), 50);
}
$('#placeInput').addEventListener('input', () => { if (pickedPlace) setPicked(null); else syncPlaceButtons(); });
$('#placeForm').addEventListener('submit', e => { e.preventDefault(); const q = $('#placeInput').value.trim(); $('#placeMsg').textContent = ''; if (!q) { $('#placeMsg').textContent = '찾을 동네나 도로명을 먼저 입력해 주세요.'; return; } openPostcode(q); });
$('#postcodeClose').onclick = closePostcode;
$('#placesClose').onclick = () => { closePostcode(); $('#placesDialog').close(); };
$('#placeAdd').onclick = async () => {
  if (!pickedPlace) { $('#placeMsg').textContent = '찾기에서 주소를 먼저 골라 주세요.'; return; }
  const btn = $('#placeAdd'); btn.disabled = true; btn.textContent = '저장 중…';
  const ok = await addPlace(pickedPlace); btn.textContent = '저장';
  if (ok) { $('#placeInput').value = ''; setPicked(null); $('#placesDialog').close(); closePostcode(); const s = places.find(p => p.selected); if (s) setOrigin(s.label); } else syncPlaceButtons();
};
// ☆ 저장: 현재 위치(좌표)는 그대로 저장하고, 글자로 적은 출발지는 주소 찾기를 거쳐 저장한다
$('#placeOnce').onclick = () => { if (!pickedPlace) return; const v = pickedPlace; $('#placeInput').value = ''; setPicked(null); closePostcode(); $('#placesDialog').close(); setOrigin(v); toast(`이번에는 '${v}'에서 출발해요`); };

// ---------- 추천 버튼(오늘의 추천 '이 조건으로 만들기'·기록 '오늘 다시'): 누를 수 있는 버튼으로 보이게 ----------
// 처음 쓰는 사람을 위한 안내: 추천 버튼을 3번 누르기 전까지 '누르면 바로 만들어 드려요' 문구를 보여 준다
const ACT_KEY = 'tailtrail.actionTaps';
const actionHintNeeded = () => { try { return Number(localStorage.getItem(ACT_KEY) || 0) < 3; } catch { return true; } };
const actionUsed = () => { try { localStorage.setItem(ACT_KEY, String(Number(localStorage.getItem(ACT_KEY) || 0) + 1)); } catch { /* 저장 못 해도 동작에는 영향 없음 */ } };
/** 같은 묶음에서 누른 버튼은 채우고 나머지는 흐리게 */
function pickAct(btn, group = btn.parentElement) { actionUsed(); group.querySelectorAll('.act').forEach(x => x.classList.toggle('picked', x === btn)); group.classList.add('used'); group.classList.remove('fresh'); }
/** 목록 위 안내 한 줄 */
const tapHint = text => `<div class="tap-hint">👇 ${text}</div>`;
/** 빈 화면에서 다른 탭으로 보내는 버튼(data-go) */
const goBtn = (tab, label, ico) => `<div class="actions empty-go"><button type="button" class="act" data-go="${tab}">${actBtn(label, ico)}</button></div>`;
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b && !b.closest('.tabbar')) go(b.dataset.go); });
const actBtn = (label, ico = '💬', go = '›') => `<span class="act-ico" aria-hidden="true">${ico}</span><span class="act-label">${esc(label)}</span><span class="act-go" aria-hidden="true">${go}</span>`;

// ---------- (오늘의 말풍선·음성 기능은 꼬리길 1차에서 쓰지 않는다) ----------
let tipAudio = null;
const hideTip = () => {};

// ---------- 내 기록(최근 30일 플랜) ----------
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const kst = iso => { const d = new Date(new Date(iso).getTime() + 9 * 3600e3); return { date: `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}(${WD[d.getUTCDay()]})`, time: d.toISOString().slice(11, 16) }; };
async function loadHistory() {
  const box = $('#history'); box.innerHTML = '<p class="loading">기록을 불러오는 중…</p>';
  try {
    const { plans } = await api('/v1/me/plans?limit=100');
    if (!plans.length) { box.innerHTML = '<p class="empty">아직 만든 산책 판단이 없어요. 오늘 탭에서 첫 판단을 만들어 보세요!</p>' + goBtn('plan', '오늘 산책 판단하러 가기', '🐾'); return; }
    const days = {}; for (const p of plans) (days[kst(p.created_at).date] ??= []).push(p);
    box.innerHTML = Object.entries(days).map(([d, ps], i) => `<details class="hist-day"${i === 0 ? ' open' : ''}><summary><b>${esc(d)}</b><span class="muted">판단 ${ps.length}개</span></summary>${ps.map(p => `
      <div class="hist-item"><div></div><div>
        <div class="muted small-text">${esc(kst(p.created_at).time)} · ${esc(p.walk_date)} · 🐕 ${esc(p.dog_name ?? '우리 아이')}</div>
        <b>${esc(p.sigungu ?? '')}</b> <span class="tag ${GC[p.gate] ?? 'caution'}">${esc(p.gate_name ?? p.gate ?? '')} ${p.score ?? ''}</span>
        <div class="small-text">${esc(p.headline ?? '')}${p.course ? ` · ${esc(p.course)}` : ''}</div>
        <div class="acts"><button type="button" class="act small act-primary" data-view="${p.id}">${actBtn('다시 보기', '📖')}</button><button type="button" class="act small" data-again="${p.id}" data-place="${esc(p.sigungu ?? '')}">${actBtn('오늘 다시 판단', '🐾')}</button></div>
      </div></div>`).join('')}</details>`).join('') + '<p class="muted small-text">판단 기록은 서비스 개선과 운영을 위해 30일간 보관된 뒤 자동으로 지워져요. 꼬리일기는 직접 지울 때까지 남아요.</p>';
    box.querySelectorAll('[data-view]').forEach(b => b.onclick = async () => { try { const r = await api('/v1/plans/' + b.dataset.view); lastPlan = { id: r.id, plan: r.plan }; go('plan'); renderPlan(lastPlan); } catch (e) { toast(errText(e)); } });
    box.querySelectorAll('[data-again]').forEach(b => b.onclick = () => { if (quotaLocked) { toast(QUOTA_EMPTY_MSG); return; } pickAct(b, box); setOrigin(b.dataset.place); sel.date = 'today'; go('plan'); drawForm(); $('#planForm').requestSubmit(); });
  } catch (e) { box.innerHTML = `<p class="msg">${esc(errText(e))}</p>`; }
}
$('#btnHistory').onclick = () => go('history');

// ---------- 의견 보내기(별점 선택 + 500자, 하루 5번) ----------
let rating = null;
function setRating(v) { rating = rating === v ? null : v; document.querySelectorAll('.star').forEach(b => { b.classList.toggle('on', !!rating && Number(b.dataset.v) <= rating); b.setAttribute('aria-pressed', String(Number(b.dataset.v) === rating)); }); }
document.querySelectorAll('.star').forEach(b => b.onclick = () => setRating(Number(b.dataset.v)));
$('#opinionText').addEventListener('input', () => { $('#opinionCount').textContent = `${$('#opinionText').value.length}/500`; });
$('#opinionForm').onsubmit = async e => {
  e.preventDefault(); const text = $('#opinionText').value.trim(), m = $('#opinionMsg');
  if (!text) { m.textContent = '의견을 한 줄이라도 적어 주세요.'; return; }
  $('#opinionSend').disabled = true; m.textContent = '';
  try { await api('/v1/opinions', { method: 'POST', body: JSON.stringify({ rating, text }) }); $('#opinionText').value = ''; $('#opinionCount').textContent = '0/500'; rating = null; setRating(null); go('plan'); toast('소중한 의견 감사합니다! 더 나은 꼬리길으로 보답할게요.'); }
  catch (err) { m.textContent = errText(err) || '의견을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.'; }
  finally { $('#opinionSend').disabled = false; }
};

// ---------- 계정 설정·사용량·AI 잠금 ----------
// 로그인 이용 안내: 서버 기본 한도(/healthz)를 따르고, 없으면 화면에 둔 기본값
const showLoginPolicy = () => { $('#loginPolicy').textContent = policyText('user', state.roleLimits?.user) + '. 계정마다 다를 수 있어요. ' + DAY_NOTE; };
showLoginPolicy();
let usage = null, aiLocked = false, planning = false; // planning: 판단 만드는 중
async function refreshUsage() {
  const token = state.auth?.token;
  if (!token) return;
  try {
    const me = await api('/v1/auth/me', { timeoutMs: 10000 });
    if (!me.user || token !== state.auth?.token) return;
    syncAccount(me);
    $('#btnAdmin').hidden = state.auth.user.role !== 'admin';
    usage = { limits: me.limits, today: me.usage.today, session: me.session?.messages ?? 0 };
    applyAiLock(me.ai);
  } catch { if (token === state.auth?.token) usage = null; /* 401은 자동 로그아웃 처리 */ }
  renderQuota();
}
// 관리자가 바꾼 한도(세션 시간·로그인 횟수·토큰)와 남은 시간을 1분마다 서버 값으로 맞춘다(화면이 보일 때만)
setInterval(() => { if (state.auth && document.visibilityState === 'visible') refreshUsage(); }, 60000);

// ---------- 오늘 남은 산책 판단 횟수 표시·소진 잠금 ----------
// 판단 1번 = 질문 1건. 오늘 횟수를 다 쓰면 만들기를 막는다. 날짜가 바뀌거나 한도가 늘면 1분 안에 자동으로 풀린다.
const fmt = v => Number(v || 0).toLocaleString('ko-KR');
const hasQuota = () => usage?.limits?.dailyMessages != null && usage?.today?.messages != null;
const quotaLeft = () => hasQuota() ? Math.max(0, usage.limits.dailyMessages - usage.today.messages) : null;
const quotaText = () => `${fmt(quotaLeft())}회 / ${fmt(usage.limits.dailyMessages)}회`;
const QUOTA_EMPTY_MSG = '오늘 만들 수 있는 산책 판단 횟수를 모두 썼어요. 내일(한국 시간 밤 12시 지나서) 다시 만들어 주세요.';
let quotaLocked = false;
function renderQuota() {
  quotaLocked = !!(state.auth && hasQuota() && quotaLeft() <= 0);
  const el = $('#quotaLeft'), low = hasQuota() && quotaLeft() <= Math.max(1, usage.limits.dailyMessages * 0.1);
  el.hidden = !hasQuota();
  if (hasQuota()) el.textContent = quotaLocked ? '🐾 ' + QUOTA_EMPTY_MSG : `🐾 오늘 남은 산책 판단 ${quotaText()}`;
  el.classList.toggle('warn', low);
  const tag = $('#planQuotaTag'); if (tag) { tag.hidden = !hasQuota(); if (hasQuota()) tag.textContent = `오늘 남은 산책 판단 ${quotaText()}`; tag.classList.toggle('warn', low); }
  $('#btnPlan').disabled = !!aiLocked || quotaLocked || planning;
  $('#planForm').classList.toggle('token-empty', quotaLocked);
}
/** 로그아웃 확인창: 이용 조건(로그인 횟수·이용 시간·자동 로그아웃·하루 AI 사용량)을 계정 한도 값으로 짧게 */
/** 남은 횟수(아는 것만): 로그아웃 확인창·계정 설정이 같이 쓴다 */
function remainParts() {
  const lq = loginQuota(), left = quotaLeft(), parts = [];
  if (lq?.left != null) parts.push(`남은 로그인 ${fmt(lq.left)}번`);
  if (left != null) parts.push(`오늘 남은 산책 판단 ${fmt(left)}번`);
  return parts;
}
/** 로그아웃 확인창: 규칙 설명 없이 남은 횟수만 한 줄로(모르면 감사 인사만) */
function logoutText() { const parts = remainParts(); return '이용해 주셔서 감사합니다.' + (parts.length ? '\n' + parts.join(' · ') : ''); }
function applyAiLock(ai) {
  aiLocked = ai && ai.available === false && state.auth?.user?.role !== 'admin';
  $('#aiLock').hidden = !aiLocked; if (aiLocked) { $('#aiLockMsg').textContent = ai.message || '지금은 AI 이용량이 모두 소진되어 잠시 이용할 수 없어요.'; hideTip(); }
  $("#btnPlan").disabled = !!aiLocked || quotaLocked || planning;
}
/** 화면 모드: 자동(기기 설정) · 밝게 · 어둡게. 이 기기에만 기억한다 */
function applyTheme(mode) {
  const m = mode === 'light' || mode === 'dark' ? mode : 'auto';
  const html = document.documentElement;
  if (html?.dataset) { if (m === 'auto') delete html.dataset.theme; else html.dataset.theme = m; }
  try { if (m === 'auto') localStorage.removeItem('tailtrail.theme'); else localStorage.setItem('tailtrail.theme', m); } catch { /* 저장 못 해도 지금 화면에는 적용 */ }
  document.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === m)));
}
document.querySelectorAll('[data-theme-set]').forEach(b => b.onclick = () => applyTheme(b.dataset.themeSet));
applyTheme((() => { try { return localStorage.getItem('tailtrail.theme'); } catch { return null; } })());
async function openSettings() {
  await refreshUsage();
  const a = state.auth; if (!a) return;
  $('#accountInfo').textContent = `${a.user.displayName}(${a.user.loginId}) · ${ROLE_LABEL[a.user.role] ?? a.user.role}`;
  // 로그아웃 확인창과 같은 말투: 남은 것만 한 줄 + 꼭 필요한 안내 한 줄
  $('#usageInfo').textContent = [`남은 시간 ${Math.floor(remaining() / 60)}분`, ...remainParts()].join(' · ') + '\n산책 판단 횟수는 매일 밤 12시에 다시 채워져요.';
  $('#settingsDialog').showModal();
}
$('#btnSettings').onclick = openSettings;
$('#btnHistory2').onclick = () => { $('#settingsDialog').close(); go('history'); };
$('#btnPlaces').onclick = () => openPlaces();
$('#btnPw').onclick = () => { $('#settingsDialog').close(); openPw(false); };
function showNotice(title, msg) { const d = $('#noticeDialog'); if (d.open) return; $('#noticeTitle').textContent = title; $('#noticeMsg').textContent = msg; try { d.showModal(); } catch { /* 로그인 화면 문구로 안내 */ } }

// ---------- 로그인 위치(허용한 경우만 세션당 1회, 서버가 약 100m 단위로 저장·30일 보관) ----------
function recordLoginLocation() {
  const sid = state.auth?.token?.slice(-12); if (!sid || sessionStorage.getItem('tailtrail.locAsked') === sid) return;
  sessionStorage.setItem('tailtrail.locAsked', sid);
  const post = body => api('/v1/auth/location', { method: 'POST', body: JSON.stringify(body), timeoutMs: 10000 }).catch(() => {});
  if (!navigator.geolocation) return post({ status: 'unavailable' });
  navigator.geolocation.getCurrentPosition(p => post({ status: 'granted', lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }), e => post({ status: e.code === 1 ? 'denied' : 'unavailable' }), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}

// ---------- 무응답 자동 로그아웃: 15분(14분에 경고). 플랜을 만드는 중·음성 재생 중은 사용 중으로 본다 ----------
const IDLE_MS = 15 * 60 * 1000, IDLE_WARN_MS = 14 * 60 * 1000;
let lastActive = Date.now(), idleWarned = false;
const markActive = () => { lastActive = Date.now(); idleWarned = false; };
['pointerdown', 'touchstart', 'keydown', 'input', 'wheel', 'scroll'].forEach(ev => window.addEventListener(ev, markActive, { passive: true, capture: true }));
const audioPlaying = () => [...document.querySelectorAll('audio')].some(a => !a.paused) || (tipAudio && !tipAudio.paused);
setInterval(() => {
  if (!state.auth) { markActive(); return; }
  if (audioPlaying() || $('#btnPlan').textContent.includes('모으는 중')) { markActive(); return; }
  const idle = Date.now() - lastActive;
  if (idle >= IDLE_MS) { endSession('15분 동안 사용이 없어 자동 로그아웃했어요.', 'idle'); showNotice('자동 로그아웃됐어요', '15분 동안 사용이 없어 안전을 위해 로그아웃했어요.\n다시 로그인해 주세요.'); }
  else if (idle >= IDLE_WARN_MS && !idleWarned) { idleWarned = true; toast('1분 동안 사용이 없으면 자동 로그아웃돼요. 화면을 터치하면 계속 이용할 수 있어요.', 8000); }
}, 15000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lastActive = Math.min(lastActive, Date.now()); });

// ---------- 로그인 ----------
function showLogin(msg = '') {
  timer?.stop(); timer = null; hideTip(); applyAiLock(null);
  for (const d of ['#settingsDialog', '#placesDialog', '#pwDialog', '#logoutDialog']) if ($(d).open) $(d).close();
  $('#appView').hidden = true; $('#loginView').hidden = false; $('#loginMsg').textContent = msg; $('#loginMsg').dataset.kind = 'info'; $('#btnAdmin').hidden = true;
  usage = null; renderQuota();
  const id = localStorage.getItem('tailtrail.loginId'); if (id) { $('#loginId').value = id; $('#rememberId').checked = true; }
  syncClearButtons();
}
// 입력칸 오른쪽 ⓧ: 값이 있을 때만 보이고, 누르면 지운 뒤 그 칸에 다시 포커스(어디물어와 같은 방식)
document.querySelectorAll('input[data-clearable], textarea[data-clearable]').forEach(inp => {
  const btn = inp.parentElement.querySelector('.clear-btn'); if (!btn) return;
  const sync = () => { btn.hidden = !inp.value; };
  ['input', 'change', 'focus'].forEach(ev => inp.addEventListener(ev, sync));
  sync(); setTimeout(sync, 300); // 비밀번호 관리자의 자동 입력 반영
  btn.addEventListener('mousedown', e => e.preventDefault()); // 포커스가 빠져 키보드가 닫히지 않게
  btn.onclick = e => { e.preventDefault(); inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus(); };
});
// 값을 코드로 넣은 뒤(저장된 아이디 등) ⓧ 표시를 맞춘다. 함수 선언이라 모듈 초기화 순서와 무관
function syncClearButtons() { document.querySelectorAll('input[data-clearable], textarea[data-clearable]').forEach(inp => { const b = inp.parentElement.querySelector('.clear-btn'); if (b) b.hidden = !inp.value; }); }
let ending = false;
function endSession(msg, reason = 'logout') { if (ending) return; ending = true; refreshShelter = null; firstShelterOrigin = null; $('#shelterRoot').replaceWith($('#shelterRoot').cloneNode(false)); places = []; $('#origin').value = ''; here = null; originRevision++; locating = false; go('plan'); logout(reason); lastPlan = null; $('#planResult').innerHTML = ''; dogs = []; sel.dogId = null; showLogin(msg); ending = false; }
async function showApp() {
  $('#loginView').hidden = true; $('#appView').hidden = false;
  if (!dogOptions.sizes.length) { try { dogOptions = await api('/v1/dog-options', { noAuth: true }); } catch { /* 기본 선택지 없이도 오늘 판단은 가능 */ } }
  try { drawForm(); } catch (e) { uiError(e); }
  if (!state.auth) return;
  $('#btnAdmin').hidden = state.auth.user?.role !== 'admin';
  markActive();
  timer?.stop();
  timer = startTimer($('#timer'), { onWarn: () => toast('1분 뒤 자동 로그아웃돼요. 필요한 내용은 지금 확인해 주세요.', 8000), onExpire: () => { const min = sessionMinutes(), lq = loginQuota(); endSession(`${min}분 이용 시간이 끝나 로그아웃했어요.`, 'expired'); showSessionEnd(min, lq); } });
  if (state.auth.user?.mustChangePassword) openPw(true);
  refreshUsage();
  loadPlaces().then(loadDogs);
  recordLoginLocation();
}
// 이용 시간 만료 안내: 이 계정의 로그인 1회 시간과 남은 로그인 횟수(최근 24시간 기준)
function showSessionEnd(min, lq) {
  const more = !lq || lq.left > 0;
  showNotice(more ? '이번 이용 시간이 끝났어요' : '오늘 이용 시간이 끝났어요', `이 계정은 로그인 1회에 ${min}분 이용할 수 있어요.\n${nextLoginText(lq)}\n이용해 주셔서 감사합니다.${more ? '' : ' 다음에 다시 찾아 주세요.'}`);
}
function openPw(forced = true) {
  $('#pwMsg').textContent = ''; $('#pwCur').value = ''; $('#pwNew').value = ''; $('#pwNew2').value = ''; hidePwAll(); syncClearButtons();
  $('#pwReason').textContent = forced ? '처음 로그인했거나 관리자가 초기화한 계정이에요. 새 비밀번호를 정해 주세요.' : '지금 비밀번호와 새 비밀번호를 입력해 주세요.';
  $('#pwCancel').hidden = forced; $('#pwDialog').showModal();
}
// 비밀번호 변경 창: 칸마다 보기(눈)·지우기(ⓧ). 창을 열 때와 보낼 때는 다시 가린다
const pwEyes = () => document.querySelectorAll('.eye-btn[data-eye]');
function setEye(btn, on) { const inp = document.getElementById(btn.dataset.eye); inp.type = on ? 'text' : 'password'; btn.setAttribute('aria-pressed', String(on)); btn.setAttribute('aria-label', on ? '비밀번호 숨기기' : '비밀번호 보기'); }
pwEyes().forEach(b => { b.addEventListener('mousedown', e => e.preventDefault()); b.addEventListener('click', () => { setEye(b, b.getAttribute('aria-pressed') !== 'true'); document.getElementById(b.dataset.eye).focus(); }); });
const hidePwAll = () => pwEyes().forEach(b => setEye(b, false));
$('#pwCancel').onclick = () => $('#pwDialog').close();
$('#pwDialog').addEventListener('close', () => { hidePwAll(); for (const id of ['pwCur', 'pwNew', 'pwNew2']) { $('#' + id).value = ''; } syncClearButtons(); });
$('#pwDialog').addEventListener('cancel', e => { if ($('#pwCancel').hidden) e.preventDefault(); }); // 첫 로그인 변경은 닫지 못하게
$('#pwForm').onsubmit = async e => {
  e.preventDefault(); hidePwAll(); // 보낼 때는 다시 가린다(브라우저 비밀번호 저장도 정상 동작)
  if ($('#pwNew').value !== $('#pwNew2').value) { $('#pwMsg').textContent = '새 비밀번호 두 칸이 서로 달라요'; return; }
  try {
    const r = await api('/v1/auth/password', { method: 'POST', body: JSON.stringify({ current: $('#pwCur').value, next: $('#pwNew').value }) });
    if (r.token) saveAuth({ ...state.auth, token: r.token });
    saveAuth({ ...state.auth, user: { ...state.auth.user, mustChangePassword: false } });
    $('#pwDialog').close(); toast('비밀번호를 바꿨어요');
  } catch (err) { $('#pwMsg').textContent = errText(err); }
};
// 비밀번호 보기/숨기기: 지우기(ⓧ)와 함께 둔다. 보기 버튼은 맨 오른쪽 고정 자리, 지우기는 글자가 있을 때만 그 왼쪽에
function setPwVisible(on) {
  const pw = $('#loginPw'), b = $('#pwToggle'); if (!pw || !b) return;
  pw.type = on ? 'text' : 'password'; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? '비밀번호 숨기기' : '비밀번호 보기');
}
$('#pwToggle')?.addEventListener('mousedown', e => e.preventDefault()); // 포커스가 빠져 키보드가 닫히지 않게
$('#pwToggle')?.addEventListener('click', () => { const pw = $('#loginPw'); setPwVisible(pw.type === 'password'); pw.focus(); });
$('#loginForm').onsubmit = async e => {
  e.preventDefault(); const btn = $('#loginBtn'); btn.disabled = true; $('#loginMsg').textContent = ''; setPwVisible(false); // 보낼 때는 다시 가린다(브라우저 비밀번호 저장도 정상 동작)
  try {
    const id = $('#loginId').value.trim();
    await login(id, $('#loginPw').value);
    if ($('#rememberId').checked) localStorage.setItem('tailtrail.loginId', id); else localStorage.removeItem('tailtrail.loginId');
    $('#loginPw').value = ''; await showApp();
  } catch (err) {
    if (err.code === 'ACTIVE_SESSION') { $('#loginPw').value = ''; showNotice('다른 기기에서 이용 중이에요', errText(err)); }
    else if (err.code === 'LOGIN_DAILY_LIMIT') showNotice('로그인 횟수를 모두 쓰셨어요', err.nextLoginAt && err.loginLimit ? nextLoginText({ left: 0, limit: err.loginLimit, nextAt: err.nextLoginAt }) : errText(err));
    else { $('#loginMsg').textContent = errText(err); $('#loginMsg').dataset.kind = 'error'; }
  } finally { btn.disabled = false; }
};
// 로그아웃: 확인 창 먼저(확인 = 로그아웃, 취소 = 그대로)
$('#btnLogout').onclick = () => {
  const d = $('#logoutDialog');
  const update = () => { $('#logoutMsg').textContent = logoutText(); };
  update();
  refreshUsage().then(() => { if (d.open) update(); });
  d.returnValue = 'cancel';
  d.onclose = () => { if (d.returnValue === 'ok') endSession('로그아웃했어요.'); else markActive(); };
  d.showModal();
};
setOnAuthLost(msg => endSession(msg || '다시 로그인해 주세요', 'lost'));
setOnMustChange(() => openPw(true));

(async () => {
  const h = await health();
  if (h.error) return showLogin('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
  showLoginPolicy();
  if (state.authMode === 'off' || state.auth) return showApp();
  showLogin();
})();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

