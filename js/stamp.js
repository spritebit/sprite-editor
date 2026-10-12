// ════════════════════════════════════════════════════════════════════
// STAMP — eigener Pinsel aus einer Auswahl (wie Strg+B in Aseprite)
// ════════════════════════════════════════════════════════════════════
// Strg+B macht aus dem Inhalt der Auswahl einen Pinsel. Stift, Pinsel und
// Radierer setzen dann diese Form: in ihren eigenen Farben oder — mit
// „Aktuelle Farbe“ — einfarbig. Leere Stellen der Form malen nicht; der
// Radierer löscht genau die Form.
//
// Der Zeiger liegt wie beim eckigen Pinsel in der Mitte: Versatz
// -floor((w-1)/2) bzw. -floor((h-1)/2) zur linken oberen Ecke.
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/stamp.test.js).
// Die Desktop-Version rechnet genauso (spritebit-rs, core::stamp).

/** @typedef {{w: number, h: number, cells: any[][]}} Stamp */

/**
 * Pinsel aus Pixeln einer Auswahl. Was außerhalb der Form (mask) liegt,
 * zählt als leer; leere Ränder werden abgeschnitten.
 * @param {any[][]} cells  Pixel im Rechteck der Auswahl (0 = leer)
 * @param {boolean[][] | number[][] | null} [mask]  Form der Auswahl, null = ganzes Rechteck
 * @returns {Stamp | null}  null, wenn nichts darin ist
 */
export function makeStamp(cells, mask = null) {
  const H = cells.length, W = cells[0]?.length || 0;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  const at = (x, y) => (mask && !mask[y][x]) ? 0 : cells[y][x];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at(x, y) === 0) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const out = [];
  for (let y = y0; y <= y1; y++) {
    const row = [];
    for (let x = x0; x <= x1; x++) row.push(at(x, y));
    out.push(row);
  }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, cells: out };
}

/** Linke obere Ecke des Pinsels, wenn der Zeiger auf (x, y) steht. */
export function stampOrigin(stamp, x, y) {
  return { x: x - Math.floor((stamp.w - 1) / 2), y: y - Math.floor((stamp.h - 1) / 2) };
}

/**
 * Die Pixel, die der Pinsel auf (x, y) setzt: [px, py, Wert].
 * `color` statt der eigenen Farben (einfarbig, auch 0 = radieren), sonst undefined.
 * @param {Stamp} stamp
 * @param {number} x
 * @param {number} y
 * @param {any} [color]
 * @returns {[number, number, any][]}
 */
export function stampCells(stamp, x, y, color) {
  const o = stampOrigin(stamp, x, y);
  /** @type {[number, number, any][]} */
  const out = [];
  for (let sy = 0; sy < stamp.h; sy++) for (let sx = 0; sx < stamp.w; sx++) {
    const v = stamp.cells[sy][sx];
    if (v === 0) continue;
    out.push([o.x + sx, o.y + sy, color === undefined ? v : color]);
  }
  return out;
}
