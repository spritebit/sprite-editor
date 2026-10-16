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

// ── Vorlagen: aus einem Bild eine Bewegung ──────────────────────────
import { seg, REST, TEMPLATES, TEMPLATE_NAMES, buildPoses, transformPart, buildFrame, buildFrames } from '../js/rig.js';

test('seg fährt linear durch die Stützwerte', () => {
  assert.equal(seg(0, [0, 10, 0]), 0);
  assert.equal(seg(0.5, [0, 10, 0]), 10);
  assert.equal(seg(1, [0, 10, 0]), 0);
  assert.equal(seg(0.25, [0, 10, 0]), 5);
  // außerhalb wird an den Rand gezogen, nicht weitergerechnet
  assert.equal(seg(-1, [4, 9]), 4);
  assert.equal(seg(2, [4, 9]), 9);
});

test('rundlaufende Vorlagen wiederholen den ersten Frame nicht', () => {
  const ps = buildPoses('walk', 8);
  assert.equal(ps.length, 8);
  // Stelle 0 und Stelle 1 wären dieselbe Stellung — die letzte ist 7/8.
  assert.notDeepEqual(ps[0], ps[7]);
  assert.deepEqual(ps[0], TEMPLATES.walk.pose(0, 1));
  assert.deepEqual(ps[7], TEMPLATES.walk.pose(7 / 8, 1));
});

test('einmalige Vorlagen laufen bis ans Ende durch', () => {
  const ps = buildPoses('attack', 5);
  assert.deepEqual(ps[0], TEMPLATES.attack.pose(0, 1));
  assert.deepEqual(ps[4], TEMPLATES.attack.pose(1, 1));
});

test('ohne Bildzahl nimmt die Vorlage ihren eigenen Vorschlag', () => {
  for (const n of TEMPLATE_NAMES) {
    assert.equal(buildPoses(n).length, TEMPLATES[n].frames, n);
  }
  assert.deepEqual(buildPoses('gibtsnicht'), []);
});

test('Bildzahl bleibt zwischen 2 und 64', () => {
  assert.equal(buildPoses('walk', 1).length, 2);
  assert.equal(buildPoses('walk', 999).length, 64);
});

test('Laufen: vorderes und hinteres Bein schwingen gegeneinander', () => {
  for (const pose of buildPoses('walk', 8)) {
    // + 0, damit die Null der einen nicht als negative Null der anderen ankommt
    assert.equal(pose.legFront.rot, -pose.legBack.rot + 0);
  }
  // und es bewegt sich überhaupt etwas
  assert.ok(buildPoses('walk', 8).some(p => p.legFront.rot !== 0));
});

test('keine eingebaute Vorlage dreht den Rumpf', () => {
  for (const n of TEMPLATE_NAMES) {
    for (const pose of buildPoses(n, 8)) {
      assert.equal(pose.torso?.rot ?? 0, 0, n);
    }
  }
});

test('die Stärke skaliert die Ausschläge', () => {
  const weak = buildPoses('walk', 8, 0.5)[2], strong = buildPoses('walk', 8, 2)[2];
  assert.ok(Math.abs(strong.legFront.rot) > Math.abs(weak.legFront.rot));
  // Stärke 0 heißt Stillstand
  for (const pose of buildPoses('walk', 8, 0)) {
    for (const p of Object.values(pose)) assert.deepEqual(p, { dx: 0, dy: 0, rot: 0 });
  }
});

// Ein 5 × 5-Bild mit einem senkrechten Strich in Spalte 2, Zeilen 1..3.
const bar = () => {
  const g = Array.from({ length: 5 }, () => new Array(5).fill(0));
  for (let y = 1; y <= 3; y++) g[y][2] = 7;
  return g;
};

test('ohne Versatz und Drehung kommt eine Kopie zurück', () => {
  const g = bar();
  const out = transformPart(g, { x: 2, y: 2 }, { dx: 0, dy: 0, rot: 0 });
  assert.deepEqual(out, g);
  assert.notEqual(out, g, 'eine Kopie, nicht dasselbe Bild');
});

test('Versatz schiebt die Pixel, was hinausfällt ist weg', () => {
  const out = transformPart(bar(), { x: 2, y: 2 }, { dx: 1, dy: 0, rot: 0 });
  assert.deepEqual(out.map(r => r.join('')), ['00000', '00070', '00070', '00070', '00000']);
  // ganz hinausgeschoben: nichts bleibt übrig
  const gone = transformPart(bar(), { x: 2, y: 2 }, { dx: 9, dy: 0, rot: 0 });
  assert.ok(gone.every(r => r.every(v => v === 0)));
});

test('90° um die Bildmitte legt den Strich quer', () => {
  const out = transformPart(bar(), { x: 2.5, y: 2.5 }, { dx: 0, dy: 0, rot: 90 });
  assert.deepEqual(out.map(r => r.join('')), ['00000', '00000', '07770', '00000', '00000']);
});

test('Drehen um ein Gelenk am Rand lässt das Gelenk liegen', () => {
  // Gelenk in der Mitte des obersten Pixels des Strichs. Der Strich zeigt
  // nach unten; im Uhrzeigersinn (y zählt nach unten) wird daraus links.
  const out = transformPart(bar(), { x: 2.5, y: 1.5 }, { dx: 0, dy: 0, rot: 90 });
  assert.equal(out[1][2], 7, 'das Pixel am Gelenk bleibt liegen');
  assert.deepEqual(out.map(r => r.join('')), ['00000', '77700', '00000', '00000', '00000']);
});

test('buildFrame rührt Ebenen ohne Rolle nicht an', () => {
  const hintergrund = bar(), kopf = bar();
  const layers = [{ part: null }, { part: { role: 'head', pivot: { x: 2, y: 2 } } }];
  const out = buildFrame([hintergrund, kopf], layers, { head: { dx: 1, dy: 0, rot: 0 } });
  assert.equal(out[0], hintergrund, 'dasselbe Bild — bleibt verknüpft');
  assert.notEqual(out[1], kopf);
  assert.equal(out[1][2][3], 7);
});

test('eine Rolle, die die Vorlage nicht nennt, bleibt stehen', () => {
  const kopf = bar();
  const layers = [{ part: { role: 'head', pivot: { x: 2, y: 2 } } }];
  assert.deepEqual(buildFrame([kopf], layers, {})[0], kopf);
});

test('buildFrames liefert für jeden Frame einen vollen Satz Zellen', () => {
  const layers = [{ part: null }, { part: { role: 'legFront', pivot: { x: 2, y: 1 } } }];
  const frames = buildFrames([bar(), bar()], layers, 'walk', 6);
  assert.equal(frames.length, 6);
  for (const cels of frames) assert.equal(cels.length, 2);
  // die Ebene ohne Rolle ist in allen Frames dasselbe Bild
  assert.ok(frames.every(c => c[0] === frames[0][0]));
});

test('kein Teil bekommt die negative Null — sie stolpert über jeden Vergleich', () => {
  for (const n of TEMPLATE_NAMES) {
    for (const pose of buildPoses(n, 8)) {
      for (const [role, p] of Object.entries(pose)) {
        for (const k of ['dx', 'dy', 'rot']) {
          assert.ok(!Object.is(p[k], -0), `${n}.${role}.${k}`);
        }
      }
    }
  }
});

test('Oberkörper und Beine laufen nie um mehr als einen Pixel auseinander', () => {
  // Mehr als einer reißt die Figur an der Hüfte auf — Teile sind starr.
  for (const n of TEMPLATE_NAMES) {
    for (const pose of buildPoses(n, 8, 2)) {
      const legs = pose.legFront || REST, torso = pose.torso || REST;
      assert.ok(Math.abs(torso.dx - legs.dx) <= 1, `${n}: dx`);
      assert.ok(Math.abs(torso.dy - legs.dy) <= 1, `${n}: dy`);
    }
  }
});

test('der Kopf sinkt nie über den Rumpf hinaus nach oben weg', () => {
  // Kopf höher als der Rumpf hieße Lücke am Hals; tiefer ist harmlos, er
  // liegt oben drüber.
  for (const n of TEMPLATE_NAMES) {
    for (const pose of buildPoses(n, 8, 2)) {
      const head = pose.head || REST, torso = pose.torso || REST;
      assert.ok(head.dy >= torso.dy, `${n}: Kopf ${head.dy} über Rumpf ${torso.dy}`);
      assert.ok(Math.abs(head.dx - torso.dx) <= 1, `${n}: dx`);
    }
  }
});

test('Vierbeiner: alle vier Beine schwingen gleich weit, über Kreuz', () => {
  for (const pose of buildPoses('walkQuad', 8, 1)) {
    const amp = Math.abs(pose.armFront.rot);
    for (const r of ['armBack', 'legFront', 'legBack']) {
      assert.equal(Math.abs(pose[r].rot), amp, r);
    }
    // nahes Vorderbein mit fernem Hinterbein, ferne über Kreuz dazu
    assert.equal(pose.legBack.rot, pose.armFront.rot);
    assert.equal(pose.legFront.rot, pose.armBack.rot);
    assert.equal(pose.armBack.rot, -pose.armFront.rot + 0);
  }
  assert.ok(buildPoses('walkQuad', 8).some(p => p.armFront.rot !== 0));
});

test('rundlaufende Vorlagen zeigen nie zweimal hintereinander dasselbe Bild', () => {
  // Ein doppelter Frame ist beim Abspielen ein Stolperer. Geprüft wird bei
  // der Bildzahl, die die Vorlage selbst vorschlägt.
  for (const n of TEMPLATE_NAMES) {
    if (!TEMPLATES[n].loop) continue;
    const ps = buildPoses(n);
    for (let i = 0; i < ps.length; i++) {
      assert.notDeepEqual(ps[i], ps[(i + 1) % ps.length], `${n}: Bild ${i + 1} und ${i + 2}`);
    }
  }
});

// ── Freie Teile: Schwanz, Ohren, Umhang ─────────────────────────────
import { FREE_AMP, FREE_PHASE, FREE_AMP_MAX, freePose, phases, normalizePart as np, copyPart as cp } from '../js/rig.js';

test('ein freies Teil ohne eigene Werte bekommt die Vorgaben', () => {
  const p = np({ role: 'free', pivot: { x: 2, y: 3 } }, 16, 16);
  assert.deepEqual(p, { role: 'free', pivot: { x: 2, y: 3 }, amp: FREE_AMP, phase: FREE_PHASE });
});

test('Ausschlag wird begrenzt, der Takt läuft rund', () => {
  const at = (amp, phase) => np({ role: 'free', pivot: { x: 0, y: 0 }, amp, phase }, 16, 16);
  assert.equal(at(999, 0).amp, FREE_AMP_MAX);
  assert.equal(at(-5, 0).amp, 0);
  assert.equal(at(10, -90).phase, 270, 'minus 90 ist dieselbe Stelle wie 270');
  assert.equal(at(10, 450).phase, 90);
  assert.equal(at(10, 'nanu').phase, FREE_PHASE);
});

test('feste Rollen tragen keinen Ausschlag mit sich herum', () => {
  const p = np({ role: 'head', pivot: { x: 1, y: 1 }, amp: 40, phase: 10 }, 16, 16);
  assert.deepEqual(p, { role: 'head', pivot: { x: 1, y: 1 } });
  assert.deepEqual(cp(p), { role: 'head', pivot: { x: 1, y: 1 } });
});

test('copyPart nimmt Ausschlag und Takt eines freien Teils mit', () => {
  const p = { role: 'free', pivot: { x: 1, y: 2 }, amp: 40, phase: 200 };
  const c = cp(p);
  assert.deepEqual(c, p);
  c.pivot.x = 9;
  assert.equal(p.pivot.x, 1);
});

test('der Ausschlag bestimmt, wie weit ein freies Teil dreht', () => {
  const part = { role: 'free', pivot: { x: 0, y: 0 }, amp: 30, phase: 0 };
  const rots = phases('walk', 8).map(p => freePose('walk', p, 1, part).rot);
  assert.ok(Math.max(...rots.map(Math.abs)) <= 30);
  assert.ok(rots.some(r => r !== 0));
  // Doppelter Ausschlag, doppelte Drehung
  const wide = phases('walk', 8).map(p => freePose('walk', p, 1, { ...part, amp: 60 }).rot);
  rots.forEach((r, i) => assert.ok(Math.abs(wide[i] - 2 * r) < 0.2));
});

test('„im Takt“ verschiebt die Bewegung umlaufend', () => {
  const part = { role: 'free', pivot: { x: 0, y: 0 }, amp: 30, phase: 0 };
  const ps = phases('walk', 8);
  const plain = ps.map(p => freePose('walk', p, 1, part).rot);
  // Eine halbe Runde später ist es genau die Gegenbewegung.
  const half = ps.map(p => freePose('walk', p, 1, { ...part, phase: 180 }).rot);
  plain.forEach((r, i) => assert.ok(Math.abs(half[i] + r) < 0.2, `Bild ${i + 1}`));
  // Eine ganze Runde später ist es wieder dasselbe.
  const full = ps.map(p => freePose('walk', p, 1, { ...part, phase: 360 }).rot);
  assert.deepEqual(full, plain);
});

test('ein freies Teil wandert mit dem Körper, statt abzureißen', () => {
  const part = { role: 'free', pivot: { x: 0, y: 0 }, amp: 30, phase: 0 };
  for (const name of TEMPLATE_NAMES) {
    for (const p of phases(name, 8)) {
      const body = TEMPLATES[name].pose(p, 1).torso || REST;
      const free = freePose(name, p, 1, part, body);
      assert.equal(free.dx, body.dx, name);
      assert.equal(free.dy, body.dy, name);
    }
  }
});

test('jede Vorlage bewegt ein freies Teil überhaupt', () => {
  const part = { role: 'free', pivot: { x: 0, y: 0 }, amp: 30, phase: 0 };
  for (const name of TEMPLATE_NAMES) {
    const rots = phases(name, 8).map(p => freePose(name, p, 1, part).rot);
    assert.ok(rots.some(r => r !== 0), name);
  }
});

test('buildFrames dreht ein freies Teil mit', () => {
  const layers = [
    { part: { role: 'torso', pivot: { x: 2, y: 4 } } },
    { part: { role: 'free', pivot: { x: 2, y: 2 }, amp: 60, phase: 0 } },
  ];
  const frames = buildFrames([bar(), bar()], layers, 'walk', 8);
  const shapes = frames.map(c => c[1].map(r => r.join('')).join('|'));
  assert.ok(new Set(shapes).size > 1, 'der Schwanz steht nicht still');
});

test('ein freies Teil hängt an der Seite, die zur Bildmitte zeigt', () => {
  // 20 × 20, Mitte bei (10, 10). Schwanz links oben, Kasten (2..5, 5..9).
  const g = Array.from({ length: 20 }, () => new Array(20).fill(0));
  for (let y = 5; y <= 9; y++) for (let x = 2; x <= 5; x++) g[y][x] = 1;
  // Nächste Stelle zur Mitte: die untere rechte Ecke des Kastens.
  assert.deepEqual(autoPivot(g, 'free'), { x: 6, y: 10 });

  // Ohr oben mittig (9..11, 1..3): Unterkante, waagerecht die Mitte.
  const e = Array.from({ length: 20 }, () => new Array(20).fill(0));
  for (let y = 1; y <= 3; y++) for (let x = 9; x <= 11; x++) e[y][x] = 1;
  assert.deepEqual(autoPivot(e, 'free'), { x: 10, y: 4 });

  // Ein Teil, das die Mitte selbst überdeckt, dreht um die Mitte.
  const m = Array.from({ length: 20 }, () => new Array(20).fill(0));
  for (let y = 6; y <= 14; y++) for (let x = 6; x <= 14; x++) m[y][x] = 1;
  assert.deepEqual(autoPivot(m, 'free'), { x: 10, y: 10 });
});
