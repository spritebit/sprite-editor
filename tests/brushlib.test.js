// Tests für gespeicherte eigene Pinsel (js/brushlib.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSaved, fromSaved, addBrush, normalizeBrushes, MAX_BRUSHES } from '../js/brushlib.js';

test('gespeichert wird nach der Farbe, zurück kommt ein Pinsel mit freien Farben', () => {
  const pal = { 1: '#000000', 2: '#FF0000' };
  const b = toSaved({ w: 2, h: 2, cells: [[2, 0], ['#00FF00', 1]] }, pal);
  assert.deepEqual(b, { w: 2, h: 2, px: ['#ff0000', null, '#00ff00', '#000000'] });
  assert.deepEqual(fromSaved(b), { w: 2, h: 2, cells: [['#ff0000', 0], ['#00ff00', '#000000']], pal: {} });
});

test('gleicher Pinsel wandert nach vorn, die Liste ist begrenzt', () => {
  const a = { w: 1, h: 1, px: ['#000000'] }, b = { w: 1, h: 1, px: ['#ffffff'] };
  assert.deepEqual(addBrush(addBrush([a], b), { ...a, px: ['#000000'] }), [a, b]);
  let list = [];
  for (let i = 0; i < MAX_BRUSHES + 5; i++) list = addBrush(list, { w: 1, h: 1, px: ['#' + String(i).padStart(6, '0')] });
  assert.equal(list.length, MAX_BRUSHES);
});

test('kaputte Einträge fallen beim Laden heraus', () => {
  const ok = { w: 1, h: 2, px: ['#abcdef', null] };
  assert.deepEqual(normalizeBrushes([ok, { w: 2, h: 2, px: [] }, { w: 1, h: 1, px: [null] }, null, { w: 1, h: 1, px: ['red'] }]), [ok]);
  assert.deepEqual(normalizeBrushes('x'), []);
});
