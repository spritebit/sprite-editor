// ════════════════════════════════════════════════════════════════════
// RIG — Körperteile einer Figur: Rolle und Gelenk je Ebene
// ════════════════════════════════════════════════════════════════════
// Hat man eine Figur mit „Auswahl in eine eigene Ebene“ (layers.js) in Kopf,
// Rumpf, Arme und Beine zerlegt, fehlen noch zwei Angaben je Teil, bevor ein
// Rechner daraus eine Bewegung machen kann:
//
//   role   welches Körperteil das ist — ein Arm schwingt anders als ein Kopf
//   pivot  wo es angewachsen ist: die Schulter, die Hüfte, der Hals
//
// Beides hängt an der EBENE (`layer.part`), nicht am Sprite: so wandert es
// beim Kopieren, Sortieren und Löschen von selbst mit, steckt in jedem
// Undo-Schnappschuss (history.js vergleicht die Ebenen als Ganzes) und landet
// im Speicherstand, ohne dass das Dateiformat etwas Neues bräuchte.
//
// Das Gelenk zählt in GITTERKANTEN, nicht in Zellen: 0 ist die linke Kante
// der ersten Spalte, 1 die Grenze zur zweiten, die Mitte der ersten Spalte
// liegt bei 0,5. So lässt sich eine Schulter auch zwischen zwei Pixel legen —
// bei 16 px breiten Figuren macht genau das den Unterschied — und es passt
// zur Rückwärts-Abbildung beim Drehen (transform.js rotateCells).
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/rig.test.js). Die
// Bedienung steckt im Ebenen-Panel (layers.js), das Malen des Gelenks in
// app.js.

/**
 * Die Rollen, in der Reihenfolge, in der sie im Panel stehen. Gedacht ist
 * die Seitenansicht: „hinten“ und „vorne“ sind die beiden Arme bzw. Beine,
 * von denen beim Laufen das hintere verdeckt wird (meist eine Stufe dunkler).
 * @type {readonly string[]}
 */
export const PART_ROLES = ['head', 'torso', 'armBack', 'armFront', 'legBack', 'legFront', 'weapon'];

/** Teil-Angaben einer Ebene kopieren (state.js copyLayer). */
export const copyPart = p => (p ? { role: p.role, pivot: { x: p.pivot.x, y: p.pivot.y } } : null);

/**
 * Teil-Angaben aus einem Speicherstand prüfen. Unbekannte Rolle, fehlendes
 * oder unsinniges Gelenk → null, die Ebene ist dann einfach kein Körperteil.
 * Das Gelenk darf am Rand liegen (0 und W/H sind Kanten), aber nicht daneben.
 */
export function normalizePart(p, W, H) {
  if (!p || !PART_ROLES.includes(p.role)) return null;
  const x = Number(p.pivot?.x), y = Number(p.pivot?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    role: p.role,
    pivot: { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) },
  };
}

/**
 * Das Rechteck um alles, was in einer Zelle gemalt ist — oder null, wenn
 * sie leer ist. x1/y1 sind die LETZTE gefüllte Spalte bzw. Zeile.
 * @returns {{x0:number,y0:number,x1:number,y1:number} | null}
 */
export function contentBox(cel) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < cel.length; y++) {
    const row = cel[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * Ein brauchbares Gelenk zu einer frisch vergebenen Rolle raten, damit man
 * nicht für jedes Teil klicken muss. Immer waagerecht in der Mitte des Teils;
 * senkrecht da, wo das Teil am Körper hängt:
 *
 *   Arme und Beine   OBEN — Schulter und Hüfte
 *   Kopf und Rumpf   UNTEN — Hals und Hüftlinie
 *   Waffe            UNTEN — der Griff steckt in der Hand
 *
 * Leere Zelle → null; dann setzt man das Gelenk von Hand.
 * @returns {{x:number,y:number} | null}
 */
export function autoPivot(cel, role) {
  const b = contentBox(cel);
  if (!b) return null;
  const top = role === 'armBack' || role === 'armFront' || role === 'legBack' || role === 'legFront';
  return { x: (b.x0 + b.x1 + 1) / 2, y: top ? b.y0 : b.y1 + 1 };
}

/** Die Ebenen eines Sprites, die ein Körperteil sind — von unten nach oben. */
export function rigParts(sp) {
  return sp.layers
    .map((l, i) => (l.part ? { i, role: l.part.role, pivot: l.part.pivot, name: l.name } : null))
    .filter(Boolean);
}

/** Ist aus den Ebenen überhaupt eine Figur zusammengesetzt? */
export const hasRig = sp => sp.layers.some(l => l.part);
