// ════════════════════════════════════════════════════════════════════
// FILL — Füllen mit Grenzen aus einem Vorlagebild
// ════════════════════════════════════════════════════════════════════
// Normales Füllen sieht nur die bemalte Ebene. Mit „Grenzen: alle Ebenen“
// (state.fillVisible) bestimmt das, was man SIEHT (flatGrid), wo die
// Fläche endet — gemalt wird trotzdem in die aktive Ebene. So malt man
// eine Vorlage, die auf einer eigenen Ebene liegt, Fläche für Fläche aus
// (wie „Sample: All Layers“ in Aseprite).
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/fill.test.js).
// Die Desktop-Version rechnet genauso (spritebit-rs, tools::flood_fill_ref).

/**
 * Zusammenhängende Fläche gleicher Werte in `ref` ab (sx, sy) finden und in
 * `grid` mit `value` füllen. `ref` darf dasselbe Bild wie `grid` sein.
 * @returns {number} wie viele Pixel sich in `grid` geändert haben
 */
export function fillRegion(grid, ref, sx, sy, value) {
  const H = grid.length, W = grid[0]?.length || 0;
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return 0;
  const target = ref[sy][sx];
  // Gleiches Bild und schon die Farbe: nichts zu tun (sonst endlos).
  if (ref === grid && target === value) return 0;
  const seen = new Uint8Array(W * H);
  const stack = [sx, sy];
  let n = 0;
  while (stack.length) {
    const y = /** @type {number} */ (stack.pop()), x = /** @type {number} */ (stack.pop());
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x;
    if (seen[i] || ref[y][x] !== target) continue;
    seen[i] = 1;
    if (grid[y][x] !== value) { grid[y][x] = value; n++; }
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return n;
}

/**
 * Wie fillRegion(), aber nicht zusammenhängend („Zusammenhängend“ aus):
 * JEDE Stelle, die in `ref` den Wert unter (sx, sy) hat, bekommt `value` —
 * auch getrennte Flächen. So färbt ein Klick eine Farbe im ganzen Bild um.
 * @returns {number} wie viele Pixel sich in `grid` geändert haben
 */
export function fillAll(grid, ref, sx, sy, value) {
  const H = grid.length, W = grid[0]?.length || 0;
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return 0;
  const target = ref[sy][sx];
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (ref[y][x] === target && grid[y][x] !== value) { grid[y][x] = value; n++; }
  }
  return n;
}
