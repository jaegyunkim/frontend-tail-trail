// 꼬리길 강아지 캐릭터(임시 디자인) 생성기: assets/dogs/{종류}-{1~5}.svg 25장을 만든다. 사용: node scripts/gen-dog-avatars.mjs
// 종류 5개(소형·중형·대형·단두종·털 두꺼운 아이) × 모양 5개(색·무늬·반다나)이고, 나이(강아지·노령견)는 화면에서 배지로 표시한다.
// 캔바에서 정식 캐릭터를 만들면 같은 파일 이름(small-1.svg … coat-5.svg, 512×512 투명 배경)으로 바꿔 끼우기만 하면 된다. docs/design/dog-characters.md 참고.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'dogs');
export const KINDS = ['small', 'medium', 'large', 'flat', 'coat'];
// 모양 1~5: 털색 / 귀색 / 무늬 / 반다나 색 / 이름(화면 표시용)
export const VARIANTS = [
  { n: 1, name: '몽글', body: '#F1D5A8', ear: '#DDB27C', mark: 'none', scarf: '#2F6B4F' },
  { n: 2, name: '초코', body: '#9A6A47', ear: '#6E472D', mark: 'bib', scarf: '#E8863A' },
  { n: 3, name: '점박', body: '#F4EFE6', ear: '#3C3A41', mark: 'patch', scarf: '#4C84C4' },
  { n: 4, name: '별이', body: '#E9A64D', ear: '#C27B2E', mark: 'star', scarf: '#D9577A' },
  { n: 5, name: '구름', body: '#C3C9D2', ear: '#8F97A5', mark: 'freckle', scarf: '#8A63C7' }
];
const INK = '#2B2630', CREAM = '#FFF7EA', PINK = '#F3A9A0';

const earPath = {
  small: (c, i) => `<g><path d="M58 70 C42 34 62 14 84 38 C90 48 88 60 84 70 Z" fill="${c}"/><path d="M62 62 C54 40 64 28 78 42 C82 48 80 56 78 62 Z" fill="${i}"/></g><g><path d="M142 70 C158 34 138 14 116 38 C110 48 112 60 116 70 Z" fill="${c}"/><path d="M138 62 C146 40 136 28 122 42 C118 48 120 56 122 62 Z" fill="${i}"/></g>`,
  medium: (c, i) => `<g stroke-linejoin="round" stroke-linecap="round"><path d="M56 70 L52 30 L90 52 Z" fill="${c}" stroke="${c}" stroke-width="10"/><path d="M60 60 L58 40 L78 52 Z" fill="${i}" stroke="${i}" stroke-width="4"/></g><g stroke-linejoin="round" stroke-linecap="round"><path d="M144 70 L148 30 L110 52 Z" fill="${c}" stroke="${c}" stroke-width="10"/><path d="M140 60 L142 40 L122 52 Z" fill="${i}" stroke="${i}" stroke-width="4"/></g>`,
  large: (c) => `<ellipse cx="44" cy="102" rx="19" ry="40" fill="${c}" transform="rotate(10 44 102)"/><ellipse cx="156" cy="102" rx="19" ry="40" fill="${c}" transform="rotate(-10 156 102)"/>`,
  flat: (c, i) => `<g stroke-linejoin="round"><path d="M50 66 C34 62 36 90 56 92 C64 90 64 74 56 66 Z" fill="${c}" stroke="${c}" stroke-width="6"/></g><g stroke-linejoin="round"><path d="M150 66 C166 62 164 90 144 92 C136 90 136 74 144 66 Z" fill="${c}" stroke="${c}" stroke-width="6"/></g>`,
  coat: (c, i) => `<g><path d="M58 72 L50 22 L92 50 Z" fill="${c}" stroke="${c}" stroke-width="8" stroke-linejoin="round"/><path d="M62 62 L58 36 L80 50 Z" fill="${CREAM}" stroke="${CREAM}" stroke-width="3" stroke-linejoin="round"/></g><g><path d="M142 72 L150 22 L108 50 Z" fill="${c}" stroke="${c}" stroke-width="8" stroke-linejoin="round"/><path d="M138 62 L142 36 L120 50 Z" fill="${CREAM}" stroke="${CREAM}" stroke-width="3" stroke-linejoin="round"/></g>`
};
const head = {
  small: b => `<ellipse cx="100" cy="94" rx="50" ry="46" fill="${b}"/>`,
  medium: b => `<ellipse cx="100" cy="94" rx="53" ry="48" fill="${b}"/>`,
  large: b => `<ellipse cx="100" cy="92" rx="56" ry="52" fill="${b}"/>`,
  flat: b => `<ellipse cx="100" cy="98" rx="60" ry="46" fill="${b}"/>`,
  coat: b => { // 폭신한 털 가장자리: 둘레에 작은 원을 둘러 구름 모양으로
    let s = ''; const n = 16; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; s += `<circle cx="${(100 + 56 * Math.cos(a)).toFixed(1)}" cy="${(94 + 50 * Math.sin(a)).toFixed(1)}" r="13" fill="${b}"/>`; }
    return s + `<ellipse cx="100" cy="94" rx="54" ry="48" fill="${b}"/>`;
  }
};
const eyeY = { small: 88, medium: 88, large: 86, flat: 82, coat: 88 }, eyeDx = { small: 21, medium: 22, large: 24, flat: 27, coat: 22 };

export function svgFor(kind, v) {
  const faceMuzzle = kind === 'flat'
    ? `<ellipse cx="100" cy="114" rx="33" ry="22" fill="#4A3F46"/><ellipse cx="100" cy="116" rx="19" ry="11" fill="#5B4F58"/>`
    : `<ellipse cx="100" cy="${kind === 'large' ? 112 : 110}" rx="${kind === 'large' ? 30 : 26}" ry="${kind === 'large' ? 22 : 20}" fill="${CREAM}"/>`;
  const wrinkles = kind === 'flat' ? `<path d="M80 66 Q100 58 120 66 M84 74 Q100 68 116 74" stroke="#4A3F46" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".55"/>` : '';
  const blaze = kind === 'coat' ? `<path d="M100 48 C86 66 84 82 100 96 C116 82 114 66 100 48 Z" fill="${CREAM}" opacity=".95"/>` : '';
  const ey = eyeY[kind], dx = eyeDx[kind], eyeR = kind === 'flat' ? 8.6 : 7.4;
  const noseY = kind === 'flat' ? 106 : kind === 'large' ? 104 : 103;
  const nose = kind === 'flat' ? `<ellipse cx="100" cy="${noseY}" rx="9" ry="6.5" fill="${INK}"/><ellipse cx="97" cy="${noseY - 2}" rx="2.6" ry="1.6" fill="#fff" opacity=".7"/>` : `<path d="M91 ${noseY} Q100 ${noseY - 6} 109 ${noseY} Q106 ${noseY + 8} 100 ${noseY + 9} Q94 ${noseY + 8} 91 ${noseY} Z" fill="${INK}"/><ellipse cx="97" cy="${noseY + 1}" rx="2.4" ry="1.5" fill="#fff" opacity=".7"/>`;
  const my = noseY + (kind === 'flat' ? 10 : 11);
  const mouth = `<path d="M${100 - 10} ${my + 3} Q${100 - 5} ${my + 10} 100 ${my + 2} Q${100 + 5} ${my + 10} ${100 + 10} ${my + 3}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const tongue = kind === 'large' || kind === 'medium' ? `<path d="M95 ${my + 7} Q100 ${my + 20} 105 ${my + 7} Z" fill="${PINK}"/>` : '';
  let mark = '';
  if (v.mark === 'patch') mark = `<ellipse cx="${100 - dx}" cy="${ey}" rx="15" ry="14" fill="${v.ear}" opacity=".9"/>`;
  if (v.mark === 'star') mark = `<path d="M100 54 L104 66 L116 66 L106 73 L110 85 L100 78 L90 85 L94 73 L84 66 L96 66 Z" fill="${CREAM}" opacity="${kind === 'coat' ? 0 : 0.95}"/>`;
  if (v.mark === 'freckle') mark = [[86, 106], [92, 112], [108, 112], [114, 106], [100, 116]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="${v.ear}"/>`).join('');
  const bib = v.mark === 'bib' ? `<ellipse cx="100" cy="176" rx="22" ry="20" fill="${CREAM}"/>` : '';
  const scarf = `<path d="M60 146 Q100 168 140 146 L124 182 L100 196 L76 182 Z" fill="${v.scarf}"/><circle cx="90" cy="164" r="3" fill="#fff" opacity=".8"/><circle cx="104" cy="172" r="3" fill="#fff" opacity=".8"/><circle cx="116" cy="160" r="3" fill="#fff" opacity=".8"/>`;
  const body = `<ellipse cx="100" cy="188" rx="${kind === 'large' ? 62 : 54}" ry="38" fill="${v.body}"/>`;
  const cheeks = `<circle cx="${100 - dx - 12}" cy="${ey + 20}" r="7" fill="${PINK}" opacity=".55"/><circle cx="${100 + dx + 12}" cy="${ey + 20}" r="7" fill="${PINK}" opacity=".55"/>`;
  const eyes = [-1, 1].map(s => `<circle cx="${100 + s * dx}" cy="${ey}" r="${eyeR}" fill="${INK}"/><circle cx="${100 + s * dx - 2.4}" cy="${ey - 2.6}" r="2.6" fill="#fff"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="${v.name}">
  ${earPath[kind](v.ear, '#F4C3BC')}
  ${body}${bib}
  ${head[kind](v.body)}
  ${blaze}${faceMuzzle}${wrinkles}${mark}
  ${scarf}
  ${cheeks}${eyes}${nose}${mouth}${tongue}
</svg>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(OUT, { recursive: true });
  let n = 0;
  for (const k of KINDS) for (const v of VARIANTS) { fs.writeFileSync(path.join(OUT, `${k}-${v.n}.svg`), svgFor(k, v)); n++; }
  console.log(`${n}개 만들었어요 → ${OUT}`);
}
