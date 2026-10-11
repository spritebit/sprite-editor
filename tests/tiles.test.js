// Tests für Tilemap-Ebenen (js/tiles.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blankTileset, buildTileset, mapOf, tileAt, placeTile, absorb, syncPaint, pruneUnused, fillTiles, normalizeTileset, copyTileset,
  syncSprite, tileMapData, godotScene, atlasGrid, atlasCols, tilemapJson,
} from '../js/tiles.js';

const blank = (W, H) => Array.from({ length: H }, () => Array(W).fill(0));
const copy = g => g.map(r => r.slice());

// 2×2-Kacheln: A = Punkt oben links, B = volle Kachel.
const A = [[1, 0], [0, 0]];
const B = [[2, 2], [2, 2]];

function level() {
  // 6×4 Pixel = 3×2 Kacheln:  A B A
  //                           . A .
  const ts = blankTileset(2, 2);
  ts.tiles = [copy(A), copy(B)];
  const g = blank(6, 4);
  placeTile(ts, g, 0, 0, 1); placeTile(ts, g, 1, 0, 2); placeTile(ts, g, 2, 0, 1); placeTile(ts, g, 1, 1, 1);
  return { ts, g };
}

test('Karte aus dem Inhalt: welche Kachel liegt wo', () => {
  const { ts, g } = level();
  assert.deepEqual(mapOf(ts, g), [[1, 2, 1], [0, 1, 0]]);
  assert.equal(tileAt(ts, g, 1, 0), 2);
  g[2][0] = 5; // Inhalt, der keine Kachel ist
  assert.equal(tileAt(ts, g, 0, 1), -1);
});

test('Umwandeln: gleiche Zellen werden eine Kachel, leere keine', () => {
  const { g } = level();
  const ts = buildTileset(2, 2, [g]);
  assert.equal(ts.tiles.length, 2);
  assert.deepEqual(ts.tiles[0], A, 'Reihenfolge wie im Bild');
  assert.deepEqual(mapOf(ts, g), [[1, 2, 1], [0, 1, 0]]);
});

test('Pixel malen ändert die Kachel überall — auch in anderen Frames', () => {
  const { ts, g } = level();
  const other = copy(g);              // ein zweiter Frame mit denselben Kacheln
  const before = copy(g);
  g[1][1] = 3;                         // in die erste Kachel A unten rechts malen
  const r = syncPaint(ts, before, g, [other], 'auto');
  assert.deepEqual(r, { edited: 1, added: 0, blocked: 0 });
  assert.deepEqual(ts.tiles[0], [[1, 0], [0, 3]]);
  assert.equal(g[1][5], 3, 'die andere A-Stelle im selben Bild');
  assert.equal(g[3][3], 3, 'A in der zweiten Reihe');
  assert.equal(other[1][1], 3, 'anderer Frame');
  assert.deepEqual(mapOf(ts, g), [[1, 2, 1], [0, 1, 0]], 'Karte bleibt gleich');
});

test('Auto: Malen in eine leere Zelle legt eine neue Kachel an', () => {
  const { ts, g } = level();
  const before = copy(g);
  g[2][0] = 4;
  const r = syncPaint(ts, before, g, [], 'auto');
  assert.equal(r.added, 1);
  assert.equal(ts.tiles.length, 3);
  assert.deepEqual(mapOf(ts, g)[1], [3, 1, 0]);
});

test('Manuell: leere Zellen bleiben leer, keine neuen Kacheln', () => {
  const { ts, g } = level();
  const before = copy(g);
  g[2][0] = 4;
  g[0][1] = 3; // Kachel A ändern geht auch manuell
  const r = syncPaint(ts, before, g, [], 'manual');
  assert.equal(r.blocked, 1);
  assert.equal(r.added, 0);
  assert.equal(g[2][0], 0, 'zurückgenommen');
  assert.deepEqual(ts.tiles[0], [[1, 3], [0, 0]]);
});

test('Widerspruch (zwei Stellen derselben Kachel verschieden bemalt): dort gilt der Inhalt', () => {
  const { ts, g } = level();
  const before = copy(g);
  g[0][1] = 3;  // erste A-Stelle oben rechts → 3
  g[0][5] = 4;  // dritte A-Stelle oben rechts → 4
  const r = syncPaint(ts, before, g, [], 'auto');
  assert.equal(r.edited, 0);
  assert.equal(r.added, 2, 'beide Fassungen werden eigene Kacheln');
  assert.deepEqual(ts.tiles[0], A, 'A bleibt');
  assert.equal(g[3][3], 0, 'die unberührte A-Stelle bleibt A');
});

test('Kachel leer gemalt: verschwindet aus dem Satz, überall leer', () => {
  const { ts, g } = level();
  const before = copy(g);
  g[0][0] = 0; // A hat nur dieses eine Pixel
  syncPaint(ts, before, g, [], 'auto');
  assert.equal(ts.tiles.length, 1);
  assert.deepEqual(mapOf(ts, g), [[0, 1, 0], [0, 0, 0]]);
});

test('Unbenutzte Kacheln entfernen, Füllen mit Kacheln', () => {
  const { ts, g } = level();
  ts.tiles.push([[7, 7], [7, 7]]);
  assert.equal(pruneUnused(ts, [g]), 1);
  assert.equal(fillTiles(ts, g, 0, 1, 2), 1, 'nur die eine leere Zelle links unten hängt zusammen');
  assert.deepEqual(mapOf(ts, g), [[1, 2, 1], [2, 1, 0]]);
  absorb(ts, [g]);
  assert.equal(ts.tiles.length, 2);
});

test('Rand, der nicht in eine ganze Kachel passt, gehört nicht zur Karte', () => {
  const ts = blankTileset(2, 2);
  const g = blank(5, 3);
  g[2][4] = 9;
  assert.deepEqual(mapOf(ts, g), [[0, 0]]);
  assert.equal(absorb(ts, [g]), 0);
});

test('Speicherstand: prüfen und kopieren', () => {
  assert.equal(normalizeTileset(null), null);
  assert.equal(normalizeTileset({ tw: 0, th: 2, tiles: [] }), null);
  const ts = normalizeTileset({ tw: 2, th: 2, tiles: [A, [[1]], 'x'] });
  assert.deepEqual(ts, { tw: 2, th: 2, tiles: [A] }, 'falsche Kacheln fallen weg');
  const c = copyTileset(ts);
  c.tiles[0][0][0] = 9;
  assert.equal(ts.tiles[0][0][0], 1);
});

const snap = sp => ({
  frames: sp.frames.map(f => ({ cels: f.cels.map(copy) })),
  layers: sp.layers.map(l => ({ ...l, tileset: l.tileset && { ...l.tileset, tiles: l.tileset.tiles.map(copy) } })),
  frame: sp.frame, layer: sp.layer,
});

test('syncSprite: Strich auf der aktiven Zelle ändert die Kachel in allen Frames', () => {
  const { ts, g } = level();
  const sp = { frame: 0, layer: 0, layers: [{ tileset: ts }], frames: [{ cels: [g] }, { cels: [copy(g)] }] };
  const before = snap(sp);
  g[1][1] = 3;
  const r = syncSprite(sp, before, { paint: true, mode: 'auto' });
  assert.equal(r.edited, 1);
  assert.equal(sp.frames[1].cels[0][1][1], 3);
});

test('syncSprite: Kacheln setzen (paint = false) ändert keine Kachel', () => {
  const { ts, g } = level();
  const sp = { frame: 0, layer: 0, layers: [{ tileset: ts }], frames: [{ cels: [g] }, { cels: [copy(g)] }] };
  const before = snap(sp);
  placeTile(ts, g, 0, 0, 2); // B auf die erste A-Stelle setzen
  const r = syncSprite(sp, before, { paint: false, mode: 'auto' });
  assert.deepEqual(r, { edited: 0, added: 0, blocked: 0 });
  assert.deepEqual(ts.tiles[0], A, 'A unverändert');
  assert.equal(sp.frames[1].cels[0][0][0], 1, 'anderer Frame unverändert');
});

test('syncSprite: hat sich mehr als die aktive Zelle geändert, gilt der Inhalt', () => {
  const { ts, g } = level();
  const g2 = copy(g);
  const sp = { frame: 0, layer: 0, layers: [{ tileset: ts }], frames: [{ cels: [g] }, { cels: [g2] }] };
  const before = snap(sp);
  g[1][1] = 3; g2[1][1] = 4; // z. B. eine Aktion über alle Frames
  syncSprite(sp, before, { paint: true, mode: 'auto' });
  assert.deepEqual(ts.tiles[0], A, 'A bleibt');
  assert.equal(ts.tiles.length, 4, 'zwei neue Fassungen von A');
});

test('Godot: tile_map_data, Kachelbild und Szene', () => {
  // 1 Kachel → Atlas 1 Spalte; Karte 2×1 mit Kachel 1 rechts
  assert.deepEqual(tileMapData([[0, 1]], 1), [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(atlasCols(5), 3);
  const { ts, g } = level();
  assert.deepEqual(atlasGrid(ts), [[1, 0, 2, 2], [0, 0, 2, 2]]);
  const scene = godotScene('Level "1"', [{ name: 'Boden', ts, map: mapOf(ts, g), png: 'res://level/level_boden.png', opacity: 0.5 }]);
  assert.match(scene, /^\[gd_scene load_steps=4 format=3\]/);
  assert.match(scene, /path="res:\/\/level\/level_boden.png"/);
  assert.match(scene, /texture_region_size = Vector2i\(2, 2\)/);
  assert.match(scene, /0:0\/0 = 0\n1:0\/0 = 0/);
  assert.ok(scene.includes('[node name="Level \\"1\\"" type="Node2D"]'));
  assert.match(scene, /modulate = Color\(1, 1, 1, 0.5\)/);
  // 4 belegte Zellen à 12 Byte + 2 Byte Kopf
  const bytes = scene.match(/PackedByteArray\(([^)]*)\)/)[1].split(', ');
  assert.equal(bytes.length, 2 + 4 * 12);
  const j = JSON.parse(tilemapJson('Level', [{ name: 'Boden', ts, map: mapOf(ts, g), png: 'res://level/level_boden.png' }]));
  assert.deepEqual(j.layers[0].data, [1, 2, 1, 0, 1, 0]);
  assert.equal(j.layers[0].atlas, 'level_boden.png');
});

test('Kachel gedreht und gespiegelt: jede Lage so, wie man sie sieht', async () => {
  const { orientTile, turnXf, NO_XF, isPlainXf } = await import('../js/tiles.js');
  const t = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
  assert.deepEqual(orientTile(t, { rot: 1 }), [[7, 4, 1], [8, 5, 2], [9, 6, 3]]);
  assert.deepEqual(orientTile(t, { fx: true }), [[3, 2, 1], [6, 5, 4], [9, 8, 7]]);
  assert.deepEqual(orientTile([[1, 2]], { rot: 1 }), [[1], [2]], '90° tauscht Breite und Höhe');
  // Was man sieht, gespiegelt/gedreht = die neue Lage — von jeder Lage aus.
  const see = {
    cw: g => orientTile(g, { rot: 1 }),
    ccw: g => orientTile(g, { rot: 3 }),
    h: g => orientTile(g, { fx: true }),
    v: g => orientTile(g, { fy: true }),
  };
  const all = new Set();
  let xf = NO_XF;
  for (const op of ['cw', 'h', 'cw', 'v', 'ccw', 'h', 'v', 'cw', 'cw', 'h', 'ccw', 'v']) {
    for (const rot of [0, 1, 2, 3]) for (const fx of [false, true]) {
      const a = { rot, fx, fy: false };
      const b = turnXf(a, op);
      assert.ok(!(b.fx && b.fy), 'nie beides gespiegelt');
      assert.deepEqual(orientTile(t, b), see[op](orientTile(t, a)), `${op} von ${JSON.stringify(a)}`);
    }
    xf = turnXf(xf, op);
    all.add(JSON.stringify(orientTile(t, xf)));
  }
  assert.ok(isPlainXf(turnXf(turnXf(NO_XF, 'h'), 'h')));
  assert.ok(isPlainXf(turnXf(turnXf(NO_XF, 'cw'), 'ccw')));
  assert.ok(all.size > 4, 'verschiedene Lagen');
});

test('Gedrehte Fassung wird eine eigene Kachel, die alte bleibt', async () => {
  const { tileIndex, orientTile, placeTile, buildTileset, mapOf } = await import('../js/tiles.js');
  const g = [[1, 2, 0, 0], [3, 4, 0, 0]];
  const ts = buildTileset(2, 2, [g]);
  const turned = orientTile(ts.tiles[0], { rot: 2 });
  assert.equal(tileIndex(ts, turned), 2);
  assert.equal(tileIndex(ts, turned), 2, 'schon da → gleiche Nummer');
  assert.equal(tileIndex(ts, [[0, 0], [0, 0]]), 0);
  placeTile(ts, g, 1, 0, 2);
  assert.deepEqual(g, [[1, 2, 4, 3], [3, 4, 2, 1]]);
  assert.deepEqual(mapOf(ts, g), [[1, 2]]);
  assert.deepEqual(ts.tiles[0], [[1, 2], [3, 4]]);
});
