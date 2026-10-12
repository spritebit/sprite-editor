// Tests für eigene Pinsel aus einer Auswahl (js/stamp.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStamp, stampOrigin, stampCells } from '../js/stamp.js';

test('leere Ränder fallen weg, außerhalb der Form zählt als leer', () => {
  const cells = [
    [0, 0, 0, 0],
    [0, 3, 4, 9],
    [0, 0, 5, 0],
  ];
  const mask = [
    [1, 1, 1, 0],
    [1, 1, 1, 0],
    [1, 1, 1, 0],
  ];
  assert.deepEqual(makeStamp(cells, mask), { w: 2, h: 2, cells: [[3, 4], [0, 5]] });
  assert.deepEqual(makeStamp(cells).w, 3, 'ohne Form zählt die 9 mit');
  assert.equal(makeStamp([[0, 0], [0, 0]]), null, 'leere Auswahl gibt keinen Pinsel');
});

test('der Zeiger liegt in der Mitte wie beim eckigen Pinsel', () => {
  assert.deepEqual(stampOrigin({ w: 3, h: 3, cells: [] }, 10, 10), { x: 9, y: 9 });
  assert.deepEqual(stampOrigin({ w: 2, h: 4, cells: [] }, 10, 10), { x: 10, y: 9 });
});

test('setzt eigene Farben oder einfarbig, leere Stellen nicht', () => {
  const s = { w: 2, h: 2, cells: [[3, 0], [0, '#ff0000']] };
  assert.deepEqual(stampCells(s, 5, 5), [[5, 5, 3], [6, 6, '#ff0000']]);
  assert.deepEqual(stampCells(s, 5, 5, 7), [[5, 5, 7], [6, 6, 7]]);
  assert.deepEqual(stampCells(s, 5, 5, 0), [[5, 5, 0], [6, 6, 0]], 'radieren: genau die Form');
});
