// Tests für js/brushshape.js (runder Pinsel).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inRound } from '../js/brushshape.js';

// Der Pinsel als Bild: '#' = gehört dazu, '.' = nicht.
const shape = n => {
  const lo = -Math.floor((n - 1) / 2), hi = Math.floor(n / 2);
  const rows = [];
  for (let dy = lo; dy <= hi; dy++) {
    let row = '';
    for (let dx = lo; dx <= hi; dx++) row += inRound(dx, dy, n) ? '#' : '.';
    rows.push(row);
  }
  return rows;
};

test('1 und 2 px bleiben voll', () => {
  assert.deepEqual(shape(1), ['#']);
  assert.deepEqual(shape(2), ['##', '##']);
});

test('3 px ist ein Plus, 4 px ohne Ecken', () => {
  assert.deepEqual(shape(3), ['.#.', '###', '.#.']);
  assert.deepEqual(shape(4), ['.##.', '####', '####', '.##.']);
});

test('5 und 7 px sind runde Flecken', () => {
  assert.deepEqual(shape(5), ['.###.', '#####', '#####', '#####', '.###.']);
  assert.deepEqual(shape(7), ['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..']);
});

test('Symmetrisch und kein Pixel außerhalb des Quadrats', () => {
  for (const n of [6, 9, 16]) {
    const s = shape(n);
    assert.deepEqual(s, [...s].reverse(), `${n}: oben = unten`);
    assert.ok(s.every(r => r === [...r].reverse().join('')), `${n}: links = rechts`);
    assert.ok(s[0].includes('#') && s[Math.floor(n / 2)].startsWith('#'), `${n}: reicht bis an den Rand`);
  }
});
