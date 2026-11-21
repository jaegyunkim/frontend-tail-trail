// 클릭 순간에만 mailto URL을 만든다. 비밀번호를 DOM 링크·저장소·로그에 남기지 않는다.
export function approvalMailto(loginId, temporaryPassword) {
  const recipient = String(loginId ?? '').trim();
  if (!/^[^\s@?&#,;<>]+@[^\s@?&#,;<>]+\.[^\s@?&#,;<>]+$/.test(recipient) || /[\r\n]/.test(recipient)) {
    throw new Error('신청자 이메일 주소를 확인해 주세요.');
  }
  if (typeof temporaryPassword !== 'string' || !temporaryPassword) throw new Error('임시 비밀번호가 없어요.');
  const subject = '꼬리길(TailTrail), 가입이 승인됐어요!';
  const body = [
    '안녕하세요! 오늘 우리 강아지가 걷기 좋은 시간과 길, 가까운 병원·미용·애견샵을 알려 드리는 ‘꼬리길’에 오신 것을 환영해요.',
    '',
    '신청하신 가입이 승인됐어요. 아래 주소에서 서비스를 이용해 주세요.',
    'https://jaegyunkim.github.io/frontend-tail-trail/',
    '',
    `로그인 이메일: ${recipient}`,
    `임시 비밀번호: ${temporaryPassword}`,
    '',
    '위 임시 비밀번호로 로그인하신 뒤, 안전한 이용을 위해 비밀번호를 꼭 바꿔 주세요.',
    '임시 비밀번호는 다른 사람에게 공유하지 말아 주세요.',
    '',
    '꼬리길과 함께 우리 아이와 즐거운 산책 하세요.',
    '감사합니다.'
  ].join('\r\n');
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
