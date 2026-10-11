// Tests für js/selcombine.js (Auswahlen hinzufügen und abziehen).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineSel, selHas } from '../js/selcombine.js';

const box = (x, y, w, h) => ({ rect: { x, y, w, h }, mask: null });
// Zellen einer Auswahl als "x,y"-Liste — so lässt sich das Ergebnis lesen.
const cells = s => {
  const out = [];
  if (!s) return out;
  const { x, y, w, h } = s.rect;
  for (let gy = y; gy < y + h; gy++) for (let gx = x; gx < x + w; gx++) if (selHas(s, gx, gy)) out.push(`${gx},${gy}`);
  return out;
};

test('Hinzufügen: zwei getrennte Rechtecke werden eine Auswahl mit Maske', () => {
  const r = combineSel(box(0, 0, 2, 1), box(4, 0, 1, 1), 'add');
  assert.deepEqual(r.rect, { x: 0, y: 0, w: 5, h: 1 });
  assert.deepEqual(r.mask, [[true, true, false, false, true]]);
});

test('Hinzufügen: ergibt es ein volles Rechteck, fällt die Maske weg', () => {
  const r = combineSel(box(0, 0, 2, 2), box(2, 0, 1, 2), 'add');
  assert.deepEqual(r, { rect: { x: 0, y: 0, w: 3, h: 2 }, mask: null });
});

test('Hinzufügen ohne bestehende Auswahl: einfach die neue', () => {
  assert.deepEqual(combineSel(null, box(1, 1, 2, 2), 'add'), box(1, 1, 2, 2));
});

test('Abziehen: Loch in der Mitte', () => {
  const r = combineSel(box(0, 0, 3, 3), box(1, 1, 1, 1), 'sub');
  assert.deepEqual(r.rect, { x: 0, y: 0, w: 3, h: 3 });
  assert.equal(cells(r).length, 8);
  assert.equal(selHas(r, 1, 1), false);
});

test('Abziehen: Box schrumpft auf den Rest', () => {
  const r = combineSel(box(0, 0, 4, 1), box(2, 0, 5, 1), 'sub');
  assert.deepEqual(r, { rect: { x: 0, y: 0, w: 2, h: 1 }, mask: null });
});

test('Abziehen: alles weg → null; ohne Auswahl → null', () => {
  assert.equal(combineSel(box(1, 1, 2, 2), box(0, 0, 5, 5), 'sub'), null);
  assert.equal(combineSel(null, box(0, 0, 1, 1), 'sub'), null);
});

test('Masken bleiben erhalten: Freihandform plus Rechteck', () => {
  const lasso = { rect: { x: 0, y: 0, w: 2, h: 2 }, mask: [[true, false], [false, true]] };
  const r = combineSel(lasso, box(1, 0, 1, 1), 'add');
  assert.deepEqual(cells(r), ['0,0', '1,0', '1,1']);
});

test('Die Eingaben werden nicht verändert', () => {
  const a = { rect: { x: 0, y: 0, w: 2, h: 1 }, mask: [[true, false]] };
  const before = JSON.stringify(a);
  combineSel(a, box(1, 0, 1, 1), 'add');
  combineSel(a, box(0, 0, 1, 1), 'sub');
  assert.equal(JSON.stringify(a), before);
});
