// ════════════════════════════════════════════════════════════════════
// LANDING-SKETCH — Abschnitt 02 der Startseite: Skizze → Pixel-Art
// ════════════════════════════════════════════════════════════════════
// Eine Beispiel-Skizze oder ein eigenes Bild (laden oder auf den Abschnitt
// ziehen) wird zu Pixel-Art — die Rechnung steht in js/sketch.js. Größe und
// Palette per Knopf. Nichts wird hochgeladen; „Im Editor weitermalen“ trägt
// das Ergebnis im Link mit.
import { PALETTES, startLink } from './landing-shared.js';
import { sketchToPixels } from './sketch.js';

const PAPER = '#f4efe3';
/** Kantenlänge der Arbeitsfläche, auf die jedes Bild eingepasst wird. */
const WORK = 256;

const srcCv = /** @type {HTMLCanvasElement|null} */ (document.getElementById('sketch-src'));
const outCv = /** @type {HTMLCanvasElement|null} */ (document.getElementById('sketch-out'));
if (srcCv && outCv) initSketch(srcCv, outCv);

/**
 * @param {HTMLCanvasElement} srcCv
 * @param {HTMLCanvasElement} outCv
 */
function initSketch(srcCv, outCv) {
  const cta = /** @type {HTMLAnchorElement|null} */ (document.getElementById('sketch-cta'));
  let size = 32;
  /** @type {keyof PALETTES} */
  let pal = 'eis';
  /** @type {{ img: CanvasImageSource, w: number, h: number } | null} */
  let source = null;
  let result = new Uint8Array(0);

  const setSource = (img, w, h) => {
    source = { img, w, h };
    const ctx = srcCv.getContext('2d');
    if (ctx) {
      const S = srcCv.width, k = Math.min(S / w, S / h);
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, S, S);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (S - w * k) / 2, (S - h * k) / 2, w * k, h * k);
    }
    convert();
  };

  // Bild auf die Arbeitsfläche einpassen, dann rechnen (js/sketch.js).
  const convert = () => {
    if (!source) return;
    const work = document.createElement('canvas');
    work.width = WORK; work.height = WORK;
    const wc = work.getContext('2d', { willReadFrequently: true });
    if (!wc) return;
    wc.fillStyle = '#ffffff';
    wc.fillRect(0, 0, WORK, WORK);
    const k = Math.min(WORK / source.w, WORK / source.h);
    const dw = source.w * k, dh = source.h * k;
    const area = { ox: (WORK - dw) / 2, oy: (WORK - dh) / 2, dw, dh };
    wc.imageSmoothingQuality = 'high';
    wc.drawImage(source.img, area.ox, area.oy, dw, dh);
    result = sketchToPixels(wc.getImageData(0, 0, WORK, WORK).data, WORK, area, size);
    draw();
  };

  const draw = () => {
    if (!result.length) return;
    const N = size;
    outCv.width = N; outCv.height = N;
    const ctx = outCv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, N, N);
    for (let i = 0; i < N * N; i++) {
      if (!result[i]) continue;
      ctx.fillStyle = PALETTES[pal][result[i] - 1];
      ctx.fillRect(i % N, (i / N) | 0, 1, 1);
    }
    if (cta) cta.href = startLink(result, pal, '.skizze');
  };

  const loadFile = file => {
    if (!file || !/^image\//.test(file.type)) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { setSource(img, img.naturalWidth || 1, img.naturalHeight || 1); URL.revokeObjectURL(url); };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };
  const loadSample = () => {
    const cv = sampleSketch();
    setSource(cv, cv.width, cv.height);
  };

  // ── Bedienung ──
  const fileInp = /** @type {HTMLInputElement|null} */ (document.getElementById('sketch-file'));
  fileInp?.addEventListener('change', () => {
    if (fileInp.files?.[0]) loadFile(fileInp.files[0]);
    fileInp.value = '';
  });
  document.getElementById('sketch-sample')?.addEventListener('click', loadSample);

  const sizeBtns = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.sketch-sizes [data-size]'));
  sizeBtns.forEach(b => b.addEventListener('click', () => {
    size = Number(b.dataset.size) || 32;
    sizeBtns.forEach(o => o.setAttribute('aria-pressed', String(Number(o.dataset.size) === size)));
    convert();
  }));

  // Paletten-Knöpfe: Farbchips einsetzen, Klick färbt die Skizze um.
  const palBtns = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.pal-btn'));
  const syncPal = () => palBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pal === pal)));
  palBtns.forEach(b => {
    const chips = b.querySelector('.pal-chips');
    for (const c of PALETTES[b.dataset.pal] || []) {
      const i = document.createElement('i');
      i.style.background = c;
      chips?.appendChild(i);
    }
    b.addEventListener('click', () => {
      if (PALETTES[b.dataset.pal]) pal = /** @type {keyof PALETTES} */ (b.dataset.pal);
      syncPal();
      draw();
    });
  });

  // Bild einfach auf den Abschnitt ziehen
  const zone = document.querySelector('.sketch');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('is-drop'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-drop'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('is-drop');
      const dt = /** @type {DragEvent} */ (e).dataTransfer;
      if (dt?.files?.[0]) loadFile(dt.files[0]);
    });
  }

  syncPal();
  loadSample();
}

// Die Beispiel-Skizze: ein Pilz mit Punkten und Augen, mit Bleistift-
// Zittern gezeichnet — Zufall mit festem Startwert, sieht immer gleich aus.
function sampleSketch() {
  const W = 480, cv = document.createElement('canvas');
  cv.width = W; cv.height = W;
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, W);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  ctx.strokeStyle = 'rgba(52, 48, 44, 0.9)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Ein Strich zweimal, leicht versetzt — wie mit der Hand.
  const stroke = (pts, w) => {
    for (let pass = 0; pass < 2; pass++) {
      ctx.lineWidth = w + rnd() * 1.5;
      ctx.beginPath();
      pts.forEach(([px, py], i) => {
        const x = px + rnd() * 3, y = py + rnd() * 3;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
  };
  const arc = (cx, cy, rx, ry, a0, a1) => Array.from({ length: 41 }, (_, i) => {
    const a = a0 + (a1 - a0) * i / 40;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
  stroke(arc(240, 236, 176, 150, Math.PI, 2 * Math.PI), 8);   // Hut oben
  stroke(arc(240, 226, 176, 26, 0, Math.PI), 8);               // Hutrand
  stroke([[176, 250], [168, 330], [164, 404]], 8);             // Stiel links
  stroke([[304, 250], [312, 330], [318, 404]], 8);             // Stiel rechts
  stroke(arc(241, 404, 77, 18, 0, Math.PI), 8);                // Stiel unten
  stroke(arc(170, 160, 30, 26, 0, 2 * Math.PI), 7);            // Punkte
  stroke(arc(286, 124, 36, 30, 0, 2 * Math.PI), 7);
  stroke(arc(356, 196, 22, 20, 0, 2 * Math.PI), 7);
  ctx.fillStyle = 'rgba(52, 48, 44, 0.9)';
  for (const [x, y] of [[214, 318], [268, 318]]) {             // Augen
    ctx.beginPath(); ctx.ellipse(x, y, 8, 12, 0, 0, 2 * Math.PI); ctx.fill();
  }
  return cv;
}
