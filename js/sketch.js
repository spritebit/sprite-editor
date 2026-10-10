// ════════════════════════════════════════════════════════════════════
// SKETCH — aus einer Zeichnung (oder einem Foto) wird Pixel-Art
// ════════════════════════════════════════════════════════════════════
// Die Rechnung hinter Abschnitt 02 der Startseite (js/landing-sketch.js).
// Reine Rechnung ohne DOM — läuft unter Node (tests/sketch.test.js).
//
// Eingabe ist eine quadratische Arbeitsfläche W×W (RGBA), auf die das Bild
// eingepasst wurde; `area` sagt, wo es darauf liegt. Ausgabe sind size×size
// Nummern 0–5 (0 = durchsichtig), passend zu den Paletten der Startseite:
// 1 Kontur · 2 Schatten · 3 Grund · 4 Licht · 5 Glanz.
//
// 1. Helligkeit je Pixel; „Papier“ ist der helle, „Tinte“ der dunkle Rand
//    der Verteilung.
// 2. Auf den Bereich mit Tinte zuschneiden (quadratisch, etwas Rand).
// 3. Je Zelle: wie viel davon Tinte ist. Viel → Kontur (1).
// 4. Was vom Rand aus erreichbar ist, bleibt durchsichtig; eingeschlossene
//    Flächen füllen sich (3), mit Licht oben links (4), Schatten unten
//    rechts (2) und kleinen Inseln als Glanz (5).
//    Ist fast alles Tinte (ein Foto statt einer Skizze), gibt es statt
//    dessen fünf Helligkeitsstufen.

/**
 * @param {Uint8ClampedArray | Uint8Array | number[]} rgba  W×W Pixel, 4 Werte je Pixel
 * @param {number} W  Kantenlänge der Arbeitsfläche
 * @param {{ ox: number, oy: number, dw: number, dh: number }} area  wo das Bild liegt
 * @param {number} size  Kantenlänge des Ergebnisses
 * @returns {Uint8Array} size×size Nummern 0–5, Zeile für Zeile
 */
export function sketchToPixels(rgba, W, area, size) {
  const { ox, oy, dw, dh } = area;
  const onImage = (x, y) => x >= ox && x < ox + dw && y >= oy && y < oy + dh;
  const lum = new Float32Array(W * W);
  const sorted = [];
  for (let i = 0; i < W * W; i++) {
    lum[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    if (onImage(i % W, (i / W) | 0)) sorted.push(lum[i]);
  }
  sorted.sort((a, b) => a - b);
  const paper = sorted[Math.floor(sorted.length * 0.9)] || 255;
  const inkL = sorted[Math.floor(sorted.length * 0.02)] || 0;
  const span = Math.max(24, paper - inkL);
  const cut = paper - span * 0.4;

  let minX = W, minY = W, maxX = -1, maxY = -1, inkN = 0;
  for (let i = 0; i < W * W; i++) {
    if (lum[i] >= cut) continue;
    inkN++;
    const x = i % W, y = (i / W) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const photo = inkN > sorted.length * 0.45;
  if (maxX < 0 || photo) { minX = ox; minY = oy; maxX = ox + dw - 1; maxY = oy + dh - 1; }
  let side = Math.max(maxX - minX, maxY - minY) + 1;
  side = Math.min(W, Math.ceil(side * (photo ? 1 : 1.1)));
  const bx = (minX + maxX) / 2 - side / 2, by = (minY + maxY) / 2 - side / 2;
  const N = size, cell = side / N;

  // Innen oder außen? In voller Auflösung entscheiden — dort sind die
  // Striche durchgehend. Tinte um 2 px verdickt schließt kleine Lücken,
  // dann vom Rand aus über das Papier fluten.
  const fat = new Uint8Array(W * W), out = new Uint8Array(W * W);
  for (let i = 0; i < W * W; i++) {
    if (lum[i] >= cut) continue;
    const ix = i % W, iy = (i / W) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const qx = ix + dx, qy = iy + dy;
      if (qx >= 0 && qy >= 0 && qx < W && qy < W) fat[qy * W + qx] = 1;
    }
  }
  const st = [];
  for (let i = 0; i < W; i++) st.push(i, (W - 1) * W + i, i * W, i * W + W - 1);
  while (st.length) {
    const q = st.pop();
    if (out[q] || fat[q]) continue;
    out[q] = 1;
    const qx = q % W;
    if (qx > 0) st.push(q - 1);
    if (qx < W - 1) st.push(q + 1);
    if (q >= W) st.push(q - W);
    if (q < W * W - W) st.push(q + W);
  }

  const inside = new Uint8Array(N * N), px = new Uint8Array(N * N);
  const line = new Uint8Array(N * N), cover = new Float32Array(N * N);
  for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
    const x1 = Math.floor(bx + gx * cell), x2 = Math.floor(bx + (gx + 1) * cell);
    const y1 = Math.floor(by + gy * cell), y2 = Math.floor(by + (gy + 1) * cell);
    let n = 0, ink = 0, sum = 0, inn = 0, onImg = 0;
    for (let yy = Math.max(0, y1); yy < Math.min(W, Math.max(y2, y1 + 1)); yy++) {
      for (let xx = Math.max(0, x1); xx < Math.min(W, Math.max(x2, x1 + 1)); xx++) {
        const l = lum[yy * W + xx];
        n++; sum += l;
        if (l < cut) ink++;
        if (!out[yy * W + xx]) inn++;
        if (onImage(xx, yy)) onImg++;
      }
    }
    const j = gy * N + gx;
    inside[j] = n && inn / n > 0.5 ? 1 : 0;
    if (photo) {
      if (onImg * 2 < n) continue;                // Rand ums Foto: durchsichtig
      const t = n ? (sum / n - inkL) / span : 1;   // 0 dunkel … 1 hell
      px[j] = Math.max(1, Math.min(5, 1 + Math.floor(t * 5)));
    } else if (n) {
      cover[j] = ink / n;
    }
  }
  if (!photo) {
    // Kontur, wo ein Strich die Zelle gut füllt: gemessen an den am
    // dichtesten getroffenen Zellen — so bleibt die Linie bei 16 wie bei
    // 32 Pixeln etwa eine Zelle dick, egal wie breit der Stift war.
    const hits = [];
    for (let j = 0; j < N * N; j++) if (cover[j] > 0.02) hits.push(cover[j]);
    hits.sort((a, b) => a - b);
    const peak = hits[Math.floor(hits.length * 0.9)] || 0;
    const need = Math.max(0.06, peak * 0.5);
    for (let j = 0; j < N * N; j++) if (cover[j] >= need) { line[j] = 1; px[j] = 1; }
    fillInside(px, line, inside, N);
  }
  return px;
}

// Eingeschlossene Flächen füllen. `inside`: Zellen innerhalb einer
// geschlossenen Kontur.
function fillInside(px, line, inside, N) {
  const outside = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) outside[i] = inside[i] ? 0 : 1;
  // Kontur schließen: eine Innen-Zelle, die außen anstößt, wird Kontur —
  // sonst blitzen dort, wo die Linie zwischen zwei Zellen lag, Lücken auf.
  const edge = [];
  for (let i = 0; i < N * N; i++) {
    if (outside[i] || line[i]) continue;
    const x = i % N;
    if (x === 0 || x === N - 1 || i < N || i >= N * N - N
        || (outside[i - 1] && !line[i - 1]) || (outside[i + 1] && !line[i + 1])
        || (outside[i - N] && !line[i - N]) || (outside[i + N] && !line[i + N])) edge.push(i);
  }
  for (const i of edge) { line[i] = 1; px[i] = 1; }
  // Eingeschlossene Flächen einzeln — kleine werden Glanz.
  const region = new Int32Array(N * N).fill(-1), sizes = [];
  let inner = 0;
  for (let i = 0; i < N * N; i++) {
    if (outside[i] || line[i] || region[i] >= 0) continue;
    const id = sizes.length;
    let count = 0;
    const stack = [i];
    while (stack.length) {
      const j = stack.pop();
      if (j < 0 || j >= N * N || outside[j] || line[j] || region[j] >= 0) continue;
      region[j] = id; count++;
      const x = j % N;
      if (x > 0) stack.push(j - 1);
      if (x < N - 1) stack.push(j + 1);
      stack.push(j - N, j + N);
    }
    sizes.push(count);
    inner += count;
  }
  const isLine = (j, ok) => ok && line[j] === 1;
  for (let i = 0; i < N * N; i++) {
    if (region[i] < 0) continue;
    if (sizes[region[i]] < Math.max(2, inner * 0.06)) { px[i] = 5; continue; }
    const x = i % N;
    const lit = isLine(i - N, i >= N) || isLine(i - 1, x > 0);
    const dark = isLine(i + N, i < N * N - N) || isLine(i + 1, x < N - 1);
    px[i] = lit && !dark ? 4 : dark && !lit ? 2 : 3;
  }
}
