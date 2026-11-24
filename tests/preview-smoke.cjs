'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const text = fs.readFileSync(path.join(__dirname,'../test-client/Gym-2.0-TEST.html'), 'utf8');
const script = text.match(/<script>([\s\S]*?)<\/script>/);
assert(script, 'Нет JavaScript тестового клиента');
new Function(script[1]);
assert(script[1].includes("const KEY = 'gym-app-v2-local-test-20261124';"), 'Тест использует чужое хранилище');
assert(script[1].includes('const TEST_SERVER_URL = "https://script.google.com/macros/s/AKfycbzByCTrcgK12eJW4JtoY6NGDd7DGlw-MXm5NwORnNjuwDJhRmGpx8afy9XH0NpySaK8/exec";'), 'Неправильный адрес тестового сервера');
assert(script[1].includes('if (url !== TEST_SERVER_URL)'), 'Отсутствует защита от рабочего сервера');
assert(!script[1].includes('const TOKEN = '), 'Нельзя публиковать секрет');
assert(!text.includes('navigator.serviceWorker.register('), 'Тест не должен регистрировать PWA кеш');
assert(text.includes('ТЕСТОВАЯ ВЕРСИЯ'), 'Нет визуального предупреждения о тесте');
// Автоматический проход через тестовую связку, отдых и дроп-сет без сети.
const store = {};
const nodes = {};
function element(selector) {
  return nodes[selector] ||= {
    innerHTML: '', textContent: '', hidden: false,
    classList: { toggle() {}, add() {}, remove() {} },
    querySelector() { return null; }
  };
}
const document = {
  querySelector: element,
  body: { classList: { toggle() {} } },
  addEventListener() {},
  visibilityState: 'visible'
};
const window = { addEventListener() {}, scrollTo() {} };
const navigator = { onLine: false, vibrate() {} };
const localStorage = {
  getItem(key) { return store[key] || null; },
  setItem(key, value) { store[key] = value; }
};
const init = new Function('document', 'window', 'navigator', 'localStorage',
  'setInterval', 'setTimeout', 'clearTimeout',
  script[1] + '\nreturn { S, ACT, beginRest, logSet, goToSet, draft, phaseOf, summarize };');
const test = init(document, window, navigator, localStorage, () => {}, () => {}, () => {});
test.S.cfg.token = 'dummy-test-token-not-a-real-secret';
test.ACT.startflowtest();
assert.equal(test.S.active.cx, 'F');
assert.equal(test.S.active.items.length, 3);
assert.equal(test.S.active.items[0].grp, test.S.active.items[1].grp);
assert.equal(test.S.active.items[2].grp, '');
test.beginRest(); test.logSet();
assert.equal(test.S.log.length, 1);
assert.equal(test.S.active.cur, 1);
assert.equal(test.phaseOf(test.S.active), 'ready', 'Связка без фиктивного отдыха');
test.beginRest(); test.logSet();
assert.equal(test.S.log.length, 2);
assert.equal(test.S.active.restPlan, 120, 'В конце связки перерыв по максимальному плану');
test.goToSet();
test.ACT.open({ dataset: { i: '2' } });
test.beginRest(); test.logSet();
assert.equal(test.S.log.length, 3);
assert.equal(test.phaseOf(test.S.active), 'rest');
test.ACT.drop();
assert.equal(test.phaseOf(test.S.active), 'ready');
assert.equal(test.draft(test.S.active.items[2]).ty, 'дроп');
test.logSet();
assert.equal(test.S.log.length, 4);
assert.equal(test.S.log[3].ty, 'дроп');
assert.equal(test.S.log[3].n, test.S.log[2].n);
test.ACT.finish();
assert.equal(test.S.active !== null, true);
test.ACT.confirmok();
assert.equal(test.S.active, null);
assert.equal(test.S.sessions.length, 1);
assert.equal(test.S.sessions[0].sets, 3);
assert.equal(test.S.sessions[0].note, 'ТЕСТ GYM 2.0: связка + дроп-сет');
console.log('Gym 2.0 local test client: PASS (isolated preview, linked sequence, drop and finish)');

