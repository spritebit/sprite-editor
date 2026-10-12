// Tests für Paletten als Datei (js/palfile.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePaletteFile, colorsFromRgba, writeGpl, writeHex, writeJasc, rgbaStrip, extOf, isImageFile } from '../js/palfile.js';

const enc = s => new TextEncoder().encode(s);

test('GIMP-Palette mit Name und Farbnamen', () => {
  const gpl = 'GIMP Palette\nName: Wald\nColumns: 4\n#\n# Kommentar\n  0  0   0\tSchwarz\n255 128 0 Untitled\n 18 52 86\t123456\n';
  const p = parsePaletteFile('wald.gpl', enc(gpl));
  assert.deepEqual(p, { colors: ['#000000', '#ff8000', '#123456'], names: ['Schwarz', null, null], name: 'Wald' });
});

test('Lospec .hex, JASC-PAL und Paint.NET', () => {
  assert.deepEqual(parsePaletteFile('x.hex', enc('ff0000\r\n00FF00\n\n0000ff\n')).colors, ['#ff0000', '#00ff00', '#0000ff']);
  assert.deepEqual(parsePaletteFile('x.pal', enc('JASC-PAL\r\n0100\r\n2\r\n255 0 0\r\n0 0 255\r\n')).colors, ['#ff0000', '#0000ff']);
  assert.deepEqual(parsePaletteFile('x.txt', enc('; paint.net\nFFFF0000\nff00ff00 ; grün\n')).colors, ['#ff0000', '#00ff00']);
});

test('RIFF-PAL (binär) wird am Kopf erkannt', () => {
  const data = [0x00, 0x03, 2, 0, 255, 0, 0, 0, 0, 0, 255, 0];
  const size = 4 + 8 + data.length;
  const b = new Uint8Array([...enc('RIFF'), size, 0, 0, 0, ...enc('PAL '), ...enc('data'), data.length, 0, 0, 0, ...data]);
  assert.deepEqual(parsePaletteFile('egal.pal', b).colors, ['#ff0000', '#0000ff']);
});

test('ohne Farben gibt es einen Fehler mit code', () => {
  assert.throws(() => parsePaletteFile('leer.hex', enc('nichts hier')), e => e.code === 'empty');
});

test('Bild: jede neue deckende Farbe in Lese-Reihenfolge', () => {
  const px = new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255, 255]);
  assert.deepEqual(colorsFromRgba(px).colors, ['#ff0000', '#0000ff']);
});

test('Schreiben und wieder Lesen ergibt dieselben Farben', () => {
  const colors = ['#000000', '#ff8000', '#123456'];
  assert.deepEqual(parsePaletteFile('a.gpl', enc(writeGpl('Wald', colors, ['Schwarz', null, null]))),
    { colors, names: ['Schwarz', null, null], name: 'Wald' });
  assert.deepEqual(parsePaletteFile('a.hex', enc(writeHex(colors))).colors, colors);
  assert.deepEqual(parsePaletteFile('a.pal', enc(writeJasc(colors))).colors, colors);
  assert.deepEqual(colorsFromRgba(rgbaStrip(colors)).colors, colors);
});

test('Endungen', () => {
  assert.equal(extOf('Meine.GPL'), 'gpl');
  assert.ok(isImageFile('lospec-1x.png'));
  assert.ok(!isImageFile('a.hex'));
});
