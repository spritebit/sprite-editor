// ════════════════════════════════════════════════════════════════════
// PALFILE — Paletten als Datei laden und speichern
// ════════════════════════════════════════════════════════════════════
// Formate, wie man sie z. B. auf Lospec herunterlädt:
//   .gpl  GIMP/Aseprite/Krita — Zeilen „R G B Name“, Farbnamen kommen mit
//   .hex  Lospec — eine Farbe je Zeile, „rrggbb“
//   .pal  JASC-PAL (Text, Paint Shop Pro / Aseprite) oder RIFF-PAL (binär, Microsoft)
//   .txt  Paint.NET — „AARRGGBB“ je Zeile, „;“ leitet Kommentare ein
//   Bild  PNG/GIF/BMP — jede neue Farbe von links oben nach rechts unten
//         (das Dekodieren macht der Browser, hier nur colorsFromRgba)
// Gespeichert wird als .gpl, .hex, .pal (JASC) oder PNG (eine Zeile, 1 px je Farbe).
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/palfile.test.js).
// Die Desktop-Version liest und schreibt genauso (spritebit-rs, core::palfile).
import { MAX_COLORS } from './data.js';

/** @typedef {{colors: string[], names: (string|null)[], name: string|null}} PalFile */

const hex2 = n => n.toString(16).padStart(2, '0');
const rgbHex = (r, g, b) => '#' + hex2(r) + hex2(g) + hex2(b);
const byte = s => { const n = Number(s); return Number.isInteger(n) && n >= 0 && n <= 255 ? n : null; };

/** Endung einer Datei, klein, ohne Punkt. */
export function extOf(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename || '');
  return m ? m[1].toLowerCase() : '';
}

/** Ist das eine Bilddatei, die der Browser dekodieren soll? */
export function isImageFile(filename) {
  return ['png', 'gif', 'bmp', 'jpg', 'jpeg', 'webp'].includes(extOf(filename));
}

/**
 * Palettendatei lesen. Wirft einen Error mit `code` ('empty' | 'format'),
 * wenn nichts Brauchbares darin ist.
 * @param {string} filename
 * @param {Uint8Array} bytes
 * @returns {PalFile}
 */
export function parsePaletteFile(filename, bytes) {
  // RIFF-PAL erkennt man am Kopf, egal wie die Datei heißt.
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'PAL ') return finish(parseRiff(bytes));
  const text = new TextDecoder().decode(bytes).replace(/^﻿/, '');
  const ext = extOf(filename);
  const head = text.trimStart().slice(0, 16).toUpperCase();
  if (head.startsWith('GIMP PALETTE')) return finish(parseGpl(text));
  if (head.startsWith('JASC-PAL')) return finish(parseJasc(text));
  if (ext === 'txt') return finish(parsePaintNet(text));
  if (ext === 'gpl') return finish(parseGpl(text));
  // .hex und alles andere: einfach Hex-Werte suchen.
  return finish(parseHexList(text));
}

function ascii(b, at, n) {
  return String.fromCharCode(...b.subarray(at, at + n));
}

function finish(/** @type {PalFile} */ p) {
  if (!p.colors.length) throw Object.assign(new Error('keine Farben'), { code: 'empty' });
  return { colors: p.colors.slice(0, MAX_COLORS), names: p.names.slice(0, MAX_COLORS), name: p.name };
}

/** GIMP-Palette: Kopfzeile, „Name:“, „Columns:“, „#“-Kommentare, dann „R G B Name“. */
function parseGpl(text) {
  const colors = [], names = [];
  let name = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || /^GIMP Palette/i.test(line) || /^Columns:/i.test(line)) continue;
    const nm = /^Name:\s*(.*)$/i.exec(line);
    if (nm) { name = nm[1].trim() || null; continue; }
    const m = /^(\d+)\s+(\d+)\s+(\d+)\s*(.*)$/.exec(line);
    if (!m) continue;
    const [r, g, b] = [byte(m[1]), byte(m[2]), byte(m[3])];
    if (r === null || g === null || b === null) continue;
    colors.push(rgbHex(r, g, b));
    // GIMP schreibt „Untitled“ oder den Hex-Wert, wenn es keinen Namen gibt.
    const label = m[4].trim();
    names.push(label && !/^untitled$/i.test(label) && !/^#?[0-9a-f]{6}$/i.test(label) ? label : null);
  }
  return { colors, names, name };
}

/** JASC-PAL: „JASC-PAL“, „0100“, Anzahl, dann „R G B“. */
function parseJasc(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const colors = [];
  for (const line of lines.slice(3)) {
    const m = /^(\d+)\s+(\d+)\s+(\d+)/.exec(line);
    if (!m) continue;
    const [r, g, b] = [byte(m[1]), byte(m[2]), byte(m[3])];
    if (r !== null && g !== null && b !== null) colors.push(rgbHex(r, g, b));
  }
  return { colors, names: colors.map(() => null), name: null };
}

/** Paint.NET: „AARRGGBB“ (oder „RRGGBB“), Kommentare mit „;“. */
function parsePaintNet(text) {
  const colors = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/;.*$/, '').trim();
    const m = /^(?:[0-9a-f]{2})?([0-9a-f]{6})$/i.exec(line);
    if (m) colors.push('#' + m[1].toLowerCase());
  }
  return { colors, names: colors.map(() => null), name: null };
}

/** Lospec .hex und Ähnliches: jedes „rrggbb“ bzw. „#rrggbb“. */
function parseHexList(text) {
  const colors = [];
  for (const m of text.matchAll(/(?:^|[^0-9a-z])#?([0-9a-f]{6})(?![0-9a-z])/gi)) colors.push('#' + m[1].toLowerCase());
  return { colors, names: colors.map(() => null), name: null };
}

/** RIFF-PAL: Chunk „data“ mit Version (2 Byte), Anzahl (2 Byte), dann je R G B Flags. */
function parseRiff(b) {
  const colors = [];
  let at = 12;
  while (at + 8 <= b.length) {
    const id = ascii(b, at, 4);
    const size = b[at + 4] | (b[at + 5] << 8) | (b[at + 6] << 16) | (b[at + 7] << 24);
    if (id === 'data') {
      const n = b[at + 10] | (b[at + 11] << 8);
      for (let i = 0; i < n; i++) {
        const p = at + 12 + i * 4;
        if (p + 3 > b.length) break;
        colors.push(rgbHex(b[p], b[p + 1], b[p + 2]));
      }
      break;
    }
    at += 8 + size + (size & 1);
  }
  return { colors, names: colors.map(() => null), name: null };
}

/**
 * Farben aus RGBA-Pixeln (Bild): jede neue deckende Farbe, in Lese-Reihenfolge.
 * @param {Uint8ClampedArray | Uint8Array} data
 * @returns {PalFile}
 */
export function colorsFromRgba(data) {
  const seen = new Set(), colors = [];
  for (let i = 0; i + 3 < data.length && colors.length < MAX_COLORS; i += 4) {
    if (data[i + 3] < 128) continue;
    const hex = rgbHex(data[i], data[i + 1], data[i + 2]);
    if (seen.has(hex)) continue;
    seen.add(hex);
    colors.push(hex);
  }
  if (!colors.length) throw Object.assign(new Error('keine Farben'), { code: 'empty' });
  return { colors, names: colors.map(() => null), name: null };
}

const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

/** GIMP-Palette schreiben (mit Farbnamen, wo es welche gibt). */
export function writeGpl(name, colors, names = []) {
  const lines = ['GIMP Palette', 'Name: ' + name, 'Columns: ' + Math.min(16, colors.length), '#'];
  colors.forEach((hex, i) => {
    const [r, g, b] = rgbOf(hex);
    lines.push(`${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${names[i] || hex.slice(1).toLowerCase()}`);
  });
  return lines.join('\n') + '\n';
}

/** Lospec-.hex schreiben. */
export function writeHex(colors) {
  return colors.map(h => h.slice(1).toLowerCase()).join('\n') + '\n';
}

/** JASC-PAL schreiben (Zeilenende CRLF wie im Original). */
export function writeJasc(colors) {
  return ['JASC-PAL', '0100', String(colors.length), ...colors.map(h => rgbOf(h).join(' '))].join('\r\n') + '\r\n';
}

/** Farben als RGBA-Zeile für ein PNG (Breite = Anzahl, Höhe 1). */
export function rgbaStrip(colors) {
  const out = new Uint8ClampedArray(colors.length * 4);
  colors.forEach((h, i) => { const [r, g, b] = rgbOf(h); out.set([r, g, b, 255], i * 4); });
  return out;
}
