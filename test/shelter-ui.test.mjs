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
function setup(override, origin = ()=>'테스트 출발지') {
  const store = new Map(); globalThis.sessionStorage = { getItem:k=>store.get(k)||null, setItem:(k,v)=>store.set(k,v) };
  const doc = { createElement:tag=>new Element(tag,doc) }, root = doc.createElement('main'), calls = [];
  const dog = { breed:'<script>public text</script>', mark:'흰 발', phase:'notice', photo:'javascript:alert(1)', photos:['data:text/html,abc'], center:{name:'테스트센터',tel:'02-123-4567'}, noticeNo:'공고-1' };
  const standard = (route,p) => ({ guide:{guide:{steps:[{title:'전화',body:'공고번호 확인'}]},attribution:'출처'}, locate:{upr:'6110000',uprName:'서울'}, regions:p.has('upr')?{sigungu:[{code:'1234567',name:'예시구'}]}:{sido:[{code:'6410000',name:'경기'}]}, dogs:{source:{status:'ok'}, attribution:'공공데이터',window:{from:'2026-11-15',to:'2026-11-22'},page:Number(p.get('page')),pages:2,total:13,centers:[],dogs:[dog]} })[route];
  const api = async path => { const u = new URL(path,'https://example.org'); calls.push(u); const route = u.pathname.split('/').pop(); return override?.(route,u.searchParams) ?? standard(route,u.searchParams); };
  const refresh = mountShelter(root,{api,origin});
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
