import { policyText, DAY_NOTE } from './role-policy.js?v=0.1.1';
import {api} from './auth.js?v=0.1.1';
// 이용 안내: 서버 기본 한도(/healthz 역할 기본값)로 채운다. 실패하면 화면에 둔 기본값 그대로
const showPolicy=L=>{document.querySelector('#signupPolicy').textContent=policyText('user',L)+'(기본값, 계정마다 다를 수 있어요). '+DAY_NOTE;};
showPolicy();
api('/healthz',{noAuth:true,timeoutMs:8000}).then(h=>{if(h?.auth?.roleLimits?.user)showPolicy(h.auth.roleLimits.user);}).catch(()=>{});
const form=document.querySelector('#requestForm');
const result=document.querySelector('#result');
const button=document.querySelector('#registerSubmit');
const dialog=document.querySelector('#registrationSuccess');
function showMessage(title,text){document.querySelector('#successTitle').textContent=title;document.querySelector('#successDescription').textContent=text;dialog.showModal();}
const successText='관리자가 확인한 뒤, 신청하신 이메일로 임시 비밀번호를 안내해 드릴게요. 조금만 기다려 주세요.';
let submitting=false;
// 이메일 중복 확인: 입력을 마치면(칸을 벗어나거나 0.6초 멈추면) 이미 신청·가입했는지 미리 알려 준다
const emailInput=document.querySelector('[name="loginId"]'),dup=document.querySelector('#dupCheck');
let dupBlocked=false,dupTimer=null,dupSeq=0;
function setDup(text,kind){dup.textContent=text;dup.hidden=!text;dup.className='dup-check '+(kind||'');dupBlocked=kind==='block';button.disabled=dupBlocked||submitting;}
async function checkDup(){
 const v=emailInput.value.trim();const seq=++dupSeq;
 if(!v||!emailInput.checkValidity()){setDup('');return;}
 try{
  const r=await api('/v1/auth/register/status?loginId='+encodeURIComponent(v),{noAuth:true});
  if(seq!==dupSeq)return;
  const when=r.requestedDate?r.requestedDate+'에 ':'';
  const reviewed=r.reviewedDate?r.reviewedDate+'에 ':'';
  if(r.status==='pending')setDup('⏳ 승인 진행 중 · '+when+'이미 이용 신청을 하셨어요. 관리자 승인을 기다려 주세요. 승인되면 신청하신 이메일로 임시 비밀번호를 안내해 드려요.','block');
  else if(r.status==='approved')setDup('✅ 승인 완료 · '+(reviewed||when)+'승인된 신청이에요.','block');
  else if(r.status==='registered')setDup('✅ 이미 가입된 이메일이에요.','block');
  else if(r.status==='rejected')setDup('❌ 승인 거부 · '+(reviewed||when)+'신청이 승인되지 않았어요. 내용을 확인하신 뒤 다시 신청하실 수 있어요.','info');
  else if(r.status==='none')setDup('신청할 수 있는 이메일이에요.','ok');
  else setDup('');
 }catch{if(seq===dupSeq)setDup('');} // 확인에 실패해도 신청은 막지 않음(제출 때 서버가 다시 확인)
}
emailInput.addEventListener('input',()=>{clearTimeout(dupTimer);setDup('');dupTimer=setTimeout(checkDup,600);});
emailInput.addEventListener('blur',()=>{clearTimeout(dupTimer);checkDup();});
function feedback(message,error=false){
 result.textContent=message;
 result.hidden=!message;
 result.className='registration-result '+(error?'error':'success');
 result.setAttribute('role',error?'alert':'status');
}
form.addEventListener('submit',async e=>{
 e.preventDefault();
 if(submitting||dupBlocked||!form.reportValidity())return;
 submitting=true;button.disabled=true;button.textContent='신청 중…';form.setAttribute('aria-busy','true');
 feedback('신청 내용을 보내고 있어요. 잠시만 기다려 주세요.');
 try{
  const h=await api('/healthz',{noAuth:true});
  if(h.version==='1.2.1')throw new Error('가입 기능을 준비 중이에요. 관리자가 서버 업데이트를 마치면 신청할 수 있어요.');
  const fields=Object.fromEntries(new FormData(form));fields.consent=fields.consent==='on';
  // 이전 서버 호환: 이미 입력한 이메일만 재사용, 별도 연락처 수집 없음.
  if(['1.3.0','1.3.1'].includes(h.version))fields.contact=fields.loginId.slice(0,100);
  const out=await api('/v1/auth/register',{method:'POST',noAuth:true,body:JSON.stringify(fields)});
  if(out.ok!==true)throw new Error(out.message||'접수 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  const date=out.requestedAt?new Date(new Date(out.requestedAt).getTime()+9*3600000).toISOString().slice(0,10).replaceAll('-','.'):null;
  const what=out.reapplied?'다시 신청이 접수됐어요':'이용 신청이 접수됐어요';
  const title=date?date+'에 '+what:what;
  feedback(title+'. '+successText);
  form.reset();
  showMessage(title,successText);
 }catch(e){
  const known={REGISTRATION_PENDING:'이미 신청하셨어요',ALREADY_REGISTERED:'이미 가입된 이메일이에요',REGISTRATION_REVIEWED:'신청 상태를 확인해 주세요',REGISTRATION_RATE:'잠시 후 다시 신청해 주세요'};
  const title=known[e.code]||'신청이 접수되지 않았어요';
  const text=known[e.code]?e.message:e.message+'\n입력하신 내용은 그대로 두었으니 잠시 후 다시 시도해 주세요.';
  feedback(text,true);
  // 어떤 결과든 안내창으로 알려 준다(작은 글씨만으로는 놓치기 쉬움)
  showMessage(title,text);
 }finally{
  submitting=false;button.disabled=dupBlocked;button.textContent='가입 신청하기';form.setAttribute('aria-busy','false');
 }
});
