// ════════════════════════════════════════════════════════════════════
// SHADE — Schattieren: ein Stift, der mit jedem Strich dunkler wird
// ════════════════════════════════════════════════════════════════════
// Man stellt eine Farbreihe zusammen (state.shadeRamp, Hex-Werte) — z. B.
// vier Rottöne, in der Reihenfolge, in der man sie anklickt. Dann ist das
// Werkzeug ein Stift, der sich durch die Reihe arbeitet (Linksklick):
//   leerer Pixel          → die erste Farbe der Reihe
//   Farbe aus der Reihe   → die nächste, an der letzten Schluss
//   andere Farbe          → bleibt (z. B. die Umrisslinie)
// Rechtsklick geht die Reihe andersherum. Pro Strich ändert sich jeder
// Pixel höchstens einmal (render.js paintShade merkt sich die berührten
// Zellen); wer weiter will, setzt neu an und malt drüber.
//
// Die Reihenfolge bestimmt man selbst — so lassen sich auch Verläufe mit
// wanderndem Farbton bauen. Der Knopf „nach Farbstufen" (sortRamp) ordnet
// sie auf Wunsch von hell nach dunkel.
//
// Die Reihe speichert Hex-Werte statt Nummern — sie überlebt so das
// Umsortieren der Palette und gilt auch für freie Farben im Bild.
//
// Ohne Reihe geht es automatisch: ein leerer Pixel bekommt die aktuelle
// Farbe, ein farbiger die nächsthellere bzw. -dunklere seiner Farbfamilie
// aus der Palette — dieselbe Suche wie beim Kantenlicht (js/light.js
// paletteStep). Freie Farben werden direkt ein Stück heller oder dunkler
// gerechnet.
//
// Reine Rechnung, ohne DOM — läuft unter Node (tests/shade.test.js).
import { paletteStep, shiftHex } from './light.js';

// So weit soll ein Schritt im Automatik-Modus gehen (Helligkeit 0..1):
// klein genug für die nächste Stufe, groß genug, dass sich etwas tut.
const AUTO_STEP = 0.1;

const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** Wahrgenommene Helligkeit 0..255 (Rec. 601). */
function luma(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

/**
 * Reihe bereinigen: nur gültige Hex-Werte, klein geschrieben, ohne
 * Doppelte. Die Reihenfolge bleibt.
 * @param {unknown} ramp
 * @returns {string[]}
 */
export function normalizeRamp(ramp) {
  if (!Array.isArray(ramp)) return [];
  const out = [];
  for (const v of ramp) {
    if (!isHex(v)) continue;
    const h = v.toLowerCase();
    if (!out.includes(h)) out.push(h);
  }
  return out;
}

/**
 * Reihe nach Farbstufen ordnen: von hell nach dunkel — so geht ein leerer
 * Pixel beim Linksklick mit der hellsten los und wird dann dunkler.
 * @param {string[]} ramp
 */
export function sortRamp(ramp) {
  return normalizeRamp(ramp).sort((a, b) => luma(b) - luma(a) || (a < b ? -1 : 1));
}

/**
 * Farbe hinten an die Reihe hängen oder wieder herausnehmen.
 * @param {string[]} ramp
 * @param {string} hex
 * @returns {string[]}
 */
export function toggleRamp(ramp, hex) {
  if (!isHex(hex)) return normalizeRamp(ramp);
  const h = hex.toLowerCase();
  const cur = normalizeRamp(ramp);
  return cur.includes(h) ? cur.filter(c => c !== h) : [...cur, h];
}

/**
 * Hex-Wert eines Pixels: Palette-Nummer → Farbe der Palette, freie Farbe
 * bleibt, 0 (leer) → null.
 * @param {number|string} v
 * @param {Record<number, string>|string[]} pal
 */
export function valueHex(v, pal) {
  if (typeof v === 'number') return v > 0 && isHex(pal[v]) ? pal[v].toLowerCase() : null;
  return isHex(v) ? v.toLowerCase() : null;
}

/** Automatik: leer → `cur`, sonst nächste Stufe der Farbfamilie (siehe oben). */
function autoShader(pal, sign, cur) {
  return v => {
    if (v === 0) return cur;
    if (typeof v === 'number') return paletteStep(pal, v, sign, AUTO_STEP) ?? v;
    return isHex(v) ? shiftHex(v, sign, AUTO_STEP) : v;
  };
}

/**
 * Rechner für einen Strich: Pixelwert → Wert eine Stufe weiter. Liegt die
 * Zielfarbe in der Palette, kommt ihre Nummer heraus (die erste mit diesem
 * Hex), sonst der Hex-Wert als freie Farbe. Leere Reihe → Automatik.
 * @param {Record<number, string>|string[]} pal
 * @param {string[]} ramp  in Mal-Reihenfolge (erste = für leere Pixel)
 * @param {1|-1} sign  -1 die Reihe entlang (Linksklick), +1 andersherum;
 *   ohne Reihe: -1 dunkler, +1 heller
 * @param {number|string} [cur]  aktuelle Farbe — nur die Automatik malt
 *   damit in leere Pixel
 * @returns {(v: number|string) => number|string}
 */
export function makeShader(pal, ramp, sign, cur = 0) {
  if (!ramp.length) return autoShader(pal, sign, cur);
  const order = sign < 0 ? ramp : [...ramp].reverse();
  const pos = new Map(order.map((h, i) => [h, i]));
  /** @type {Map<string, number>} */
  const idx = new Map();
  for (const k of Object.keys(pal)) {
    const i = Number(k);
    const h = i > 0 && isHex(pal[i]) ? pal[i].toLowerCase() : null;
    if (h && !idx.has(h)) idx.set(h, i);
  }
  // Leerer Pixel: dort beginnt die Reihe.
  const first = idx.get(order[0]) ?? order[0];
  return v => {
    if (v === 0) return first;
    const h = valueHex(v, pal);
    if (!h) return v;
    const i = pos.get(h);
    if (i == null || i + 1 >= order.length) return v;
    const target = order[i + 1];
    return idx.get(target) ?? target;
  };
}

// ── Verlauf ──────────────────────────────────────────────────────────
// Mit „Verlauf" (state.shadeSoft) wird der Pinsel rund und weich: in der
// Mitte geht es mehrere Stufen weiter, zum Rand hin immer weniger, ganz
// außen eine. Innerhalb eines Strichs zählt je Pixel die höchste Stufe,
// die er erreicht hat — wer über dieselbe Stelle fährt, verstärkt nicht.

/** So viele Stufen geht die Mitte im Automatik-Modus (ohne Reihe). */
export const AUTO_LEVELS = 3;

/**
 * Stufen für einen Pixel im Abstand (dx, dy) zur Pinselmitte.
 * 0 = liegt außerhalb des runden Pinsels.
 * @param {number} dx
 * @param {number} dy
 * @param {number} size  Pinselgröße (Durchmesser in Pixeln)
 * @param {number} levels  Stufen in der Mitte (mindestens 1)
 */
export function softLevel(dx, dy, size, levels) {
  const r = (size - 1) / 2;
  const d = Math.hypot(dx, dy);
  if (d > r + 0.5) return 0;
  return Math.max(1, Math.ceil(levels * (1 - d / (r + 1))));
}

/**
 * Stufen in der Mitte: so viele, wie die Reihe von leer bis zur letzten
 * Farbe braucht; ohne Reihe AUTO_LEVELS.
 * @param {string[]} ramp
 */
export function rampLevels(ramp) {
  return ramp.length ? ramp.length : AUTO_LEVELS;
}

// ── Gedrückt halten ──────────────────────────────────────────────────
// Hält man still, geht es Stufe um Stufe weiter — erst langsam, dann
// immer schneller: jede Pause ist um HOLD_FACTOR kürzer als die vorige,
// aber nie kürzer als HOLD_MIN_MS. Eine Bewegung beginnt wieder bei 0.

export const HOLD_FIRST_MS = 350;
export const HOLD_FACTOR = 0.7;
export const HOLD_MIN_MS = 60;

/**
 * Wartezeit vor dem Schritt Nummer `n` (0 = erster Schritt nach dem Ansetzen).
 * @param {number} n
 */
export function holdDelay(n) {
  return Math.max(HOLD_MIN_MS, HOLD_FIRST_MS * HOLD_FACTOR ** n);
}

// ── Abstufungen erzeugen ─────────────────────────────────────────────
// Aus einer Farbe eine passende Reihe machen: `n` dunklere und `n` hellere
// Töne dazu — so, wie man es in Pixel-Art von Hand macht: Schatten etwas
// kühler, Licht etwas wärmer (light.js shiftHex). Jeder Schritt baut auf
// dem vorigen auf, der Farbton wandert also mit. Graue bleiben grau.

/** So weit liegt ein Ton vom nächsten (Helligkeit 0..1). */
export const SHADE_GEN_STEP = 0.12;

/**
 * @param {string} hex  Grundfarbe "#rrggbb"
 * @param {number} [n]  wie viele Töne je Seite
 * @returns {string[]}  hell → dunkel (Mal-Reihenfolge), mit der Grundfarbe
 *   in der Mitte; ohne Doppelte (ganz nah an Schwarz oder Weiß fallen
 *   Stufen zusammen)
 */
export function makeShades(hex, n = 2) {
  if (!isHex(hex)) return [];
  const out = [hex.toLowerCase()];
  let dark = hex, light = hex;
  for (let k = 0; k < n; k++) {
    dark = shiftHex(dark, -1, SHADE_GEN_STEP);
    light = shiftHex(light, 1, SHADE_GEN_STEP);
    out.unshift(dark);
    out.push(light);
  }
  return sortRamp(out);
}
