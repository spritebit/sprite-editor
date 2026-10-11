// ════════════════════════════════════════════════════════════════════
// LANDING-SHARED — was die beiden Demos der Startseite gemeinsam haben
// ════════════════════════════════════════════════════════════════════
// js/landing-paint.js (Abschnitt 01, Mal-Raster) und js/landing-sketch.js
// (Abschnitt 02, Skizze → Pixel-Art).

/** Nummer → Rolle: 1 Kontur · 2 Schatten · 3 Grund · 4 Licht · 5 Glanz */
export const PALETTES = {
  wald:  ['#1b2a1e', '#2f5a33', '#5d9642', '#9cc75a', '#e8f5b0'],
  abend: ['#24142e', '#6b3f6a', '#c26b56', '#f0a35e', '#ffe1a8'],
  eis:   ['#14213d', '#2d4870', '#6ea8fe', '#a9d1ff', '#f2f8ff'],
  grau:  ['#141414', '#4a4a4a', '#8a8a8a', '#c4c4c4', '#ffffff'],
};

/**
 * „Im Editor weitermalen“ nimmt das Bild mit — im Hash, nicht im Speicher:
 *   editor.html#start=eis.14213d,…,f2f8ff.0011…[.skizze]
 * Palettenname, ihre 5 Farben, dann N×N Ziffern 0–5 Zeile für Zeile; der
 * Editor legt daraus einen Sprite an (js/fromstart.js). Leeres Bild → nur
 * der Editor.
 * @param {ArrayLike<number>} px
 * @param {keyof PALETTES} name
 * @param {string} [tag]  z. B. '.skizze' — der Sprite heißt dann so
 */
export function startLink(px, name, tag = '') {
  for (let i = 0; i < px.length; i++) {
    if (px[i]) return `editor.html#start=${name}.${PALETTES[name].join(',').replace(/#/g, '')}.${Array.prototype.join.call(px, '')}${tag}`;
  }
  return 'editor.html';
}
