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

// ════════════════════════════════════════════════════════════════════
// Vorlagen — aus einem Bild eine Bewegung rechnen
// ════════════════════════════════════════════════════════════════════
// Eine Vorlage sagt für jeden Augenblick der Bewegung, wo jedes Körperteil
// steht: um wie viele Pixel verschoben und um wie viel Grad gedreht.
//
//   pose(p, s) → { armFront: { dx, dy, rot }, … }
//
// `p` läuft von 0 bis 1 durch die ganze Bewegung, `s` ist die Stärke (1 =
// normal). Was nicht genannt wird, bleibt stehen. Aus einer Vorlage werden
// beliebig viele Frames: man fragt sie an n gleichmäßig verteilten Stellen.
// So hängt die Bildzahl am Nutzer und nicht an der Vorlage.
//
// ── Zwei Entscheidungen, die man dem Ergebnis ansieht ──
//
// 1. JEDES TEIL DREHT UM SEIN EIGENES GELENK, es gibt keine Hierarchie. Der
//    Kopf hängt also nicht am Rumpf. Darum drehen die eingebauten Vorlagen
//    den RUMPF NIE — er wird nur verschoben, sonst stünde der Kopf daneben.
//    Gedreht werden Arme, Beine, Waffe und ein wenig der Kopf.
//
// 2. HOCH UND RUNTER GILT FÜR DIE GANZE FIGUR. Beim Laufen hebt sich der
//    Körper in der Mitte des Schritts — mitsamt den Beinen. Streng genommen
//    müsste der aufgesetzte Fuß stehen bleiben; das ginge nur, indem man ihn
//    neu zeichnet. Lieber eine Figur, die einen Pixel rutscht, als eine, die
//    an der Hüfte aufreißt.
//
// Das Ergebnis ist ein Rohentwurf, an dem man von Hand weiterarbeitet —
// genau dafür liegen die Frames danach in der Timeline.

/** Eine Stellung eines Teils: Versatz in Pixeln, Drehung in Grad. */
/** @typedef {{dx: number, dy: number, rot: number}} Pose */

/** Lineare Fahrt durch Stützwerte: seg(0.5, [0, 10, 0]) === 10. */
export function seg(p, stops) {
  const n = stops.length - 1;
  const x = Math.max(0, Math.min(1, p)) * n;
  const i = Math.min(n - 1, Math.floor(x));
  return stops[i] + (stops[i + 1] - stops[i]) * (x - i);
}

// Pixel werden ganz gezählt, Grad auf Zehntel — Drehungen rechnet
// transformPart ohnehin in Fließkomma weiter.
// `+ 0` macht aus der negativen Null eine gewöhnliche: Math.round(-0.2) ist
// -0, und das stolpert später über jeden Vergleich und jeden Speicherstand.
const px = v => Math.round(v) + 0;
const deg = v => Math.round(v * 10) / 10 + 0;

// Ein Versatz, den der OBERKÖRPER gegen die Beine macht (eine Neigung nach
// vorn), reißt die Figur an der Hüfte auf — Teile sind starr, da wächst
// nichts nach. Ein Pixel liest sich noch als Neigung, zwei als Bruch.
const lean = v => Math.max(-1, Math.min(1, px(v)));

// Gegenrichtung. Das `+ 0` wieder gegen die negative Null: -0 ist das
// Ergebnis von -(0), und das reicht, damit zwei gleiche Posen als
// verschieden gelten.
const neg = v => -v + 0;

/** Dieselbe Stellung für mehrere Rollen. */
function all(roles, pose) {
  return Object.fromEntries(roles.map(r => [r, pose]));
}

const LIMBS = ['armBack', 'armFront', 'legBack', 'legFront'];
const BODY = ['head', 'torso', 'armBack', 'armFront', 'weapon'];

/**
 * Die eingebauten Vorlagen. `frames` ist nur der Vorschlag für die Bildzahl;
 * `loop` sagt, ob die Bewegung rundläuft (Laufen) oder einmal abläuft
 * (Sprung, Schlag) — davon hängt ab, wie die Stellen verteilt werden.
 */
export const TEMPLATES = {
  // Atmen im Stand: Brust und Kopf gehen einen Pixel auf und ab.
  idle: {
    frames: 4,
    loop: true,
    pose: (p, s) => {
      // Die GANZE Figur atmet mit demselben Versatz. Ginge der Kopf allein
      // einen Pixel hoch, klaffte am Hals eine Lücke — die Teile sind starr.
      const body = { dx: 0, dy: px(0.6 * s * Math.sin(2 * Math.PI * p)), rot: 0 };
      return { ...all(BODY, body), legFront: body, legBack: body };
    },
  },

  // Laufen: Arme und Beine im Gegentakt, der Körper hebt sich zur Mitte
  // jedes Schritts. Eine volle Runde sind zwei Schritte.
  walk: {
    frames: 8,
    loop: true,
    pose: (p, s) => {
      const a = 2 * Math.PI * p;
      // Hoch und runter geht DOPPELT so schnell wie die Schritte — einmal je
      // Schritt. Und zwar als volle Welle, nicht als Betrag: kurz nach dem
      // Aufsetzen ist der Körper am tiefsten, kurz davor am höchsten. Ein
      // Betrag wäre um die Spitze herum spiegelgleich, und dann käme bei
      // sechs oder acht Frames zweimal hintereinander dasselbe Bild heraus.
      const bob = { dx: 0, dy: px(0.7 * s * Math.sin(2 * a)), rot: 0 };
      const swing = (amp, phase) => ({ ...bob, rot: deg(amp * s * Math.sin(a + phase)) });
      return {
        ...all(BODY, bob),
        legFront: swing(26, 0),
        legBack: swing(26, Math.PI),
        armFront: swing(-18, 0),
        armBack: swing(-18, Math.PI),
        weapon: swing(-18, 0),
      };
    },
  },

  // Laufen auf vier Beinen — Hund, Katze, Pferd.
  //
  // Es gibt keine eigenen Rollen dafür: die beiden VORDERBEINE bekommen „Arm
  // vorne“ und „Arm hinten“, die Hinterbeine „Bein vorne“ und „Bein hinten“
  // („vorne/hinten“ heißt hier näher und ferner zum Betrachter). Das klingt
  // schief, trägt aber genau, was gebraucht wird: vier Glieder in zwei
  // Paaren.
  //
  // Gangart ist der Trab, und damit laufen die Beine ÜBER KREUZ: das nahe
  // Vorderbein mit dem fernen Hinterbein, das ferne Vorderbein mit dem nahen
  // Hinterbein. Anders als beim Zweibeiner schwingen alle vier gleich weit —
  // ein Hund mit kurz trippelnden Vorderbeinen sieht lahm aus. Der Rücken
  // wippt nur wenig, der Kopf bleibt fast ruhig: er trägt sich selbst.
  walkQuad: {
    frames: 8,
    loop: true,
    pose: (p, s) => {
      const a = 2 * Math.PI * p;
      // Kräftig genug, um wirklich einen Pixel zu wandern: tut es das nicht,
      // sind die Frames nur noch die Beinwinkel — und die sind um die Spitze
      // herum spiegelgleich, es käme zweimal dasselbe Bild heraus.
      const bob = { dx: 0, dy: px(0.7 * s * Math.sin(2 * a)), rot: 0 };
      const swing = phase => ({ ...bob, rot: deg(30 * s * Math.sin(a + phase)) });
      return {
        head: bob,
        torso: bob,
        weapon: bob,
        armFront: swing(0),            // nahes Vorderbein
        legBack: swing(0),             // fernes Hinterbein — mit ihm im Takt
        armBack: swing(Math.PI),       // fernes Vorderbein
        legFront: swing(Math.PI),      // nahes Hinterbein
      };
    },
  },

  // Rennen: dieselbe Mechanik, größere Ausschläge, und die Figur lehnt sich
  // nach vorn — als Versatz, nicht als Drehung (siehe oben, Punkt 1).
  run: {
    frames: 8,
    loop: true,
    pose: (p, s) => {
      const a = 2 * Math.PI * p;
      const dy = px(1.2 * s * Math.sin(2 * a)); // wie beim Laufen, nur kräftiger
      const fwd = lean(1.2 * s);                 // Oberkörper nach vorn
      const swing = (amp, phase, dx) => ({ dx, dy, rot: deg(amp * s * Math.sin(a + phase)) });
      return {
        head: { dx: fwd, dy, rot: 0 },
        torso: { dx: fwd, dy, rot: 0 },
        legFront: swing(42, 0, 0),
        legBack: swing(42, Math.PI, 0),
        armFront: swing(-32, 0, fwd),
        armBack: swing(-32, Math.PI, fwd),
        weapon: swing(-32, 0, fwd),
      };
    },
  },

  // Sprung in einem Durchlauf: ducken, abstoßen, steigen, oben, fallen,
  // aufkommen. Die Beine ziehen erst an und strecken sich dann.
  jump: {
    frames: 6,
    loop: false,
    pose: (p, s) => {
      const dy = px(seg(p, [0, 2, -2, -3, -1, 1]) * s);
      const body = { dx: 0, dy, rot: 0 };
      const legRot = deg(seg(p, [0, -12, 22, 18, 6, 0]) * s);
      const armRot = deg(seg(p, [0, 18, -30, -26, -10, 0]) * s);
      return {
        ...all(BODY, body),
        legFront: { dx: 0, dy, rot: legRot },
        legBack: { dx: 0, dy, rot: neg(legRot) },
        armFront: { dx: 0, dy, rot: armRot },
        armBack: { dx: 0, dy, rot: armRot },
        weapon: { dx: 0, dy, rot: armRot },
      };
    },
  },

  // Schlag: ausholen (zurück), treffen (weit vor), nachschwingen, zurück.
  // Die Waffe macht die Bewegung des vorderen Arms mit.
  attack: {
    frames: 5,
    loop: false,
    pose: (p, s) => {
      const armRot = deg(seg(p, [0, -48, 58, 70, 12]) * s);
      const dx = lean(seg(p, [0, -1, 2, 1, 0]) * s);
      const body = { dx, dy: 0, rot: 0 };
      return {
        head: body,
        torso: body,
        legFront: { dx: 0, dy: 0, rot: 0 },
        legBack: { dx: 0, dy: 0, rot: 0 },
        armFront: { dx, dy: 0, rot: armRot },
        weapon: { dx, dy: 0, rot: armRot },
        armBack: { dx, dy: 0, rot: deg(seg(p, [0, 18, -14, -10, 0]) * s) },
      };
    },
  },

  // Treffer: die Figur wird zurückgestoßen, der Kopf kippt, die Arme fliegen
  // hoch — und alles federt zurück.
  hit: {
    frames: 4,
    loop: false,
    pose: (p, s) => {
      const dx = px(seg(p, [0, -3, -2, 0]) * s);
      const armRot = deg(seg(p, [0, 16, 10, 0]) * s);
      return {
        head: { dx, dy: 0, rot: deg(seg(p, [0, -10, -5, 0]) * s) },
        torso: { dx, dy: 0, rot: 0 },
        legFront: { dx, dy: 0, rot: deg(seg(p, [0, -8, -4, 0]) * s) },
        legBack: { dx, dy: 0, rot: deg(seg(p, [0, 8, 4, 0]) * s) },
        armFront: { dx, dy: 0, rot: armRot },
        armBack: { dx, dy: 0, rot: armRot },
        weapon: { dx, dy: 0, rot: armRot },
      };
    },
  },

  // Tod: die Figur sackt zusammen. Umkippen wäre eine Drehung der ganzen
  // Figur — die kann es ohne Hierarchie nicht geben (siehe oben, Punkt 1),
  // darum sinkt sie, der Kopf neigt sich, Arme und Beine geben nach.
  death: {
    frames: 6,
    loop: false,
    pose: (p, s) => {
      const dy = px(seg(p, [0, 0, 1, 2, 3, 4]) * s);
      const body = { dx: 0, dy, rot: 0 };
      const armRot = deg(seg(p, [0, 8, 18, 30, 40, 46]) * s);
      // Der Kopf sinkt dem Rumpf immer ein Stück VORAUS — er rutscht damit in
      // die Schultern statt vom Hals abzuheben. Überlappen ist harmlos, der
      // Kopf liegt oben; eine Lücke wäre es nicht.
      const legRot = deg(seg(p, [0, 5, 12, 20, 27, 32]) * s);
      return {
        head: { dx: 0, dy: px(seg(p, [0, 1, 2, 3, 4, 5]) * s), rot: deg(seg(p, [0, -6, -14, -24, -32, -36]) * s) },
        torso: body,
        legFront: { dx: 0, dy, rot: neg(legRot) },
        legBack: { dx: 0, dy, rot: legRot },
        armFront: { dx: 0, dy, rot: armRot },
        armBack: { dx: 0, dy, rot: armRot },
        weapon: { dx: 0, dy, rot: armRot },
      };
    },
  },
};

/** Die Namen der Vorlagen, in der Reihenfolge fürs Panel. */
export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

/** Stillstand — was eine Vorlage nicht nennt. */
export const REST = { dx: 0, dy: 0, rot: 0 };

/**
 * Die Stellungen für n Frames: je Frame eine Zuordnung Rolle → Pose.
 *
 * Rundlaufende Bewegungen werden bei 0, 1/n, 2/n … abgefragt — die Stelle 1
 * wäre wieder 0 und ergäbe einen doppelten Frame. Einmalige Bewegungen
 * laufen dagegen von 0 bis 1 durch, damit auch das Ende dabei ist.
 */
export function buildPoses(name, n = 0, strength = 1) {
  const tpl = TEMPLATES[name];
  if (!tpl) return [];
  const count = Math.max(2, Math.min(64, Math.round(n) || tpl.frames));
  const last = tpl.loop ? count : count - 1;
  return Array.from({ length: count }, (_, i) => tpl.pose(i / last, strength));
}

/**
 * Ein Teil verschieben und um sein Gelenk drehen — auf einer Fläche
 * derselben Größe. Gerechnet wird rückwärts (für jedes Zielpixel die Quelle
 * suchen) mit nächstem Nachbarn, wie überall sonst im Editor: es entstehen
 * keine Mischfarben, jede Zelle behält ihren Palette-Index. Positive Grad
 * drehen im Uhrzeigersinn, wie bei der freien Drehung (transform.js).
 *
 * Was über den Rand gerät, fällt weg — die Zeichenfläche wächst nicht mit.
 */
export function transformPart(cel, pivot, { dx = 0, dy = 0, rot = 0 } = {}) {
  const H = cel.length, W = cel[0].length;
  if (!dx && !dy && !rot) return cel.map(row => [...row]);
  const out = cel.map(row => row.map(() => 0));
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Von der Zielmitte zurück: erst den Versatz abziehen, dann um das
      // Gelenk zurückdrehen — das ist die Quellkoordinate.
      const tx = x + 0.5 - dx - pivot.x, ty = y + 0.5 - dy - pivot.y;
      const sx = Math.floor(tx * cos + ty * sin + pivot.x);
      const sy = Math.floor(-tx * sin + ty * cos + pivot.y);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      out[y][x] = cel[sy][sx];
    }
  }
  return out;
}

/**
 * Einen Frame bauen: jede Ebene des Grundframes in ihre Stellung bringen.
 * Ebenen ohne Rolle (Hintergrund, Schatten) werden unverändert übernommen —
 * als DASSELBE Bild, damit sie in allen erzeugten Frames verknüpft bleiben
 * und nicht n-mal im Speicher liegen.
 *
 * @param {any[][][]} base    Zellen des Grundframes, je Ebene
 * @param {any[]} layers      die Ebenen des Sprites (für `part`)
 * @param {Record<string, Pose>} pose
 */
export function buildFrame(base, layers, pose) {
  return base.map((cel, i) => {
    const part = layers[i]?.part;
    if (!part) return cel;
    const p = pose[part.role] || REST;
    return transformPart(cel, part.pivot, p);
  });
}

/**
 * Die ganze Bewegung: aus einem Grundframe n fertige Frames.
 * Gibt nur die Zellen zurück — wohin sie kommen und wie der Tag heißt,
 * entscheidet der Aufrufer (js/layers.js, später das Erzeugen-Fenster).
 */
export function buildFrames(base, layers, name, n = 0, strength = 1) {
  return buildPoses(name, n, strength).map(pose => buildFrame(base, layers, pose));
}
