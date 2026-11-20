/* Offline contract tests for the staged Apps Script candidate.
   Run: node tests/server-smoke.cjs. No access to Google services required. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs.candidate'), 'utf8');
new Function(source);

class FakeSheet {
  constructor(name) { this.name = name; this.cells = []; this.maxRows = 1000; this.failProgramOnce = false; }
  getMaxRows() { return this.maxRows; }
  getLastRow() {
    for (let i = this.cells.length - 1; i >= 0; i--)
      if ((this.cells[i] || []).some(v => v !== '' && v !== null && v !== undefined)) return i + 1;
    return 0;
  }
  insertRowsAfter(_row, n) { this.maxRows += n; }
  setFrozenRows() {}
  getRange(row, col, height = 1, width = 1) {
    assert(row >= 1 && col >= 1 && height > 0 && width > 0);
    const sheet = this;
    return {
      getValues() { return Array.from({ length: height }, (_, i) =>
        Array.from({ length: width }, (_, j) => sheet.cells[row + i - 1]?.[col + j - 1] ?? '')); },
      setValues(values) {
        assert.equal(values.length, height);
        if (sheet.name === 'Программа' && sheet.failProgramOnce && row >= 2) {
          sheet.failProgramOnce = false;
          throw new Error('Имитация обрыва при записи программы');
        }
        for (let i = 0; i < height; i++) {
          assert.equal(values[i].length, width);
          const dest = sheet.cells[row + i - 1] ||= [];
          for (let j = 0; j < width; j++) dest[col + j - 1] = values[i][j];
        }
      },
      getValue() { return this.getValues()[0][0]; },
      setValue(value) { this.setValues([[value]]); },
      clearContent() {
        for (let i = 0; i < height; i++) {
          const dest = sheet.cells[row + i - 1] ||= [];
          for (let j = 0; j < width; j++) dest[col + j - 1] = '';
        }
      }
    };
  }
}
class FakeSpreadsheet {
  constructor() { this.byName = {}; }
  getSheetByName(name) { return this.byName[name] || null; }
  insertSheet(name) { return this.byName[name] = new FakeSheet(name); }
  getSpreadsheetTimeZone() { return 'Europe/Moscow'; }
}
const ss = new FakeSpreadsheet();
for (const name of ['Лог','Тренировки','Вес','Упражнения','Программа','Комплексы','Настройки'])
  ss.insertSheet(name);
const set = (name, row, values) => ss.getSheetByName(name).getRange(row, 1, 1, values.length).setValues([values]);
set('Настройки', 1, ['Параметр','Значение']); set('Настройки', 2, ['Цикл',3]);
set('Упражнения',1,['ID','Название']); set('Упражнения',2,['e01','Жим лёжа']);
set('Упражнения',3,['e02','Жим гантелей']);
set('Комплексы',1,['Ключ','Название','Подпись','Разминка']);
set('Комплексы',2,['A','Жим','грудь','Лёгкая разминка']);
set('Программа',1,['Комплекс','№','ID','Упражнение','Подходы','Мин','Макс','Отдых','Связка']);
set('Программа',2,['A',1,'e01','Жим лёжа',4,6,8,150,'']);
set('Тренировки',1,['ID','Дата','Комплекс','Цикл','Старт','Конец','Всего','Рабочая','Подходов','Рекордов','Замен','Пропусков','Заметка','Конец разминки','Отдых, сек','События времени, JSON']);
const Utilities = {
  parseDate: s => new Date(s + 'T00:00:00Z'),
  formatDate: d => d.toISOString().slice(0,10)
};
const SpreadsheetApp = { getActive: () => ss, flush() {} };
const hooks = new Function('SpreadsheetApp','Utilities',source +
  '\nreturn {opProgram_, readProgramSnapshot_, opSession_, archiveSheet_};')(SpreadsheetApp, Utilities);
const ctx = { ss, tz: 'Europe/Moscow' };
const before = hooks.readProgramSnapshot_(ctx);
assert.equal(before.cycle,3); assert.equal(before.complexes[0].items.length,1);
const next = [{ key:'A', name:'Обновлённый жим', sub:'грудь', warm:'Разминка',
  items:[{ex:'e01',sets:3,rmin:8,rmax:10,rest:120,grp:''},{ex:'e02',sets:2,rmin:10,rmax:12,rest:90,grp:''}] }];
const request = {op:'program', oid:'fixed-op-1', cycle:4, complexes:next};
hooks.opProgram_(ctx,request);
assert.equal(hooks.readProgramSnapshot_(ctx).cycle,4);
assert.equal(ss.getSheetByName('Архив программ').getLastRow(),2);
hooks.opProgram_(ctx,request);
assert.equal(ss.getSheetByName('Архив программ').getLastRow(),2,'Повторная отправка не создаёт второй архив');
assert.equal(ss.getSheetByName('Архив программ').getRange(2,5).getValue(),'done');
// Ошибка в процессе записи должна восстановить прежний цикл.
const second = {op:'program',oid:'fixed-op-2',cycle:5,complexes:[{
  key:'B',name:'Тяга',sub:'спина',warm:'Разминка',items:[{ex:'e02',sets:3,rmin:8,rmax:12,rest:90,grp:''}]
}]};
ss.getSheetByName('Программа').failProgramOnce = true;
assert.throws(() => hooks.opProgram_(ctx,second),/Имитация обрыва/);
assert.equal(hooks.readProgramSnapshot_(ctx).cycle,4);
hooks.opProgram_(ctx,second);
assert.equal(hooks.readProgramSnapshot_(ctx).cycle,5);
assert.equal(ss.getSheetByName('Архив программ').getLastRow(),3,'Повтор после сбоя использует тот же снимок');
// Старый клиент не должен очищать временные метрики уже существующей тренировки.
set('Тренировки',2,['old-1',new Date('2026-11-20'), 'A', 3, new Date(),new Date(),60,55,10,0,0,0,'', '', 170, '[{"start":1,"end":2}]']);
hooks.opSession_(ctx,{sid:'old-1',d:'2026-11-20',cx:'A',cyc:3,start:Date.now(),end:Date.now(),min:60,wmin:55,sets:10,prs:0,subs:0,skips:0});
const tail = ss.getSheetByName('Тренировки').getRange(2,15,1,2).getValues()[0];
assert.equal(tail[0],170);assert.equal(tail[1],'[{"start":1,"end":2}]');
console.log('Gym Apps Script candidate: PASS (архив, идемпотентность, восстановление, совместимость старых клиентов)');
