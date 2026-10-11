// ════════════════════════════════════════════════════════════════════
// SHADE — Schattieren wie in Aseprite: Pixel eine Stufe heller/dunkler
// ════════════════════════════════════════════════════════════════════
// Man wählt eine Farbreihe (state.shadeRamp, Hex-Werte) — z. B. vier
// Rottöne. Das Werkzeug malt nicht mit der aktuellen Farbe, sondern schiebt
// jeden Pixel, über den es fährt, eine Stufe in der Reihe weiter:
// Linksklick heller, Rechtsklick dunkler. Pixel, deren Farbe nicht in der
// Reihe steht, bleiben, wie sie sind; am Ende der Reihe passiert nichts.
// Pro Strich ändert sich jeder Pixel höchstens einmal (render.js
// paintShade merkt sich die berührten Zellen).
//
// Anders als in Aseprite zählt nicht die Reihenfolge in der Palette: die
// Reihe ist immer nach Helligkeit sortiert. So stimmen „heller" und
// „dunkler", egal wie die Palette geordnet ist.
//
// Die Reihe speichert Hex-Werte statt Nummern — sie überlebt so das
// Umsortieren der Palette und gilt auch für freie Farben im Bild.
//
// Reine Rechnung, ohne DOM — läuft unter Node (tests/shade.test.js).

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

/**
 * Rechner für einen Strich: Pixelwert → Wert eine Stufe weiter. Liegt die
 * Zielfarbe in der Palette, kommt ihre Nummer heraus (die erste mit diesem
 * Hex), sonst der Hex-Wert als freie Farbe.
 * @param {Record<number, string>|string[]} pal
 * @param {string[]} ramp  sortiert (normalizeRamp)
 * @param {1|-1} sign  +1 heller, -1 dunkler
 * @returns {(v: number|string) => number|string}
 */
export function makeShader(pal, ramp, sign) {
  const pos = new Map(ramp.map((h, i) => [h, i]));
  /** @type {Map<string, number>} */
  const idx = new Map();
  for (const k of Object.keys(pal)) {
    const i = Number(k);
    const h = i > 0 && isHex(pal[i]) ? pal[i].toLowerCase() : null;
    if (h && !idx.has(h)) idx.set(h, i);
  }
  return v => {
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
