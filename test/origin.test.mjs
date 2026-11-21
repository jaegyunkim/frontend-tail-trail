#!/usr/bin/env node
// node --test test/origin.test.mjs
// From live/: ORIGIN_APP=../next/app.js node --test test/origin.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const file = process.env.ORIGIN_APP || new URL('../app.js', import.meta.url);
const source = readFileSync(file, 'utf8').replace(/^import .*$/gm, '');
const noop = () => {};
const coarse = '서울 마포구 망원동';
const address = { sido: '서울', sigungu: '마포구', bname: '망원동', roadAddress: '서울 마포구 테스트로 987', jibunAddress: `${coarse} 654-3` };

function app() {
  const nodes = new Map(), store = new Map(), calls = [], gps = [], postcode = [];
  function $(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: '', innerHTML: '', textContent: '', dataset: {}, events: {},
      classList: { toggle: noop, add: noop, remove: noop },
      querySelector: key => $(selector + ' ' + key), querySelectorAll: () => [],
      addEventListener(type, cb) { this.events[type] = cb; }, focus: noop, scrollIntoView: noop,
      showModal() { this.open = true; }, close() { this.open = false; }
    });
    return nodes.get(selector);
  }
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) };
  const ctx = {
    document: { querySelector: $, querySelectorAll: () => [], addEventListener: noop },
    localStorage: storage, sessionStorage: storage, setTimeout: noop, clearTimeout: noop,
    setInterval: noop, clearInterval: noop, addEventListener: noop, setOnAuthLost: noop, setOnMustChange: noop,
    // Keep the unrelated authentication startup suspended.
    policyText: () => null, DAY_NOTE: "", health: () => new Promise(noop), state: { auth: null },
    navigator: { geolocation: { getCurrentPosition: (ok, fail) => gps.push({ ok, fail }) } },
    daum: { Postcode: class { constructor(opts) { postcode.push(opts); } embed() {} } },
    api: async (url, opts = {}) => {
      const body = opts.body && JSON.parse(opts.body);
      calls.push({ url, method: opts.method, body });
      if (url.startsWith('/v1/place-name?')) return { label: '모의 공원' };
      if (url === '/v1/me/places' && opts.method === 'POST') {
        const place = { id: 7, label: body.text, selected: true };
        return { place, places: [place] };
      }
      throw Error(`Unexpected API call: ${url}`);
    }
  };
  ctx.window = ctx;
  const origin = vm.runInNewContext(source + '\n;({drawForm, originValue})', ctx, { filename: String(file) });
  origin.drawForm();
  return { $, store, calls, gps, postcode, origin };
}
const chips = a => a.$('#placeChips').innerHTML;
const gpsButton = a => a.$('#placeChips [data-here]');

async function pick(a) {
  const { $ } = a;
  $('#placeManage').onclick();
  $('#placeInput').value = '테스트로';
  $('#placeInput').events.input();
  assert.equal($('#placeAdd').disabled, true);
  assert.equal($('#placeOnce').disabled, true);
  $('#placeForm').events.submit({ preventDefault: noop });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(a.postcode.length, 1);
  a.postcode[0].oncomplete(address);
  assert.equal($('#placePickedText').textContent, coarse);
  assert.equal($('#placeAdd').disabled, false);
  assert.equal($('#placeOnce').disabled, false);
}

test('first draw renders an unselected GPS control and empty origin', () => {
  const a = app();
  assert.match(chips(a), /<button\b(?=[^>]*data-here)(?=[^>]*aria-checked="false")/);
  assert.match(chips(a), /id="placeManage"/);
  assert.match(a.$('#originNow').innerHTML, /아래에서 골라 주세요/);
  assert.equal(a.origin.originValue(), '');
});

for (const save of [true, false]) test(`selected postcode: ${save ? 'save sends only coarse text' : 'once selects coarse text without saving'}`, async () => {
  const a = app();
  await pick(a);
  await a.$(save ? '#placeAdd' : '#placeOnce').onclick();
  assert.deepEqual(a.calls, save ? [{ url: '/v1/me/places', method: 'POST', body: { text: coarse } }] : []);
  assert.equal(a.origin.originValue(), coarse);
  assert.equal(a.$('#placesDialog').open, false);
  assert.match(a.$('#originNow').innerHTML, new RegExp(coarse));
  assert.match(chips(a), save ? /<button\b(?=[^>]*data-place="7")(?=[^>]*aria-checked="true")/ : /<button\b(?=[^>]*data-temp)(?=[^>]*aria-checked="true")/);
  assert.doesNotMatch(JSON.stringify([...a.store]), /테스트로|654-3/);
});

test('GPS success displays the label but uses rounded coordinates for the origin', async () => {
  const a = app();
  gpsButton(a).onclick();
  assert.match(chips(a), /aria-busy="true"/);
  await a.gps[0].ok({ coords: { latitude: 37.123456, longitude: 127.987654 } });
  assert.deepEqual(a.calls.map(c => c.url), ['/v1/place-name?lat=37.1235&lon=127.9877']);
  assert.equal(a.origin.originValue(), '37.1235,127.9877');
  assert.equal(a.$('#origin').value, '모의 공원');
  assert.match(a.$('#originNow').innerHTML, /모의 공원/);
  assert.match(chips(a), /<button\b(?=[^>]*data-here)(?=[^>]*aria-checked="true")/);
  assert.doesNotMatch(chips(a), /aria-busy="true"/);
});

test('GPS permission denial retains the chosen address and allows retry', async () => {
  const a = app();
  await pick(a);
  a.$('#placeOnce').onclick();
  gpsButton(a).onclick();
  a.gps[0].fail({ code: 1 });
  assert.match(a.$('#toast').textContent, /권한/);
  assert.match(a.$('#originNow').innerHTML, new RegExp(coarse));
  assert.equal(a.origin.originValue(), coarse);
  assert.doesNotMatch(chips(a), /aria-busy="true"/);
  assert.match(chips(a), /<button\b(?=[^>]*data-here)(?=[^>]*aria-checked="false")/);
  assert.deepEqual(a.calls, []);
  assert.equal(a.store.has('tailtrail.here'), false);
  gpsButton(a).onclick();
  assert.equal(a.gps.length, 2);
});
