// ════════════════════════════════════════════════════════════════════
// SELCOMBINE — Auswahlen zusammenlegen: hinzufügen und abziehen
// ════════════════════════════════════════════════════════════════════
// Mit Umschalt kommt eine neue Auswahl zur bestehenden dazu, mit Strg wird
// sie von ihr abgezogen (js/selection.js). Eine Auswahl ist wie überall
// { rect, mask }: rect die Bounding-Box in Grid-Zellen, mask null (volles
// Rechteck) oder boolean[h][w] relativ zu rect.
//
// Das Ergebnis wird auf seinen Inhalt zugeschnitten; ist es ein volles
// Rechteck, fällt die Maske weg. Bleibt nichts übrig, kommt null zurück.
//
// Reine Rechnung, ohne DOM — läuft unter Node (tests/selcombine.test.js).

/** @typedef {{x: number, y: number, w: number, h: number}} Rect */
/** @typedef {{rect: Rect, mask: boolean[][] | null}} Sel */

/** Liegt die Grid-Zelle (gx, gy) in der Auswahl? */
export function selHas(sel, gx, gy) {
  if (!sel) return false;
  const { x, y, w, h } = sel.rect;
  const lx = gx - x, ly = gy - y;
  if (lx < 0 || ly < 0 || lx >= w || ly >= h) return false;
  return !sel.mask || !!sel.mask[ly]?.[lx];
}

/**
 * @param {Sel | null} a  die bestehende Auswahl
 * @param {Sel} b         die neu gezogene
 * @param {'add'|'sub'} op
 * @returns {Sel | null}
 */
export function combineSel(a, b, op) {
  if (!a) return op === 'add' ? copySel(b) : null;
  // Abziehen kann nichts außerhalb von a erzeugen — die Box von a reicht.
  const box = op === 'add' ? unionRect(a.rect, b.rect) : a.rect;
  const mask = [];
  for (let y = 0; y < box.h; y++) {
    const row = [];
    for (let x = 0; x < box.w; x++) {
      const gx = box.x + x, gy = box.y + y;
      const inA = selHas(a, gx, gy), inB = selHas(b, gx, gy);
      row.push(op === 'add' ? inA || inB : inA && !inB);
    }
    mask.push(row);
  }
  return trimSel(box, mask);
}

function copySel(s) {
  return { rect: { ...s.rect }, mask: s.mask ? s.mask.map(r => r.slice()) : null };
}

function unionRect(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

// Auf den Inhalt zuschneiden; volles Rechteck → Maske null; leer → null.
function trimSel(box, mask) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
    if (!mask[y][x]) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  const rect = { x: box.x + minX, y: box.y + minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  const cut = [];
  let full = true;
  for (let y = minY; y <= maxY; y++) {
    const row = mask[y].slice(minX, maxX + 1);
    if (full && row.includes(false)) full = false;
    cut.push(row);
  }
  return { rect, mask: full ? null : cut };
}
