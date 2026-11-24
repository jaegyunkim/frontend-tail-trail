import { errText } from './errors.js?v=0.1.6';
import { ROLE_LABEL, policyText, limitsText, DAY_NOTE } from './role-policy.js?v=0.1.6';
import { approvalMailto } from './approval-email.js?v=0.1.6';
import { visitsHtml } from './admin-visits.js?v=0.1.6';
import { regResendButton, findAccountId, resendPath, resendConfirmHtml, resendDone, resendFail } from './admin-resend.js?v=0.1.6-31';
// 꼬리길 관리자 화면(backend-go-fishing/frontend-go-fishing 운영관리와 동일 구성 + 플랜·코스 탭): 계정·세션·사용량·대화 로그·로그인/작업 기록. 관리자 계정으로 로그인한 탭에서만 동작.
import { state, api, health, startTimer, syncAccount, setOnAuthLost, logout } from './auth.js?v=0.1.6';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dt = v => v ? new Date(v).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
const n = v => Number(v ?? 0).toLocaleString('ko-KR');
const view = $('#view');
let current = 'users';

function note(text, bad = false) { const m = $('#msg'); m.textContent = text; m.hidden = !text; m.style.color = bad ? 'var(--bad)' : ''; if (text) setTimeout(() => { if (m.textContent === text) m.hidden = true; }, 8000); }
function gone(msg) { $('#userPageLink').hidden = true; view.innerHTML = `<div class="card"><h3>관리자 로그인이 필요해요</h3><p class="sub">${esc(msg)}</p><p><a class="link-btn" href="./">서비스 화면에서 관리자 계정으로 로그인 →</a></p></div>`; $('#timer').hidden = true; }
setOnAuthLost(msg => { logout(); gone(msg); });

const dialog = (html, onSubmit) => new Promise(resolve => {
  const f = $('#dlgForm'); f.innerHTML = html + '<div class="row"><button value="ok">확인</button><button value="cancel" class="ghost" formnovalidate>취소</button></div>';
  $('#dlg').onclose = async () => { if ($('#dlg').returnValue === 'ok' && onSubmit) resolve(await onSubmit(new FormData(f))); else resolve(null); };
  $('#dlg').returnValue = 'cancel';
  $('#dlg').showModal();
});
const showSecret = async (title, pw, approvalEmail = null) => {
 const pending=dialog('<h2>'+esc(title)+'</h2><p class="hint">임시 비밀번호는 이 창에서만 확인할 수 있어요. 신청자에게 안전하게 전달해 주세요. 첫 로그인에 비밀번호를 변경해야 해요.</p><p class="access-url"><span>모바일 접속 주소</span><a id="accessUrl" target="_blank" rel="noopener noreferrer"></a></p><input id="issuedSecret" type="password" readonly autocomplete="off"><div class="row secret-actions"><button id="revealSecret" type="button">비밀번호 보기</button>'+(approvalEmail?'<button id="sendApprovalEmail" type="button" class="ghost">메일 보내기</button></div><p id="approvalMailStatus" class="hint" role="status">기기의 기본 메일 앱에 받는 사람·제목·내용을 채워요. 메일 앱에서 확인 후 직접 보내 주세요. 메일 앱이 설정되어 있어야 해요.</p>':'</div>'));
 const accessUrl=window.BOOKWALKING_PUBLIC_URL||new URL('./',location.href).href; $('#accessUrl').href=accessUrl; $('#accessUrl').textContent=accessUrl; $('#issuedSecret').value=pw; $('#revealSecret').onclick=()=>{const x=$('#issuedSecret');x.type=x.type==='password'?'text':'password';$('#revealSecret').textContent=x.type==='password'?'비밀번호 보기':'비밀번호 숨기기';};
 if (approvalEmail) $('#sendApprovalEmail').onclick = () => {
   try {
     const mailto = approvalMailto(approvalEmail, pw);
     window.location.href = mailto;
     $('#approvalMailStatus').textContent = '메일 앱에서 받는 사람과 내용을 확인한 뒤 직접 보내 주세요. 앱이 열리지 않으면 기기의 기본 메일 앱 설정을 확인해 주세요.';
   } catch {
     $('#approvalMailStatus').textContent = '메일 앱을 열지 못했어요. 신청자 이메일과 기기의 기본 메일 앱 설정을 확인해 주세요.';
   }
 };
 await pending;$('#dlgForm').replaceChildren();
};

// 임시 비밀번호 생성(신청 승인 탭 승인 완료 카드): 확인 창 → 진행 중 표시 → 새 비밀번호 창(showSecret, '메일 보내기'로 메일 앱 열기) → 완료·실패 알림. 이미 있는 중복 호출은 버튼 잠금으로 막아요.
async function runResend(b, u, getId) {
  if (b.disabled || !(await dialog(resendConfirmHtml(u), () => true))) return;
  const label = b.textContent; b.disabled = true; b.textContent = '만드는 중…'; b.setAttribute('aria-busy', 'true'); note('임시 비밀번호를 만드는 중이에요…');
  try {
    const out = await api(resendPath(await getId()), { method: 'POST', body: '{}' });
    if (out.tempPassword) await showSecret(`${u.loginId} 새 임시 비밀번호`, out.tempPassword, u.loginId);
    note(resendDone(u, out));
  } catch (e) { note(resendFail(e), true); }
  finally { b.disabled = false; b.textContent = label; b.removeAttribute('aria-busy'); }
}

// ---- AI 연결(제공사·엔드포인트·API 키·모델) ----
let llmState = null;
async function renderLlm() {
  const box = $('#llmCard'); if (!box) return;
  const { config, status } = await api('/v1/admin/llm'); llmState = config;
  if (!box.isConnected) return; // 응답 전에 다른 메뉴로 옮겼으면 그리지 않는다(사라진 카드·폼을 건드리지 않게)
  const cur = config.active ? config.providers[config.active] : null;
  box.innerHTML = '<h2>AI 연결</h2>'
    + '<p>현재 사용 중: ' + (cur ? '<b>' + esc(cur.label) + '</b> · ' + esc(cur.model || '모델 미지정') : '<span class="pill bad">미설정</span>') + '</p>'
    + '<p class="sub">' + esc(status.purpose) + '<br>최근 호출: ' + esc(status.last ? status.last.status + (status.last.model ? ' · ' + status.last.model : '') + (status.last.ms ? ' · ' + status.last.ms + 'ms' : '') : '재시작 이후 호출 없음') + '</p>'
    + '<form id="llmForm" class="llm-form" autocomplete="off">'
    + '<label>제공사<select name="provider">' + Object.entries(config.providers).map(([id, p]) => '<option value="' + id + '"' + (id === (config.active || 'openai') ? ' selected' : '') + '>' + esc(p.label) + (p.hasKey ? '' : ' (키 없음)') + '</option>').join('') + '</select></label>'
    + '<label>엔드포인트<input name="endpoint" type="url" inputmode="url" required spellcheck="false" autocapitalize="none"></label>'
    + '<div class="llm-row"><button type="button" id="llmDefault" class="ghost-btn">기본 주소로</button></div>'
    + '<label>API 키<input name="apiKey" type="password" autocomplete="new-password" spellcheck="false" autocapitalize="none"></label>'
    + '<div class="llm-row"><button type="button" id="llmKeyShow" class="ghost-btn">키 보기</button></div>'
    + '<label>모델<select name="model" required></select></label>'
    + '<p class="sub" id="llmModelNote"></p>'
    + '<div class="llm-row"><button type="button" id="llmLoad" class="ghost-btn">모델 목록 불러오기</button></div>'
    + '<button type="submit" id="llmSave">연결 테스트 후 저장</button>'
    + '<p class="sub">저장 전에 실제 호출로 연결을 확인하고, 실패하면 저장하지 않아요. 키는 서버에만 보관되고 화면에는 끝 4자리만 보여요. 엔드포인트 주소를 다른 곳으로 바꿀 때는 키를 다시 입력해야 해요.</p>'
    + '</form>';
  const f = $('#llmForm'), sel = f.provider, ep = f.endpoint, key = f.apiKey, model = f.model, note = $('#llmModelNote');
  const fillModels = (list, keep) => { model.innerHTML = list.map(m => '<option' + (m === keep ? ' selected' : '') + '>' + esc(m) + '</option>').join(''); if (keep && !list.includes(keep)) model.insertAdjacentHTML('afterbegin', '<option selected>' + esc(keep) + '</option>'); };
  const load = async () => {
    const btn = $('#llmLoad'); note.textContent = '모델 목록을 불러오는 중…'; btn.disabled = true;
    try { const r = await api('/v1/admin/llm/models', { method: 'POST', body: JSON.stringify({ provider: sel.value, endpoint: ep.value, apiKey: key.value || undefined }) });
      if (!f.isConnected) return; // 불러오는 동안 다른 메뉴로 옮김
      fillModels(r.models, model.value || config.providers[sel.value].model);
      note.textContent = (r.source === 'live' ? '키로 조회한 실시간 목록' : 'MonoRouter 화면 기준 목록') + ' · 대화용 ' + r.models.length + '개' + (r.note ? ' · ' + r.note : '');
    } catch (e) { if (f.isConnected) note.textContent = errText(e); } finally { if (btn.isConnected) btn.disabled = false; }
  };
  const pick = () => {
    const p = config.providers[sel.value]; ep.value = p.endpoint; key.value = '';
    key.placeholder = p.hasKey ? '저장된 키 ' + p.keyHint + ' · 바꿀 때만 입력' : sel.value === 'openai' ? 'mr_openai_… 키 입력' : sel.value === 'anthropic' ? 'mr_anthropic_… 키 입력' : 'mr_gemini_… 키 입력';
    fillModels(p.model ? [p.model] : [], p.model);
    load();
  };
  sel.onchange = pick; $('#llmLoad').onclick = load;
  $('#llmDefault').onclick = () => { ep.value = config.providers[sel.value].defaultEndpoint; };
  $('#llmKeyShow').onclick = () => { key.type = key.type === 'password' ? 'text' : 'password'; $('#llmKeyShow').textContent = key.type === 'password' ? '키 보기' : '키 숨기기'; };
  f.onsubmit = async e => {
    e.preventDefault(); const b = $('#llmSave'); b.disabled = true; b.textContent = '연결 테스트 중…';
    try { const r = await api('/v1/admin/llm', { method: 'POST', body: JSON.stringify({ provider: sel.value, endpoint: ep.value, apiKey: key.value || undefined, model: model.value }) });
      key.value = ''; note.textContent = '';
      noteTop('저장했어요 · ' + r.config.providers[sel.value].label + ' · ' + r.test.model + ' (테스트 ' + r.test.ms + 'ms)');
      renderLlm();
    } catch (err) { noteTop(errText(err), true); b.disabled = false; b.textContent = '연결 테스트 후 저장'; }
  };
  pick();
}
const noteTop = (t, bad) => note(t, bad);
const policyGuide = () => '<ul>' + Object.keys(ROLE_LABEL).map(role => '<li>' + policyText(role) + '</li>').join('') + '</ul><p class="hint">' + DAY_NOTE + '</p>';
const roleText = r => ROLE_LABEL[r] ?? r;
const views = {
 async requests(){
 const {requests,capacity}=await api('/v1/admin/registrations');
 view.innerHTML='<div class="tool"><h2>가입 신청 · 승인</h2></div>'+capBar(capacity)+'<p class="sub">승인 즉시 랜덤 임시 비밀번호가 발급돼요. 승인 완료 창의 메일 보내기로 신청자에게 안내해 주세요. 메일 앱에서 직접 발송해야 해요. 잘못 승인했다면 <b>승인 회수</b>로 승인 대기로 되돌릴 수 있어요.</p><div class="requestCards">'+requests.map(r=>'<article class="card"><h3><a class="mail-link" href="mailto:'+encodeURIComponent(r.login_id)+'">'+esc(r.login_id)+'</a> · '+esc(r.display_name)+'</h3><p class="sub">'+dt(r.status==='pending'?r.created_at:r.reviewed_at)+' · '+esc({pending:'승인 대기',approved:'승인 완료',rejected:'거절'}[r.status])+'</p>'+(r.reapply_count?'<p><span class="pill warn">재신청 '+n(r.reapply_count)+'회</span> <span class="sub">'+(r.last_rejected_at?dt(r.last_rejected_at)+'에 거절했던 신청':'이전에 거절했던 신청')+'</span></p>':'')+(r.status==='pending'?'<div class="acts"><button data-review="approve" data-id="'+r.id+'">승인·비밀번호 발급</button><button data-review="reject" data-id="'+r.id+'">거절</button></div>':r.status==='approved'?'<div class="acts">'+regResendButton(r)+'<button class="danger" data-revoke-reg="'+r.id+'" data-login="'+esc(r.login_id)+'">승인 회수</button></div>':'')+'</article>').join('')+'</div>';
 if(!requests.length)view.innerHTML+='<p>접수된 신청이 없어요.</p>';
 // 승인 회수: 승인 대기로 되돌리고 승인 때 만든 계정과 그 데이터를 지운다(로그인·작업 기록은 남김)
 view.querySelectorAll('[data-revoke-reg]').forEach(b=>b.onclick=async()=>{if(!confirm(b.dataset.login+' 승인을 회수할까요?\n\n• 신청은 \'승인 대기\'로 돌아가요.\n• 승인 때 만든 계정과 그 계정의 산책 판단·우리 아이·꼬리일기·자주 걷는 곳·의견이 지워지고, 이용 중이면 바로 로그아웃돼요.\n• 이미 보낸 승인 메일의 임시 비밀번호는 더 이상 쓸 수 없어요.'))return;b.disabled=true;try{const out=await api('/v1/admin/registrations/'+b.dataset.revokeReg+'/revoke',{method:'POST',body:'{}'});note(out.loginId+' 승인을 회수했어요'+(out.everLoggedIn?' · 로그인한 적이 있는 계정이었어요':' · 로그인한 적 없음')+'. 다시 승인하면 새 임시 비밀번호가 발급돼요.');await views.requests();}catch(e){note(errText(e),true);b.disabled=false;}});
 view.querySelectorAll('[data-resend-reg]').forEach(b=>b.onclick=()=>runResend(b,{loginId:b.dataset.login,displayName:b.dataset.name},async()=>findAccountId((await api('/v1/admin/users')).users,b.dataset.login)));
 view.querySelectorAll('[data-review]').forEach(b=>b.onclick=async()=>{if(!confirm(b.dataset.review==='approve'?'이 사용자를 승인할까요?':'이 신청을 거절할까요?'))return;b.disabled=true;try{const out=await api('/v1/admin/registrations/'+b.dataset.id+'/review',{method:'POST',body:JSON.stringify({action:b.dataset.review})});if(out.tempPassword)await showSecret(out.user.loginId+' 승인 완료',out.tempPassword,out.user.loginId);await views.requests();}catch(e){note(errText(e),true);b.disabled=false;}});
 },
 async model(){const {llm,credits,ai}=await api('/v1/admin/model');
 view.innerHTML='<div class="card"><h2>서비스 상태</h2><p><span class="pill '+(ai.available?'ok':'bad')+'">'+(ai.available?'이용 가능':'이용 중지(크레딧 소진)')+'</span></p>'+(ai.available?'':'<p class="sub">사유: '+esc(ai.reason||'')+(ai.since?' · '+dt(ai.since)+'부터':'')+'</p><p class="sub">베타 테스터 화면은 모든 입력이 잠기고 안내 문구가 표시돼요.</p>')+'<p class="sub">잔여 크레딧이 '+n(ai.threshold)+' 이하이거나 GPT가 크레딧 부족으로 응답을 거부하면 이 상태가 \'이용 중지\'로 바뀌어요(AI 기능을 붙일 때를 위한 표시).</p><div class="acts"><button id="aiRecheck">GPT 다시 확인·재개</button></div></div>'
  +'<div class="card" id="llmCard"><h2>AI 연결</h2><p class="sub">불러오는 중…</p></div>'
 +'<div class="card"><h2>MonoGPT 잔여 크레딧</h2><p>'+n(credits.remaining)+' / '+n(credits.total)+'</p><p class="sub">'+dt(credits.checkedAt)+' 확인 · '+esc(credits.source||'')+' · 실시간 아님</p><a href="https://monogpt.kr/apps/mono-router" target="_blank" rel="noopener noreferrer">MonoGPT에서 최신 잔액 확인</a><form id="creditForm" class="grid2" style="margin-top:10px"><label>잔여 크레딧<input name="remaining" type="number" min="0" required value="'+(credits.remaining??'')+'"></label><label>전체 크레딧<input name="total" type="number" min="1" required value="'+(credits.total??'')+'"></label><button>확인한 잔액 저장</button></form></div>';
 $('#creditForm').onsubmit=async ev=>{ev.preventDefault();try{const fd=Object.fromEntries(new FormData(ev.target));await api('/v1/admin/model/credit',{method:'POST',body:JSON.stringify(fd)});note('잔액을 저장했어요');views.model();}catch(err){note(errText(err),true);}};
 $('#aiRecheck').onclick=async()=>{const b=$('#aiRecheck');b.disabled=true;b.textContent='확인 중…';try{const r=await api('/v1/admin/model/recheck',{method:'POST',body:'{}'});note(r.ai.available?'GPT 호출 정상 · 서비스 이용 가능':'아직 이용할 수 없어요: '+(r.ai.reason||r.call.reason||r.call.status),!r.ai.available);views.model();}catch(err){note(errText(err),true);b.disabled=false;b.textContent='GPT 다시 확인·재개';}};
 renderLlm();
 },
  async users() {
    const [{ users }, { capacity }] = await Promise.all([api('/v1/admin/users'), api('/v1/admin/capacity')]);
    view.innerHTML = `<div class="tool"><h2>사용자 ${users.length}명</h2><div class="acts"><button id="add">+ 계정 발급</button></div></div>${capBar(capacity)}
    <details class="card"><summary>역할별 기본 한도 확인</summary>${policyGuide()}</details>
    <div class="scroll"><table class="tbl"><tr><th>아이디</th><th>닉네임</th><th>역할·상태</th><th class="num">오늘 질문</th><th class="num">오늘 토큰</th><th class="num">음성(ElevenLabs)</th><th class="num">로그인</th><th>세션 한도</th><th>기기·최근 로그인</th><th>작업</th></tr>
    ${users.map(u => `<tr><td><b>${esc(u.loginId)}</b></td><td><span>${esc(u.displayName || '미설정')}${u.memo ? ' · ' + esc(u.memo) : ''}</span><br><button class="mini-btn" data-detail="opinions" data-id="${u.id}" data-login="${esc(u.loginId)}"${u.opinionCount ? '' : ' disabled title="보낸 의견이 없어요"'}>의견 ${n(u.opinionCount)}</button></td>
      <td>${roleText(u.role)} <span class="sub">${u.role === 'user' ? '· 1기기' : '· 동시 접속 허용'}</span><br><span class="pill ${u.status === 'active' ? 'ok' : 'bad'}">${u.status === 'active' ? '사용' : '중지'}</span>${u.lockedUntil && new Date(u.lockedUntil) > new Date() ? ' <span class="pill warn">잠김</span>' : ''}${u.activeSessions ? ' <span class="pill ok">접속 중</span>' : ''}${u.mustChangePassword ? ' <span class="pill warn">비번 변경 대기</span>' : ''}</td>
      <td class="num">${n(u.today.messages)}/${n(u.limits.dailyMessages)}${u.today.blocked ? `<br><span class="sub">거절 ${u.today.blocked}</span>` : ''}<br><button class="mini-btn" data-detail="questions" data-id="${u.id}" data-login="${esc(u.loginId)}">질문</button></td><td class="num">${n(u.today.tokens)}/${n(u.limits.dailyTokens)}<br><button class="mini-btn" data-detail="usage" data-id="${u.id}" data-login="${esc(u.loginId)}">토큰</button></td><td class="num" title="ElevenLabs 크레딧은 글자 수로 차감돼요. 다시 듣기는 0이에요">오늘 ${n(u.today.tts?.count ?? 0)}회<br><span class="sub">${n(u.today.tts?.chars ?? 0)}자</span><br><span class="sub">누적 ${n(u.ttsTotal?.count ?? 0)}회 · ${n(u.ttsTotal?.chars ?? 0)}자</span></td>
      <td class="num">${n(u.today.sessions)}<br><span class="sub">24시간 ${n(u.logins24h ?? u.today.sessions)}/${n(u.limits.dailySessions)}회</span></td><td>${u.limits.sessionMinutes}분 · 질문 ${u.limits.sessionMessages}${u.customLimits ? '<br><span class="pill warn">개별 한도</span>' : ''}</td><td>${esc(devPlat(u.device))}<br>${esc(devBrowser(u.device))}<br>${dt(u.lastLoginAt)}${u.nextLoginAt?`<br><span class="sub">재이용 ${dt(u.nextLoginAt)} (KST)</span>`:""}<br><button class="mini-btn" data-detail="logins" data-id="${u.id}" data-login="${esc(u.loginId)}">위치</button></td>
      <td><div class="acts" data-id="${u.id}" data-login="${esc(u.loginId)}"><button data-a="limits">한도</button><button data-a="role">권한 변경</button><button data-a="reset">비번 초기화</button>${u.lockedUntil ? '<button data-a="unlock">잠금 해제</button>' : ''}
        <button data-a="toggle" class="${u.status === 'active' ? 'danger' : ''}">${u.status === 'active' ? '중지' : '재개'}</button><button data-a="chats">대화</button></div></td></tr>`).join('')}</table></div>`;
    view.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => go(b.dataset.detail === 'opinions' ? 'opinions' : 'user_' + b.dataset.detail, { user: b.dataset.id, label: b.dataset.login }));
    $('#add').onclick = async () => {
      const r = await dialog(`<h2>계정 발급</h2><label>아이디 (베타 테스터는 이메일, 관리자·내부 테스터는 영문 아이디도 가능)<input name="loginId" required maxlength="254"></label><label>이름<input name="displayName" required maxlength="40"></label>
        <label>역할<select name="role"><option value="user">베타 테스터 (한 기기만)</option><option value="tester">내부 테스터 (동시 접속 허용)</option><option value="admin">관리자 (동시 접속 허용)</option></select></label><label>메모<input name="memo" maxlength="100"></label>
        <p class="hint">선택한 역할의 기본 한도가 적용돼요. 만든 뒤 사용자 목록의 "한도"에서 이 계정만 따로 바꿀 수 있어요.</p>${policyGuide()}`,
        fd => api('/v1/admin/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd)) }).catch(e => ({ error: errText(e) })));
      if (r?.error) return note(r.error, true);
      if (r?.user?.tempPassword) await showSecret(`${r.user.loginId} 계정을 만들었어요`, r.user.tempPassword);
      views.users();
    };
    view.querySelectorAll('.acts[data-id] button').forEach(b => b.onclick = async () => {
      const box = b.parentElement, id = box.dataset.id, login = box.dataset.login, u = users.find(x => String(x.id) === id);
      const patch = body => api(`/v1/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      try {
        if (b.dataset.a === 'limits') {
          const F = [['sessionMinutes', '세션 시간(분)', 5, 240], ['sessionMessages', '세션당 질문', 1, 500], ['dailyMessages', '하루 질문', 1, 1000], ['dailySessions', '하루 로그인', 1, 100], ['dailyTokens', '하루 AI 토큰', 100, 1000000]];
          const base = u.roleLimits ?? {};
          const pending = dialog(`<h2>${esc(login)} 한도</h2><p class="hint">${roleText(u.role)} 기본값은 괄호 안 숫자예요. 이 계정만 따로 바꿀 수 있어요.</p>
            <div class="grid2">${F.map(([k, label, lo, hi]) => `<label>${label} <span class="sub">(기본 ${n(base[k])})</span><input name="${k}" type="number" inputmode="numeric" min="${lo}" max="${hi}" step="1" required value="${u.limits[k]}"></label>`).join('')}</div>
            <label class="inline"><input type="checkbox" name="resetLimits" value="1"> 역할 기본값으로 되돌리기</label>
            <p class="hint limits-hint" id="limitsHint" aria-live="polite"></p>
            <p class="hint">저장하면 바로 적용돼요. 세션 시간은 이용 중인 세션에도 로그인 시각 기준으로 바로 반영돼요. 로그인 횟수는 최근 24시간, 질문·토큰은 한국시간 0시 기준이에요. 권한을 바꾸면 그 역할의 기본 한도로 다시 맞춰져요.</p>`,
            fd => fd.get('resetLimits') ? patch({ resetLimits: true }).catch(e => ({ error: errText(e) })) : patch({ limits: Object.fromEntries(F.map(([k]) => [k, Number(fd.get(k))])) }).catch(e => ({ error: errText(e) })));
          // 입력값(또는 '기본값으로 되돌리기'면 역할 기본값)을 그대로 풀어 쓴 안내를 입력할 때마다 다시 쓴다
          const lf = $('#dlgForm'), showHint = () => { const fd = new FormData(lf); const L = fd.get('resetLimits') && u.roleLimits ? u.roleLimits : Object.fromEntries(F.map(([k]) => [k, Number(fd.get(k))])); $('#limitsHint').textContent = limitsText(L); };
          lf.oninput = showHint; lf.onchange = showHint; showHint();
          const r = await pending; lf.oninput = null; lf.onchange = null;
          if (r?.error) return note(r.error, true);
          if (r) {
            note(`${login} 한도를 저장했어요 · 즉시 적용${r.adjustedSessions ? ` (이용 중인 세션 ${r.adjustedSessions}개 시간 변경)` : ''}`);
            if (String(id) === String(state.auth?.user?.id)) { try { const me = await api('/v1/auth/me'); syncAccount(me); $('#who').textContent = `${me.user.displayName}(${me.user.loginId}) · 세션 ${me.limits.sessionMinutes}분`; } catch { /* 다음 갱신 때 반영 */ } }
            views.users();
          }
          return;
        }
        if (b.dataset.a === 'role') {
          const r = await dialog(`<h2>${esc(login)} 권한 변경</h2>${policyGuide()}<label>역할<select name="role">${['user', 'tester', 'admin'].map(x => `<option value="${x}"${x === u.role ? ' selected' : ''}>${roleText(x)}</option>`).join('')}</select></label>
            <p class="hint">베타 테스터: 한 기기에서만 로그인 · 내부 테스터·관리자: 여러 기기 동시 접속 허용 · 관리자만 이 관리자 페이지를 쓸 수 있어요.<br>권한을 바꾸면 이 계정의 이용 중인 세션은 종료되고, 다시 로그인할 때 새 권한이 적용돼요.</p>`,
            fd => fd.get('role') === u.role ? null : patch({ role: fd.get('role') }).catch(e => ({ error: errText(e) })));
          if (r?.error) return note(r.error, true);
          if (r) note(`${login} 권한: ${roleText(r.user.role)}`);
        } else if (b.dataset.a === 'reset') {
          if (!confirm(`${login} 비밀번호를 초기화할까요? 접속 중인 세션도 종료돼요.`)) return;
          const r = await patch({ resetPassword: true, unlock: true }); await showSecret(`${login} 비밀번호를 초기화했어요`, r.tempPassword);
        } else if (b.dataset.a === 'unlock') { await patch({ unlock: true }); note('잠금을 풀었어요'); }
        else if (b.dataset.a === 'toggle') {
          const off = u.status === 'active';
          if (off && !confirm(`${login} 계정을 중지할까요? 접속 중인 세션도 즉시 종료돼요.`)) return;
          await patch({ status: off ? 'disabled' : 'active' }); note(`${login}: ${off ? '중지' : '재개'}`);
        } else if (b.dataset.a === 'chats') return go('chats', { user: id, label: login });
        await views.users();
      } catch (e) { note(errText(e), true); }
    });
  },
  async sessions(opt = {}) {
    const all = opt.all ? '?all=1' : '';
    const { sessions } = await api('/v1/admin/sessions' + all);
    view.innerHTML = `<div class="tool"><h2>${opt.all ? '최근 세션' : '접속 중인 세션'} ${sessions.length}</h2><div class="acts"><button id="tg">${opt.all ? '접속 중만' : '최근 전체 보기'}</button><button id="rf">새로고침</button></div></div>
    <div class="scroll"><table class="tbl"><tr><th>사용자</th><th>시작</th><th>남은 시간·종료</th><th class="num">질문</th><th class="num">AI 호출·토큰</th><th>외부 API 호출</th><th>작업</th></tr>
    ${sessions.map(s => { const left = Math.max(0, Math.round((new Date(s.expires_at) - Date.now()) / 1000));
      const end = s.active ? `<span class="pill ok">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span>` : `${dt(s.ended_at)}<br><span class="sub">${esc({ logout: '로그아웃', expired: '시간 만료', revoked: '강제 종료', replaced: '새 로그인', disabled: '계정 중지' }[s.end_reason] ?? s.end_reason ?? '만료')}</span>`;
      const apis = Object.entries(s.api_calls || {}).map(([k, v]) => `${esc(k)} ${v}`).join(', ') || '-';
      return `<tr><td><b>${esc(s.login_id)}</b><br><span class="sub">${esc(s.display_name)} · ${esc(s.device ? devPlat(s.device) : s.client ?? '')} · ${esc(devBrowser(s.device))}</span></td><td>${dt(s.created_at)}</td><td>${end}</td><td class="num">${n(s.message_count)}</td>
        <td class="num">${n(s.llm_calls)} · ${n(s.tokens_in + s.tokens_out)}</td><td class="sub">${apis}</td>
        <td><div class="acts"><button data-chat="${s.id}" data-label="${esc(s.login_id)}">대화</button>${s.active ? `<button class="danger" data-revoke="${s.id}">강제 종료</button>` : ''}</div></td></tr>`; }).join('')}</table></div>`;
    $('#tg').onclick = () => views.sessions({ all: !opt.all }); $('#rf').onclick = () => views.sessions(opt);
    view.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => { if (!confirm('이 세션을 강제 종료할까요?')) return; await api(`/v1/admin/sessions/${b.dataset.revoke}/revoke`, { method: 'POST', body: '{}' }); note('세션을 종료했어요'); views.sessions(opt); });
    view.querySelectorAll('[data-chat]').forEach(b => b.onclick = () => go('chats', { session: b.dataset.chat, label: b.dataset.label }));
  },
  async usage() {
    const { usage } = await api('/v1/admin/usage?days=14');
    const tot = usage.reduce((a, r) => ({ m: a.m + r.messages, t: a.t + r.tokens_in + r.tokens_out, s: a.s + r.sessions, b: a.b + r.blocked }), { m: 0, t: 0, s: 0, b: 0 });
    view.innerHTML = `<div class="tool"><h2>최근 14일 사용량</h2><span class="sub">로그인 ${n(tot.s)} · 질문 ${n(tot.m)} · AI 토큰 ${n(tot.t)} · 한도 거절 ${n(tot.b)}</span></div>
    <div class="scroll"><table class="tbl"><tr><th>날짜</th><th>사용자</th><th class="num">로그인</th><th class="num">질문</th><th class="num">AI 호출</th><th class="num">토큰(입력/출력)</th><th class="num">거절</th><th>외부 API 호출</th></tr>
    ${usage.map(r => `<tr><td>${String(r.day).slice(0, 10)}</td><td>${esc(r.login_id)}</td><td class="num">${n(r.sessions)}</td><td class="num">${n(r.messages)}</td><td class="num">${n(r.llm_calls)}</td>
      <td class="num">${n(r.tokens_in)}/${n(r.tokens_out)}</td><td class="num">${n(r.blocked)}</td><td class="sub">${Object.entries(r.api_calls || {}).map(([k, v]) => `${esc(k)} ${v}`).join(', ') || '-'}</td></tr>`).join('')}</table></div>`;
  },
  async chats(opt = {}) {
    if (!opt.session && !opt.user) { view.innerHTML = '<div class="card"><p class="sub">세션 탭이나 사용자 탭에서 "대화"를 눌러 열람할 대화를 고르세요.</p></div>'; return; }
    const qs = opt.session ? `session=${opt.session}` : `user=${opt.user}`;
    const { messages } = await api(`/v1/admin/chats?${qs}&limit=300`);
    view.innerHTML = `<div class="tool"><h2>대화 로그 · ${esc(opt.label ?? '')}</h2><span class="sub">${messages.length}건 · 주소 번지는 저장 시 가려짐 · 보관 30일</span></div>
    <div class="chatlog">${messages.map(m => `<div class="m ${m.role}">${esc(m.content).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}<div class="meta">${dt(m.created_at)} · ${esc(m.login_id ?? '')} · ${esc(m.intent ?? '')}${m.latency_ms ? ` · ${m.latency_ms}ms` : ''}${m.tokens_in ? ` · 토큰 ${m.tokens_in}/${m.tokens_out}` : ''}</div></div>`).join('') || '<p class="sub">대화 없음</p>'}</div>`;
  },
  async logins() {
    const { logins } = await api('/v1/admin/logins');
    view.innerHTML = `<div class="tool"><h2>로그인 기록(최근 200)</h2></div><div class="scroll"><table class="tbl"><tr><th>시각</th><th>아이디</th><th>결과</th><th>기기</th></tr>
    ${logins.map(l => `<tr><td>${dt(l.at)}</td><td>${esc(l.login_id)}</td><td><span class="pill ${l.success ? 'ok' : 'bad'}">${l.success ? '성공' : '실패'}</span> <span class="sub">${esc(l.reason ?? '')}</span></td><td class="sub">${esc((l.user_agent ?? '').slice(0, 60))}</td></tr>`).join('')}</table></div>`;
  },
  // 접속현황: 메인(로그인)·이용 신청 화면 방문자(하루 IP 1회) — 시간별·일간·요일별·주간별·월간·시즌별·연간(섹션 탭)
  async visits(opt = {}) {
    const days = [7, 14, 30, 90].includes(opt.days) ? opt.days : 30;
    const { visits } = await api(`/v1/admin/visits?days=${days}`);
    const draw = () => {
      view.innerHTML = visitsHtml(visits, days, view.clientWidth - 56, visitsUi);
      view.querySelectorAll('[data-vdays]').forEach(b => b.onclick = () => views.visits({ days: Number(b.dataset.vdays) }));
      $('#vRefresh').onclick = async () => { const b = $('#vRefresh'); b.disabled = true; b.textContent = '불러오는 중…'; await views.visits({ days }); };
    };
    draw(); visitsRedraw = draw;
  },
  async reports() {
    const { reports } = await api('/v1/admin/reports?limit=90');
    const ST = { ok: '<span class="pill ok">정상</span>', warn: '<span class="pill warn">주의</span>', critical: '<span class="pill bad">위험</span>' };
    view.innerHTML = `<div class="tool"><h2>서버 운영 리포트</h2><div class="acts"><button id="genReport">오늘 리포트 지금 만들기</button></div></div>
    <p class="sub">매일 00:10(한국 시간)에 전날 리포트를 자동으로 만들고 Slack 로그 채널에 요약을 보내요. 수동 생성은 오늘 0시부터 지금까지를 집계해요. 리포트는 2년, 시간별 지표는 180일 보관해요.</p>
    ${reports.length ? `<div class="rep-list">${reports.map(r => `<button class="rep-item" data-date="${esc(r.date)}"><div class="rep-top"><b>${esc(r.date)}</b>${ST[r.status] ?? esc(r.status)}${r.alert_count ? `<span class="sub">경보 ${r.alert_count}</span>` : ''}<span class="sub">${r.trigger === 'auto' ? '자동' : '수동'} · ${dt(r.generated_at)}</span></div>
      <div class="rep-nums"><span>요청 <b>${n(r.requests)}</b></span><span>로그인 <b>${n(r.users)}</b>명</span><span>질문 <b>${n(r.questions)}</b></span></div></button>`).join('')}</div>` : '<div class="card"><p class="sub">아직 만들어진 리포트가 없어요. 위 버튼으로 오늘 리포트를 만들어 보세요.</p></div>'}`;
    $('#genReport').onclick = async () => { const b = $('#genReport'); b.disabled = true; b.textContent = '만드는 중…'; try { const { report } = await api('/v1/admin/reports/generate', { method: 'POST', body: '{}' }); go('report', { date: report.date }); } catch (e) { note(errText(e), true); b.disabled = false; b.textContent = '오늘 리포트 지금 만들기'; } };
    view.querySelectorAll('[data-date]').forEach(b => b.onclick = () => go('report', { date: b.dataset.date }));
  },
  async report(opt = {}) {
    const { report: r } = await api(`/v1/admin/reports/${opt.date}`); const m = r.metrics, t = m.traffic, u = m.users, res = m.resources;
    const ST = { ok: ['정상', 'ok'], warn: ['주의', 'warn'], critical: ['위험', 'bad'] }[r.status] ?? [r.status, ''];
    const kv = rows => `<dl class="kv rep-kv">${rows.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
    const pctTxt = v => v == null ? '-' : (Math.round(v * 1000) / 10) + '%';
    const hours = Array.from({ length: 24 }, (_, i) => { const h = (t.hourly ?? []).find(x => Number(x.h) === i); return { i, n: h?.n ?? 0, e: h?.e ?? 0 }; }), hmax = Math.max(1, ...hours.map(h => h.n));
    view.innerHTML = `<div class="tool"><div class="acts"><button id="backReports">← 리포트 목록</button></div><h2>운영 리포트 · ${esc(r.date)} <span class="pill ${ST[1]}">${ST[0]}</span></h2></div>
    <p class="sub">${esc(r.summary)}<br>${r.trigger === 'auto' ? '자동' : '수동'} 생성 ${dt(r.generated_at)} · 집계 ${dt(r.period_start)} ~ ${dt(r.period_end)} · 백엔드 v${esc(r.version ?? '-')}</p>
    <div class="card"><h3>경보 ${r.alerts.length}건</h3>${r.alerts.length ? `<ul class="rep-alerts">${r.alerts.map(a => `<li class="${a.level}"><span class="pill ${a.level === 'critical' ? 'bad' : 'warn'}">${a.level === 'critical' ? '위험' : '주의'}</span> <b>${esc(a.area)}</b> ${esc(a.message)}</li>`).join('')}</ul>` : '<p class="sub">경보 없음 — 모든 지표가 기준 안에 있어요.</p>'}</div>
    <div class="card"><h3>가용성·트래픽</h3>${kv([['서버 재시작', `${n(m.availability.restarts)}회`], ['요청', `${n(t.requests)}건 (가장 많은 시간 ${t.peakHour ? esc(t.peakHour.h) + '시 ' + n(t.peakHour.n) + '건' : '-'})`], ['오류', `서버 오류(5xx) ${n(t.errors5xx)}건 (${pctTxt(t.errorRate5xx)}) · 요청 오류(4xx) ${n(t.errors4xx)}건 · 요청 제한(429) ${n(t.rateLimited429)}건`], ['응답 시간', `평균 ${t.avgMs ?? '-'}ms · 95% ${t.p95Ms ?? '-'}ms 이하`], ['클라이언트 오류 보고', `${n(m.errors.clientReports)}건`]])}
      <div class="rep-hours" aria-label="시간별 요청">${hours.map(h => `<i title="${h.i}시 ${h.n}건" style="height:${Math.max(2, h.n / hmax * 100)}%" class="${h.e ? 'err' : ''}"></i>`).join('')}</div><div class="rep-axis"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>24시</span></div>
      ${t.topRoutes?.length ? `<div class="scroll"><table class="tbl"><tr><th>많이 쓴 경로</th><th class="num">요청</th><th class="num">평균</th><th class="num">최대</th><th class="num">5xx</th></tr>${t.topRoutes.map(x => `<tr><td>${esc(x.route)}</td><td class="num">${n(x.requests)}</td><td class="num">${x.avgMs}ms</td><td class="num">${x.maxMs}ms</td><td class="num">${n(x.errors5xx)}</td></tr>`).join('')}</table></div>` : ''}</div>
    <div class="card"><h3>사용자·서비스</h3>${kv([['로그인', `성공 ${n(u.loginOk)} · 실패 ${n(u.loginFail)} · 이용자 ${n(u.activeUsers)}명`], ['신청·승인', `신청 ${n(u.registrations)} · 승인 ${n(u.approvals)} · 거절 ${n(u.rejections)}`], ['질문·AI', `질문 ${n(u.questions)} · AI 호출 ${n(u.llmCalls)} · 토큰 ${n(u.tokens)} · 한도 거절 ${n(u.blockedByLimit)}`], ['답변 시간', `평균 ${u.answer?.avgMs ?? '-'}ms · 95% ${u.answer?.p95Ms ?? '-'}ms (${n(u.answer?.count)}건)`], ['의견', `${n(u.opinions)}건${u.avgRating != null ? ` · 평균 ${u.avgRating}점` : ''}`],
      ['정원', `오늘 신청 ${u.capacity.registers.used}/${u.capacity.registers.max} · 베타 테스터 ${u.capacity.users.used}/${u.capacity.users.max} · 오늘 로그인 ${u.capacity.logins.used}/${u.capacity.logins.max}`]])}</div>
    <div class="card"><h3>외부 API 사용량</h3>${m.external.length ? `<div class="scroll"><table class="tbl"><tr><th>제공기관</th><th class="num">호출</th><th class="num">하루 한도</th><th>사용률</th><th class="num">오류</th></tr>${m.external.map(e => `<tr><td>${esc(e.provider)}</td><td class="num">${n(e.calls)}</td><td class="num">${e.quota ? n(e.quota) : '-'}</td><td>${e.usage != null ? `<div class="ubar"><i style="width:${Math.min(100, e.usage * 100).toFixed(1)}%"${e.usage >= 0.8 ? ' class="over"' : ''}></i></div><span class="sub">${pctTxt(e.usage)}</span>` : '-'}</td><td class="num">${n(e.errors)}</td></tr>`).join('')}</table></div><p class="sub">로그인 사용자 요청에서 실제로 호출한 수(캐시 적중 제외)</p>` : '<p class="sub">호출 기록 없음</p>'}</div>
    <div class="card"><h3>오류 로그</h3>${kv([['건수', `오류 ${n(m.errors.error)} · 경고 ${n(m.errors.warn)} · 정보 ${n(m.errors.info)}`]])}${m.errors.top.length ? `<ul class="qlist">${m.errors.top.map(e => `<li><span class="sub">${n(e.n)}회 · 마지막 ${dt(e.last)}</span><div>${esc(e.title)}</div></li>`).join('')}</ul>` : '<p class="sub">오류·경고 없음</p>'}</div>
    <div class="card"><h3>자원·백업 <span class="sub">(${dt(res.sampledAt)} 측정)</span></h3>${kv([['서버 프로세스', `가동 ${res.process.uptimeH}시간 · 메모리 ${res.process.rssMB}MB · Node ${esc(res.process.node)}`], ['호스트', `CPU ${res.host.cpus}개 · 부하 ${res.host.load.join(' / ')} · 메모리 ${res.host.memTotalGB}GB`],
      ['디스크', res.disk ? `남은 공간 ${res.disk.freeGB}GB / ${res.disk.totalGB}GB (${pctTxt(res.disk.freeRatio)})` : '-'], ['DB', `${res.db.sizeMB}MB · 큰 테이블 ${res.db.tables.slice(0, 3).map(x => `${esc(x.name)} ${x.sizeMB}MB`).join(', ')}`],
      ['백업', res.backup.latest ? `마지막 ${dt(res.backup.latest.at)} · ${esc(res.backup.latest.file)} (${res.backup.latest.sizeMB}MB)` : '<span class="st-error">백업 파일 없음</span>'], ['Notion 요약', res.notionSummary?.log ? esc(res.notionSummary.log) : '-']])}</div>
    <div class="card"><h3>AI</h3>${kv([['상태', m.ai.status?.available === false ? '<span class="pill bad">크레딧 소진 잠금</span>' : '<span class="pill ok">이용 가능</span>'], ['크레딧', m.ai.credit?.remaining != null ? `${n(m.ai.credit.remaining)} / ${n(m.ai.credit.total)} (${dt(m.ai.credit.checkedAt)} 확인값)` : '확인 기록 없음']])}</div>`;
    $('#backReports').onclick = () => go('reports');
  },
  async user_usage(opt = {}) {
    const { user, days } = await api(`/v1/admin/users/${opt.user}/usage?days=30`);
    const max = Math.max(user.dailyTokens || 0, ...days.map(d => d.tokens), 1), sum = days.reduce((a, d) => a + d.tokens, 0);
    view.innerHTML = `${backBar(`토큰 사용 기록 · ${esc(user.loginId)}`)}<p class="sub">최근 30일 · 합계 ${n(sum)} 토큰 · 하루 한도 ${n(user.dailyTokens)} · 사용이 없던 날은 빠져요</p>
    ${days.length ? `<div class="scroll"><table class="tbl"><tr><th>날짜</th><th class="num">토큰(입력/출력)</th><th>한도 대비</th><th class="num">AI 호출</th><th class="num">질문</th><th class="num">로그인</th></tr>
    ${days.map(d => `<tr><td>${esc(d.day)}</td><td class="num"><b>${n(d.tokens)}</b><br><span class="sub">${n(d.tokensIn)} / ${n(d.tokensOut)}</span></td><td><div class="ubar"><i style="width:${Math.min(100, d.tokens / max * 100).toFixed(1)}%"${user.dailyTokens && d.tokens > user.dailyTokens ? ' class="over"' : ''}></i></div><span class="sub">${user.dailyTokens ? Math.round(d.tokens / user.dailyTokens * 100) + '%' : '-'}</span></td><td class="num">${n(d.llmCalls)}</td><td class="num">${n(d.messages)}${d.blocked ? `<br><span class="sub">거절 ${d.blocked}</span>` : ''}</td><td class="num">${n(d.sessions)}</td></tr>`).join('')}</table></div>` : '<div class="card"><p class="sub">최근 30일 사용 기록이 없어요.</p></div>'}`;
    bindBack();
  },
  async user_questions(opt = {}) {
    const { user, days } = await api(`/v1/admin/users/${opt.user}/questions?days=30`);
    view.innerHTML = `${backBar(`질문 기록 · ${esc(user.loginId)}`)}<p class="sub">최근 30일 · 날짜별 질문 ${n(days.reduce((a, d) => a + d.count, 0))}건 · 주소 번지는 저장할 때 가려짐</p>
    ${days.length ? days.map((d, i) => `<details class="card qday"${i === 0 ? ' open' : ''}><summary><b>${esc(d.day)}</b> <span class="pill ok">질문 ${d.count}</span></summary><ul class="qlist">${d.items.map(m => `<li><span class="sub">${esc(new Date(m.at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }))}${m.intent ? ' · ' + esc(m.intent) : ''}</span><div>${esc(m.content)}</div></li>`).join('')}</ul></details>`).join('') : '<div class="card"><p class="sub">최근 30일 질문이 없어요.</p></div>'}
    <div class="acts" style="margin-top:8px"><button id="toChats">답변까지 전체 대화 보기</button></div>`;
    bindBack(); $('#toChats').onclick = () => go('chats', { user: opt.user, label: user.loginId });
  },
  async user_logins(opt = {}) {
    const { user, logins } = await api(`/v1/admin/users/${opt.user}/logins?days=30`);
    const ST = { granted: '<span class="pill ok">허용</span>', denied: '<span class="pill warn">거부</span>', unavailable: '<span class="pill">확인 불가</span>', none: '<span class="sub">요청 전·이전 버전</span>' };
    view.innerHTML = `${backBar(`로그인 위치 기록 · ${esc(user.loginId)}`)}<p class="sub">최근 30일 로그인 · 위치는 사용자가 허용한 경우만 약 100m 단위로 저장하고 30일 뒤 지워요</p>
    ${logins.length ? `<div class="scroll"><table class="tbl"><tr><th>로그인</th><th>기기</th><th>위치 동의</th><th>위경도</th><th>지도</th></tr>
    ${logins.map(l => `<tr><td>${dt(l.at)}${l.endedAt ? `<br><span class="sub">종료 ${dt(l.endedAt)}${l.endReason ? ' · ' + esc(l.endReason) : ''}</span>` : ''}</td><td>${esc(devPlat(l.device))}<br><span class="sub">${esc(devBrowser(l.device))}</span></td><td>${ST[l.locationStatus] ?? esc(l.locationStatus)}</td>
      <td>${l.location ? `${l.location.lat.toFixed(3)}, ${l.location.lon.toFixed(3)}${l.location.address ? ` (${esc(l.location.address)} 부근)` : ''}${l.location.accuracyM ? `<br><span class="sub">오차 약 ${n(l.location.accuracyM)}m</span>` : ''}` : '-'}</td>
      <td>${l.location ? `<a href="https://map.kakao.com/link/map/${encodeURIComponent(user.loginId + ' 로그인')},${l.location.lat},${l.location.lon}" target="_blank" rel="noopener noreferrer">카카오맵</a>` : '-'}</td></tr>`).join('')}</table></div>` : '<div class="card"><p class="sub">최근 30일 로그인 기록이 없어요.</p></div>'}`;
    bindBack();
  },
  async opinions(opt = {}) {
    const { opinions } = await api('/v1/admin/opinions' + (opt.user ? `?user=${opt.user}` : ''));
    const avg = opinions.filter(o => o.rating).map(o => o.rating);
    view.innerHTML = `${opt.user ? backBar(`의견 · ${esc(opt.label ?? '')}`) : '<div class="tool"><h2>의견 보내기(최근 200)</h2></div>'}<p class="sub">사용자가 하단 '의견' 탭에서 보낸 의견이에요. 새 의견은 Slack 의견 채널(FEEDBACK_SLACK_ID)로도 알려 드려요.${avg.length ? ` 평균 만족도 ${(avg.reduce((a, b) => a + b, 0) / avg.length).toFixed(1)}점(${avg.length}건)` : ''}</p>
    ${opinions.length ? `<div class="scroll"><table class="tbl"><tr><th>시각</th><th>아이디</th><th>만족도</th><th>의견</th></tr>
    ${opinions.map(o => `<tr><td>${dt(o.createdAt)}</td><td>${esc(o.loginId ?? '')}</td><td>${o.rating ? '★'.repeat(o.rating) + '☆'.repeat(5 - o.rating) : '<span class="sub">-</span>'}</td><td style="white-space:pre-wrap">${esc(o.text)}</td></tr>`).join('')}</table></div>` : '<div class="card"><p class="sub">아직 받은 의견이 없어요.</p></div>'}`;
    bindBack();
  },
async skills() {
    const r = await api('/v1/admin/skills');
    const ul = a => `<ul class="sk-ul">${(a ?? []).map(x => `<li>${esc(x)}</li>`).join('') || '<li class="sub">없음</li>'}</ul>`;
    view.innerHTML = `<div class="tool"><h2>에이전트 스킬 ${r.skills.length}개 <span class="sub">v${esc(r.version)}</span></h2></div>
    <p class="sub">${esc(r.framework)}. 원본은 백엔드 <code>skills/registry.json</code>, 산책 판단 기록에는 의도에 맞는 스킬 id가 함께 저장돼요.</p>
    <details class="card"><summary><b>공통 원칙</b></summary>${ul(r.principles)}</details>
    ${r.skills.map(s => `<details class="card sk"><summary><b>${esc(s.name)}</b> <code>${esc(s.id)}</code><div class="sub">${esc(s.goal)}</div><div class="sk-tags">${s.intents.map(i => `<span class="pill ok">${esc(i)}</span>`).join('')}</div></summary>
      <h4>1. API 명세</h4><div class="scroll"><table class="tbl"><tr><th>호출</th><th>입력</th><th>출력</th></tr>${s.endpoints.map(e => `<tr><td><code>${esc(e.method)} ${esc(e.path)}</code></td><td class="sub">${esc(e.input)}</td><td class="sub">${esc(e.output)}</td></tr>`).join('')}</table></div>
      <p class="sub">제공기관: ${s.providers.map(esc).join(' · ')}</p>
      <h4>2. 의도</h4>${ul(s.examples.map(x => '"' + x + '"'))}
      <h4>3. 문맥</h4><p class="sub">필수</p>${ul(s.context.required)}<p class="sub">선택</p>${ul(s.context.optional)}${s.context.memory?.length ? `<p class="sub">기억·상태</p>${ul(s.context.memory)}` : ''}
      <h4>4. 실행 조건</h4>${ul(s.conditions)}<p class="sub">실패 시 대체</p>${ul(s.fallbacks)}
      <h4>참고한 외부 MCP</h4>${ul(s.references)}</details>`).join('')}`;
  },
  async plans() {
    const [{ plans }, h] = await Promise.all([api('/v1/admin/plans?limit=100'), api('/healthz', { noAuth: true })]);
    view.innerHTML = `<div class="tool"><h2>꼬리길 산책 판단(최근 100)</h2><div class="acts"><button id="syncCourses">두루누비 코스 지금 동기화</button></div></div>
    <p class="sub">두루누비 코스 ${n(h.courses?.count)}개 · 마지막 동기화 ${dt(h.courses?.syncedAt)} · 매일 05시 이후 자동 동기화 · 백엔드 v${esc(h.version)}</p>
    <div class="scroll"><table class="tbl"><tr><th>만든 시각</th><th>날짜</th><th>지역</th><th>아이</th><th class="num">산책 점수</th><th>코스</th></tr>
    ${plans.map(p => `<tr><td>${dt(p.created_at)}</td><td>${esc(p.walk_date)}</td><td>${esc(p.sigungu ?? '')}</td><td>${esc(({ small: '소형', medium: '중형', large: '대형' })[p.dog_size] ?? '')} ${esc(({ puppy: '강아지', adult: '성견', senior: '노령견' })[p.dog_age] ?? '')}</td><td class="num">${p.score ?? '-'} <span class="pill ${p.gate === 'go' ? 'ok' : p.gate === 'indoor' ? 'bad' : 'warn'}">${esc({ go: '지금 가기', time: '시간대', short: '짧게', indoor: '실내' }[p.gate] ?? p.gate ?? '')}</span></td><td>${esc(p.course ?? '-')}</td></tr>`).join('')}</table></div>${plans.length ? '' : '<div class="card"><p class="sub">아직 만든 플랜이 없어요.</p></div>'}`;
    $('#syncCourses').onclick = async () => { const b = $('#syncCourses'); b.disabled = true; b.textContent = '동기화 중…'; try { const r = await api('/v1/admin/courses/sync', { method: 'POST', body: '{}', timeoutMs: 120000 }); note(`코스 ${r.total}개 동기화(시작점 ${r.withStart}개, GPX ${r.gpxFetched}개 새로 받음)`); views.plans(); } catch (e) { note(errText(e), true); b.disabled = false; b.textContent = '두루누비 코스 지금 동기화'; } };
  },
  async actions() {
    const { actions } = await api('/v1/admin/actions');
    view.innerHTML = `<div class="tool"><h2>관리자 작업 기록</h2></div><div class="scroll"><table class="tbl"><tr><th>시각</th><th>관리자</th><th>작업</th><th>대상</th><th>내용</th></tr>
    ${actions.map(a => `<tr><td>${dt(a.at)}</td><td>${esc(a.admin ?? 'CLI')}</td><td>${esc(a.action)}</td><td>${esc(a.target ?? '')}</td><td class="sub">${esc(JSON.stringify(a.detail ?? {}))}</td></tr>`).join('')}</table></div>`;
  }
};
// 기기 표시: 아이폰 · iOS 26.7.3 / Chrome 157 (User-Agent 추정, 구버전 서버 응답은 기존 필드로 표시)
const devPlat = d => d ? [d.platform, d.model, d.os].filter(Boolean).join(' · ') : '';
const devBrowser = d => d ? (d.label ?? d.browser ?? '') : '';
const capBar = c => c ? `<div class="capbar">${[['오늘 신청', c.registers], ['베타 테스터', c.users], ['오늘 로그인', c.logins]].map(([l, v]) => `<div class="${v.used >= v.max ? 'full' : v.used >= v.max * 0.8 ? 'near' : ''}"><span>${l}</span><b>${n(v.used)} / ${n(v.max)}</b><i><em style="width:${Math.min(100, v.max ? v.used / v.max * 100 : 100).toFixed(1)}%"></em></i></div>`).join('')}</div><p class="sub">서비스 전체 정원은 베타 테스터에게 적용돼요. 계정별 하루 로그인 한도는 모든 역할에 적용돼요.</p>` : '';
const backBar = title => `<div class="tool"><div class="acts"><button id="backUsers">← 사용자</button></div><h2>${title}</h2></div>`;
function bindBack() { const b = $('#backUsers'); if (b) b.onclick = () => go('users'); }
async function go(v, opt) {
  current = v; visitsRedraw = null; document.querySelectorAll('#atabs button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  document.querySelector(`#atabs button[data-v="${v}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); window.scrollTo({ top: 0 });
  try { await views[v](opt); } catch (e) { if (e.status !== 401) view.innerHTML = `<div class="card"><p class="sub">${esc(errText(e))}</p></div>`; }
}
document.querySelectorAll('#atabs button').forEach(b => b.onclick = () => go(b.dataset.v));
// 모바일 카드형 표: 각 칸에 머리글을 data-label 로 붙여, 좁은 화면에서 '머리글: 값' 카드로 보이게 한다(CSS).
function labelTables(root = view) {
  root.querySelectorAll('table.tbl').forEach(t => {
    const rows = [...t.rows]; const head = rows.find(r => r.querySelector('th')); if (!head) return;
    head.classList.add('thead-row');
    const labels = [...head.cells].map(c => c.textContent.trim());
    rows.forEach(r => { if (r === head) return; [...r.cells].forEach((c, i) => { if (c.hasAttribute('data-label')) return; c.setAttribute('data-label', labels[i] ?? ''); if (!labels[i]) c.classList.add('no-label'); const w = document.createElement('div'); w.className = 'cell'; while (c.firstChild) w.appendChild(c.firstChild); c.appendChild(w); }); });
  });
}
new MutationObserver(() => labelTables()).observe(view, { childList: true, subtree: true });
// 접속현황 차트: 누르거나 올리면 아래 줄에 수치(휴대폰은 title 말풍선이 없어서), 화면 폭이 바뀌면 다시 그림
let visitsRedraw = null, visitsW = 0, visitsLastW = innerWidth;
const visitsUi = { sec: 'daily', modes: {} }; // 고른 섹션 탭·차트 보기(하루 평균/합계 등)는 새로 고침·기간 바꿈·화면 폭 변경에도 유지
const resetRead = card => { const out = card?.querySelector('.vz-read'); if (out) out.textContent = out.dataset.hint ?? ''; card?.querySelectorAll('.vz-hit.on').forEach(x => x.classList.remove('on')); };
view.addEventListener('click', e => {
  const tab = e.target.closest?.('[data-vsec]');
  if (tab) {
    visitsUi.sec = tab.dataset.vsec;
    view.querySelectorAll('[data-vsec]').forEach(b => { const on = b === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    view.querySelectorAll('[data-vsec-pane]').forEach(p => { p.hidden = p.dataset.vsecPane !== visitsUi.sec; });
    return;
  }
  const mode = e.target.closest?.('[data-vmode]');
  if (mode) {
    const card = mode.closest('.vz-card'); visitsUi.modes[card.dataset.vsecPane] = mode.dataset.vmode;
    card.querySelectorAll('[data-vmode]').forEach(b => { const on = b === mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    card.querySelectorAll('[data-vpane]').forEach(p => { p.hidden = p.dataset.vpane !== mode.dataset.vmode; });
    resetRead(card);
  }
});
const showTip = e => { const t = e.target.closest?.('[data-tip]'); if (!t) return; const card = t.closest('.vz-card'); const out = card?.querySelector('.vz-read'); if (!out) return; out.textContent = t.dataset.tip; card.querySelectorAll('.vz-hit.on').forEach(x => x.classList.remove('on')); t.classList.add('on'); };
view.addEventListener('click', showTip); view.addEventListener('pointerover', e => { if (e.pointerType === 'mouse') showTip(e); });
// 폭이 바뀔 때만 다시 그림(휴대폰은 스크롤하면 주소창 때문에 높이만 바뀌는 resize 가 자주 와요)
addEventListener('resize', () => { clearTimeout(visitsW); visitsW = setTimeout(() => { if (innerWidth !== visitsLastW) { visitsLastW = innerWidth; visitsRedraw?.(); } }, 250); });

(async () => {
  const h = await health();
  if (h.error) return gone(`서버 연결 실패: ${h.error}`);
  if (state.authMode !== 'required') return gone('서버가 로그인 없이 동작 중이에요(AUTH_MODE=off). 관리자 기능은 로그인 모드에서만 써요.');
  if (!state.auth?.token) return gone('이 탭에 로그인 정보가 없어요.');
  try {
    const me = await api('/v1/auth/me');
    if (me.role !== 'admin') return gone('관리자 계정이 아니에요.');
    $('#userPageLink').hidden = false;
    syncAccount(me);
    $('#who').textContent = `${me.user.displayName}(${me.user.loginId}) · 세션 ${me.limits.sessionMinutes}분`;
    startTimer($('#timer'), { onWarn: s => note(`약 ${s}초 뒤 자동 로그아웃돼요`), onExpire: () => { logout('expired'); gone('이용 시간이 끝나 자동 로그아웃됐어요.'); } });
    $('#userPageLink').textContent = '일반 페이지로';
    go('users');
  } catch (e) { if (e.status !== 401) gone(errText(e)); }
})();

// 모바일: 메뉴 탭이 오른쪽 끝까지 밀렸으면 흐림 표시를 없애고, 길게 내려가면 '맨 위로' 버튼
const tabsEl = $('#atabs'); const syncTabsEdge = () => tabsEl.classList.toggle('at-end', tabsEl.scrollLeft + tabsEl.clientWidth >= tabsEl.scrollWidth - 4);
tabsEl.addEventListener('scroll', syncTabsEdge, { passive: true }); syncTabsEdge();
const toTop = document.createElement('button'); toTop.className = 'to-top'; toTop.type = 'button'; toTop.setAttribute('aria-label', '맨 위로'); toTop.textContent = '↑'; toTop.hidden = true;
toTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' }); document.body.appendChild(toTop);
window.addEventListener('scroll', () => { toTop.hidden = window.scrollY < 600; }, { passive: true });
