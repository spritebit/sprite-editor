// Tests für js/tilelib.js (Kachelsätze speichern und wiederverwenden).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLib, toLib, fromLib, retile, freeLibName, tilesetFile, parseTilesetFile, tilesFromImage,
} from '../js/tilelib.js';
import { buildTileset, mapOf } from '../js/tiles.js';

const PAL = { 1: '#FF0000', 2: '#00FF00', 3: '#0000FF' };
const t2 = (a, b, c, d) => [[a, b], [c, d]];

test('Bibliothek speichert Farben statt Nummern', () => {
  const ts = { tw: 2, th: 2, tiles: [t2(1, 0, 2, '#123456')] };
  assert.deepEqual(toLib(ts, PAL).tiles, [t2('#ff0000', 0, '#00ff00', '#123456')]);
});

test('Einsetzen: Farbe → Nummer der Palette, sonst freie Farbe', () => {
  const lib = { tw: 2, th: 2, tiles: [t2('#0000ff', 0, '#00ff00', '#123456')] };
  assert.deepEqual(fromLib(lib, PAL).tiles, [t2(3, 0, 2, '#123456')]);
  // Andere Palette: andere Nummern, gleiches Aussehen
  const other = { 1: '#00ff00', 2: '#0000ff' };
  assert.deepEqual(fromLib(lib, other).tiles, [t2(2, 0, 1, '#123456')]);
});

test('Hin und zurück bleibt das Bild gleich', () => {
  const ts = { tw: 2, th: 2, tiles: [t2(1, 2, 3, 0)] };
  assert.deepEqual(fromLib(toLib(ts, PAL), PAL), ts);
});

test('Andere Kacheln einsetzen: die Anordnung bleibt', () => {
  // 4×2-Bild: links Kachel 1, rechts Kachel 2
  const g = [[1, 1, 2, 2], [1, 1, 2, 2]];
  const ts = buildTileset(2, 2, [g]);
  assert.deepEqual(mapOf(ts, g), [[1, 2]]);
  const ok = retile(ts, [t2(3, 3, 3, 3), t2(0, 1, 1, 0)], [g]);
  assert.ok(ok);
  assert.deepEqual(g, [[3, 3, 0, 1], [3, 3, 1, 0]]);
  assert.deepEqual(mapOf(ts, g), [[1, 2]]);
});

test('Einsetzen mit falscher Kachelgröße geht nicht', () => {
  const g = [[1, 1], [1, 1]];
  const ts = buildTileset(2, 2, [g]);
  assert.equal(retile(ts, [[[1, 1, 1]]], [g]), false);
  assert.deepEqual(g, [[1, 1], [1, 1]]);
});

test('Weniger Kacheln: Zellen ohne neue Kachel bleiben', () => {
  const g = [[1, 1, 2, 2], [1, 1, 2, 2]];
  const ts = buildTileset(2, 2, [g]);
  retile(ts, [t2(3, 3, 3, 3)], [g]);
  assert.deepEqual(g, [[3, 3, 2, 2], [3, 3, 2, 2]]);
});

test('Freie Namen und unbrauchbare Einträge', () => {
  assert.equal(freeLibName({}, 'Wald'), 'Wald');
  assert.equal(freeLibName({ Wald: {}, 'Wald 2': {} }, 'Wald'), 'Wald 3');
  assert.deepEqual(Object.keys(normalizeLib({ ok: { tw: 2, th: 2, tiles: [] }, kaputt: { tw: 0 }, '  ': { tw: 2, th: 2, tiles: [] } })), ['ok']);
});

test('Datei: schreiben und lesen', () => {
  const set = { tw: 2, th: 2, tiles: [t2('#ff0000', 0, 0, '#00ff00')] };
  const back = parseTilesetFile(tilesetFile('Wald', set));
  assert.deepEqual(back, { name: 'Wald', set });
  assert.equal(parseTilesetFile('{"format":"etwas anderes"}'), null);
  assert.equal(parseTilesetFile('kein json'), null);
});

test('Kachelbild zerschneiden: leere und doppelte fallen weg, Rand bleibt außen vor', () => {
  // 5×2 RGBA: Kachel A (rot), Kachel B (leer), Kachel A noch einmal … und 1 px Rand
  const w = 5, h = 2;
  const px = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const red = x < 2 || (x >= 4 && x < 6);
    px.push(red ? 255 : 0, 0, 0, red ? 255 : 0);
  }
  const set = tilesFromImage(px, w, h, 2, 2);
  assert.equal(set.tiles.length, 1);
  assert.deepEqual(set.tiles[0], t2('#ff0000', '#ff0000', '#ff0000', '#ff0000'));
});
