// Tests für Körperteile: Rolle und Gelenk je Ebene (js/rig.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PART_ROLES, copyPart, normalizePart, contentBox, autoPivot, rigParts, hasRig } from '../js/rig.js';

// Ein 6 × 6-Bild mit einem Klotz von (1,2) bis (4,3).
const cel = () => {
  const g = Array.from({ length: 6 }, () => new Array(6).fill(0));
  for (let y = 2; y <= 3; y++) for (let x = 1; x <= 4; x++) g[y][x] = 1;
  return g;
};

test('contentBox umschließt genau das Gemalte', () => {
  assert.deepEqual(contentBox(cel()), { x0: 1, y0: 2, x1: 4, y1: 3 });
});

test('contentBox einer leeren Zelle ist null', () => {
  assert.equal(contentBox(Array.from({ length: 3 }, () => [0, 0, 0])), null);
});

test('Arme und Beine hängen oben, Kopf und Rumpf unten', () => {
  // Mitte waagerecht: (1 + 4 + 1) / 2 = 3
  assert.deepEqual(autoPivot(cel(), 'armFront'), { x: 3, y: 2 }); // Schulter: Oberkante
  assert.deepEqual(autoPivot(cel(), 'legBack'), { x: 3, y: 2 });  // Hüfte: Oberkante
  assert.deepEqual(autoPivot(cel(), 'head'), { x: 3, y: 4 });     // Hals: Unterkante
  assert.deepEqual(autoPivot(cel(), 'torso'), { x: 3, y: 4 });
  assert.deepEqual(autoPivot(cel(), 'weapon'), { x: 3, y: 4 });   // Griff unten
});

test('ein Teil mit ungerader Breite bekommt ein Gelenk auf halber Zelle', () => {
  const g = Array.from({ length: 4 }, () => new Array(4).fill(0));
  g[1][1] = 1; g[1][2] = 1; g[1][3] = 1; // Spalten 1..3 → (1 + 3 + 1) / 2 = 2,5
  assert.deepEqual(autoPivot(g, 'armFront'), { x: 2.5, y: 1 });
});

test('leere Zelle: kein geratenes Gelenk', () => {
  assert.equal(autoPivot(Array.from({ length: 3 }, () => [0, 0, 0]), 'head'), null);
});

test('normalizePart wirft weg, was keine Rolle oder kein Gelenk ist', () => {
  assert.equal(normalizePart(null, 8, 8), null);
  assert.equal(normalizePart({ role: 'nase', pivot: { x: 1, y: 1 } }, 8, 8), null);
  assert.equal(normalizePart({ role: 'head' }, 8, 8), null);
  assert.equal(normalizePart({ role: 'head', pivot: { x: 'a', y: 1 } }, 8, 8), null);
});

test('normalizePart zieht ein Gelenk von außerhalb an den Rand', () => {
  assert.deepEqual(normalizePart({ role: 'head', pivot: { x: -5, y: 99 } }, 8, 6),
    { role: 'head', pivot: { x: 0, y: 6 } });
  // Die Kanten selbst sind erlaubt: 0 und W/H sind Gitterlinien, keine Zellen.
  assert.deepEqual(normalizePart({ role: 'torso', pivot: { x: 8, y: 0 } }, 8, 6),
    { role: 'torso', pivot: { x: 8, y: 0 } });
});

test('copyPart teilt das Gelenk nicht mit dem Original', () => {
  const p = { role: 'head', pivot: { x: 2, y: 3 } };
  const c = copyPart(p);
  c.pivot.x = 9;
  assert.equal(p.pivot.x, 2);
  assert.equal(copyPart(null), null);
});

test('rigParts zählt nur Ebenen mit Rolle, von unten nach oben', () => {
  const sp = {
    layers: [
      { name: 'Rumpf', part: { role: 'torso', pivot: { x: 4, y: 9 } } },
      { name: 'Hintergrund', part: null },
      { name: 'Kopf', part: { role: 'head', pivot: { x: 4, y: 3 } } },
    ],
  };
  assert.deepEqual(rigParts(sp).map(p => [p.i, p.role]), [[0, 'torso'], [2, 'head']]);
  assert.equal(hasRig(sp), true);
  assert.equal(hasRig({ layers: [{ part: null }] }), false);
});

test('jede Rolle hat ein geratenes Gelenk', () => {
  for (const r of PART_ROLES) assert.ok(autoPivot(cel(), r), r);
});
