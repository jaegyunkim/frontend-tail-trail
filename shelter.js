// This module renders only normalized public shelter fields. It never stores an origin/address.
const code = v => typeof v === 'string' && /^\d{7}$/.test(v);
const validRegion = r => r && code(r.upr) && (!r.org || code(r.org));
const regionName = r => [r.uprName || r.upr, r.orgName || r.org].filter(Boolean).join(' ');
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
export function mountShelter(root, { api, origin }) {
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
    try { const r = JSON.parse(sessionStorage.getItem(key)); if (validRegion(r)) saved = r; } catch { /* private browsing */ }
    const panel = el('section', 'shelter-panel'), head = el('header', 'shelter-head');
    head.append(el('h2', '', '동물보호소'), el('p', '', '우리 동네에서 최근 7일 안에 공고된 강아지를 찾아보세요.'));
    const region = el('section', 'shelter-region'), prov = el('select'), district = el('select'), note = el('p', 'shelter-status');
    note.setAttribute('role','status');
    const selName = s => s.selectedOptions[0]?.textContent || '';
    const browse = button('이 지역 보기', () => activate({ upr: prov.value, uprName: selName(prov), org: district.value || null, orgName: district.value ? selName(district) : null }));
    const save = button('기본 지역으로 저장', () => {
      if (!active || !alive() || preferenceKey() !== key) return;
      try { sessionStorage.setItem(key, JSON.stringify(active)); saved = active; note.textContent = `기본 지역으로 저장했어요: ${regionName(saved)}`; } catch { note.textContent = '이 브라우저에서는 지역을 저장할 수 없어요.'; }
    });
    const home = button('기본 지역 보기', () => saved ? activate(saved) : locate()), nearby = button('산책 출발지로 찾기', () => locate());
    options(prov, [['','시도 선택']]); options(district, [['','시군구 전체']]); district.disabled = browse.disabled = save.disabled = true;
    browse.classList?.add('primary-act'); const acts = el('div', 'region-acts'); acts.append(browse, save, home, nearby);
    region.append(el('h3', '', '지역 선택'), field('시도',prov), field('시군구',district), acts, note);
    const current = el('h3'), form = el('form','shelter-filters'), status = el('p','shelter-status'), results = el('div','shelter-list'), pager = el('nav','shelter-pager'), source = el('p','shelter-source');
    status.setAttribute('role','status'); pager.setAttribute('aria-label','공고 페이지');
    const controls = {};
    function selectFilter(k, name, list) { const s = controls[k] = el('select'); options(s,list,filters[k]); form.append(field(name,s)); s.onchange = () => { if (k === 'state') controls.center.value = ''; return apply(); }; }
    selectFilter('state','보호 상태',[['protect','보호 상태 · 보호 중'],['ended','보호 상태 · 가족을 만난 아이']]); selectFilter('sex','성별',[['','성별 · 전체'],['M','성별 · 수컷'],['F','성별 · 암컷']]);
    selectFilter('sort','정렬',[['new','정렬 · 최신 공고순'],['ending','정렬 · 공고 종료일순']]); selectFilter('center','보호센터',[['','보호센터 · 전체']]);
    controls.q = el('input'); controls.q.type = 'search'; controls.q.maxLength = 30; controls.q.placeholder = '품종, 발견 장소, 공고번호';
    controls.q.setAttribute?.('aria-label','검색어(품종, 발견 장소, 공고번호)');
    const submit = el('button','shelter-submit','검색'); submit.type = 'submit'; form.append(field('검색어',controls.q), submit);
    form.onsubmit = e => { e.preventDefault(); return apply(); }; form.hidden = true;
    const guide = el('details','shelter-guide'), guideSlot = el('div','','안내를 불러오는 중이에요.'); guide.append(el('summary','','입양 절차 · 잃어버린 반려견 찾기'),guideSlot);
    const official = el('aside','shelter-source');
    const officialLink = (text, path) => { const a = el('a','',text); a.href = `https://www.animal.go.kr/front/${path}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
    official.append(el('p','','입양 전에는 공고번호를 메모하고 센터에 전화해 현재 보호 상태, 방문 예약, 준비물을 확인하세요.'), officialLink('공식 보호동물 검색','awtis/public/publicList.do?menuNo=1000000055'), el('span','',' · '), officialLink('국가동물보호정보시스템 홈','index.do'));
    panel.append(head,region,current,form,status,results,pager,source,official,guide); root.replaceChildren(panel);
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
        const centers = (r.centers || []).map(c => [c.name,`보호센터 · ${c.name} (${c.count})`]); options(controls.center,[['','보호센터 · 전체'],...centers],filters.center);
        const dogs = r.dogs || []; status.textContent = dogs.length ? `검색 결과 ${r.total}마리 · ${r.page}/${r.pages}쪽` : '이 조건에 맞는 최근 7일 공고가 없어요. 지역이나 검색 조건을 바꿔 보세요.';
        results.replaceChildren(...dogs.map(card)); filters.page = r.page || 1;
        if (r.pages > 1) { const go = n => { filters.page = n; return loadDogs(); }; const prev = button('이전',()=>go(r.page-1)), next = button('다음',()=>go(r.page+1)); prev.disabled = r.page <= 1; next.disabled = r.page >= r.pages; pager.append(prev,el('span','',`${r.page} / ${r.pages}`),next); }
      } catch { if (alive() && id === search) fail('공고를 불러오지 못했어요. 연결을 확인해 주세요.'); }
    }
    function activate(r) {
      if (!validRegion(r) || !alive()) return; ++find; active = { upr:r.upr, org:r.org || null, uprName:r.uprName || '', orgName:r.orgName || '' };
      filters = defaults(); for (const [k,s] of Object.entries(controls)) s.value = filters[k];
      options(controls.center,[['','보호센터 · 전체']]); current.textContent = `${regionName(active)} · 최근 7일 공고`; form.hidden = false; save.disabled = false;
      note.textContent = saved ? `기본 지역: ${regionName(saved)}` : '지금 보는 지역을 기본 지역으로 저장할 수 있어요.'; return loadDogs();
    }
    async function locate() {
      const id = ++find; try {
        const value = origin?.(); if (!value) { note.textContent = '산책 출발지가 없어요. 시도와 시군구를 직접 골라 주세요.'; return; }
        note.textContent = '출발지의 보호 지역을 찾고 있어요.';
        const r = await get('locate',{origin:value}); if (!alive() || id !== find) return; if (!validRegion(r)) throw Error(); return activate(r);
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
    await Promise.all([loadGuide(),loadProvinces(),saved ? activate(saved) : locate()]);
  };
}
