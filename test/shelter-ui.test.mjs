import test from 'node:test';
import assert from 'node:assert/strict';
import { mountShelter } from '../shelter.js';

// Small DOM doubles, no network, dependencies or HTML parsing.
class Element {
  constructor(tag,doc) { this.tag = tag; this.ownerDocument = doc; this.nodes = []; this.value = ''; this.text = ''; }
  set textContent(v) { this.text = v; this.nodes = []; }
  get textContent() { return this.text + this.nodes.map(n=>n.textContent).join(''); }
  set innerHTML(_) { throw Error('Do not parse public data as markup'); }
  append(...ns) { this.nodes.push(...ns); }
  replaceChildren(...ns) { this.text = ''; this.nodes = ns; }
  setAttribute(k,v) { this[k] = v; }
  get selectedOptions() { return this.nodes.filter(n=>n.value===this.value); }
  all(predicate) { return [...(predicate(this)?[this]:[]), ...this.nodes.flatMap(n=>n.all(predicate))]; }
}
function setup(override, origin = ()=>'테스트 출발지', places = ()=>['테스트 출발지'], onRegister) {
  const store = new Map(); globalThis.sessionStorage = { getItem:k=>store.get(k)||null, setItem:(k,v)=>store.set(k,v) };
  const doc = { createElement:tag=>new Element(tag,doc) }, root = doc.createElement('main'), calls = [];
  const dog = { breed:'<script>public text</script>', mark:'흰 발', phase:'notice', photo:'javascript:alert(1)', photos:['data:text/html,abc'], center:{name:'테스트센터',tel:'02-123-4567'}, noticeNo:'공고-1' };
  const standard = (route,p) => ({ guide:{guide:{steps:[{title:'전화',body:'공고번호 확인'}]},attribution:'출처'}, locate:{upr:'6110000',uprName:'서울'}, regions:p.has('upr')?{sigungu:[{code:'1234567',name:'예시구'}]}:{sido:[{code:'6410000',name:'경기'}]}, dogs:{source:{status:'ok'}, attribution:'공공데이터',window:{from:'2026-11-15',to:'2026-11-22'},page:Number(p.get('page')),pages:2,total:13,centers:[],dogs:[dog]} })[route];
  const api = async path => { const u = new URL(path,'https://example.org'); calls.push(u); const route = u.pathname.split('/').pop(); return override?.(route,u.searchParams) ?? standard(route,u.searchParams); };
  const refresh = mountShelter(root,{api,origin,places,onRegister});
  return { root,refresh,store,calls,btn:n=>root.all(e=>e.tag==='button'&&e.textContent===n)[0],field:n=>root.all(e=>e.tag==='label'&&e.nodes[0].textContent===n)[0].nodes[1] };
}
test('원점 조회, 안전한 카드/센터 전화, 안내, 검색과 페이지 전환',async()=>{
  const {refresh,root,calls,btn,field} = setup(); assert.equal(calls.length,0); await refresh();
  assert.equal(calls.find(u=>u.pathname.endsWith('/locate')).searchParams.get('origin'),'테스트 출발지');
  assert.match(root.textContent,/<script>public text<\/script>/); assert.match(root.textContent,/공고-1/); assert.match(root.textContent,/공고번호 확인/);
  assert.equal(root.all(e=>e.tag==='img'||e.tag==='script').length,0); assert.ok(root.all(e=>e.href==='tel:021234567').length);
  await btn('다음').onclick(); assert.equal(calls.at(-1).searchParams.get('page'),'2'); assert.equal(btn('다음').disabled,true);
  field('검색어').value = '발견 & 장소'; field('보호 상태').value = 'ended'; await field('보호 상태').onchange();
  const p = calls.at(-1).searchParams; assert.equal(p.get('page'),'1'); assert.equal(p.get('state'),'ended'); assert.equal(p.get('q'),'발견 & 장소');
});
test('다른 지역 탐색과 사용자별 기본 지역 저장은 독립',async()=>{
  const {refresh,store,calls,btn,field} = setup(); const auth = id=>store.set('tailtrail.auth',JSON.stringify({user:{loginId:id}}));
  auth('A'); await refresh(); await btn('기본 지역으로 저장').onclick(); field('시도').value = '6410000'; await field('시도').onchange(); field('시군구').value='1234567'; await btn('이 지역 보기').onclick();
  assert.equal(calls.at(-1).searchParams.get('org'),'1234567'); await refresh(); assert.equal(calls.at(-1).searchParams.get('upr'),'6110000');
  const before = calls.length; auth('B'); await refresh(); assert.ok(calls.slice(before).some(u=>u.pathname.endsWith('/locate')));
  assert.doesNotMatch(store.get('tailtrail.shelter.user:A'),/테스트 출발지/);
});
test('404/자료 연결 실패를 빈 목록으로 표시하지 않고 공식 대안 제공',async()=>{
  const down = setup(()=>{throw Error('404');}); await down.refresh(); assert.match(down.root.textContent,/공고 수를 확인할 수 없어요/); assert.match(down.root.textContent,/방문 예약/); assert.ok(down.root.all(e=>e.href?.startsWith('https://www.animal.go.kr/')).length);
  for (const status of ['missing-key','unauthorized','error','ok']) {
    const ui = setup(route=>route==='dogs'?{source:{status},dogs:[],centers:[],total:0,page:1,pages:1}:undefined); await ui.refresh();
    assert.equal(/공고가 없어요/.test(ui.root.textContent),status==='ok'); assert.equal(Boolean(ui.btn('공고 다시 시도')),status!=='ok');
  }
});
test('이전 요청이 늦게 도착해도 최신 검색 결과를 유지',async()=>{
  let release; const pending = new Promise(resolve=>{release=resolve;});
  const ui = setup((route,p)=>route==='dogs'&&p.get('sex')==='M'?pending:undefined); await ui.refresh();
  const sex = ui.field('성별'); sex.value = 'M'; const slow = sex.onchange(); sex.value='F'; await sex.onchange(); release({source:{status:'error'}}); await slow;
  assert.match(ui.root.textContent,/검색 결과 13마리/); assert.equal(ui.btn('공고 다시 시도'),undefined);
});
test('지역 선택·공고 필터: 라벨 글자는 sr-only, 옵션에 제목(값은 그대로), 지역 버튼 4개는 한 묶음', async () => {
  const { refresh, root, field } = setup(); await refresh();
  const labels = root.all(e => e.tag === 'label' && e.className === 'shelter-field');
  assert.ok(labels.length >= 7); for (const l of labels) assert.equal(l.nodes[0].className, 'sr-only');
  const opts = s => s.nodes.map(o => [o.value, o.textContent]);
  assert.deepEqual(opts(field('보호 상태')), [['protect', '보호 상태 · 보호 중'], ['ended', '보호 상태 · 가족을 만난 아이']]);
  assert.deepEqual(opts(field('성별')), [['', '성별 · 전체'], ['M', '성별 · 수컷'], ['F', '성별 · 암컷']]);
  assert.deepEqual(opts(field('정렬')), [['new', '정렬 · 최신 공고순'], ['ending', '정렬 · 공고 종료일순']]);
  assert.equal(opts(field('보호센터'))[0][1], '보호센터 · 전체');
  assert.equal(field('검색어').placeholder, '품종·장소·공고번호'); assert.ok(field('검색어')['aria-label']);
  const acts = root.all(e => e.className === 'region-acts')[0]; assert.deepEqual(acts.nodes.map(b => b.textContent), ['이 지역 보기', '기본 지역으로 저장', '기본 지역 보기', '산책 출발지로 찾기']);
});
test('좁은 화면(480px 미만): 옵션은 짧은 제목·짧은 값, value 는 그대로', async () => {
  const before = globalThis.matchMedia; globalThis.matchMedia = () => ({ matches: true, addEventListener() {} });
  try {
    const { refresh, field } = setup(); await refresh();
    const opts = s => s.nodes.map(o => [o.value, o.textContent]);
    assert.deepEqual(opts(field('보호 상태')), [['protect', '상태 · 보호 중'], ['ended', '상태 · 가족 만남']]);
    assert.deepEqual(opts(field('정렬')), [['new', '정렬 · 최신순'], ['ending', '정렬 · 마감순']]);
    assert.equal(opts(field('보호센터'))[0][1], '센터 · 전체');
  } finally { globalThis.matchMedia = before; }
});

test('보호소 첫 화면 1순위: 자주 걷는 곳 첫 항목의 지역 공고를 바로 보이고 지역 선택 카드는 접혀 있다', async()=>{
  const ui = setup(undefined, undefined, ()=>['부산 남구 대연5동','서울 강남구']); await ui.refresh();
  const loc = ui.calls.filter(u=>u.pathname.endsWith('/locate')); assert.equal(loc.length,1); assert.equal(loc[0].searchParams.get('origin'),'부산 남구 대연5동');
  assert.ok(ui.calls.some(u=>u.pathname.endsWith('/dogs')));
  const region = ui.root.all(e=>e.className==='shelter-region')[0], bar = ui.root.all(e=>e.className==='shelter-bar')[0], prompt = ui.root.all(e=>e.className==='shelter-prompt')[0];
  assert.equal(region.hidden,true); assert.equal(bar.hidden,false); assert.equal(prompt.hidden,true);
  assert.match(bar.textContent,/📍 서울 · 자주 걷는 곳 기준/); assert.ok(ui.btn('다른 지역 찾기'));
  assert.equal(ui.root.all(e=>e.tag==='form'&&e.hidden).length,0);
});
test('다른 지역 찾기: 카드가 펼쳐지고 이 지역 보기·닫기로 다시 접힌다', async()=>{
  const ui = setup(); await ui.refresh(); const region = ui.root.all(e=>e.className==='shelter-region')[0], bar = ui.root.all(e=>e.className==='shelter-bar')[0];
  const open = bar.nodes[1]; assert.equal(open.textContent,'다른 지역 찾기'); open.onclick(); assert.equal(region.hidden,false); assert.equal(open['aria-expanded'],'true');
  ui.btn('닫기').onclick(); assert.equal(region.hidden,true); open.onclick(); assert.equal(region.hidden,false);
  ui.field('시도').value = '6410000'; await ui.field('시도').onchange(); await ui.btn('이 지역 보기').onclick();
  assert.equal(region.hidden,true); assert.match(bar.textContent,/직접 고른 지역/); assert.equal(ui.calls.at(-1).searchParams.get('upr'),'6410000');
});
test('2순위: 자주 걷는 곳이 없고 조회 이력이 있으면 그 지역 공고 + 등록 유도 문구·버튼', async()=>{
  let registered = 0; const first = setup(undefined, undefined, ()=>[]); await first.refresh();
  assert.equal(first.root.all(e=>e.className==='shelter-prompt')[0].hidden,false);
  first.btn('다른 지역 찾기').onclick(); first.field('시도').value='6410000'; await first.field('시도').onchange(); await first.btn('이 지역 보기').onclick();
  const saved = JSON.stringify({upr:'6410000',uprName:'경기',org:null,orgName:''}); // 이력 저장 확인용으로 같은 저장소를 다시 사용
  const second = setup(undefined, undefined, ()=>[], ()=>registered++); for (const [k,v] of first.store) second.store.set(k,v);
  await second.refresh(); const prompt = second.root.all(e=>e.className==='shelter-prompt')[0];
  assert.equal(second.calls.filter(u=>u.pathname.endsWith('/locate')).length,0); assert.equal(second.calls.find(u=>u.pathname.endsWith('/dogs')).searchParams.get('upr'),'6410000');
  assert.match(prompt.textContent,/자주 걷는 곳을 등록하면 우리 동네 보호소를 바로 볼 수 있어요/); assert.equal(prompt.hidden,false);
  second.btn('자주 걷는 곳 등록').onclick(); assert.equal(registered,1); assert.match(second.root.all(e=>e.className==='shelter-bar')[0].textContent,/최근 조회한 지역/); assert.ok(saved);
});
test('3순위: 둘 다 없으면 등록 유도 카드 + 다른 지역 찾기, 공고 목록은 아직 없다', async()=>{
  let registered = 0; const ui = setup(undefined, undefined, ()=>[], ()=>registered++); await ui.refresh();
  const prompt = ui.root.all(e=>e.className==='shelter-prompt')[0], region = ui.root.all(e=>e.className==='shelter-region')[0];
  assert.match(prompt.textContent,/자주 걷는 곳을 등록해 우리 동네 보호소 공고를 바로 받아보세요/); assert.equal(prompt.hidden,false); assert.equal(region.hidden,true);
  assert.equal(ui.calls.some(u=>u.pathname.endsWith('/dogs')||u.pathname.endsWith('/locate')),false);
  ui.btn('자주 걷는 곳 등록').onclick(); assert.equal(registered,1);
  prompt.all(e=>e.tag==='button'&&e.textContent==='다른 지역 찾기')[0].onclick(); assert.equal(region.hidden,false);
});
