// Tests für „Farbe ersetzen“ (js/recolor.js) und Füllen ohne Zusammenhang (js/fill.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replaceColor, recolorTargets } from '../js/recolor.js';
import { fillAll } from '../js/fill.js';

const pal = { 1: '#000000', 2: '#FF0000', 3: '#00ff00' };

test('ersetzt jede Stelle der Farbe, auch eine gleich aussehende freie Farbe', () => {
  const g = [
    [2, 0, 2],
    ['#ff0000', 1, 0],
  ];
  assert.equal(replaceColor(g, 2, 3, pal), 3);
  assert.deepEqual(g, [[3, 0, 3], [3, 1, 0]]);
  assert.equal(replaceColor(g, 2, 3, pal), 0, 'nichts mehr zu tun');
});

test('leer ersetzt nur leere Stellen, Auswahl begrenzt', () => {
  const g = [[0, 1], [0, 0]];
  assert.equal(replaceColor(g, 0, 2, pal, (x, y) => y === 0), 1);
  assert.deepEqual(g, [[2, 1], [0, 0]]);
});

test('Bereiche: Bild, Ebene in allen Frames, alles außer gesperrten Ebenen', () => {
  const shared = [[1]];
  const a0 = [[1]], b0 = [[1]], b1 = [[1]];
  const sp = {
    frame: 0, layer: 0,
    layers: [{}, { locked: true }],
    frames: [{ cels: [shared, b0] }, { cels: [shared, b1] }, { cels: [a0, b1] }],
  };
  assert.deepEqual(recolorTargets(sp, 'cel'), [shared]);
  assert.deepEqual(recolorTargets(sp, 'layer'), [shared, a0], 'verknüpftes Bild nur einmal');
  assert.deepEqual(recolorTargets(sp, 'all'), [shared, a0], 'gesperrte Ebene bleibt');
  sp.layers[1].locked = false;
  assert.equal(recolorTargets(sp, 'all').length, 4);
});

test('Füllen ohne Zusammenhang erreicht auch getrennte Flächen', () => {
  const g = [
    [1, 0, 1],
    [0, 0, 0],
    [1, 0, 1],
  ];
  assert.equal(fillAll(g, g, 0, 0, 2), 4);
  assert.deepEqual(g, [[2, 0, 2], [0, 0, 0], [2, 0, 2]]);
  const ref = [[5, 5, 0]], g2 = [[0, 0, 0]];
  assert.equal(fillAll(g2, ref, 0, 0, 3), 2, 'Grenzen aus der Vorlage');
  assert.deepEqual(g2, [[3, 3, 0]]);
});
