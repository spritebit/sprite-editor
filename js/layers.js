// ════════════════════════════════════════════════════════════════════
// LAYERS — Ebenen: anlegen, ordnen, ein-/ausblenden, sperren, Deckkraft
// ════════════════════════════════════════════════════════════════════
// Jede Ebene hat in jedem Frame ihr eigenes Bild (state.js: frames[].cels).
// Gemalt wird immer in die aktive Ebene — über sp.grid, die Werkzeuge
// wissen davon nichts. Angezeigt und exportiert wird, was man sieht: alle
// sichtbaren Ebenen übereinander (flatGrid).
//
// Die Liste im Panel zeigt die oberste Ebene oben. Alle Änderungen laufen
// durch recordOp() und sind Undo-Schritte; nur das Wählen der aktiven Ebene
// ist keine Änderung.
import { state, getSprite, getPaletteByName, clearSelection, defaultLayer, blankLike, sampleGrid, copyLayer, flatGrid, isLinked } from './state.js';
import { blankMask, bakeMask, maskedCel } from './mask.js';
import { dc, cellToColor } from './data.js';
import { renderAll, renderEditor, renderCallbacks } from './render.js';
import { recordOp, beginStroke, commitStroke } from './history.js';
import { commitFloat, isFloating, selectionPixels, takeSelection, stampCells } from './selection.js';
import { PART_ROLES, autoPivot, rigParts, hasRig } from './rig.js';
import { saveState } from './storage.js';
import { stop as stopPlayback } from './frames.js';
import { showInfoToast } from './toast.js';
import { iconSvg } from './icons.js';
import { gridToCanvas } from './raster.js';
import { t, onLangChange } from './i18n.js';

/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);
const THUMB = 28;

function leave() {
  stopPlayback();
  commitFloat();
  clearSelection();
}

// Struktur ändern (neu, löschen, zusammenführen, verschieben).
function edit(fn) {
  const sp = getSprite();
  if (!sp) return;
  leave();
  recordOp(() => fn(sp));
  renderAll();
  saveState();
}

// Nur Eigenschaften (sichtbar, gesperrt, Name) — die Auswahl bleibt.
function meta(fn) {
  const sp = getSprite();
  if (!sp) return;
  recordOp(() => fn(sp));
  renderAll();
  saveState();
}

// Freier Name "Ebene N" — oder nach einem anderen Muster ("Teil N").
function freshName(sp, key = 'ly.name') {
  const taken = new Set(sp.layers.map(l => l.name));
  let n = sp.layers.length + 1;
  while (taken.has(t(key, { n }))) n++;
  return n;
}

export function setActiveLayer(i) {
  const sp = getSprite();
  if (!sp || i === sp.layer || i < 0 || i >= sp.layers.length) return;
  leave();
  sp.layer = i;
  if (!sp.layers[i].mask) state.maskEdit = false;
  renderAll();
  saveState();
}

export function addLayer() {
  edit(sp => {
    const at = sp.layer + 1;
    sp.layers.splice(at, 0, defaultLayer(freshName(sp)));
    sp.frames.forEach(f => f.cels.splice(at, 0, blankLike(f.cels[0])));
    sp.layer = at;
  });
}

export function duplicateLayer() {
  edit(sp => {
    const at = sp.layer + 1;
    const src = sp.layers[sp.layer];
    sp.layers.splice(at, 0, { ...copyLayer(src), name: t('ly.copyName', { name: src.name }) });
    // Verknüpfte Zellen der Vorlage sind in der Kopie wieder verknüpft.
    const memo = new Map();
    sp.frames.forEach(f => {
      const g = f.cels[sp.layer];
      if (!memo.has(g)) memo.set(g, dc(g));
      f.cels.splice(at, 0, memo.get(g));
    });
    sp.layer = at;
  });
}

// ── Auswahl → eigene Ebene ───────────────────────────────────────────
// Der ausgewählte Teil wird aus der aktiven Ebene HERAUSGENOMMEN und sitzt
// danach allein in einer neuen Ebene darüber, an genau derselben Stelle.
// Damit zerlegt man eine fertig gezeichnete Figur in Kopf, Rumpf, Arme und
// Beine — die Voraussetzung dafür, die Teile einzeln zu bewegen.
//
// Nur im aktuellen Frame: man zerlegt ein Bild, nicht eine Animation. Teilt
// die Quellzelle ihr Bild mit anderen Frames (verknüpft), wird sie für diesen
// Frame zuerst gelöst — sonst fehlte das Teil überall.
export function layerFromSelection() {
  const sp = getSprite();
  if (!sp) return;
  if (state.maskEdit) { showInfoToast(t('ly.notInMask')); return; }
  const src = sp.layers[sp.layer];
  if (src.locked) { showInfoToast(t('ly.lockedInfo', { name: src.name })); return; }

  // Leere Auswahl: nichts anfassen, sonst entstünde eine leere Ebene.
  const peek = selectionPixels();
  if (!peek) { showInfoToast(t('ly.needSel')); return; }
  if (!peek.cells.some(row => row.some(v => v !== 0))) { showInfoToast(t('ly.partEmpty')); return; }

  // Nicht edit(): das setzt schwebenden Inhalt ab und hebt die Auswahl auf,
  // bevor hier etwas passieren könnte — beides brauchen wir noch.
  stopPlayback();
  let moved = 0;
  recordOp(() => {
    const from = sp.layer, fr = sp.frames[sp.frame];
    // Verknüpfung nur für diesen Frame lösen — vor dem Herausnehmen.
    if (!isFloating() && isLinked(sp, sp.frame, from)) fr.cels[from] = dc(fr.cels[from]);
    const part = takeSelection();
    const at = from + 1;
    sp.layers.splice(at, 0, { ...defaultLayer(), name: t('ly.partName', { n: freshName(sp, 'ly.partName') }) });
    sp.frames.forEach(f => f.cels.splice(at, 0, blankLike(f.cels[from])));
    moved = stampCells(fr.cels[at], part.cells, part.x, part.y);
    sp.layer = at;
  });
  clearSelection();
  renderAll();
  saveState();
  showInfoToast(t('ly.partDone', { n: moved }));
}

export function deleteLayer() {
  const sp = getSprite();
  if (!sp) return;
  if (sp.layers.length < 2) { showInfoToast(t('ly.lastLayer')); return; }
  edit(s => {
    s.layers.splice(s.layer, 1);
    s.frames.forEach(f => f.cels.splice(s.layer, 1));
    s.layer = Math.min(s.layer, s.layers.length - 1);
  });
}

// Aktive Ebene in die darunter einrechnen — in jedem Frame. Mit voller
// Deckkraft überschreibt sie einfach; halbdurchsichtig wird über einer
// Farbe gemischt (freie Farbe), über leerem Grund bleibt sie deckend.
export function mergeDown() {
  const sp = getSprite();
  if (!sp) return;
  if (sp.layer === 0) { showInfoToast(t('ly.nothingBelow')); return; }
  edit(s => {
    const top = s.layer, below = top - 1;
    const a = s.layers[top].opacity;
    const pal = getPaletteByName(s.palette);
    // Verknüpfte Zellen: dasselbe Paar (oben, unten) ergibt dasselbe neue,
    // wieder geteilte Bild. Ein geteiltes Bild unten, über dem in jedem
    // Frame etwas anderes liegt, wird dagegen je Frame eigenständig.
    const done = new Map();
    for (const f of s.frames) {
      const raw = f.cels[top];
      const src = maskedCel(s.layers[top], raw); // was die Maske ausblendet, kommt nicht mit
      const pair = done.get(raw) || new Map();
      done.set(raw, pair);
      if (pair.has(f.cels[below])) { f.cels[below] = pair.get(f.cels[below]); f.cels.splice(top, 1); continue; }
      const dst = dc(f.cels[below]);
      pair.set(f.cels[below], dst);
      f.cels[below] = dst;
      for (let y = 0; y < dst.length; y++) for (let x = 0; x < dst[y].length; x++) {
        const v = src[y][x];
        if (v === 0) continue;
        if (a >= 1 || dst[y][x] === 0) { dst[y][x] = a >= 1 ? v : (cellToColor(v, pal) || '#000000').toLowerCase(); continue; }
        const tc = cellToColor(v, pal), bc = cellToColor(dst[y][x], pal);
        if (!tc || !bc) { dst[y][x] = v; continue; }
        const ch = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
        const mix = i => Math.round(ch(bc, i) * (1 - a) + ch(tc, i) * a).toString(16).padStart(2, '0');
        dst[y][x] = '#' + mix(0) + mix(1) + mix(2);
      }
      f.cels.splice(top, 1);
    }
    s.layers.splice(top, 1);
    s.layer = below;
    state.maskEdit = false;
  });
}

// ── Körperteil (rig.js): Rolle und Gelenk ────────────────────────────
// Eine Rolle zu vergeben setzt gleich ein brauchbares Gelenk — oben in der
// Mitte bei Armen und Beinen, unten bei Kopf, Rumpf und Waffe. Das stimmt
// bei den meisten gezeichneten Figuren; sitzt es daneben, setzt man es mit
// „Gelenk“ von Hand. „—“ macht die Ebene wieder zu einer gewöhnlichen.
export function setPartRole(role) {
  const sp = getSprite();
  if (!sp) return;
  meta(s => {
    const L = s.layers[s.layer];
    if (!PART_ROLES.includes(role)) { L.part = null; return; }
    const pivot = L.part?.pivot || autoPivot(s.frames[s.frame].cels[s.layer], role)
      || { x: s.grid[0].length / 2, y: s.grid.length / 2 };
    L.part = { role, pivot };
  });
  if (!role) state.pivotPick = false;
  renderLayers();
  renderEditor();
}

/** Gelenk-Modus: der nächste Klick auf die Fläche setzt das Gelenk. */
export function togglePivotPick() {
  const sp = getSprite();
  if (!sp?.layers[sp.layer].part) return;
  state.pivotPick = !state.pivotPick;
  if (state.pivotPick) showInfoToast(t('rig.pivotHint'));
  renderLayers();
  renderEditor();
}

/** Aus app.js, wenn im Gelenk-Modus auf die Fläche geklickt wird. */
export function setPivotAt(x, y) {
  const sp = getSprite();
  const L = sp?.layers[sp.layer];
  if (!L?.part) return;
  const W = sp.grid[0].length, H = sp.grid.length;
  meta(s => {
    s.layers[s.layer].part.pivot = {
      x: Math.max(0, Math.min(W, x)),
      y: Math.max(0, Math.min(H, y)),
    };
  });
  state.pivotPick = false;
  renderLayers();
  renderEditor();
}

// Die Gelenke aller Körperteile über das Bild zeichnen — der aktive Ring
// kräftig, die übrigen blass, damit man sieht, wie die Figur zusammenhängt.
function drawPivots(ctx, _W, _H, cs) {
  const sp = getSprite();
  if (!sp || !hasRig(sp)) return;
  ctx.save();
  for (const p of rigParts(sp)) {
    const on = p.i === sp.layer;
    const x = p.pivot.x * cs, y = p.pivot.y * cs;
    const r = Math.max(3, Math.min(7, cs * 0.6));
    ctx.lineWidth = on ? 2 : 1;
    ctx.strokeStyle = on ? '#ffcc33' : 'rgba(255,204,51,0.45)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    // Kreuz in der Mitte: der Kreis allein ist auf buntem Grund schlecht zu treffen.
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    ctx.stroke();
  }
  ctx.restore();
}

function renderPart() {
  const sel = $('ly-part-role'), btn = $('ly-part-pivot');
  if (!sel) return;
  const sp = getSprite();
  const part = sp?.layers[sp.layer]?.part || null;
  // Die Liste trägt die Sprache mit — sie wird bei jedem Wechsel neu gebaut.
  sel.innerHTML = `<option value="">${t('rig.roleNone')}</option>`
    + PART_ROLES.map(r => `<option value="${r}">${t('rig.role.' + r)}</option>`).join('');
  sel.value = part?.role || '';
  sel.disabled = !sp;
  btn.hidden = !part;
  btn.classList.toggle('is-active', !!state.pivotPick);
  btn.setAttribute('aria-pressed', String(!!state.pivotPick));
  if (part) {
    const fmt = v => (Number.isInteger(v) ? String(v) : v.toFixed(1));
    btn.title = t('rig.pivotAt', { x: fmt(part.pivot.x), y: fmt(part.pivot.y) });
  }
}

// ── Ebenenmasken (mask.js) ───────────────────────────────────────────
// Eine Maske je Ebene, für alle Frames. „Bearbeiten“ ist kein Undo-Schritt
// (nur Ansicht); hinzufügen, an/aus, anwenden und löschen schon.
export function addMask() {
  const sp = getSprite();
  if (!sp || sp.layers[sp.layer].mask) return;
  edit(s => {
    const g = s.frames[0].cels[s.layer];
    s.layers[s.layer].mask = blankMask(g[0].length, g.length);
  });
  state.maskEdit = true;
  showInfoToast(t('mask.editHint'));
  renderAll();
}

export function toggleMaskEdit(i = getSprite()?.layer) {
  const sp = getSprite();
  if (!sp || !sp.layers[i]?.mask) return;
  commitFloat(); // schwebender Inhalt gehört ins Raster, aus dem er kam
  if (i !== sp.layer) { leave(); sp.layer = i; state.maskEdit = true; }
  else state.maskEdit = !state.maskEdit;
  if (state.maskEdit) showInfoToast(t('mask.editHint'));
  renderAll();
  saveState();
}

export function toggleMaskOn() {
  meta(sp => { const m = sp.layers[sp.layer].mask; if (m) m.on = !m.on; });
}

export function applyMask() {
  const sp = getSprite();
  if (!sp?.layers[sp.layer].mask) return;
  edit(s => {
    const L = s.layers[s.layer];
    const memo = new Map();
    s.frames.forEach(f => {
      const g = f.cels[s.layer];
      if (!memo.has(g)) memo.set(g, L.mask.on ? bakeMask(g, L.mask.hide) : g);
      f.cels[s.layer] = memo.get(g);
    });
    L.mask = null;
  });
  state.maskEdit = false;
  renderAll();
}

export function deleteMask() {
  const sp = getSprite();
  if (!sp?.layers[sp.layer].mask) return;
  edit(s => { s.layers[s.layer].mask = null; });
  state.maskEdit = false;
  renderAll();
}

// Masken-Bildchen: weiß = sichtbar, schwarz = ausgeblendet.
function drawMaskThumb(cv, hide) {
  const g = sampleGrid(hide, THUMB * 2);
  const H = g.length, W = g[0].length;
  if (cv.width !== W || cv.height !== H) {
    cv.width = W; cv.height = H;
    const k = THUMB / Math.max(W, H);
    cv.style.width = Math.max(1, Math.round(W * k)) + 'px';
    cv.style.height = Math.max(1, Math.round(H * k)) + 'px';
  }
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, v = g[y][x] ? 24 : 235;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// Alle sichtbaren Ebenen in jedem Frame zu einer zusammenführen — auch
// Licht und Schatten (die damit fest im Bild landen). Ausgeblendete bleiben,
// wie sie sind. Die neue Ebene sitzt auf dem Platz der untersten sichtbaren.
export function mergeVisible() {
  const sp = getSprite();
  if (!sp) return;
  const vis = sp.layers.map((L, i) => (L.visible && L.opacity > 0 ? i : -1)).filter(i => i >= 0);
  if (vis.length < 2) { showInfoToast(t('ly.nothingToMerge')); return; }
  edit(s => {
    const at = vis[0];
    // Verknüpfte Zellen: dieselbe Kombination ergibt dasselbe, wieder geteilte Bild.
    const ids = new Map();
    const id = g => { if (!ids.has(g)) ids.set(g, ids.size); return ids.get(g); };
    const memo = new Map();
    const merged = s.frames.map((f, fi) => {
      const key = vis.map(i => id(f.cels[i])).join(',');
      if (!memo.has(key)) memo.set(key, dc(flatGrid(s, fi)));
      return memo.get(key);
    });
    const keep = new Set(vis);
    s.layers = s.layers.filter((_, i) => i === at || !keep.has(i));
    // at ist die unterste sichtbare — darunter fällt nichts weg, der Platz bleibt at.
    s.layers[at] = { ...defaultLayer(), name: t('ly.mergedName') };
    s.frames.forEach((f, fi) => {
      f.cels = f.cels.filter((_, i) => i === at || !keep.has(i));
      f.cels[at] = merged[fi];
    });
    s.layer = at;
  });
}

export function moveLayer(from, to) {
  const sp = getSprite();
  if (!sp || from === to || to < 0 || to >= sp.layers.length) return;
  edit(s => {
    const [l] = s.layers.splice(from, 1);
    s.layers.splice(to, 0, l);
    s.frames.forEach(f => { const [c] = f.cels.splice(from, 1); f.cels.splice(to, 0, c); });
    s.layer = to;
  });
}

export function toggleVisible(i) { meta(sp => { sp.layers[i].visible = !sp.layers[i].visible; }); }
export function toggleLocked(i) { meta(sp => { sp.layers[i].locked = !sp.layers[i].locked; }); }
// Durchgehend: neue Frames verknüpfen hier mit dem vorigen (state.js newFrameCels).
export function setOpacity(i, v) { meta(sp => { sp.layers[i].opacity = Math.max(0, Math.min(1, v)); }); }
export function toggleContinuous(i) { meta(sp => { sp.layers[i].continuous = !sp.layers[i].continuous; }); }

export function renameLayer(i, name) {
  const n = String(name || '').trim();
  const sp = getSprite();
  if (!sp || !n || n === sp.layers[i]?.name) { renderLayers(); return; }
  meta(s => { s.layers[i].name = n; });
}

// ────────────────────────────────────────────────────────────────────
// Panel
// ────────────────────────────────────────────────────────────────────
function drawThumb(cv, grid, pal) {
  // Große Bilder erst verkleinern — für 28 px braucht es keine Million Pixel.
  const g = sampleGrid(grid, THUMB * 2);
  const H = g.length, W = g[0].length;
  if (cv.width !== W || cv.height !== H) {
    const k = THUMB / Math.max(W, H);
    cv.style.width = Math.max(1, Math.round(W * k)) + 'px';
    cv.style.height = Math.max(1, Math.round(H * k)) + 'px';
  }
  gridToCanvas(cv, g, pal);   // ein Bild statt eines fillRect je Pixel
}

function makeRow() {
  const row = document.createElement('div');
  row.className = 'ly-row';
  row.setAttribute('role', 'option');
  row.innerHTML = '<button type="button" class="icon-btn ly-eye"></button>'
    + '<button type="button" class="icon-btn ly-lock"></button>'
    + '<span class="ly-thumb"><canvas></canvas></span>'
    + '<button type="button" class="ly-mask" hidden><canvas></canvas></button>'
    + '<span class="ly-name"></span>'
    + '<span class="ly-op"></span>';
  row.querySelector('.ly-eye').addEventListener('click', e => { e.stopPropagation(); toggleVisible(Number(row.dataset.i)); });
  row.querySelector('.ly-lock').addEventListener('click', e => { e.stopPropagation(); toggleLocked(Number(row.dataset.i)); });
  row.querySelector('.ly-name').addEventListener('dblclick', e => { e.stopPropagation(); startRename(row); });
  row.querySelector('.ly-mask').addEventListener('click', e => { e.stopPropagation(); toggleMaskEdit(Number(row.dataset.i)); });
  initRowDrag(row);
  return row;
}

function startRename(row) {
  const i = Number(row.dataset.i);
  const span = row.querySelector('.ly-name');
  const inp = document.createElement('input');
  inp.className = 'input input--sm ly-rename';
  inp.value = getSprite().layers[i].name;
  span.replaceWith(inp);
  inp.focus();
  inp.select();
  let done = false;
  const finish = ok => {
    if (done) return;
    done = true;
    if (ok) renameLayer(i, inp.value); else renderLayers();
  };
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  inp.addEventListener('blur', () => finish(true));
}

export function renderLayers() {
  const list = $('layer-list');
  const sp = getSprite();
  if (!list) return;
  if (!sp) { list.innerHTML = ''; return; }
  const n = sp.layers.length;
  // Eine offene Umbenennung nicht mitten im Tippen wegwerfen.
  if (list.querySelector('.ly-rename')) return;
  list.innerHTML = '';
  const pal = getPaletteByName(sp.palette);
  // Oberste Ebene oben.
  for (let i = n - 1; i >= 0; i--) {
    const L = sp.layers[i];
    const row = makeRow();
    row.dataset.i = String(i);
    row.classList.toggle('is-active', i === sp.layer);
    row.classList.toggle('is-hidden', !L.visible);
    row.setAttribute('aria-selected', String(i === sp.layer));
    const eye = row.querySelector('.ly-eye'), lock = row.querySelector('.ly-lock');
    eye.innerHTML = iconSvg(L.visible ? 'eye' : 'eyeOff');
    eye.title = t(L.visible ? 'ly.hide' : 'ly.show');
    eye.setAttribute('aria-pressed', String(L.visible));
    lock.innerHTML = iconSvg(L.locked ? 'lock' : 'unlock');
    lock.title = t(L.locked ? 'ly.unlock' : 'ly.lock');
    lock.setAttribute('aria-pressed', String(L.locked));
    lock.classList.toggle('is-on', L.locked);
    row.querySelector('.ly-name').textContent = L.name;
    row.querySelector('.ly-op').textContent = L.opacity < 1 ? Math.round(L.opacity * 100) + '%' : '';
    row.title = t('ly.rowTitle', { name: L.name });
    drawThumb(row.querySelector('.ly-thumb canvas'), maskedCel(L, sp.frames[sp.frame].cels[i]), pal);
    const mb = row.querySelector('.ly-mask');
    mb.hidden = !L.mask;
    if (L.mask) {
      drawMaskThumb(mb.querySelector('canvas'), L.mask.hide);
      const editing = state.maskEdit && i === sp.layer;
      mb.classList.toggle('is-editing', editing);
      mb.classList.toggle('is-off', !L.mask.on);
      mb.setAttribute('aria-pressed', String(editing));
      mb.title = t(editing ? 'mask.editStop' : 'mask.editStart');
    }
    list.append(row);
  }

  const L = sp.layers[sp.layer];
  const op = $('ly-opacity');
  if (document.activeElement !== op) op.value = Math.round(L.opacity * 100);
  $('ly-opacity-val').textContent = Math.round(L.opacity * 100) + '%';
  $('ly-del').disabled = n < 2;
  $('ly-merge').disabled = sp.layer === 0;
  $('ly-merge-all').disabled = sp.layers.filter(L => L.visible && L.opacity > 0).length < 2;
  const m = L.mask;
  // Die Maske gibt es nur im Ebenen-Panel, nicht in der Timeline.
  {
    const mk = id => $('ly-' + id);
    mk('mask-add').hidden = !!m;
    for (const id of ['mask-edit', 'mask-on', 'mask-apply', 'mask-del']) mk(id).hidden = !m;
    if (m) {
      const editing = !!state.maskEdit;
      mk('mask-edit').classList.toggle('is-active', editing);
      mk('mask-edit').setAttribute('aria-pressed', String(editing));
      mk('mask-on').innerHTML = iconSvg(m.on ? 'eye' : 'eyeOff');
      mk('mask-on').title = t(m.on ? 'mask.off' : 'mask.on');
    }
  }
  renderPart();
  const tlOp = $('tl-ly-opacity');
  if (tlOp) {
    if (document.activeElement !== tlOp) tlOp.value = String(Math.round(L.opacity * 100));
    $('tl-ly-del').disabled = n < 2;
    $('tl-ly-merge').disabled = sp.layer === 0;
    $('tl-ly-merge-all').disabled = $('ly-merge-all').disabled;
    $('tl-ly-up').disabled = sp.layer >= n - 1;
    $('tl-ly-down').disabled = sp.layer === 0;
  }
}

// Beim Zeichnen nur das Vorschaubild der aktiven Ebene auffrischen.
function refreshActiveThumb() {
  const sp = getSprite();
  const row = sp && $('layer-list')?.querySelector(`.ly-row[data-i="${sp.layer}"] canvas`);
  if (!row) return;
  const L = sp.layers[sp.layer];
  drawThumb(row, maskedCel(L, sp.grid), getPaletteByName(sp.palette));
  const mc = state.maskEdit && L.mask ? $('layer-list')?.querySelector(`.ly-row[data-i="${sp.layer}"] .ly-mask canvas`) : null;
  if (mc) drawMaskThumb(mc, L.mask.hide);
}

// Ziehen sortiert um, ein Klick wählt die Ebene. Die Liste steht auf dem
// Kopf (oben = oberste Ebene), darum wird die Zielposition umgerechnet.
function initRowDrag(row) {
  row.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button, input')) return;
    const list = $('layer-list');
    const from = Number(row.dataset.i);
    const sy = e.clientY;
    let dragging = false, slot = null;

    const move = ev => {
      const d = ev.clientY - sy;
      if (!dragging) {
        if (Math.abs(d) < 6) return;
        dragging = true;
        row.classList.add('is-dragging');
        try { row.setPointerCapture(ev.pointerId); } catch {}
      }
      ev.preventDefault();
      row.style.transform = `translateY(${d}px)`;
      // Position in der Anzeige (0 = oben) → Ebenen-Index (0 = unten).
      const rows = [...list.children].filter(r => r !== row);
      let pos = 0;
      rows.forEach((r, k) => {
        const b = r.getBoundingClientRect();
        if (ev.clientY > b.top + b.height / 2) pos = k + 1;
      });
      slot = rows.length - pos;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!dragging) { setActiveLayer(from); return; }
      row.classList.remove('is-dragging');
      row.style.transform = '';
      if (slot != null) moveLayer(from, slot);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

export function initLayers() {
  $('ly-add').addEventListener('click', addLayer);
  // Dieselben Knöpfe in der Timeline-Leiste (editor.html, Gruppe tl-lyops).
  const on = (id, fn) => $(id)?.addEventListener('click', fn);
  on('tl-ly-add', addLayer);
  on('tl-ly-dup', duplicateLayer);
  on('tl-ly-from-sel', layerFromSelection);
  on('ly-from-sel', layerFromSelection);
  on('tl-ly-del', deleteLayer);
  on('tl-ly-merge', mergeDown);
  on('tl-ly-merge-all', mergeVisible);
  on('tl-ly-up', () => { const sp = getSprite(); if (sp) moveLayer(sp.layer, sp.layer + 1); });
  on('tl-ly-down', () => { const sp = getSprite(); if (sp) moveLayer(sp.layer, sp.layer - 1); });
  $('tl-ly-opacity')?.addEventListener('change', e => {
    const sp = getSprite();
    const v = Number(/** @type {HTMLInputElement} */ (e.target).value);
    if (sp && Number.isFinite(v)) setOpacity(sp.layer, v / 100);
  });
  $('ly-dup').addEventListener('click', duplicateLayer);
  $('ly-del').addEventListener('click', deleteLayer);
  $('ly-merge').addEventListener('click', mergeDown);
  $('ly-merge-all').addEventListener('click', mergeVisible);
  $('ly-part-role').addEventListener('change', e => setPartRole(/** @type {HTMLSelectElement} */ (e.target).value));
  $('ly-part-pivot').addEventListener('click', togglePivotPick);
  $('ly-mask-add').addEventListener('click', addMask);
  $('ly-mask-edit').addEventListener('click', () => toggleMaskEdit());
  $('ly-mask-on').addEventListener('click', toggleMaskOn);
  $('ly-mask-apply').addEventListener('click', applyMask);
  $('ly-mask-del').addEventListener('click', deleteMask);

  // Deckkraft: live zeigen, als EIN Undo-Schritt festhalten.
  const op = $('ly-opacity');
  let dragging = false;
  const begin = () => { if (!dragging) { dragging = true; beginStroke(); } };
  op.addEventListener('pointerdown', begin);
  op.addEventListener('keydown', begin);
  op.addEventListener('input', () => {
    const sp = getSprite();
    if (!sp) return;
    begin();
    sp.layers[sp.layer].opacity = Number(op.value) / 100;
    $('ly-opacity-val').textContent = op.value + '%';
    renderEditor();
  });
  op.addEventListener('change', () => {
    dragging = false;
    commitStroke();
    renderAll();
    saveState();
  });

  renderCallbacks.onRenderLayers = renderLayers;
  const prev = renderCallbacks.onEditorRendered;
  renderCallbacks.onEditorRendered = () => { prev(); refreshActiveThumb(); };
  renderCallbacks.onDrawPivots = drawPivots;
  // Die Rollenliste steht in der Sprache des Nutzers — nach dem Wechsel neu bauen.
  onLangChange(renderPart);
}
