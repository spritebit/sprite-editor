// ════════════════════════════════════════════════════════════════════
// TILELIB — Kachelsätze speichern und wiederverwenden
// ════════════════════════════════════════════════════════════════════
// Ein Kachelsatz hängt an seiner Tilemap-Ebene (js/tiles.js). Damit man ihn
// in einer anderen Ebene, einem anderen Sprite oder einem anderen Projekt
// wieder nutzen kann, gibt es
//   • die Bibliothek des Projekts: state.tilesetLib = { name: Satz, … }
//   • eine Datei (.json) für andere Projekte — oder ein fremdes Kachelbild
//     (PNG), das in Kacheln zerschnitten wird.
//
// In Bibliothek und Datei stehen Farben (#rrggbb), keine Palettennummern:
// so passt ein Satz in jeden Sprite, auch mit anderer Palette. Beim
// Einsetzen wird jede Farbe zur passenden Nummer der Sprite-Palette, sonst
// zur freien Farbe — das Bild sieht aus wie gespeichert.
//
// Eingesetzt wird immer eine Kopie. Die Ebene merkt sich, woher sie kommt
// (tileset.lib) — für „Neu laden“ und „In Bibliothek speichern“.
//
// Reine Rechnung, ohne DOM — läuft unter Node (tests/tilelib.test.js).
// Dasselbe Dateiformat liest und schreibt spritebit-rs.
import { mapOf, placeTile } from './tiles.js';

export const FILE_FORMAT = 'spritebit-tileset';

const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** Ein Satz der Bibliothek: { tw, th, tiles } mit 0 oder "#rrggbb" je Pixel. */
export function normalizeLibSet(s) {
  if (!s || typeof s !== 'object') return null;
  const tw = Math.round(Number(s.tw)), th = Math.round(Number(s.th));
  if (!(tw >= 1 && tw <= 256 && th >= 1 && th <= 256)) return null;
  const ok = g => Array.isArray(g) && g.length === th && g.every(r => Array.isArray(r) && r.length === tw);
  const tiles = (Array.isArray(s.tiles) ? s.tiles : []).filter(ok)
    .map(g => g.map(r => r.map(v => (isHex(v) ? v.toLowerCase() : 0))));
  return { tw, th, tiles };
}

/** Die ganze Bibliothek aus dem Speicherstand: nur brauchbare Sätze. */
export function normalizeLib(lib) {
  const out = {};
  if (!lib || typeof lib !== 'object') return out;
  for (const [name, s] of Object.entries(lib)) {
    const n = normalizeLibSet(s);
    if (n && String(name).trim()) out[String(name).trim()] = n;
  }
  return out;
}

/**
 * Kachelsatz einer Ebene → Satz der Bibliothek (Farben statt Nummern).
 * @param {{tw: number, th: number, tiles: any[][][]}} ts
 * @param {Record<number, string>} pal
 */
export function toLib(ts, pal) {
  const hex = v => (typeof v === 'number' ? (v > 0 && isHex(pal[v]) ? pal[v].toLowerCase() : 0) : isHex(v) ? v.toLowerCase() : 0);
  return { tw: ts.tw, th: ts.th, tiles: ts.tiles.map(g => g.map(r => r.map(hex))) };
}

/**
 * Satz der Bibliothek → Kacheln für einen Sprite mit Palette `pal`: jede
 * Farbe wird ihre Nummer (die erste mit dieser Farbe), sonst freie Farbe.
 */
export function fromLib(lib, pal) {
  const idx = new Map();
  for (const k of Object.keys(pal)) {
    const i = Number(k);
    if (i > 0 && isHex(pal[i]) && !idx.has(pal[i].toLowerCase())) idx.set(pal[i].toLowerCase(), i);
  }
  const val = v => (v === 0 ? 0 : idx.get(v) ?? v);
  return { tw: lib.tw, th: lib.th, tiles: lib.tiles.map(g => g.map(r => r.map(val))) };
}

/**
 * Andere Kacheln in eine Tilemap-Ebene legen, die Anordnung bleibt: wo
 * vorher Kachel k lag, liegt danach die neue Kachel k. Zellen mit einer
 * Nummer, die es im neuen Satz nicht gibt, und Inhalt, der keine Kachel
 * war, bleiben, wie sie sind. Ändert `ts` und die Bilder.
 * @param {{tw: number, th: number, tiles: any[][][]}} ts  Satz der Ebene
 * @param {any[][][]} tiles  die neuen Kacheln (gleiche Größe)
 * @param {any[][][]} grids  alle Bilder der Ebene (jedes nur einmal)
 * @returns {boolean} false, wenn die Größe nicht passt
 */
export function retile(ts, tiles, grids) {
  if (tiles.some(t => t.length !== ts.th || t.some(r => r.length !== ts.tw))) return false;
  const maps = grids.map(g => mapOf(ts, g));
  ts.tiles = tiles.map(t => t.map(r => r.slice()));
  grids.forEach((g, i) => maps[i].forEach((row, cy) => row.forEach((k, cx) => {
    if (k > 0 && k <= ts.tiles.length) placeTile(ts, g, cx, cy, k);
  })));
  return true;
}

/** Freier Name in der Bibliothek: „Kacheln“, „Kacheln 2“, … */
export function freeLibName(lib, base) {
  const b = String(base || '').trim() || 'Tileset';
  if (!lib[b]) return b;
  let n = 2;
  while (lib[`${b} ${n}`]) n++;
  return `${b} ${n}`;
}

// ── Datei ────────────────────────────────────────────────────────────

/** Satz als Datei (JSON-Text). */
export function tilesetFile(name, set) {
  return JSON.stringify({ format: FILE_FORMAT, version: 1, name, tw: set.tw, th: set.th, tiles: set.tiles });
}

/** Datei lesen → { name, set } oder null. */
export function parseTilesetFile(text) {
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || j.format !== FILE_FORMAT) return null;
  const set = normalizeLibSet(j);
  return set ? { name: String(j.name || '').trim(), set } : null;
}

/**
 * Fremdes Kachelbild (RGBA, z. B. aus einem PNG) in Kacheln tw × th
 * zerschneiden: Zeile für Zeile, leere und doppelte Kacheln fallen weg.
 * Halb durchsichtige Pixel (Alpha < 128) gelten als leer. Der Rand, der
 * keine ganze Kachel mehr ergibt, bleibt außen vor.
 * @param {Uint8ClampedArray|number[]} rgba
 * @param {number} w
 * @param {number} h
 */
export function tilesFromImage(rgba, w, h, tw, th) {
  const tiles = [];
  const seen = new Set();
  const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  for (let cy = 0; cy + th <= h; cy += th) {
    for (let cx = 0; cx + tw <= w; cx += tw) {
      let empty = true;
      const t = Array.from({ length: th }, (_, y) => Array.from({ length: tw }, (_, x) => {
        const o = ((cy + y) * w + cx + x) * 4;
        if (rgba[o + 3] < 128) return 0;
        empty = false;
        return hex(rgba[o], rgba[o + 1], rgba[o + 2]);
      }));
      const key = JSON.stringify(t);
      if (empty || seen.has(key)) continue;
      seen.add(key);
      tiles.push(t);
    }
  }
  return { tw, th, tiles };
}
