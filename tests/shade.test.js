// Tests für js/shade.js (Schattieren wie in Aseprite).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRamp, toggleRamp, valueHex, makeShader } from '../js/shade.js';

// Drei Rottöne, absichtlich nicht nach Helligkeit sortiert, dazu Grün.
const PAL = { 1: '#FF8080', 2: '#800000', 3: '#FF0000', 4: '#00FF00' };
const RAMP = normalizeRamp(['#ff8080', '#800000', '#ff0000']);

test('Reihe: sortiert von dunkel nach hell, ohne Doppelte und Ungültiges', () => {
  assert.deepEqual(RAMP, ['#800000', '#ff0000', '#ff8080']);
  assert.deepEqual(normalizeRamp(['#FF0000', '#ff0000', 'rot', 3, null]), ['#ff0000']);
  assert.deepEqual(normalizeRamp(undefined), []);
});

test('Reihe: Farbe an- und wieder abwählen', () => {
  const r = toggleRamp(['#800000'], '#FF8080');
  assert.deepEqual(r, ['#800000', '#ff8080']);
  assert.deepEqual(toggleRamp(r, '#ff8080'), ['#800000']);
  assert.deepEqual(toggleRamp(r, 'kein hex'), r);
});

test('Pixelwert → Hex: Nummer, freie Farbe, leer', () => {
  assert.equal(valueHex(1, PAL), '#ff8080');
  assert.equal(valueHex('#ABCDEF', PAL), '#abcdef');
  assert.equal(valueHex(0, PAL), null);
  assert.equal(valueHex(9, PAL), null);
});

test('Heller: eine Stufe weiter, als Palette-Nummer', () => {
  const up = makeShader(PAL, RAMP, 1);
  assert.equal(up(2), 3);   // dunkelrot → rot
  assert.equal(up(3), 1);   // rot → hellrot
});

test('Dunkler: eine Stufe zurück', () => {
  const down = makeShader(PAL, RAMP, -1);
  assert.equal(down(1), 3);
  assert.equal(down(3), 2);
});

test('Am Ende der Reihe bleibt der Pixel, wie er ist', () => {
  assert.equal(makeShader(PAL, RAMP, 1)(1), 1);
  assert.equal(makeShader(PAL, RAMP, -1)(2), 2);
});

test('Farben außerhalb der Reihe und leere Pixel bleiben unberührt', () => {
  const up = makeShader(PAL, RAMP, 1);
  assert.equal(up(4), 4);
  assert.equal(up(0), 0);
  assert.equal(up('#123456'), '#123456');
});

test('Freie Farben: in der Reihe, aber nicht in der Palette → bleibt Hex', () => {
  const ramp = normalizeRamp(['#800000', '#c04040']);
  assert.equal(makeShader(PAL, ramp, 1)(2), '#c04040');
  assert.equal(makeShader(PAL, ramp, -1)('#C04040'), 2);
});

test('Gleicher Hex zweimal in der Palette: die erste Nummer gewinnt', () => {
  const pal = { 1: '#000000', 2: '#ffffff', 3: '#ffffff' };
  assert.equal(makeShader(pal, normalizeRamp(['#000000', '#ffffff']), 1)(1), 2);
});
