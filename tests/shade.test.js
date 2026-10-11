// Tests für js/shade.js (Schattieren wie in Aseprite).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRamp, toggleRamp, valueHex, makeShader, softLevel, rampLevels, AUTO_LEVELS, holdDelay, HOLD_FIRST_MS, HOLD_MIN_MS, makeShades } from '../js/shade.js';

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

test('Farben außerhalb der Reihe bleiben unberührt', () => {
  const up = makeShader(PAL, RAMP, 1);
  assert.equal(up(4), 4);
  assert.equal(up('#123456'), '#123456');
});

test('Wie ein Stift: leer → hellste Farbe, dann mit jedem Strich dunkler', () => {
  const down = makeShader(PAL, RAMP, -1);
  let v = 0;
  const seen = [];
  for (let i = 0; i < 4; i++) { v = down(v); seen.push(v); }
  assert.deepEqual(seen, [1, 3, 2, 2]);   // hellrot, rot, dunkelrot, bleibt
});

test('Richtung heller: leer → dunkelste Farbe', () => {
  assert.equal(makeShader(PAL, RAMP, 1)(0), 2);
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

test('Ohne Reihe: Automatik nimmt die nächste Stufe der Farbfamilie', () => {
  // Rot in drei Stufen, Grün daneben — Grün darf nie herauskommen.
  const pal = { 1: '#400000', 2: '#900000', 3: '#e04040', 4: '#00c000' };
  assert.equal(makeShader(pal, [], 1)(2), 3);
  assert.equal(makeShader(pal, [], -1)(2), 1);
  assert.equal(makeShader(pal, [], 1)(3), 3);   // heller gibt es nicht
  assert.equal(makeShader(pal, [], -1, 3)(0), 3);  // leer → aktuelle Farbe
  assert.equal(makeShader(pal, [], -1)(0), 0);     // ohne Farbe bleibt leer
});

test('Ohne Reihe: freie Farben werden direkt heller bzw. dunkler', () => {
  const up = makeShader(PAL, [], 1)('#606060');
  assert.match(up, /^#[0-9a-f]{6}$/);
  assert.ok(parseInt(up.slice(1, 3), 16) > 0x60);
});

test('Verlauf: Mitte die meisten Stufen, zum Rand weniger, außen keine', () => {
  const mid = softLevel(0, 0, 7, 4);
  const near = softLevel(1, 0, 7, 4);
  const edge = softLevel(3, 0, 7, 4);
  assert.equal(mid, 4);
  assert.ok(near <= mid && near >= edge);
  assert.equal(edge, 1);
  assert.equal(softLevel(3, 3, 7, 4), 0);   // Ecke liegt außerhalb des Kreises
  assert.equal(rampLevels([]), AUTO_LEVELS);
  assert.equal(rampLevels(['#000000', '#ffffff']), 2);
});

test('Gedrückt halten: jede Pause kürzer als die vorige, bis zur Untergrenze', () => {
  assert.equal(holdDelay(0), HOLD_FIRST_MS);
  assert.ok(holdDelay(1) < holdDelay(0) && holdDelay(2) < holdDelay(1));
  assert.equal(Math.round(holdDelay(1)), 245);
  assert.equal(holdDelay(50), HOLD_MIN_MS);
});

test('Abstufungen erzeugen: n dunklere und n hellere Töne, dunkel → hell', () => {
  const r = makeShades('#c04040', 2);
  assert.equal(r.length, 5);
  assert.equal(r[2], '#c04040');
  assert.deepEqual(r, normalizeRamp(r), 'schon sortiert');
  // Schatten kühler, Licht wärmer: der dunkelste Ton hat mehr Blau als Rot-Anteil zuvor.
  const [dr, , db] = [1, 3, 5].map(i => parseInt(r[0].slice(i, i + 2), 16));
  assert.ok(db / (dr + 1) > 0x40 / 0xc0);
  // Grau bleibt grau, ganz am Rand fallen Stufen zusammen.
  assert.ok(makeShades('#808080', 2).every(h => h.slice(1, 3) === h.slice(3, 5) && h.slice(3, 5) === h.slice(5, 7)));
  assert.ok(makeShades('#ffffff', 2).length < 5);
  assert.deepEqual(makeShades('kein hex'), []);
});
