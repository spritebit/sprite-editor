// ════════════════════════════════════════════════════════════════════
// BRUSHSHAPE — Pinselform: eckig oder rund
// ════════════════════════════════════════════════════════════════════
// Pinsel, Radierer und Schattieren malen ein Quadrat in Pinselgröße — oder,
// mit state.brushRound, einen Kreis. Der Kreis ist so gerastert, wie man
// ihn in Pixel-Art von Hand setzen würde: 1 und 2 px bleiben voll, 3 px
// ist ein Plus, ab 4 px fehlen die Ecken, 5 px ist ein runder Fleck.
//
// Die Pixel des Pinsels liegen wie beim Quadrat bei Versatz lo..hi um den
// Zeiger (render.js paintBrush): lo = -floor((n-1)/2), hi = floor(n/2).
// Bei gerader Größe liegt die Mitte also zwischen zwei Pixeln.
//
// Reine Rechnung, ohne DOM — läuft unter Node (tests/brushshape.test.js).
// Dieselbe Regel steht in spritebit-rs (tools.rs in_round).

/**
 * Gehört der Pixel mit Versatz (dx, dy) zum runden Pinsel der Größe `size`?
 * @param {number} dx  -floor((size-1)/2) … floor(size/2)
 * @param {number} dy
 * @param {number} size
 */
export function inRound(dx, dy, size) {
  const lo = -Math.floor((size - 1) / 2);
  const mid = lo + (size - 1) / 2;
  const r = (size - 1) / 2;
  const x = dx - mid, y = dy - mid;
  // Etwas mehr als r²: sonst würden die Kreise eckig-dünn (bei 5 px fehlten
  // die Pixel neben den Spitzen). 0,8·r trifft die Formen, die man kennt.
  return x * x + y * y <= r * r + 0.8 * r;
}
