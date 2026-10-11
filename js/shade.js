// ════════════════════════════════════════════════════════════════════
// SHADE — Schattieren: ein Stift, der mit jedem Strich dunkler wird
// ════════════════════════════════════════════════════════════════════
// Man wählt eine Farbreihe (state.shadeRamp, Hex-Werte) — z. B. vier
// Rottöne. Dann ist das Werkzeug ein Stift, der sich durch die Reihe
// arbeitet (Richtung „dunkler", Standard für Linksklick):
//   leerer Pixel          → die hellste Farbe der Reihe
//   Farbe aus der Reihe   → eine Stufe dunkler, an der dunkelsten Schluss
//   andere Farbe          → bleibt (z. B. die Umrisslinie)
// Richtung „heller" (Rechtsklick) genau andersherum: leer → dunkelste,
// dann jeweils eine Stufe heller. Pro Strich ändert sich jeder Pixel
// höchstens einmal (render.js paintShade merkt sich die berührten Zellen);
// wer dunkler will, setzt neu an und malt drüber.
//
// Anders als in Aseprite zählt nicht die Reihenfolge in der Palette: die
// Reihe ist immer nach Helligkeit sortiert. So stimmen „heller" und
// „dunkler", egal wie die Palette geordnet ist.
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
 * Doppelte, von dunkel nach hell.
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
  return out.sort((a, b) => luma(a) - luma(b) || (a < b ? -1 : 1));
}

/**
 * Farbe in die Reihe aufnehmen oder wieder herausnehmen.
 * @param {string[]} ramp
 * @param {string} hex
 * @returns {string[]} neue, sortierte Reihe
 */
export function toggleRamp(ramp, hex) {
  if (!isHex(hex)) return normalizeRamp(ramp);
  const h = hex.toLowerCase();
  const cur = normalizeRamp(ramp);
  return cur.includes(h) ? cur.filter(c => c !== h) : normalizeRamp([...cur, h]);
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
 * @param {string[]} ramp  sortiert (normalizeRamp)
 * @param {1|-1} sign  +1 heller, -1 dunkler
 * @param {number|string} [cur]  aktuelle Farbe — nur die Automatik malt
 *   damit in leere Pixel
 * @returns {(v: number|string) => number|string}
 */
export function makeShader(pal, ramp, sign, cur = 0) {
  if (!ramp.length) return autoShader(pal, sign, cur);
  const pos = new Map(ramp.map((h, i) => [h, i]));
  /** @type {Map<string, number>} */
  const idx = new Map();
  for (const k of Object.keys(pal)) {
    const i = Number(k);
    const h = i > 0 && isHex(pal[i]) ? pal[i].toLowerCase() : null;
    if (h && !idx.has(h)) idx.set(h, i);
  }
  // Leerer Pixel: dort beginnt die Reihe — dunkler fängt hell an, heller dunkel.
  const start = ramp[sign < 0 ? ramp.length - 1 : 0];
  const first = idx.get(start) ?? start;
  return v => {
    if (v === 0) return first;
    const h = valueHex(v, pal);
    if (!h) return v;
    const i = pos.get(h);
    if (i == null) return v;
    const j = i + sign;
    if (j < 0 || j >= ramp.length) return v;
    const target = ramp[j];
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
