// This module renders only normalized public shelter fields. It never stores an origin/address.
const code = v => typeof v === 'string' && /^\d{7}$/.test(v);
const validRegion = r => r && code(r.upr) && (!r.org || code(r.org));
const regionName = r => [r.uprName || r.upr, r.orgName || r.org].filter(Boolean).join(' ');
const lastKey = k => k + ':last';
function readRegion(key) {
  for (const read of [() => sessionStorage.getItem(key), () => localStorage.getItem(key)]) {
    try { const r = JSON.parse(read()); if (validRegion(r)) return r; } catch { /* storage unavailable */ }
  }
  return null;
}
function writeRegion(key, r) {
  for (const w of [() => sessionStorage.setItem(key, JSON.stringify(r)), () => localStorage.setItem(key, JSON.stringify(r))]) { try { w(); } catch { /* ignore */ } }
}
function preferenceKey() {
  try {
    const user = JSON.parse(sessionStorage.getItem('tailtrail.auth'))?.user;
    const id = user?.loginId || user?.id;
    return id ? `tailtrail.shelter.user:${encodeURIComponent(id)}` : 'tailtrail.shelter.guest';
  } catch { return 'tailtrail.shelter.guest'; }
}
const photoURL = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
};
const defaults = () => ({ state: 'protect', sex: '', sort: 'new', center: '', q: '', page: 1, size: 12 });
export function mountShelter(root, { api, origin, places, onRegister }) {
  const doc = root.ownerDocument;
  const el = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  };
  const button = (name, action) => { const b = el('button', '', name); b.type = 'button'; b.onclick = action; return b; };
  // 라벨 글자는 화면에서 숨기고(sr-only) 스크린리더용으로만 남긴다. 셀렉트는 옵션 글자 '제목 · 값'으로 뜻을 보인다
  const field = (name, node) => { const l = el('label', 'shelter-field'); l.append(el('span', 'sr-only', name), node); if (!node.getAttribute?.('aria-label')) node.setAttribute?.('aria-label', name); return l; };
  function options(select, list, value = '') {
    select.replaceChildren(...list.map(([v, name]) => { const o = el('option', '', name); o.value = v; return o; })); select.value = value;
  }
  const get = (route, args = {}) => {
    const query = new URLSearchParams(Object.entries(args).filter(([,v]) => v != null && v !== '')).toString();
    return api(`/v1/shelter/${route}${query ? '?' + query : ''}`);
  };
  function photo(url, breed) {
    const missing = () => el('div', 'shelter-placeholder', '등록된 사진이 없어요');
    if (!url) return missing();
    const img = el('img', 'shelter-photo'); img.alt = `${breed} 공고 사진`; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.onerror = () => img.replaceWith(missing()); img.src = url; return img;
  }
  function card(d) {
    const article = el('article', 'shelter-card'), body = el('div', 'shelter-card-body');
    const breed = d.breed || '품종 미확인', urls = [...new Set([d.photo, ...(d.photos || [])].map(photoURL).filter(Boolean))];
    const thumb = el('div', 'shelter-thumb'); thumb.append(photo(urls[0], breed)); // 목록형: 왼쪽 정사각 대표 사진 1장
    article.append(thumb, body);
    body.append(el('span', 'shelter-badge', d.phase === 'ended' ? (d.processState || '보호 종료') : d.phase === 'adoptable' ? '입양 문의 가능' : '보호 중 · 공고'), el('h3', '', breed), el('p', '', [d.sex, d.age, d.weight, d.color].filter(Boolean).join(' · ')));
    if (d.mark) body.append(el('p', '', d.mark));
    const center = d.center || {};
    body.append(el('p', '', center.name || '보호센터 미확인'), el('small', '', `공고번호 ${d.noticeNo || '미확인'}`));
    const detail = el('details', 'shelter-details'), facts = el('dl', 'shelter-facts');
    const fact = (k, v) => facts.append(el('dt', '', k), el('dd', '', v || '미확인'));
    fact('발견 날짜', d.foundDate); fact('발견 장소', d.foundAt); fact('공고 기간', [d.noticeFrom, d.noticeTo].map(x => x || '미확인').join(' ~ '));
    fact('중성화', d.neuter); fact('관할 기관', d.org); fact('센터 주소', center.address);
    if (d.phase !== 'ended' && d.adoptableFrom) fact('입양 문의 기준일', `${d.adoptableFrom} 이후 (센터 확인 필요)`);
    detail.append(el('summary', '', '공고 상세 · 센터 연락처'), facts);
    if (center.tel && /^\+?[\d ()-]{7,24}$/.test(center.tel) && center.tel.replace(/\D/g, '').length >= 7) {
      const a = el('a', '', `센터 전화 ${center.tel}`); a.href = 'tel:' + center.tel.replace(/[^\d+]/g, ''); detail.append(a);
    } else detail.append(el('p', '', `센터 전화: ${center.tel || '미등록'}`));
    detail.append(el('p', '', d.phase === 'ended' ? '보호가 종료된 공고예요.' : '입양 가능 여부와 방문 일정은 공고번호를 알려 주고 센터에 확인하세요.'));
    for (const url of urls.slice(1)) detail.append(photo(url, breed));
    body.append(detail); return article;
  }
  function guideBody(g) {
    const box = el('div');
    const list = (title, rows, tag = 'ul') => { if (!rows?.length) return; const ul = el(tag); for (const row of rows) ul.append(el('li', '', row)); box.append(el('h3', '', title), ul); };
    for (const t of [g.clock?.notice, g.clock?.ownerNote]) if (t) box.append(el('p', '', t));
    list('입양 절차', g.steps?.map(s => `${s.title}: ${s.body}`), 'ol'); list('입양 전 확인', g.checklist); list('방문 준비물', g.carry);
    if (g.lost) box.append(el('h3', '', g.lost.title), el('p', '', g.lost.body)); list('알아 두세요', g.caution); return box;
  }
  let entry = 0;
  return async function refresh() {
    const turn = ++entry, alive = () => turn === entry, key = preferenceKey();
    let active = null, lookup = 0, search = 0, find = 0, saved = null, filters = defaults();
    saved = readRegion(key); const last = readRegion(lastKey(key));
    const panel = el('section', 'shelter-panel'), head = el('header', 'shelter-head');
    head.append(el('h2', '', '동물보호소'), el('p', '', '우리 동네에서 최근 7일 안에 공고된 강아지를 찾아보세요.'));
    // 컴팩트 기준 지역 바 + 접힌 지역 선택 카드(‘다른 지역 찾기’로 펼침)
    const prompt = el('section', 'shelter-prompt'), bar = el('div', 'shelter-bar'), barText = el('span', 'shelter-bar-text'), findBtn = button('다른 지역 찾기', () => toggleRegion());
    prompt.hidden = bar.hidden = true; findBtn.className = 'shelter-bar-btn'; bar.append(barText, findBtn);
    const region = el('section', 'shelter-region'), prov = el('select'), district = el('select'), note = el('p', 'shelter-status');
    note.setAttribute('role','status');
    const selName = s => s.selectedOptions[0]?.textContent || '';
    region.hidden = true; findBtn.setAttribute('aria-expanded', 'false');
    function toggleRegion(open = region.hidden) { region.hidden = !open; findBtn.setAttribute('aria-expanded', String(open)); }
    const browse = button('이 지역 보기', () => activate({ upr: prov.value, uprName: selName(prov), org: district.value || null, orgName: district.value ? selName(district) : null }, 'manual'));
    const save = button('기본 지역으로 저장', () => {
      if (!active || !alive() || preferenceKey() !== key) return;
      try { sessionStorage.setItem(key, JSON.stringify(active)); saved = active; note.textContent = `기본 지역으로 저장했어요: ${regionName(saved)}`; } catch { note.textContent = '이 브라우저에서는 지역을 저장할 수 없어요.'; }
    });
    const home = button('기본 지역 보기', () => saved ? activate(saved, 'saved') : locate()), nearby = button('산책 출발지로 찾기', () => locate());
    options(prov, [['','시도 선택']]); options(district, [['','시군구 전체']]); district.disabled = browse.disabled = save.disabled = true;
    browse.classList?.add('primary-act'); const acts = el('div', 'region-acts'); acts.append(browse, save, home, nearby);
    const closeBtn = button('닫기', () => toggleRegion(false)); closeBtn.className = 'shelter-close'; const regionHead = el('div', 'shelter-region-head'); regionHead.append(el('h3', '', '지역 선택'), closeBtn);
     region.append(regionHead, field('시도',prov), field('시군구',district), acts, note);
    const current = el('h3'), form = el('form','shelter-filters'), status = el('p','shelter-status'), results = el('div','shelter-list'), pager = el('nav','shelter-pager'), source = el('p','shelter-source');
    status.setAttribute('role','status'); pager.setAttribute('aria-label','공고 페이지');
    const controls = {};
    // 옵션 글자 '제목 · 값'. 좁은 화면(480px 미만)은 값이 잘리지 않게 짧은 제목·짧은 값으로(value 는 그대로)
    const narrowQ = typeof matchMedia === 'function' ? matchMedia('(max-width: 479px)') : null, narrow = () => Boolean(narrowQ?.matches);
    const FILTER_TEXT = {
      state: { protect: ['보호 상태 · 보호 중', '상태 · 보호 중'], ended: ['보호 상태 · 가족을 만난 아이', '상태 · 가족 만남'] },
      sex: { '': ['성별 · 전체', '성별 · 전체'], M: ['성별 · 수컷', '성별 · 수컷'], F: ['성별 · 암컷', '성별 · 암컷'] },
      sort: { new: ['정렬 · 최신 공고순', '정렬 · 최신순'], ending: ['정렬 · 공고 종료일순', '정렬 · 마감순'] },
      center: { '': ['보호센터 · 전체', '센터 · 전체'] }
    };
    const filterText = (k, v) => FILTER_TEXT[k]?.[v]?.[narrow() ? 1 : 0] ?? (k === 'center' ? (narrow() ? `센터 · ${v}` : `보호센터 · ${v}`) : v);
    const centerOpts = (list = []) => [['', filterText('center', '')], ...list.map(c => [c.name, `${filterText('center', c.name)} (${c.count})`])];
    let centerList = [];
    function selectFilter(k, name) { const s = controls[k] = el('select'); options(s, Object.keys(FILTER_TEXT[k]).map(v => [v, filterText(k, v)]), filters[k]); form.append(field(name,s)); s.onchange = () => { if (k === 'state') controls.center.value = ''; return apply(); }; }
    selectFilter('state','보호 상태'); selectFilter('sex','성별'); selectFilter('sort','정렬'); selectFilter('center','보호센터');
    controls.q = el('input'); controls.q.type = 'search'; controls.q.maxLength = 30; controls.q.placeholder = '품종·장소·공고번호';
    // 폭이 480px 를 넘나들면 옵션 글자만 바꾼다(고른 값 유지)
    narrowQ?.addEventListener?.('change', () => { if (!alive()) return; for (const k of ['state', 'sex', 'sort']) { const s = controls[k], v = s.value; options(s, Object.keys(FILTER_TEXT[k]).map(x => [x, filterText(k, x)]), v); } const cv = controls.center.value; options(controls.center, centerOpts(centerList), cv); });
    controls.q.setAttribute?.('aria-label','검색어(품종, 발견 장소, 공고번호)');
    const submit = el('button','shelter-submit','검색'); submit.type = 'submit'; form.append(field('검색어',controls.q), submit);
    form.onsubmit = e => { e.preventDefault(); return apply(); }; form.hidden = true;
    const guide = el('details','shelter-guide'), guideSlot = el('div','','안내를 불러오는 중이에요.'); guide.append(el('summary','','입양 절차 · 잃어버린 반려견 찾기'),guideSlot);
    const official = el('aside','shelter-source');
    const officialLink = (text, path) => { const a = el('a','',text); a.href = `https://www.animal.go.kr/front/${path}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
    official.append(el('p','','입양 전에는 공고번호를 메모하고 센터에 전화해 현재 보호 상태, 방문 예약, 준비물을 확인하세요.'), officialLink('공식 보호동물 검색','awtis/public/publicList.do?menuNo=1000000055'), el('span','',' · '), officialLink('국가동물보호정보시스템 홈','index.do'));
    panel.append(head,prompt,bar,region,current,form,status,results,pager,source,official,guide); root.replaceChildren(panel);
    async function loadGuide() {
      try { const r = await get('guide'); if (alive()) guideSlot.replaceChildren(guideBody(r.guide),el('small','shelter-source',r.attribution)); }
      catch { if (alive()) guideSlot.replaceChildren(el('p','','안내를 불러오지 못했어요.'),button('안내 다시 시도',loadGuide)); }
    }
    function apply() { for (const [k,s] of Object.entries(controls)) filters[k] = s.value; filters.page = 1; return loadDogs(); }
    async function loadDogs() {
      if (!active || !alive()) return;
      const id = ++search; status.textContent = '공고를 불러오는 중이에요.'; results.replaceChildren(); pager.replaceChildren(); source.textContent = '';
      const fail = msg => { status.textContent = msg; pager.append(button('공고 다시 시도',loadDogs)); };
      try {
        const r = await get('dogs',{ upr:active.upr, org:active.org, ...filters }); if (!alive() || id !== search) return;
        source.textContent = [r.attribution, r.window && `${r.window.from} ~ ${r.window.to}`, r.source?.fetchedAt && `자료 수집 ${r.source.fetchedAt}`].filter(Boolean).join(' · ');
        if (!['ok','no-data'].includes(r.source?.status)) { fail(({ 'missing-key':'공공데이터 연결이 아직 설정되지 않았어요.', unauthorized:'공공데이터 접근 승인을 확인 중이에요.' })[r.source?.status] || '공공데이터 제공기관에서 자료를 받지 못했어요. 잠시 후 다시 시도하세요.'); return; }
        centerList = r.centers || []; options(controls.center, centerOpts(centerList), filters.center);
        const dogs = r.dogs || []; status.textContent = dogs.length ? `검색 결과 ${r.total}마리 · ${r.page}/${r.pages}쪽` : '이 조건에 맞는 최근 7일 공고가 없어요. 지역이나 검색 조건을 바꿔 보세요.';
        results.replaceChildren(...dogs.map(card)); filters.page = r.page || 1;
        if (r.pages > 1) { const go = n => { filters.page = n; return loadDogs(); }; const prev = button('이전',()=>go(r.page-1)), next = button('다음',()=>go(r.page+1)); prev.disabled = r.page <= 1; next.disabled = r.page >= r.pages; pager.append(prev,el('span','',`${r.page} / ${r.pages}`),next); }
      } catch { if (alive() && id === search) fail('공고를 불러오지 못했어요. 연결을 확인해 주세요.'); }
    }
    function activate(r, basis = 'manual') {
      if (!validRegion(r) || !alive()) return; ++find; active = { upr:r.upr, org:r.org || null, uprName:r.uprName || '', orgName:r.orgName || '' };
      filters = defaults(); for (const [k,s] of Object.entries(controls)) s.value = filters[k];
      centerList = []; options(controls.center, centerOpts()); current.textContent = '최근 7일 공고'; barText.textContent = `📍 ${regionName(active)} · ${BASIS[basis] || BASIS.manual}`; bar.hidden = false; toggleRegion(false);
      if (basis === 'manual') { writeRegion(lastKey(key), active); prompt.hidden = true; } form.hidden = false; save.disabled = false;
      note.textContent = saved ? `기본 지역: ${regionName(saved)}` : '지금 보는 지역을 기본 지역으로 저장할 수 있어요.'; return loadDogs();
    }
    const BASIS = { frequent: '자주 걷는 곳 기준', history: '최근 조회한 지역', saved: '기본 지역', origin: '산책 출발지 기준', manual: '직접 고른 지역' };
    function nudge(text, find) {
      const acts = el('div', 'shelter-prompt-acts'); acts.append(button('자주 걷는 곳 등록', () => onRegister?.()));
      if (find) acts.append(button('다른 지역 찾기', () => toggleRegion()));
      prompt.replaceChildren(el('p', '', text), acts); prompt.hidden = false;
    }
    // 기본 지역 우선순위: ① 자주 걷는 곳(첫 번째) ② 저장/최근 조회 지역(+ 등록 유도) ③ 둘 다 없음(등록 유도 카드 + 다른 지역 찾기)
    async function start() {
      const place = places?.()?.[0];
      if (place) {
        const id = ++find;
        try { const r = await get('locate', { origin: place }); if (!alive() || id !== find) return; if (!validRegion(r)) throw Error(); return activate(r, 'frequent'); }
        catch { if (!alive() || id !== find) return; note.textContent = '자주 걷는 곳의 지역을 찾지 못했어요. 지역을 직접 선택해 주세요.'; }
      }
      const prev = saved || last;
      if (prev) { if (!place) nudge('자주 걷는 곳을 등록하면 우리 동네 보호소를 바로 볼 수 있어요', false); return activate(prev, saved ? 'saved' : 'history'); }
      nudge('자주 걷는 곳을 등록해 우리 동네 보호소 공고를 바로 받아보세요', true);
    }
    async function locate() {
      const id = ++find; try {
        const value = origin?.(); if (!value) { note.textContent = '산책 출발지가 없어요. 시도와 시군구를 직접 골라 주세요.'; return; }
        note.textContent = '출발지의 보호 지역을 찾고 있어요.';
        const r = await get('locate',{origin:value}); if (!alive() || id !== find) return; if (!validRegion(r)) throw Error(); return activate(r, 'origin');
      } catch { if (alive() && id === find) note.textContent = '출발지의 지역을 찾지 못했어요. 지역을 직접 선택해 주세요.'; }
    }
    const regionMsg = el('p','shelter-status'); region.append(regionMsg); regionMsg.setAttribute('role','status');
    async function loadProvinces() {
      regionMsg.replaceChildren(); try { const r = await get('regions'); if (alive()) options(prov,[['','시도 선택'], ...r.sido.filter(x=>code(x.code)).map(x=>[x.code,x.name])]); }
      catch { if (alive()) regionMsg.replaceChildren(el('span','','시도 목록을 받지 못해 공고 수를 확인할 수 없어요. 공식 보호동물 검색도 이용할 수 있어요. '),button('지역 목록 다시 시도',loadProvinces)); }
    }
    prov.onchange = async () => {
      const id = ++lookup, upr = prov.value; options(district,[['','시군구 전체']]); district.disabled = true; browse.disabled = !upr; regionMsg.textContent = ''; if (!upr) return;
      try { const r = await get('regions',{upr}); if (!alive() || id !== lookup) return;
        options(district,[['','시군구 전체'],...r.sigungu.filter(x=>code(x.code)).map(x=>[x.code,x.name])]); district.disabled = !r.sigungu.length;
        if (district.disabled) regionMsg.textContent = '선택할 시군구가 없어요. 시도 전체를 조회할 수 있어요.';
      } catch { if (alive() && id === lookup) regionMsg.replaceChildren(el('span','','시군구 목록을 받지 못했어요. 시도 전체를 조회하거나 '),button('시군구 다시 시도',prov.onchange)); }
    };
    await Promise.all([loadGuide(),loadProvinces(),start()]);
  };
}
