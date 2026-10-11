import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiledAxes, wrap, wrapPoint, axisRange } from '../js/tiled.js';

test('Achsen je Modus', () => {
  assert.deepEqual(tiledAxes('off'), { x: false, y: false });
  assert.deepEqual(tiledAxes('x'), { x: true, y: false });
  assert.deepEqual(tiledAxes('y'), { x: false, y: true });
  assert.deepEqual(tiledAxes('both'), { x: true, y: true });
});

test('über den Rand auf die andere Seite', () => {
  assert.equal(wrap(-1, 16), 15);
  assert.equal(wrap(16, 16), 0);
  assert.equal(wrap(-17, 16), 15);
  assert.equal(wrap(5, 16), 5);
  assert.deepEqual(wrapPoint(-1, 20, 16, 8, 'both'), [15, 4]);
  // Nur waagerecht: senkrecht bleibt der Punkt draußen.
  assert.deepEqual(wrapPoint(-1, 20, 16, 8, 'x'), [15, 20]);
  assert.deepEqual(wrapPoint(-1, 20, 16, 8, 'off'), [-1, 20]);
});

test('Reichweite: eine Kopie auf jeder Seite', () => {
  assert.deepEqual(axisRange(16, true), [-16, 31]);
  assert.deepEqual(axisRange(16, false), [0, 15]);
});
