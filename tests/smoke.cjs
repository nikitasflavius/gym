/* Gym 2.0: тесты основных сценариев без сети и реальной таблицы.
 * Запуск: node tests/smoke.cjs
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/);
assert(source, 'Не найден основной JavaScript');
new Function(source[1]); // Синтаксис JS проверяем до выполнения тестов.

function app(existing) {
  const store = existing || {};
  const nodes = {};
  function node(sel) {
    return nodes[sel] ||= {
      innerHTML: '', textContent: '', hidden: false,
      classList: { toggle() {}, add() {}, remove() {} }
    };
  }
  const document = {
    querySelector: node,
    body: { classList: { toggle() {} } },
    addEventListener() {},
    visibilityState: 'visible'
  };
  const window = { addEventListener() {}, scrollTo() {} };
  const navigator = { onLine: false, vibrate() {} };
  const localStorage = {
    getItem(k) { return store[k] || null; },
    setItem(k, v) { store[k] = v; }
  };
  const init = new Function('document', 'window', 'navigator', 'localStorage',
    'setInterval', 'setTimeout', 'clearTimeout',
    source[1] + '\nreturn { S, startSession, beginRest, logSet, goToSet, undoRest, adjustRest, summarize, draft, phaseOf, viewWeight, nextComplex, save };');
  return { instance: init(document, window, navigator, localStorage, () => {}, () => {}, () => {}), store };
}

const { instance: gym, store } = app();
gym.startSession('A');
gym.S.active.warmEnd = Date.now();
gym.S.active.setStarted = Date.now() - 120_000;
assert.equal(gym.phaseOf(gym.S.active), 'ready');
gym.beginRest();
assert.equal(gym.phaseOf(gym.S.active), 'rest');
assert.equal(gym.S.log.length, 0, 'Отдых не должен записывать пустой подход');
assert.equal(gym.S.active.pending.done, false);
gym.goToSet();
assert.equal(gym.phaseOf(gym.S.active), 'rest', 'Нельзя потерять незаписанный подход');
const draft = gym.draft(gym.S.active.items[0]);
draft.w = 60;
draft.r = 8;
gym.logSet();
assert.equal(gym.S.log.length, 1);
assert.equal(gym.S.active.pending.done, true);
const before = gym.S.active.restStart;
gym.logSet();
assert.equal(gym.S.log.length, 1, 'Повторное нажатие не создаёт дубль');
gym.adjustRest(-15);
assert(gym.S.active.restStart <= before - 14_000);
assert(gym.S.log[0].ts <= before - 14_000, 'Сохранённый подход тоже корректируется');
gym.goToSet();
assert.equal(gym.phaseOf(gym.S.active), 'ready');
assert.equal(gym.S.active.restEvents.length, 1);
const summary = gym.summarize(gym.S.active);
assert(summary.end >= gym.S.log[0].ts);
assert(summary.restSec >= 15, 'Отдых учитывается при расчёте');
assert(!gym.viewWeight().includes('коридор'), 'Экран веса не должен оценивать коридор');
gym.save();
const restored = app(store).instance;
assert.equal(restored.S.log.length, 1);
assert.equal(restored.phaseOf(restored.S.active), 'ready');

// Незавершённый результат подхода переживает перезагрузку без записи фиктивной строки.
const pendingCase = app();
const p = pendingCase.instance;
p.startSession('B');
p.S.active.warmEnd = Date.now();
p.beginRest();
const waitingStart = p.S.active.restStart;
p.save();
const resumedPending = app(pendingCase.store).instance;
assert.equal(resumedPending.phaseOf(resumedPending.S.active), 'rest');
assert.equal(resumedPending.S.active.restStart, waitingStart);
assert.equal(resumedPending.S.active.pending.done, false);
assert.equal(resumedPending.S.log.length, 0);
resumedPending.undoRest();
assert.equal(resumedPending.phaseOf(resumedPending.S.active), 'ready');
// Завершение занятия использует настоящее время, а не последнюю запись.
gym.S.active.start = Date.now() - 5 * 60_000;
assert(gym.summarize(gym.S.active).min >= 5);

console.log('Gym 2.0 smoke: PASS (фазы, таймер, незаписанный подход, корректировка, дубли, перезагрузка, длительность, вес)');
