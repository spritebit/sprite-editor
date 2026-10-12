// Tests für Projektdateien .sb (js/sbfile.js) — dasselbe Format wie die
// Desktop-App (spritebit-rs, core::io save_native / load_native).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSb, writeSb, docToSbBody, sbBodyToDoc, looksLikeSb, isSbName } from '../js/sbfile.js';

/** Kleines Projekt: zwei Ebenen, drei Frames, Verknüpfung, freie Farbe, eigene Palette. */
function sample() {
  const W = 70, H = 3; // breiter als eine Kachel (64): zwei Kacheln nebeneinander
  const blank = () => Array.from({ length: H }, () => new Array(W).fill(0));
  const back = blank();
  back[2].fill(3);
  back[0][69] = 5;
  const front = f => { const g = blank(); g[1][f + 1] = 1; if (f === 2) g[2][65] = '#abcdef'; return g; };
  return {
    version: 2,
    name: 'Mein Spiel',
    sprites: {
      held: {
        name: 'held', palette: 'meine', fps: 12, frame: 1, layer: 1,
        layers: [{ name: 'Hinten', visible: true, locked: false, opacity: 1, continuous: true },
          { name: 'Vorn', visible: true, locked: true, opacity: 0.5, continuous: false }],
        tags: [{ name: 'lauf', from: 0, to: 2, color: '#e5534b', dir: 'pingpong' }],
        guides: { h: [1], v: [], heads: 0, top: 0, bottom: H },
        frames: [0, 1, 2].map(f => (f === 1 ? { cels: [{ link: 0 }, front(f)], dur: 200 } : { cels: [f ? { link: 0 } : back, front(f)] })),
      },
    },
    customPalettes: { meine: { 1: '#000000', 2: '#ff0000', 3: '#00ff00', 4: '#0000ff', 5: '#ffffff' } },
    paletteMaterials: { meine: { 3: 'stone' } },
    paletteColorNames: { meine: { 1: 'Kontur' } },
    ui: { curSprite: 'held' },
  };
}

test('hin und zurück: Pixel, Verknüpfung, freie Farbe, Ebenen, Tags, Palette', async () => {
  const bytes = await writeSb(sample());
  assert.ok(looksLikeSb(bytes));
  const { doc, skipped } = await readSb(bytes, 1024);
  assert.deepEqual(skipped, []);
  const s = doc.sprites.held;
  assert.equal(doc.name, 'Mein Spiel');
  assert.equal(doc.ui.curSprite, 'held');
  assert.equal(s.fps, 12);
  assert.deepEqual(s.frames.map(f => f.dur || 0), [0, 200, 0]);
  assert.deepEqual(s.frames[1].cels[0], { link: 0 }, 'verknüpft bleibt verknüpft');
  assert.deepEqual(s.frames[2].cels[0], { link: 0 });
  const back = s.frames[0].cels[0];
  assert.deepEqual(back[2], new Array(70).fill(3), 'über die Kachelgrenze');
  assert.equal(back[0][69], 5);
  assert.equal(s.frames[2].cels[1][2][65], '#abcdef', 'freie Farbe');
  assert.equal(s.frames[1].cels[1][1][2], 1);
  assert.deepEqual(s.layers.map(l => [l.name, l.locked, l.opacity, l.continuous]), [['Hinten', false, 1, true], ['Vorn', true, 0.5, false]]);
  assert.deepEqual(s.tags, [{ name: 'lauf', from: 0, to: 2, color: '#e5534b', dir: 'pingpong' }]);
  assert.deepEqual(doc.customPalettes.meine, sample().customPalettes.meine);
  assert.deepEqual(doc.paletteColorNames.meine, { 1: 'Kontur' });
  assert.deepEqual(doc.paletteMaterials.meine, { 3: 'stone' });
});

test('zu große Sprites lässt das Öffnen weg und nennt sie', () => {
  const doc = sample();
  doc.sprites.riesig = { name: 'Riesig', palette: 'meine', frames: [{ cels: [Array.from({ length: 2 }, () => new Array(130).fill(1))] }] };
  const body = docToSbBody(doc);
  const { doc: back, skipped } = sbBodyToDoc(body, 100);
  assert.deepEqual(skipped, [{ name: 'Riesig', width: 130, height: 2 }]);
  assert.deepEqual(Object.keys(back.sprites), ['held'], 'der kleine bleibt, und das Lesen danach stimmt noch');
  assert.equal(back.sprites.held.frames[0].cels[0][0][69], 5);
});

test('fremde Dateien und Endungen', async () => {
  assert.ok(isSbName('Spiel.sb') && isSbName('alt.SPRITEBIT') && !isSbName('x.json'));
  await assert.rejects(readSb(new TextEncoder().encode('{"kein":"sb"}'), 1024), e => e.code === 'format');
  const bad = await writeSb(sample());
  bad[10] = 9; // Fassung 9
  await assert.rejects(readSb(bad, 1024), e => e.code === 'version');
});
