// ════════════════════════════════════════════════════════════════════
// LANDING-PAINT — Abschnitt 01 der Startseite: das Raster zum Ausprobieren
// ════════════════════════════════════════════════════════════════════
// Farbe wählen, klicken oder ziehen (Rechtsklick radiert). Zu Beginn steht
// Bitty, das Maskottchen (js/bitty.js), als Beispiel darin. Immer in der
// Palette „Eis“ — die Knöpfe in Abschnitt 02 färben nur die Skizze.
// Speichert nichts; „Im Editor weitermalen“ trägt das Bild im Link mit.
import { PALETTES, startLink } from './landing-shared.js';

const N = 16;
const PAL = 'eis';
const board = /** @type {HTMLCanvasElement|null} */ (document.getElementById('try-canvas'));
if (board) initPaint(board);

/** @param {HTMLCanvasElement} board */
function initPaint(board) {
  const colors = PALETTES[PAL];
  const cells = new Uint8Array(N * N);
  let color = 3, erasing = false;

  const SAMPLE = window.Bitty ? window.Bitty.FRAMES.idle : [];
  const loadSample = () => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const c = SAMPLE[y] ? SAMPLE[y].charAt(x) : '.';
      cells[y * N + x] = c === '.' ? 0 : Number(c);
    }
  };

  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const draw = () => {
    const ctx = board.getContext('2d');
    if (!ctx) return;
    const cell = 24, size = N * cell;
    board.width = size; board.height = size;
    // Schachbrett = transparent
    const a = css('--surface-3') || '#1d2c4a', b = css('--surface-4') || '#283a5c';
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = cells[y * N + x];
      ctx.fillStyle = v ? colors[v - 1] : ((x + y) % 2 ? a : b);
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < N; i++) {
      ctx.moveTo(i * cell + 0.5, 0); ctx.lineTo(i * cell + 0.5, size);
      ctx.moveTo(0, i * cell + 0.5); ctx.lineTo(size, i * cell + 0.5);
    }
    ctx.stroke();
  };

  // ── Farben ──
  const swatches = [];
  const swBox = document.getElementById('try-swatches');
  if (swBox) {
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'try-sw';
      b.setAttribute('aria-label', String(i));
      b.addEventListener('click', () => { color = i; setErase(false); });
      swBox.appendChild(b);
      swatches.push(b);
    }
  }
  const syncSwatches = () => swatches.forEach((b, i) => {
    b.style.background = colors[i];
    b.setAttribute('aria-pressed', String(!erasing && color === i + 1));
  });

  const eraseBtn = document.getElementById('try-erase');
  const setErase = on => {
    erasing = on;
    eraseBtn?.setAttribute('aria-pressed', String(on));
    syncSwatches();
  };
  eraseBtn?.addEventListener('click', () => setErase(!erasing));

  const cta = /** @type {HTMLAnchorElement|null} */ (document.querySelector('#malen a[href^="editor.html"]'));
  const render = () => {
    draw();
    syncSwatches();
    if (cta) cta.href = startLink(cells, PAL);
  };
  document.getElementById('try-clear')?.addEventListener('click', () => { cells.fill(0); render(); });
  document.getElementById('try-sample')?.addEventListener('click', () => { loadSample(); render(); });

  // ── Malen ──
  let down = false, rightBtn = false, last = -1;
  const cellAt = e => {
    const r = board.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * N);
    const y = Math.floor(((e.clientY - r.top) / r.height) * N);
    return x < 0 || y < 0 || x >= N || y >= N ? -1 : y * N + x;
  };
  const paint = e => {
    const i = cellAt(e);
    if (i < 0 || i === last) return;
    last = i;
    cells[i] = erasing || rightBtn ? 0 : color;
    render();
  };
  board.addEventListener('pointerdown', e => {
    e.preventDefault();
    down = true; rightBtn = e.button === 2; last = -1;
    try { board.setPointerCapture(e.pointerId); } catch { /* egal */ }
    paint(e);
  });
  board.addEventListener('pointermove', e => { if (down) paint(e); });
  const up = () => { down = false; last = -1; };
  board.addEventListener('pointerup', up);
  board.addEventListener('pointercancel', up);
  board.addEventListener('contextmenu', e => e.preventDefault());

  // ── Bitty neben dem Raster: hüpft bei Klick ──
  const bittyEl = /** @type {HTMLCanvasElement|null} */ (document.getElementById('bitty-hi'));
  const bitty = bittyEl && window.Bitty ? window.Bitty.mount(bittyEl, { palette: colors }) : null;
  if (bitty) bittyEl.addEventListener('click', () => bitty.hop());

  loadSample();
  render();
}
