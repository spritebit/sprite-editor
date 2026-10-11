// ════════════════════════════════════════════════════════════════════
// TILEMAP — Panel „Kacheln“, Kacheln setzen, Raster und Godot-Export
// ════════════════════════════════════════════════════════════════════
// Die Rechnung steckt in js/tiles.js; hier hängt sie an der Oberfläche:
//   • Panel: Tilemap-Ebene anlegen/umwandeln, Modus, Kachelliste, Export
//   • Modus „Kacheln“: Stift setzt die gewählte Kachel, Radierer (und
//     Rechtsklick) leert, Füllen füllt Kacheln, Alt nimmt eine Kachel auf;
//     gedreht/gespiegelt (Z, Umschalt+Z, X, Y) wird die Fassung gesetzt
//   • Raster der Kacheln über der Zeichenfläche
//   • Abgleich nach jedem Undo-Schritt (history.js → syncSprite)
//   • Bibliothek: Kachelsätze speichern, in andere Ebenen/Sprites laden,
//     als Datei für andere Projekte (Rechnung in js/tilelib.js)
import { state, sprites, tilesetLib, getSprite, getPal, getPaletteByName, blankLike, defaultLayer } from './state.js';
import {
  TILE_SIZES, DEFAULT_TILE, blankTileset, buildTileset, mapSize, mapOf, tileAt, placeTile, fillTiles,
  NO_XF, isPlainXf, orientTile, turnXf, tileIndex,
  pruneUnused, copyTileset, syncSprite, atlasGrid, godotScene, tilemapJson,
} from './tiles.js';
import { recordOp, beginStroke, commitStroke, historyCallbacks } from './history.js';
import { renderAll, renderEditor, renderCallbacks, cellFromEvent } from './render.js';
import { gridToCanvas, paintGrid } from './raster.js';
import { commitFloat } from './selection.js';
import { clearSelection } from './state.js';
import { saveState } from './storage.js';
import { showInfoToast, showConfirmToast } from './toast.js';
import { toLib, fromLib, retile, freeLibName, tilesetFile, parseTilesetFile, tilesFromImage } from './tilelib.js';
import { saveBlob } from './filesystem.js';
import { zipBlob } from './zip.js';
import { t, onLangChange } from './i18n.js';

/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);

/** Kachelsatz der aktiven Ebene — null, wenn sie keine Tilemap ist (oder die Maske bearbeitet wird). */
export function activeTileset() {
  const sp = getSprite();
  if (!sp || state.maskEdit) return null;
  return sp.layers[sp.layer]?.tileset || null;
}

/** Gehört der Zeiger gerade dem Kachel-Setzen? */
export const tileModeOn = () => !!activeTileset() && state.tileMode === 'tiles';

// ── Zeiger im Modus „Kacheln“ (von app.js aufgerufen) ──────────────

let drag = null;      // { k } — welche Kachel beim Ziehen gesetzt wird (0 = leeren)
let hover = null;     // { cx, cy } — Zelle unter dem Zeiger (Vorschau)

function cellOf(e) {
  const ts = activeTileset();
  const c = ts && cellFromEvent(e);
  if (!c) return null;
  const g = getSprite().grid;
  const { cols, rows } = mapSize(ts, g[0].length, g.length);
  const cx = Math.floor(c.x / ts.tw), cy = Math.floor(c.y / ts.th);
  return cx < cols && cy < rows ? { cx, cy } : null;
}

/** Lage für diesen Satz: 90°/270° nur bei quadratischen Kacheln. */
function xfFor(ts) {
  const xf = state.tileXf || NO_XF;
  return ts.tw === ts.th ? xf : { ...xf, rot: xf.rot & 2 };
}

/** Die gewählte Kachel so, wie sie gesetzt wird (Raster) — oder null. */
function shownTile(ts) {
  const tile = ts.tiles[state.tile - 1];
  return tile ? orientTile(tile, xfFor(ts)) : null;
}

/** Nummer der Kachel, die gesetzt wird — eine neue Fassung kommt in den Satz. */
function placedK(ts) {
  const xf = xfFor(ts);
  return isPlainXf(xf) ? state.tile : tileIndex(ts, orientTile(ts.tiles[state.tile - 1], xf));
}

/** Lage weiterdrehen (Knöpfe und Tasten Z, Umschalt+Z, X, Y). */
export function turnTile(op) {
  const ts = activeTileset();
  if (!ts) return;
  if ((op === 'cw' || op === 'ccw') && ts.tw !== ts.th) { showInfoToast(t('tile.xfSquare')); return; }
  state.tileXf = op === 'reset' ? { ...NO_XF } : turnXf(state.tileXf, op);
  renderTilePanel();
  renderEditor();
}

function stamp(c) {
  if (!c || !drag) return;
  if (drag.last && drag.last.cx === c.cx && drag.last.cy === c.cy) return;
  drag.last = c;
  placeTile(activeTileset(), getSprite().grid, c.cx, c.cy, drag.k);
  renderEditor();
}

/**
 * Zeiger gedrückt (Modus „Kacheln“). Alt nimmt die Kachel unter dem
 * Zeiger auf, Füllen füllt, Radierer/Rechts leert, sonst wird gesetzt.
 */
export function tilePointerDown(e) {
  const ts = activeTileset();
  const c = cellOf(e);
  if (!ts || !c) return;
  e.preventDefault();
  const sp = getSprite();
  if (e.altKey) {
    const k = tileAt(ts, sp.grid, c.cx, c.cy);
    // Aufgenommen wird die Kachel, wie sie liegt — also normal.
    if (k > 0) { state.tile = k; state.tileXf = { ...NO_XF }; renderTilePanel(); }
    showInfoToast(k > 0 ? t('tile.picked', { k }) : t('tile.pickedEmpty'));
    return;
  }
  const erase = e.button === 2 || state.tool === 'eraser';
  if (!erase && !ts.tiles[state.tile - 1]) { showInfoToast(t(ts.tiles.length ? 'tile.pick' : 'tile.noneYet')); return; }
  commitFloat();
  clearSelection();
  if (state.tool === 'fill') {
    recordOp(() => fillTiles(ts, sp.grid, c.cx, c.cy, erase ? 0 : placedK(ts)));
    renderAll();
    saveState();
    return;
  }
  beginStroke();
  drag = { k: erase ? 0 : placedK(ts), last: null };
  stamp(c);
}

export function tilePointerMove(e) {
  const c = cellOf(e);
  if (drag) { stamp(c); return; }
  // Vorschau nur neu zeichnen, wenn sich die Zelle ändert.
  if (c?.cx !== hover?.cx || c?.cy !== hover?.cy) { hover = c; renderEditor(); }
}

function endDrag() {
  if (!drag) return;
  drag = null;
  commitStroke();
  renderAll();
  saveState();
}

// ── Raster über der Zeichenfläche ──────────────────────────────────

function drawTiles(ctx, W, H, r) {
  // Im Modus „Kacheln“ kein Pinsel-Umriss — gesetzt wird eine ganze Kachel.
  $('editor-canvas-wrap')?.classList.toggle('is-tile-mode', tileModeOn());
  const ts = activeTileset();
  if (!ts) return;
  const { cols, rows } = mapSize(ts, W, H);
  const mw = cols * ts.tw * r, mh = rows * ts.th * r;
  // Der Rand außerhalb der Karte: abgedunkelt (gehört zu keiner Kachel).
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  if (mw < W * r) ctx.fillRect(mw, 0, W * r - mw, H * r);
  if (mh < H * r) ctx.fillRect(0, mh, mw, H * r - mh);
  if (ts.tw * r >= 4) {
    ctx.strokeStyle = 'rgba(110, 170, 255, 0.55)';
    ctx.lineWidth = Math.max(1, r / 8);
    ctx.beginPath();
    for (let x = 0; x <= cols; x++) { ctx.moveTo(x * ts.tw * r, 0); ctx.lineTo(x * ts.tw * r, mh); }
    for (let y = 0; y <= rows; y++) { ctx.moveTo(0, y * ts.th * r); ctx.lineTo(mw, y * ts.th * r); }
    ctx.stroke();
  }
  // Modus „Kacheln“: die gewählte Kachel als Vorschau unter dem Zeiger.
  if (state.tileMode === 'tiles' && hover && !drag) {
    const tile = shownTile(ts);
    if (tile && state.tool !== 'eraser') paintGrid(ctx, tile, getPal(), hover.cx * ts.tw, hover.cy * ts.th, r, { alpha: 0.6, key: 'tile-hover' });
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = Math.max(1, r / 4);
    ctx.strokeRect(hover.cx * ts.tw * r, hover.cy * ts.th * r, ts.tw * r, ts.th * r);
  }
  ctx.restore();
}

// ── Tilemap-Ebene anlegen / umwandeln / zurück ─────────────────────

const chosenSize = () => ({ tw: Number($('tile-w').value) || DEFAULT_TILE, th: Number($('tile-h').value) || DEFAULT_TILE });

function structural(fn) {
  const sp = getSprite();
  if (!sp) return;
  commitFloat();
  clearSelection();
  recordOp(() => fn(sp));
  renderAll();
  saveState();
}

function newTilemapLayer() {
  const { tw, th } = chosenSize();
  structural(sp => {
    const at = sp.layer + 1;
    let n = sp.layers.length + 1;
    const taken = new Set(sp.layers.map(l => l.name));
    while (taken.has(t('tile.layerName', { n }))) n++;
    sp.layers.splice(at, 0, { ...defaultLayer(n), name: t('tile.layerName', { n }), tileset: blankTileset(tw, th) });
    sp.frames.forEach(f => f.cels.splice(at, 0, blankLike(f.cels[0])));
    sp.layer = at;
  });
  state.tileMode = 'pixel';
  hint();
}

function convertLayer() {
  const { tw, th } = chosenSize();
  let n = 0;
  structural(sp => {
    const L = sp.layers[sp.layer];
    L.tileset = buildTileset(tw, th, [...new Set(sp.frames.map(f => f.cels[sp.layer]))]);
    n = L.tileset.tiles.length;
  });
  showInfoToast(t('tile.converted', { n }));
}

function unmapLayer() {
  structural(sp => { sp.layers[sp.layer].tileset = null; });
  showInfoToast(t('tile.unmapped'));
}

function prune() {
  // Erst zählen (an einer Kopie), dann nachfragen — die Nummern der
  // übrigen Kacheln rücken dabei auf.
  const sp = getSprite();
  const cur = activeTileset();
  if (!sp || !cur) return;
  const unused = pruneUnused(copyTileset(cur), [...new Set(sp.frames.map(f => f.cels[sp.layer]))]);
  if (!unused) { showInfoToast(t('tile.prunedNone')); return; }
  showConfirmToast(unused === 1 ? t('tile.pruneAsk1') : t('tile.pruneAsk', { n: unused }), pruneNow, t('tile.pruneOk'));
}

function pruneNow() {
  let n = 0;
  structural(sp => {
    const ts = sp.layers[sp.layer].tileset;
    if (ts) n = pruneUnused(ts, [...new Set(sp.frames.map(f => f.cels[sp.layer]))]);
  });
  state.tile = 1;
  showInfoToast(n ? t('tile.pruned', { n }) : t('tile.prunedNone'));
}

function hint() {
  const sp = getSprite();
  const g = sp?.grid;
  const ts = activeTileset();
  if (!g || !ts) return;
  const W = g[0].length, H = g.length;
  showInfoToast(W % ts.tw || H % ts.th ? t('tile.rest', { tw: ts.tw, th: ts.th }) : t('tile.created'));
}

// ── Bibliothek ──────────────────────────────────────────────────────
// Eingesetzt wird immer eine Kopie (Farben → Nummern der Sprite-Palette);
// die Ebene merkt sich in tileset.lib, woher sie kommt.

const libSel = () => $('tile-lib-sel').value;

function saveToLib() {
  const ts = activeTileset();
  if (!ts) return;
  const sp = getSprite();
  const name = $('tile-lib-name').value.trim() || freeLibName(tilesetLib, sp.layers[sp.layer].name);
  const store = () => {
    tilesetLib[name] = toLib(ts, getPal());
    ts.lib = name;
    saveState();
    renderTilePanel();
    showInfoToast(t('tlib.saved', { name, n: ts.tiles.length }));
  };
  // Einen anderen Satz gleichen Namens nur nach Rückfrage ersetzen —
  // den eigenen (Zurückschreiben) ohne.
  if (tilesetLib[name] && ts.lib !== name) showConfirmToast(t('tlib.replace', { name }), store);
  else store();
}

function newLayerFromLib() {
  const name = libSel();
  const set = tilesetLib[name];
  if (!set) return;
  structural(sp => {
    const at = sp.layer + 1;
    const ts = { ...fromLib(set, getPaletteByName(sp.palette)), lib: name };
    sp.layers.splice(at, 0, { ...defaultLayer(sp.layers.length + 1), name, tileset: ts });
    sp.frames.forEach(f => f.cels.splice(at, 0, blankLike(f.cels[0])));
    sp.layer = at;
  });
  // Wer einen fertigen Satz holt, will meist gleich Kacheln setzen.
  state.tile = 1;
  state.tileMode = 'tiles';
  renderTilePanel();
  showInfoToast(t('tlib.newLayerDone', { name }));
}

/** Kacheln aus der Bibliothek in die aktive Tilemap-Ebene legen. */
function useFromLib(name) {
  const set = tilesetLib[name];
  const ts = activeTileset();
  if (!set || !ts) return;
  if (set.tw !== ts.tw || set.th !== ts.th) {
    showInfoToast(t('tlib.sizeMismatch', { name, tw: set.tw, th: set.th, lw: ts.tw, lh: ts.th }));
    return;
  }
  structural(sp => {
    const li = sp.layer;
    const L = sp.layers[li];
    const tiles = fromLib(set, getPaletteByName(sp.palette)).tiles;
    retile(L.tileset, tiles, [...new Set(sp.frames.map(f => f.cels[li]))]);
    L.tileset.lib = name;
  });
  showInfoToast(t('tlib.used', { name }));
}

function deleteFromLib() {
  const name = libSel();
  if (!tilesetLib[name]) return;
  showConfirmToast(t('tlib.confirmDel', { name }), () => {
    delete tilesetLib[name];
    saveState();
    renderTilePanel();
  });
}

async function exportLibSet() {
  const name = libSel();
  const set = tilesetLib[name];
  if (!set) return;
  const file = `${safe(name)}.tileset.json`;
  const r = await saveBlob(new Blob([tilesetFile(name, set)], { type: 'application/json' }), file);
  showInfoToast(t(r?.fallback ? 'tlib.exportedDl' : 'tlib.exported', { name: file }));
}

/** Datei laden: unsere .json — oder ein Kachelbild, zerschnitten in Kacheln. */
async function importLibFile(file) {
  if (!file) return;
  const base = file.name.replace(/\.tileset\.json$|\.json$|\.png$/i, '');
  let name = '', set = null;
  if (/\.png$/i.test(file.name) || file.type === 'image/png') {
    // Kachelgröße: die der aktiven Tilemap-Ebene, sonst die eingestellte.
    const ts = activeTileset();
    const { tw, th } = ts ? { tw: ts.tw, th: ts.th } : chosenSize();
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) { showInfoToast(t('tlib.bad')); return; }
    const cv = document.createElement('canvas');
    cv.width = bmp.width;
    cv.height = bmp.height;
    const ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
    ctx.drawImage(bmp, 0, 0);
    set = tilesFromImage(ctx.getImageData(0, 0, bmp.width, bmp.height).data, bmp.width, bmp.height, tw, th);
    name = base;
  } else {
    const r = parseTilesetFile(await file.text());
    if (r) { set = r.set; name = r.name || base; }
  }
  if (!set || !set.tiles.length) { showInfoToast(t('tlib.bad')); return; }
  name = freeLibName(tilesetLib, name);
  tilesetLib[name] = set;
  saveState();
  $('tile-lib-sel').value = name;
  renderTilePanel();
  $('tile-lib-sel').value = name;
  renderLib();
  showInfoToast(t('tlib.imported', { name, n: set.tiles.length, tw: set.tw, th: set.th }));
}

function renderLib() {
  const ts = activeTileset();
  const sp = getSprite();
  const names = Object.keys(tilesetLib).sort((a, b) => a.localeCompare(b));
  const sel = $('tile-lib-sel');
  const keep = sel.value;
  sel.innerHTML = '';
  for (const n of names) {
    const s = tilesetLib[n];
    const o = document.createElement('option');
    o.value = n;
    o.textContent = t('tlib.option', { name: n, tw: s.tw, th: s.th, n: s.tiles.length });
    sel.append(o);
  }
  // Gewählt bleibt, was gewählt war — sonst der Satz, aus dem die Ebene kommt.
  sel.value = names.includes(keep) ? keep : ts?.lib && names.includes(ts.lib) ? ts.lib : names[0] || '';
  const has = names.length > 0;
  $('tile-lib-pick-row').hidden = !has;
  $('tile-lib-export').hidden = !has;
  $('tile-lib-empty').hidden = has;
  const picked = tilesetLib[sel.value];
  $('tile-lib-use').disabled = !ts || !picked || picked.tw !== ts.tw || picked.th !== ts.th;
  $('tile-lib-save-row').hidden = !ts;
  const src = ts?.lib && tilesetLib[ts.lib] ? ts.lib : '';
  $('tile-lib-reload').hidden = !src;
  $('tile-lib-src').hidden = !src;
  if (src) $('tile-lib-src').textContent = t('tlib.src', { name: src });
  const nameIn = $('tile-lib-name');
  if (ts && sp && document.activeElement !== nameIn) nameIn.value = ts.lib || sp.layers[sp.layer].name;
}

// ── Export für Godot ────────────────────────────────────────────────

const safe = s => String(s).normalize('NFKD').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'tiles';

async function exportGodot() {
  const sp = getSprite();
  if (!sp) return;
  const pal = getPaletteByName(sp.palette);
  const base = safe(sp.name);
  const layers = [];
  const files = [];
  const used = new Set();
  for (const [li, L] of sp.layers.entries()) {
    if (!L.tileset || !L.tileset.tiles.length) continue;
    let ln = safe(L.name);
    while (used.has(ln)) ln += '_';
    used.add(ln);
    const png = `${base}_${ln}.png`;
    const cv = gridToCanvas(document.createElement('canvas'), atlasGrid(L.tileset), pal);
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    files.push({ name: `${base}/${png}`, data: new Uint8Array(await blob.arrayBuffer()) });
    layers.push({ name: L.name, ts: L.tileset, map: mapOf(L.tileset, sp.frames[sp.frame].cels[li]), png: `res://${base}/${png}`, visible: L.visible, opacity: L.opacity });
  }
  if (!layers.length) { showInfoToast(t('tile.exportNone')); return; }
  const enc = new TextEncoder();
  files.push({ name: `${base}/${base}.tscn`, data: enc.encode(godotScene(sp.name, layers)) });
  files.push({ name: `${base}/${base}.json`, data: enc.encode(tilemapJson(sp.name, layers)) });
  const zipName = `${base}_godot.zip`;
  const r = await saveBlob(zipBlob(files), zipName);
  showInfoToast(t('tile.exported', { name: zipName, folder: base }) + (r?.fallback ? ' ' + t('tile.exportedDl') : ''));
}

// ── Panel ───────────────────────────────────────────────────────────

const THUMB = 32;

export function renderTilePanel() {
  const panel = document.querySelector('[data-panel="tiles"]');
  if (!panel) return;
  const sp = getSprite();
  const ts = activeTileset();
  $('tile-off').hidden = !!ts;
  $('tile-on').hidden = !ts;
  $('tile-off-mask').hidden = !(sp && state.maskEdit);
  renderLib();
  if (!ts) return;
  const g = sp.grid;
  const { cols, rows } = mapSize(ts, g[0].length, g.length);
  $('tile-info').textContent = t('tile.info', { tw: ts.tw, th: ts.th, n: ts.tiles.length, cols, rows });
  for (const m of ['pixel', 'tiles']) {
    const b = $('tile-mode-' + m);
    b.classList.toggle('is-active', state.tileMode === m);
    b.setAttribute('aria-pressed', String(state.tileMode === m));
  }
  $('tile-auto').value = state.tileAuto;
  $('tile-auto-row').hidden = state.tileMode !== 'pixel';
  $('tile-hint').textContent = t(state.tileMode === 'tiles' ? 'tile.hintTiles' : state.tileAuto === 'auto' ? 'tile.hintAuto' : 'tile.hintManual');
  if (state.tile > ts.tiles.length) state.tile = Math.max(1, ts.tiles.length);

  const list = $('tile-list');
  const pal = getPal();
  // Knöpfe wiederverwenden — bei jedem Strich neu bauen flackert.
  while (list.children.length > ts.tiles.length) list.lastChild.remove();
  while (list.children.length < ts.tiles.length) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile-item';
    b.innerHTML = '<canvas></canvas><span></span>';
    b.addEventListener('click', () => {
      state.tile = Number(b.dataset.k);
      // Kachel gewählt → wer sie wählt, will sie meist auch setzen.
      state.tileMode = 'tiles';
      renderTilePanel();
      renderEditor();
    });
    list.append(b);
  }
  ts.tiles.forEach((tile, i) => {
    const b = /** @type {HTMLButtonElement} */ (list.children[i]);
    b.dataset.k = String(i + 1);
    b.title = t('tile.item', { k: i + 1 });
    b.classList.toggle('is-active', state.tile === i + 1);
    const cv = /** @type {HTMLCanvasElement} */ (b.querySelector('canvas'));
    gridToCanvas(cv, tile, pal);
    cv.style.width = cv.style.height = THUMB + 'px';
    b.querySelector('span').textContent = String(i + 1);
  });
  $('tile-empty').hidden = ts.tiles.length > 0;
  renderXf(ts);
}

// Zeile „gedreht/gespiegelt setzen“: nur im Modus „Kacheln setzen“.
function renderXf(ts) {
  const show = state.tileMode === 'tiles' && ts.tiles.length > 0;
  $('tile-xf-row').hidden = !show;
  const xf = xfFor(ts);
  $('tile-xf-state').hidden = !show || isPlainXf(xf);
  $('tile-xf-state').textContent = t('tile.xfState');
  for (const id of ['tile-rot-ccw', 'tile-rot-cw']) $(id).disabled = ts.tw !== ts.th;
  $('tile-xf-reset').disabled = isPlainXf(xf);
  const tile = show && shownTile(ts);
  const cv = $('tile-xf-prev');
  if (tile) gridToCanvas(cv, tile, getPal());
  cv.hidden = !tile;
}

function setMode(m) {
  state.tileMode = m;
  hover = null;
  renderTilePanel();
  renderEditor();
  saveState();
}

export function initTilemap() {
  const fillSizes = sel => {
    sel.innerHTML = TILE_SIZES.map(n => `<option value="${n}">${n} px</option>`).join('');
    sel.value = String(DEFAULT_TILE);
  };
  fillSizes($('tile-w'));
  fillSizes($('tile-h'));
  // Quadratisch ist der Normalfall: Breite ändern zieht die Höhe mit.
  $('tile-w').addEventListener('change', () => { $('tile-h').value = $('tile-w').value; });
  $('tile-new').addEventListener('click', newTilemapLayer);
  $('tile-convert').addEventListener('click', convertLayer);
  $('tile-unmap').addEventListener('click', unmapLayer);
  $('tile-prune').addEventListener('click', prune);
  $('tile-godot').addEventListener('click', exportGodot);
  $('tile-mode-pixel').addEventListener('click', () => setMode('pixel'));
  $('tile-mode-tiles').addEventListener('click', () => setMode('tiles'));
  $('tile-rot-ccw').addEventListener('click', () => turnTile('ccw'));
  $('tile-rot-cw').addEventListener('click', () => turnTile('cw'));
  $('tile-flip-h').addEventListener('click', () => turnTile('h'));
  $('tile-flip-v').addEventListener('click', () => turnTile('v'));
  $('tile-xf-reset').addEventListener('click', () => turnTile('reset'));
  $('tile-lib-save').addEventListener('click', saveToLib);
  $('tile-lib-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveToLib(); });
  $('tile-lib-reload').addEventListener('click', () => { const ts = activeTileset(); if (ts?.lib) useFromLib(ts.lib); });
  $('tile-lib-sel').addEventListener('change', renderLib);
  $('tile-lib-new').addEventListener('click', newLayerFromLib);
  $('tile-lib-use').addEventListener('click', () => useFromLib(libSel()));
  $('tile-lib-del').addEventListener('click', deleteFromLib);
  $('tile-lib-export').addEventListener('click', exportLibSet);
  $('tile-lib-file').addEventListener('change', e => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    importLibFile(input.files?.[0]);
    input.value = '';
  });
  $('tile-auto').addEventListener('change', e => { state.tileAuto = e.target.value === 'manual' ? 'manual' : 'auto'; renderTilePanel(); saveState(); });

  const canvas = $('editor-canvas');
  canvas.addEventListener('pointermove', e => { if (tileModeOn()) tilePointerMove(e); });
  canvas.addEventListener('pointerleave', () => { if (hover) { hover = null; renderEditor(); } });
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  renderCallbacks.onDrawTiles = drawTiles;
  historyCallbacks.beforeCommit = (id, before) => {
    const sp = sprites[id];
    if (!sp?.layers.some(l => l.tileset)) return;
    const r = syncSprite(sp, before, { paint: state.tileMode !== 'tiles', mode: state.tileAuto });
    if (r.blocked) showInfoToast(t('tile.blocked'));
    // Mitgezogene Kacheln stehen auch an anderen Stellen und in anderen
    // Frames — die müssen neu gezeichnet werden, nicht nur der Strich.
    queueMicrotask(r.edited || r.blocked ? renderAll : renderTilePanel);
  };
  renderCallbacks.onRenderTiles = renderTilePanel;
  onLangChange(renderTilePanel);
}
