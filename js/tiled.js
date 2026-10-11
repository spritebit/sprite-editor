// ════════════════════════════════════════════════════════════════════
// TILED — Kachelmodus: das Bild ringsum wiederholt, Malen läuft über den Rand
// ════════════════════════════════════════════════════════════════════
// Für nahtlose Muster (Boden, Wand, Wasser): Neben dem Bild stehen Kopien,
// waagerecht, senkrecht oder in beide Richtungen. Wer über den Rand hinaus
// malt, malt auf der anderen Seite weiter — so passen die Kanten von selbst
// zusammen. Malen geht auch direkt auf den Kopien.
//
// state.tiled: 'off' | 'x' (nebeneinander) | 'y' (übereinander) | 'both'.
// Gezeichnet wird in js/render.js, die Zeiger kommen aus js/app.js.
//
// Reine Rechnung, ohne DOM — läuft unter Node (tests/tiled.test.js).

/** @typedef {'off' | 'x' | 'y' | 'both'} TiledMode */

export const TILED_MODES = /** @type {TiledMode[]} */ (['off', 'both', 'x', 'y']);

/** In welche Richtungen wird wiederholt? */
export function tiledAxes(mode) {
  return { x: mode === 'x' || mode === 'both', y: mode === 'y' || mode === 'both' };
}

/** `v` auf 0 … n−1 zurückholen — auch von weit links (negativ). */
export function wrap(v, n) {
  return ((v % n) + n) % n;
}

/**
 * Punkt (x, y) ins Bild W × H holen: auf den wiederholten Achsen
 * herumgeführt, auf den anderen unverändert (dort fällt er ggf. heraus).
 * @returns {[number, number]}
 */
export function wrapPoint(x, y, W, H, mode) {
  const a = tiledAxes(mode);
  return [a.x ? wrap(x, W) : x, a.y ? wrap(y, H) : y];
}

/**
 * Wie weit reicht die Fläche auf einer Achse? Mit Kacheln eine Kopie auf
 * jeder Seite: −n … 2n−1, sonst 0 … n−1.
 * @returns {[number, number]}  kleinster und größter Wert
 */
export function axisRange(n, tiled) {
  return tiled ? [-n, 2 * n - 1] : [0, n - 1];
}
