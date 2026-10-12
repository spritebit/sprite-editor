// ════════════════════════════════════════════════════════════════════
// BRUSHLIB — gespeicherte eigene Pinsel (js/stamp.js)
// ════════════════════════════════════════════════════════════════════
// Ein eigener Pinsel lässt sich speichern und später wieder nehmen — in
// jedem Projekt und jedem Sprite. Gespeichert wird nach der FARBE
// ("#rrggbb", null = leer), nicht nach der Palettennummer: in einem Sprite
// mit anderer Palette sieht der Pinsel so gleich aus (stampForPalette
// überträgt ihn nach der Farbe, remap.js).
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/brushlib.test.js).
// Die Desktop-Version speichert genauso (spritebit-rs, brushes.json).
import { cellToColor } from './data.js';

/** Höchstens so viele Pinsel — der älteste fällt dann heraus. */
export const MAX_BRUSHES = 32;

/** @typedef {{w: number, h: number, px: (string|null)[]}} SavedBrush */

/**
 * Pinsel → gespeicherte Form (Farben statt Nummern).
 * @param {{w: number, h: number, cells: any[][]}} stamp
 * @param {Record<number,string>} pal  Palette, in der die Nummern gelten
 * @returns {SavedBrush}
 */
export function toSaved(stamp, pal) {
  const px = [];
  for (const row of stamp.cells) for (const v of row) {
    const hex = v === 0 ? null : cellToColor(v, pal);
    px.push(hex ? hex.toLowerCase() : null);
  }
  return { w: stamp.w, h: stamp.h, px };
}

/**
 * Gespeicherte Form → Pinsel mit freien Farben ("#rrggbb") und leerer Palette.
 * @param {SavedBrush} b
 */
export function fromSaved(b) {
  const cells = [];
  for (let y = 0; y < b.h; y++) cells.push(b.px.slice(y * b.w, (y + 1) * b.w).map(c => c || 0));
  return { w: b.w, h: b.h, cells, pal: {} };
}

const same = (a, b) => a.w === b.w && a.h === b.h && a.px.every((c, i) => c === b.px[i]);

/**
 * Pinsel vorne in die Liste; ein gleicher wandert nach vorn statt doppelt.
 * @param {SavedBrush[]} list
 * @param {SavedBrush} b
 * @returns {SavedBrush[]}
 */
export function addBrush(list, b) {
  return [b, ...list.filter(x => !same(x, b))].slice(0, MAX_BRUSHES);
}

/** Gespeicherte Liste prüfen — Kaputtes fällt heraus. */
export function normalizeBrushes(raw) {
  if (!Array.isArray(raw)) return [];
  const hex = /^#[0-9a-f]{6}$/;
  return raw.filter(b => b && Number.isInteger(b.w) && Number.isInteger(b.h) && b.w > 0 && b.h > 0
    && b.w * b.h <= 512 * 512 && Array.isArray(b.px) && b.px.length === b.w * b.h
    && b.px.every(c => c === null || (typeof c === 'string' && hex.test(c)))
    && b.px.some(c => c !== null))
    .map(b => ({ w: b.w, h: b.h, px: [...b.px] }))
    .slice(0, MAX_BRUSHES);
}
