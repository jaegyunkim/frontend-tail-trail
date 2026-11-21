// 기본 백엔드 주소(맥미니 Caddy HTTPS, 어디물어·북 워킹과 같은 도메인의 /tail-trail 경로 → 127.0.0.1:8889). 비밀키는 절대 넣지 않아요.
window.TAILTRAIL_API = 'https://lonbekim.tplinkdns.com/tail-trail';
// 기본 주소에 연결되지 않을 때 차례로 시도하는 예비 주소
window.TAILTRAIL_API_FALLBACKS = []; // 예비 주소가 생기면 여기에 넣는다(공인 IP 주소는 공개 저장소에 두지 않는다)
window.TAILTRAIL_PUBLIC_URL = 'https://jaegyunkim.github.io/frontend-tail-trail/';
