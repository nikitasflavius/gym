/* Проверка Safari/iPhone: самостоятельный offline-файл не подключается к серверу,
 * состояние незаписанного подхода восстанавливается после пересоздания страницы.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'../test-client/Gym-2.0-iPhone-OFFLINE.html'),'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/);
assert(script);
new Function(script[1]);
assert(script[1].includes("const KEY = 'gym-app-v2-iphone-offline-20261124';"));
assert(script[1].includes("const TEST_SERVER_URL = '';"));
assert(!script[1].includes('AKfycbzByCTr'), 'No test webapp URL is embedded');
assert(!html.includes('navigator.serviceWorker.register('));
assert(html.includes('АВТОНОМНЫЙ ТЕСТ'));
function create(store = {}) {
 const nodes = {};
 const el = name => nodes[name] ||= {
  innerHTML: '',textContent:'',hidden:false,
  classList:{toggle(){},add(){},remove(){}},
  querySelector(){return null;}
 };
 const document = {querySelector:el,body:{classList:{toggle(){}}},addEventListener(){},visibilityState:'visible'};
 const window = {addEventListener(){},scrollTo(){}};
 const navigator = {onLine:false,vibrate(){}};
 const localStorage = {getItem(k){return store[k] || null;},setItem(k,v){store[k]=v;}};
 const init = new Function('document','window','navigator','localStorage','setInterval','setTimeout','clearTimeout',
    script[1]+"\nreturn { S, ACT, startSession, beginRest, logSet, goToSet, save, phaseOf, draft };");
 return init(document,window,navigator,localStorage,()=>{},()=>{},()=>{});
}
const state={};
let a=create(state);
assert.equal(a.S.cfg.url,'');
assert.equal(a.S.cfg.token,'');
a.ACT.startflowtest();
assert.equal(a.S.active.items.length,3);
a.beginRest();
const initial=a.S.active.restStart;
assert.equal(a.S.active.pending.done,false);
assert.equal(a.S.log.length,0);
a.save();
// Safari created a fresh document after it was killed while the user had not logged the set.
a=create(state);
assert.equal(a.phaseOf(a.S.active),'rest');
assert.equal(a.S.active.restStart,initial);
assert.equal(a.S.active.pending.done,false);
assert.equal(a.S.log.length,0);
a.S.active.restStart -= 35_000;
a.save();
a=create(state);
assert(Date.now()-a.S.active.restStart>=35_000,'Elapsed time must remain wall-clock based');
a.logSet();
assert.equal(a.S.log.length,1);
assert.equal(a.phaseOf(a.S.active),'ready','Between linked sets there is no fake rest');
a.save();
a=create(state);
assert.equal(a.S.log.length,1);
assert.equal(a.S.active.cur,1);
a.beginRest();
a.logSet();
assert.equal(a.S.log.length,2);
a.save();
a=create(state);
assert.equal(a.phaseOf(a.S.active),'rest');
assert.equal(a.S.active.pending.done,true);
a.goToSet();
a.ACT.open({dataset:{i:'2'}});
a.beginRest();
a.logSet();
a.ACT.drop();
a.logSet();
assert.equal(a.S.log.length,4);
a.ACT.finish();
a.ACT.confirmok();
assert.equal(a.S.sessions.length,1);
assert.equal(a.S.sessions[0].sets,3);
assert.equal(a.S.outbox.length>0,true,'Offline test keeps unsent ops locally');
assert.equal(a.S.cfg.url,'');
console.log('Gym 2.0 iPhone offline: PASS (no credentials, suspend/reopen, pending set, linked pair, drop)');
