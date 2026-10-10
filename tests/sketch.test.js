// Tests für Skizze → Pixel-Art (js/sketch.js, Abschnitt 02 der Startseite).
//
// Statt eines Fotos wird eine Arbeitsfläche von Hand gefüllt: weißes Papier,
// schwarze Striche. Geprüft wird, was daraus wird — Kontur, Füllung, Licht
// und Schatten, Glanz; außen bleibt durchsichtig.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sketchToPixels } from '../js/sketch.js';

const W = 256;
const full = { ox: 0, oy: 0, dw: W, dh: W };

/** Papier (weiß) mit Funktion, die Pixel schwarz macht. */
function canvas(draw) {
  const rgba = new Uint8ClampedArray(W * W * 4).fill(255);
  const ink = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= W) return;
    const i = (y * W + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = 30;
  };
  draw(ink);
  return rgba;
}

/** Quadratischer Rahmen von (a, a) bis (b, b), `t` Pixel dick. */
const frame = (ink, a, b, t) => {
  for (let y = a; y <= b; y++) for (let x = a; x <= b; x++) {
    if (x < a + t || x > b - t || y < a + t || y > b - t) ink(x, y);
  }
};

test('ein gezeichneter Rahmen: Kontur außen, gefüllt innen, Rand durchsichtig', () => {
  const px = sketchToPixels(canvas(ink => frame(ink, 60, 196, 5)), W, full, 16);
  const at = (x, y) => px[y * 16 + x];
  // Zugeschnitten auf die Tinte mit etwas Rand: ganz außen ist nichts.
  assert.equal(at(0, 0), 0, 'Ecke durchsichtig');
  assert.equal(at(8, 0), 0);
  // Mitte gefüllt (Grund 3, Licht 4 oder Schatten 2)
  assert.ok([2, 3, 4].includes(at(8, 8)), `Mitte gefüllt: ${at(8, 8)}`);
  // Auf jeder Zeile durch die Mitte: Kontur, dann Füllung, dann Kontur
  const row = Array.from({ length: 16 }, (_, x) => at(x, 8));
  const first = row.findIndex(v => v === 1), last = row.lastIndexOf(1);
  assert.ok(first >= 0 && last - first > 8, `Kontur links und rechts: ${row.join('')}`);
  // (die Kontur darf zwei Zellen dick sein, wo der Strich zwischen zwei Zellen lag)
  assert.ok(row.slice(first + 1, last - 1).every(v => v >= 1 && v <= 4) && row.slice(first + 2, last - 2).every(v => v >= 2), `innen gefüllt: ${row.join('')}`);
  // Licht oben links, Schatten unten rechts an der Kontur
  assert.ok(px.includes(4) && px.includes(2), 'Licht und Schatten');
});

test('eine kleine geschlossene Insel wird Glanz', () => {
  const px = sketchToPixels(canvas(ink => {
    frame(ink, 40, 216, 5);
    frame(ink, 70, 100, 4);   // kleiner Kringel innen
  }), W, full, 32);
  assert.ok(px.includes(5), 'Glanz im kleinen Kringel');
});

test('ein offener Strich füllt nichts', () => {
  const px = sketchToPixels(canvas(ink => {
    for (let x = 40; x < 216; x++) for (let t = 0; t < 6; t++) ink(x, 128 + t);
  }), W, full, 16);
  assert.ok(px.includes(1), 'Strich als Kontur');
  assert.ok(px.every(v => v === 0 || v === 1), 'keine Füllung ohne geschlossene Form');
});

test('leeres Papier ergibt ein leeres Bild', () => {
  const px = sketchToPixels(canvas(() => {}), W, full, 16);
  assert.ok(px.every(v => v === 0));
});

test('ein Foto (fast überall dunkel) gibt fünf Helligkeitsstufen, Rand ums Bild bleibt frei', () => {
  // Querformat: das Bild liegt nur in der mittleren Hälfte der Fläche.
  const area = { ox: 0, oy: 64, dw: W, dh: 128 };
  const rgba = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let y = 64; y < 192; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, v = Math.round(20 + 200 * x / W);   // Verlauf dunkel → hell
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
  }
  const px = sketchToPixels(rgba, W, area, 16);
  const row = Array.from({ length: 16 }, (_, x) => px[8 * 16 + x]);
  assert.ok(row.every(v => v >= 1 && v <= 5), `ganze Zeile belegt: ${row.join('')}`);
  assert.ok(row[0] < row[15], 'links dunkler als rechts');
  assert.equal(px[0], 0, 'oberhalb des Bilds durchsichtig');
});
