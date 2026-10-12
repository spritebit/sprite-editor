// ════════════════════════════════════════════════════════════════════
// RECOLOR — eine Farbe überall durch eine andere ersetzen
// ════════════════════════════════════════════════════════════════════
// „Farbe ersetzen“ im Panel „Feinschliff“: jede Stelle mit der alten Farbe
// bekommt die neue — im aktuellen Bild, auf der Ebene in allen Frames oder
// im ganzen Sprite. Verglichen wird nach der FARBE, nicht nach der Nummer:
// eine freie Farbe ("#rrggbb"), die genauso aussieht wie Palettenfarbe 3,
// wird mit ersetzt. Leer (0) ersetzt nur leere Stellen.
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/recolor.test.js).
// Die Desktop-Version rechnet genauso (spritebit-rs, recolor.rs).
import { cellToColor } from './data.js';

/** @typedef {'cel' | 'layer' | 'all'} RecolorScope */
export const RECOLOR_SCOPES = /** @type {RecolorScope[]} */ (['cel', 'layer', 'all']);

/** Vergleichsschlüssel eines Pixels: Farbe in Kleinbuchstaben, leer = ''. */
function key(v, pal) {
  if (v === 0) return '';
  const hex = cellToColor(v, pal);
  return hex ? hex.toLowerCase() : 'n' + v; // unbekannte Nummer: nur sich selbst gleich
}

/**
 * In `grid` jede Stelle mit der Farbe von `from` auf `to` setzen.
 * @param {any[][]} grid
 * @param {any} from   Pixelwert der alten Farbe (Nummer, "#rrggbb" oder 0)
 * @param {any} to     Pixelwert der neuen Farbe
 * @param {Record<number,string>} pal  Palette, in der die Nummern gelten
 * @param {(x:number, y:number) => boolean} [keep]  nur Stellen, für die das stimmt (Auswahl)
 * @returns {number} wie viele Pixel sich geändert haben
 */
export function replaceColor(grid, from, to, pal, keep) {
  const want = key(from, pal);
  let n = 0;
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const v = row[x];
      if (v === to || key(v, pal) !== want) continue;
      if (keep && !keep(x, y)) continue;
      row[x] = to;
      n++;
    }
  }
  return n;
}

/**
 * Die Bilder, in denen ersetzt wird. Verknüpfte Zellen kommen nur einmal vor.
 * 'cel' = aktuelles Bild, 'layer' = die Ebene in allen Frames,
 * 'all' = jede Ebene in jedem Frame außer gesperrten.
 * @param {{frames: {cels: any[][][]}[], layers: {locked?: boolean}[], frame: number, layer: number}} sp
 * @param {RecolorScope} scope
 */
export function recolorTargets(sp, scope) {
  if (scope === 'cel') return [sp.frames[sp.frame].cels[sp.layer]];
  const out = new Set();
  for (const f of sp.frames) {
    f.cels.forEach((g, l) => {
      if (scope === 'layer' ? l === sp.layer : !sp.layers[l]?.locked) out.add(g);
    });
  }
  return [...out];
}
