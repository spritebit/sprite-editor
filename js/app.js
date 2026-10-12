// ════════════════════════════════════════════════════════════════════
// APP — Haupt-Entry: Init + Event-Bindings + Wiring zwischen Modulen
// ════════════════════════════════════════════════════════════════════
import {
  state, sprites, paletteMaterials, selection, flatGrid, defaultLayer, colorName,
  getGrid, getSprite, getPal, getMaxIdx, getPaletteName, getPreviewName, listSprites,
  createSprite, clearSelection, isInSelection, blankLike, editingMask,
  paletteExists, getPaletteByName,
} from './state.js';
import { parseStartHash } from './fromstart.js';
import { initHelper, relabelHelper, hint, openHelpAt, openSearch } from './helper.js';
import { DEFAULT_PALETTE, MAX_COLORS, paletteSize } from './data.js';
import {
  t, tn, colorLabelShort, applyStatic, initLangSwitch, onLangChange, getLang,
} from './i18n.js';
import { initDock } from './dock.js';
import { initLayout, isMobileLayout, refreshToolOpts } from './layout.js';
import { initTabs } from './tabs.js';
import { initWhatsNew } from './whatsnew.js';
import { initToolWrap } from './toolwrap.js';
import { initProjectsUi } from './projectsui.js';
import { draggedSize, clampSize, SIZED_TOOLS, sliderToSize, sizeToSlider } from './sizedrag.js';
import { calcInput } from './calc.js';
import { snapDir, project, snapEnd } from './lock.js';
import { applyIcons, iconSvg } from './icons.js';
import { showConfirmToast, showInfoToast } from './toast.js';
import {
  renderAll, renderEditor, renderSpriteList, syncColorActive, updateOutput, currentCode, renderMaterials,
  renderFreeColorsList, countCurrentColor,
  cellFromEvent, cellFromEventRaw, cellFromEventClamped, cellToColor, colorHooks, paintCell, paintStamp, stampActive, stampForPalette, STAMP_TOOLS, paintBrush, paintSpray, floodFill,
  ppActive, ppBegin, ppEnd, paintPixelPerfect, shadeBegin, shadeEnd, paintShade, shadeDwell, syncShadeMarks,
  renderCallbacks, shapeCells, commitShape, placeHiddenPicker, updateCurrentColorIndicator,
} from './render.js';
import {
  saveState, loadState, clearStorage, forceSaveBeforeUnload, saveToFile, loadFromFile,
  saveSpriteToFile, addSpritesFromFile, saveAseToFile,
  backupInfo, downloadBackup, restoreBackup,
} from './storage.js';
import { supportsFsAccess, pickSaveDirectory, getStoredDirName, saveBlob } from './filesystem.js';
import {
  initNewSpriteModal, initRenameModal, openRenameModal, initSizeModal, openSizeModal,
  selectSprite, deleteSprite, duplicateSprite, createDefaultSprite, clearCurrentGrid,
} from './sprites.js';
import {
  openPaletteModal, initPaletteModal, deleteCustomPalette,
  previewPalette, assignPalette, forkPreviewPalette, addFreeColorsToPalette,
  createPaletteFromImport, appendPaletteColor, setPaletteColor, removePaletteColor,
  addCurrentColorToPalette, addColorsToPalette,
} from './palettes.js';
import {
  initTemplate, tplLoaded, tplHasOffscreen,
  startTplDrag, tplDragging, updateTplDrag, endTplDrag, getTplOffset,
  doTemplatePipette, sampleTemplateGrid,
  forgetTemplate,
} from './template.js';
import {
  medianCut, nearestColor, rgbToHex, hexToRgb,
  despeckleGrid, outlineGrid, magicWandDelete, autoRemoveBackground,
} from './spritefx.js';
import { replaceColor, recolorTargets, RECOLOR_SCOPES } from './recolor.js';
import { makeStamp, stampOrigin } from './stamp.js';
import { toSaved, fromSaved, addBrush, normalizeBrushes } from './brushlib.js';
import { normalizeFx, fxSource, fxFor, recomputeFx, fxStale, lightCel, shadowCel } from './light.js';
import { HOLD_MIN_MS, makeShades, sortRamp } from './shade.js';
import { initExport } from './export.js';
import { openReduceModal, initReduceModal } from './reduce.js';
import { zoomAt, fitZoomToArea, isPanMode, setPanTool, initPan, initPinch } from './view.js';
import { initFrames, togglePlay, nextFrame, prevFrame, firstFrame, lastFrame, isPlaying, stop as stopPlayback } from './frames.js';
import { initLayers, toggleLocked, toggleVisible, toggleMaskEdit, toggleMaskOn, setOpacity, setActiveLayer } from './layers.js';
import { celKeyDown } from './frames.js';
import { initTlMenu } from './tlmenu.js';
import { initQuickPaletteDrag } from './qpdrag.js';
import { initMenubar } from './menubar.js';
import { initFullscreen, enterFullscreen, exitFullscreen } from './fullscreen.js';
import { normalizeTags } from './tags.js';
import { initPreview, renderPreview } from './preview.js';
import { initTilemap, tileModeOn, tilePointerDown, turnTile } from './tilemap.js';
import { initGuides, guidePointerDown, guideAt, toggleShow as toggleGuides } from './guides.js';
import { TILED_MODES } from './tiled.js';
import { parseTsSprite } from './tsimport.js';
import { CODE_FORMATS, getFormat, codeFilename } from './codegen.js';
import {
  beginStroke, commitStroke, recordOp, undo, redo,
  canUndo, canRedo, clearHistory, historyCallbacks, rollbackTo,
} from './history.js';
import {
  startMarquee, updateMarquee, startLasso, updateLasso, startMove, updateMove, handleAt, startScale, updateScale,
  endSelectionPointer, selectByColor, fillSelection, commitFloat, isFloating,
  selectAll, deselect, nudgeSelection, selectionInfo,
  copySelection, cutSelection, pasteClipboard, deleteSelection, hasClipboard,
  selectionPixels,
} from './selection.js';
import {
  flip, rotate90, trimToContent, centerContent, resizeCanvas, scaleSprite, scopeLabel, scopeLabelFor,
  beginFreeRotate, previewFreeRotate, applyFreeRotate, cancelFreeRotate, isRotating,
} from './transform.js';

// Kurz fuer document.getElementById. Der Rueckgabetyp ist bewusst `any`:
// die Felder (.value, .checked, .disabled) gehoeren zu den konkreten
// Element-Arten, und ein Cast an jeder Fundstelle waere mehr Laerm als Nutzen.
/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);

// ────────────────────────────────────────────────────────────────────
// Render-Callbacks (vermeidet Zirkularimporte render <-> Feature-Module)
// ────────────────────────────────────────────────────────────────────
renderCallbacks.onSave             = saveState;
renderCallbacks.onSelectSprite     = id => {
  stopRotating(true);
  commitFloat();
  selectSprite(id);
};
renderCallbacks.onRenameSprite     = openRenameModal;
renderCallbacks.onResizeSprite     = openSizeModal;
renderCallbacks.onDuplicateSprite  = duplicateSprite;
renderCallbacks.onOpenPaletteModal = openPaletteModal;
renderCallbacks.onEditPalette      = openPaletteModal;
renderCallbacks.onImageToPalette   = openReduceModal;
renderCallbacks.onAppendColor      = appendPaletteColor;
renderCallbacks.onSetColor         = setPaletteColor;
renderCallbacks.onRemoveColor      = removePaletteColor;
renderCallbacks.onSyncImagePanel   = () => syncImagePanel();

renderCallbacks.onDeleteSprite = id => {
  const name = sprites[id]?.name || id;
  showConfirmToast(t('sprite.confirmDelete', { name }), () => deleteSprite(id));
};

renderCallbacks.onDeletePalette = name => {
  const used = Object.values(sprites).filter(s => s.palette === name).length;
  const extra = used ? tn('pal.usedBy', used) : '';
  showConfirmToast(t('pal.confirmDelete', { name, extra }), () => deleteCustomPalette(name));
};

// ────────────────────────────────────────────────────────────────────
// History → UI
// ────────────────────────────────────────────────────────────────────
function syncHistoryButtons() {
  const u = $('undo-btn'), r = $('redo-btn');
  if (u) u.disabled = !canUndo();
  if (r) r.disabled = !canRedo();
}
historyCallbacks.onChange = syncHistoryButtons;
// Nach einem Undo passt eine Auswahl nicht mehr zum Bild — weg damit. Ein
// schwebender Inhalt wurde vorher schon abgesetzt (siehe Undo-Bindings).
historyCallbacks.onRestore = () => {
  stopPlayback();
  clearSelection();
  // Nach Undo einer Paletten-Änderung kann die gewählte Nummer fehlen.
  if (typeof state.curColor === 'number' && state.curColor > paletteSize(getPal())) state.curColor = 1;
  renderAll();
  saveState();
};

// ────────────────────────────────────────────────────────────────────
// SCHABLONE ÜBERNEHMEN — Auto-Trace ins Grid
// ────────────────────────────────────────────────────────────────────
// Palette-Index (1..maxIdx), dessen Farbe der RGB-Farbe am nächsten liegt.
function nearestPaletteIndex(c, pal, maxIdx) {
  let best = 1, bestD = Infinity;
  for (let i = 1; i <= maxIdx; i++) {
    const hex = pal[i];
    if (!hex) continue;
    const p = hexToRgb(hex);
    const d = (c.r - p.r) ** 2 + (c.g - p.g) ** 2 + (c.b - p.b) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

const TRACE_ALPHA_MIN = 32; // darunter gilt ein Schablonen-Pixel als transparent

// mode 'palette'  → auf die aktuelle Palette einrasten (Export-tauglich)
// mode 'raw'      → freie Hex-Pixel (fotorealistisch)
// mode 'quantize' → per Median-Cut auf n dominante Töne reduzieren
function applyTemplateTrace(mode, n) {
  if (!getSprite()) { showInfoToast(t('tpl.needSprite')); return; }
  if (layerBlocked(true)) return;
  if (!tplLoaded() || !tplHasOffscreen()) { showInfoToast(t('tpl.needTpl')); return; }

  const grid = getGrid();
  const H = grid.length, W = grid[0].length;
  const sampled = sampleTemplateGrid(W, H);
  if (!sampled) { showInfoToast(t('tpl.sampleFail')); return; }

  const pal = getPal();
  const maxIdx = getMaxIdx();

  let qpal = null;
  if (mode === 'quantize') {
    const px = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = sampled[y][x];
      if (c && c.a >= TRACE_ALPHA_MIN) px.push(c);
    }
    qpal = medianCut(px, Math.max(2, Math.min(64, n || 8)));
    if (!qpal.length) { showInfoToast(t('tpl.noColors')); return; }
  }

  let painted = 0;
  recordOp(() => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = sampled[y][x];
        if (!c || c.a < TRACE_ALPHA_MIN) continue; // außerhalb / transparent
        let val;
        if (mode === 'palette')       val = nearestPaletteIndex(c, pal, maxIdx);
        else if (mode === 'quantize') { const q = nearestColor(c, qpal); val = rgbToHex(q.r, q.g, q.b); }
        else                          val = rgbToHex(c.r, c.g, c.b);
        if (grid[y][x] !== val) { grid[y][x] = val; painted++; }
      }
    }
  });

  renderAll();
  const lbl = mode === 'palette' ? t('tpl.modePalette')
            : mode === 'quantize' ? t('tpl.modeQuant', { n: qpal.length })
            : t('tpl.modeRaw');
  showInfoToast(painted
    ? t('tpl.traced', { n: painted, mode: lbl })
    : t('tpl.tracedNone'));
}

// ────────────────────────────────────────────────────────────────────
// Tool-Dispatch + UI-Sync
// ────────────────────────────────────────────────────────────────────
// Umschalt beim Malen (js/lock.js): die Richtung rastet auf waagerecht,
// senkrecht oder 45° ein. `start` ist die Stelle, an der Umschalt griff;
// `last` der zuletzt gemalte Punkt (dazwischen wird als Linie gefüllt).
let lock = null; // { start, dir, last }

function strokeTo(c, shift) {
  if (!lock) { applyTool(c.x, c.y); return; }
  if (!shift) {
    // Ohne Umschalt frei — und der nächste Umschalt-Zug beginnt hier.
    applyTool(c.x, c.y);
    lock = { start: c, dir: null, last: c };
    return;
  }
  if (!lock.dir) {
    lock.dir = snapDir(c.x - lock.start.x, c.y - lock.start.y);
    if (!lock.dir) return;
  }
  const q = project(lock.start, lock.dir, c);
  if (q.x === lock.last.x && q.y === lock.last.y) return;
  for (const [x, y] of shapeCells('line', lock.last, q)) applyTool(x, y);
  lock.last = q;
}

// Formen mit Umschalt: Linie auf 0°/45°/90°, Rechteck und Ellipse gleich breit wie hoch.
function shapeEnd(start, c, shift) {
  if (!shift) return c;
  if (state.tool === 'line') return snapEnd(start, c);
  const dx = c.x - start.x, dy = c.y - start.y;
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + (dx < 0 ? -d : d), y: start.y + (dy < 0 ? -d : d) };
}

function applyTool(x, y) {
  // Eigener Pinsel (js/stamp.js): Stift, Pinsel und Radierer setzen seine Form.
  if (stampActive()) { paintStamp(x, y, state.tool === 'eraser'); return; }
  // Pixel-perfect: Stift und Radierer mit 1 px.
  if (ppActive()) { paintPixelPerfect(x, y, state.tool === 'eraser' ? 0 : state.curColor); return; }
  if (state.tool === 'brush')  { paintBrush(x, y);  return; }
  if (state.tool === 'spray')  { paintSpray(x, y);  return; }
  if (state.tool === 'shade') {
    paintShade(x, y);
    shadeAt = { x, y };
    return;
  }
  if (state.tool === 'fill')   { floodFill(x, y);   return; }
  if (state.tool === 'eraser') {
    const prev = state.curColor;
    state.curColor = 0;
    paintBrush(x, y);
    state.curColor = prev;
    return;
  }
  paintCell(x, y); // pencil
}

// Werkzeug-Familien — bestimmen, welche Bedienelemente sichtbar sind und
// wie pointerdown reagiert.
const SELECT_TOOLS = ['select', 'lasso', 'magic'];
const SHAPE_TOOLS  = ['line', 'rect', 'ellipse'];
const isSelectTool = t => SELECT_TOOLS.includes(t);

// Auswahl-Modus beim Ansetzen: Umschalt legt dazu, Strg (Mac: Cmd) zieht
// ab — sonst gilt der Knopf in der Options-Zeile (für Finger).
/** @type {'new'|'add'|'sub'} */
let selOp = 'new';
const selOpFor = e => e.shiftKey ? 'add' : (e.ctrlKey || e.metaKey) ? 'sub' : selOp;

function setSelOp(op) {
  selOp = op;
  for (const [id, o] of /** @type {[string, string][]} */ ([['sel-op-new', 'new'], ['sel-op-add', 'add'], ['sel-op-sub', 'sub']])) {
    $(id).classList.toggle('is-active', o === op);
    $(id).setAttribute('aria-pressed', String(o === op));
  }
}
const isShapeTool  = t => SHAPE_TOOLS.includes(t);

function setTool(tool) {
  stopRotating(true);
  // Schwebender Auswahl-Inhalt gehört ins Bild, bevor ein anderes Werkzeug
  // drankommt — sonst wäre er beim Abwählen weg.
  if (!isSelectTool(tool)) commitFloat();
  // Beim Wechsel weg von den Auswahl-Werkzeugen verschwindet auch die Auswahl —
  // ein Rahmen, den kein Werkzeug mehr anfassen kann, verwirrt nur.
  if (!isSelectTool(tool) && isSelectTool(state.tool)) { commitFloat(); clearSelection(); }
  // Eine halb gezogene Form gehoert zum alten Werkzeug.
  shapeStart = null;
  state.shape.cells = [];
  state.tool = tool;
  updateToolUI();
  renderEditor();
  saveState();
}

function updateToolUI() {
  document.querySelectorAll('.tool-btn').forEach(b => {
    const on = b.dataset.tool === state.tool;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  $('editor-canvas-wrap').dataset.tool = state.tool;
  // Die Hand malt nicht, sie schiebt nur — das weiss die Ansicht.
  setPanTool(state.tool === 'pan');

  const hasSize = SIZED_TOOLS.includes(state.tool);
  const needsTolerance = state.tool === 'wand' || state.tool === 'magic';
  $('brush-size-group').hidden = !hasSize;
  $('strength-group').hidden   = !hasSize || state.tool === 'shade';
  $('shade-group').hidden      = state.tool !== 'shade';
  syncBrushShape();
  $('tolerance-group').hidden  = !needsTolerance;
  $('select-group').hidden     = !isSelectTool(state.tool);
  $('shape-group').hidden      = !isShapeTool(state.tool);
  $('fill-group').hidden       = state.tool !== 'fill';
  $('pixel-perfect-group').hidden = !['pencil', 'eraser'].includes(state.tool);
  syncStamp();
  if (!isSelectTool(state.tool)) $('editor-canvas-wrap').classList.remove('is-move');
  syncShadeMarks();
  renderShadeRamp();
  updateSelectionUI();
  refreshToolOpts();
}

// ── Schattieren: Options-Zeile (js/shade.js) ──
// Die Farbreihe als kleine Felder in Mal-Reihenfolge — so, wie man die
// Farben angeklickt hat; ein Tipp nimmt eine wieder heraus. Gewählt wird
// in der Farbzeile oder im Paletten-Panel (render.js pickSwatch). Dazu
// Abstufungen, nach Farbstufen ordnen, Umdrehen (Finger) und Verlauf.
function renderShadeRamp() {
  const box = $('shade-ramp');
  if (!box) return;
  box.innerHTML = '';
  const ramp = state.shadeRamp;
  if (!ramp.length) {
    const hint = document.createElement('span');
    hint.className = 'shade-empty';
    hint.textContent = t('shade.empty');
    box.append(hint);
  }
  // In Mal-Reihenfolge: links die Farbe, die ein leerer Pixel bekommt.
  for (const hex of shadeUp() ? [...ramp].reverse() : ramp) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'shade-sw';
    b.style.background = hex;
    b.title = t('shade.swTitle', { hex });
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', () => {
      state.shadeRamp = ramp.filter(h => h !== hex);
      renderShadeRamp();
      syncShadeMarks();
      saveState();
    });
    box.append(b);
  }
  $('shade-clear-btn').disabled = !ramp.length;
  $('shade-sort-btn').disabled = ramp.length < 2;
  for (const [id, on] of /** @type {[string, boolean][]} */ ([['shade-rev-btn', shadeUp()], ['shade-soft-btn', state.shadeSoft]])) {
    $(id).classList.toggle('is-active', on);
    $(id).setAttribute('aria-pressed', String(on));
  }
}
renderCallbacks.onShadeRamp = renderShadeRamp;

// „Umdrehen" gibt es nur für Finger — mit Maus malt Rechtsklick die Reihe
// andersherum, auch im schmalen Fenster. Dort gilt die gemerkte
// Einstellung darum nicht. Dieselbe Abfrage wie in styles.css.
const TOUCH = window.matchMedia('(pointer: coarse)');
const shadeUp = () => state.shadeUp && TOUCH.matches;

// Schattieren ansetzen: true, wenn es losgehen kann. `along` = die Reihe
// entlang (Linksklick: leer → erste Farbe, dann die nächste; js/shade.js),
// sonst andersherum. Ohne Reihe läuft es mit der aktuellen Farbe und wird
// dunkler bzw. heller; eine Reihe mit nur einer Farbe kann nichts schieben
// — dann ein Hinweis statt eines stummen Strichs.
function startShade(along) {
  if (editingMask()) { info(t('shade.noMask')); return false; }
  if (state.shadeRamp.length === 1) { showInfoToast(t('shade.needRamp')); return false; }
  shadeBegin(along ? -1 : 1);
  // Gedrückt halten wie eine Airbrush: die Pixel unter dem Pinsel sammeln
  // Zeit und gehen damit weiter — auch beim langsamen Malen, gleichmäßig je
  // Pixel (render.js shadeDwell, js/shade.js holdSteps).
  clearInterval(shadeTimer);
  let last = performance.now();
  shadeTimer = setInterval(() => {
    const now = performance.now();
    const ms = now - last;
    last = now;
    if (state.isDrawing && state.tool === 'shade' && shadeAt) shadeDwell(shadeAt.x, shadeAt.y, ms);
  }, HOLD_MIN_MS / 3);
  return true;
}
let shadeTimer = 0;
/** @type {{x: number, y: number} | null} */
let shadeAt = null;

// Ein Strich, der nichts geändert hat, sagt, warum — sonst sähe es aus,
// als ginge das Werkzeug nicht. Als Toast nur beim ersten Mal, danach in
// der Statuszeile.
let shadeNoteShown = false;
function shadeNothing() {
  const msg = t(state.shadeRamp.length ? 'shade.nothingRamp' : 'shade.nothingAuto');
  if (shadeNoteShown) { info(msg); return; }
  shadeNoteShown = true;
  showInfoToast(msg);
}

// Symmetrie-Knöpfe und Achsenzustand zusammenhalten.
function updateMirrorUI() {
  const x = state.mirror === 'x' || state.mirror === 'both';
  const y = state.mirror === 'y' || state.mirror === 'both';
  /** @type {[string, boolean][]} */
  const pairs = [['mirror-x-btn', x], ['mirror-y-btn', y]];
  for (const [id, on] of pairs) {
    const b = $(id);
    if (!b) continue;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  }
}

function toggleMirror(axis) {
  const x = state.mirror === 'x' || state.mirror === 'both';
  const y = state.mirror === 'y' || state.mirror === 'both';
  const nx = axis === 'x' ? !x : x;
  const ny = axis === 'y' ? !y : y;
  state.mirror = nx && ny ? 'both' : nx ? 'x' : ny ? 'y' : 'off';
  updateMirrorUI();
  renderEditor();
  saveState();
  info(state.mirror === 'off'
    ? t('info.mirrorOff')
    : t('info.mirrorOn', { axes: t(`axes.${state.mirror === 'both' ? 'both' : state.mirror}`) }));
}

// Auswahl-Buttons scharf schalten, je nachdem was gerade möglich ist.
let hadSelection = false;
function updateSelectionUI() {
  syncImagePanel();
  const has = !!selection.rect;
  ['sel-cut-btn', 'sel-copy-btn', 'sel-delete-btn', 'sel-none-btn', 'sel-fill-btn', 'sel-brush-btn'].forEach(id => {
    const b = $(id);
    if (b) b.disabled = !has;
  });
  const paste = $('sel-paste-btn');
  if (paste) paste.disabled = !hasClipboard();
  // Frisch gezogene Auswahl: die Aktionen dazu liegen auf dem Handy in der
  // Options-Zeile — die klappt jetzt von selbst auf.
  if (has && !hadSelection) refreshToolOpts(true);
  hadSelection = has;
}

// ────────────────────────────────────────────────────────────────────
// Canvas-Events
// ────────────────────────────────────────────────────────────────────
function eraseAt(e) {
  const c = cellFromEventRaw(e);
  if (!c) return;
  if (stampActive()) { paintStamp(c.x, c.y, true); return; }
  if (ppActive()) { paintPixelPerfect(c.x, c.y, 0); return; }
  const prev = state.curColor;
  state.curColor = 0;
  paintCell(c.x, c.y);
  state.curColor = prev;
}

// Größenvorschau am Mauszeiger — zeigt exakt die Reichweite des Werkzeugs.
function updateBrushCursor(e) {
  const el = $('brush-cursor');
  if (!el) return;
  const tool = state.tool;
  const stamp = stampActive();
  if (!SIZED_TOOLS.includes(tool) && !stamp) { el.hidden = true; return; }
  const c = cellFromEventRaw(e);
  if (!c) { el.hidden = true; return; }

  const cs = state.cellSize;
  // Eigener Pinsel: Rahmen um seine Form, darin die Form halb durchsichtig.
  el.classList.toggle('is-stamp', stamp);
  if (stamp) {
    const s = /** @type {NonNullable<typeof state.stamp>} */ (state.stamp);
    const o = stampOrigin(s, c.x, c.y);
    el.className = 'tool-' + tool + ' is-stamp';
    el.style.left = o.x * cs + 'px';
    el.style.top = o.y * cs + 'px';
    el.style.width = s.w * cs + 'px';
    el.style.height = s.h * cs + 'px';
    el.style.borderRadius = '0';
    el.style.backgroundImage = 'url(' + stampPreviewUrl() + ')';
    el.hidden = false;
    return;
  }
  el.style.backgroundImage = '';
  let left, top, size, round;
  if (tool === 'spray') {
    const r = state.brushSize;
    left = (c.x - r) * cs; top = (c.y - r) * cs;
    size = (2 * r + 1) * cs; round = true;
  } else {
    const lo = -Math.floor((state.brushSize - 1) / 2);
    left = (c.x + lo) * cs; top = (c.y + lo) * cs;
    // Runder Pinsel — und Schattieren mit Verlauf — wirken rund.
    size = state.brushSize * cs;
    round = state.brushSize > 2 && (state.brushRound || (tool === 'shade' && state.shadeSoft));
  }
  el.className = 'tool-' + tool;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.width = size + 'px';
  el.style.height = size + 'px';
  el.style.borderRadius = round ? '50%' : '0';
  el.hidden = false;
}

// Startpunkt der gerade gezogenen Form (null = keine Form im Gange).
let shapeStart = null;

// Alt + rechte Maustaste ziehen: Größe von Pinsel, Radierer, Spray
// (js/sizedrag.js). x = Startpunkt, size = Größe beim Start, at = das
// Ereignis am Start — dort bleibt die Vorschau stehen.
let sizeDrag = null;

function syncFillVisible() {
  $('fill-visible-btn').classList.toggle('is-active', state.fillVisible);
  $('fill-visible-btn').setAttribute('aria-pressed', String(state.fillVisible));
  $('fill-contig-btn').classList.toggle('is-active', state.fillContig);
  $('fill-contig-btn').setAttribute('aria-pressed', String(state.fillContig));
}

// ── Eigener Pinsel (js/stamp.js) ──
// Strg+B oder „Als Pinsel“ in der Auswahl-Zeile: der Inhalt der Auswahl wird
// zum Pinsel für Stift, Pinsel und Radierer. Noch einmal Strg+B (ohne
// Auswahl) oder × in der Options-Zeile: zurück zum normalen Pinsel.
/** @type {{stamp: any, pal: any, mono: any, url: string}} */
let stampPreview = { stamp: null, pal: null, mono: null, url: '' };

/** Bild des Pinsels (1 Pixel je Zelle) für Vorschau und Mauszeiger. */
function stampPreviewUrl() {
  const s = stampForPalette();
  if (!s) return '';
  const pal = getPal();
  const mono = state.stampMono ? state.curColor : null;
  const p = stampPreview;
  if (p.stamp === state.stamp && p.pal === pal && p.mono === mono) return p.url;
  const cv = document.createElement('canvas');
  cv.width = s.w; cv.height = s.h;
  const ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const v = s.cells[y][x];
    if (v === 0) continue;
    const hex = cellToColor(state.stampMono ? state.curColor : v, pal) || '#000000';
    ctx.fillStyle = hex;
    ctx.fillRect(x, y, 1, 1);
  }
  stampPreview = { stamp: state.stamp, pal, mono, url: cv.toDataURL() };
  return stampPreview.url;
}

function syncStamp() {
  const on = stampActive();
  $('stamp-group').hidden = !on;
  // Gespeicherte Pinsel: bei Stift, Pinsel und Radierer, sobald es welche gibt.
  $('brushlib-group').hidden = !STAMP_TOOLS.includes(state.tool) || !savedBrushes.length;
  if ($('brushlib-group').hidden) closeBrushLib();
  if (on) {
    const s = /** @type {NonNullable<typeof state.stamp>} */ (state.stamp);
    const img = /** @type {HTMLImageElement} */ ($('stamp-preview'));
    img.src = stampPreviewUrl();
    // Kleine Pinsel groß zeigen, große auf 32 px Höhe begrenzen.
    const k = Math.max(1, Math.min(8, Math.floor(32 / Math.max(s.w, s.h)))) || 1;
    img.style.width = Math.min(96, s.w * k) + 'px';
    img.style.height = Math.min(32, s.h * k) + 'px';
    $('stamp-size').textContent = s.w + '×' + s.h;
    $('stamp-mono-btn').classList.toggle('is-active', state.stampMono);
    $('stamp-mono-btn').setAttribute('aria-pressed', String(state.stampMono));
  }
  // Größe, Form und Stärke gelten für den eigenen Pinsel nicht.
  if (on) {
    $('brush-size-group').hidden = true;
    $('strength-group').hidden = true;
    $('pixel-perfect-group').hidden = true;
  }
  const b = $('sel-brush-btn');
  if (b) b.disabled = !selection.rect;
}

// ── Gespeicherte Pinsel (js/brushlib.js) ──
// Liegen für alle Projekte im Browser (wie die Hilfslinien-Layouts).
const BRUSHES_KEY = 'spritebit_brushes';
/** @type {import('./brushlib.js').SavedBrush[]} */
let savedBrushes = [];
try { savedBrushes = normalizeBrushes(JSON.parse(localStorage.getItem(BRUSHES_KEY) || '[]')); } catch { savedBrushes = []; }

function storeBrushes() {
  try { localStorage.setItem(BRUSHES_KEY, JSON.stringify(savedBrushes)); } catch { /* privates Fenster o. Ä. */ }
}

/** Kleines Bild eines gespeicherten Pinsels (1 Pixel je Zelle). */
function savedBrushUrl(b) {
  const cv = document.createElement('canvas');
  cv.width = b.w; cv.height = b.h;
  const ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  b.px.forEach((c, i) => {
    if (!c) return;
    ctx.fillStyle = c;
    ctx.fillRect(i % b.w, Math.floor(i / b.w), 1, 1);
  });
  return cv.toDataURL();
}

function saveStamp() {
  if (!state.stamp) return;
  const saved = toSaved(state.stamp, state.stamp.pal);
  const had = savedBrushes.length;
  savedBrushes = addBrush(savedBrushes, saved);
  storeBrushes();
  syncStamp();
  info(t(savedBrushes.length > had ? 'stamp.saved' : 'stamp.savedAgain'));
}

function closeBrushLib() {
  $('brushlib-pop').hidden = true;
  $('brushlib-btn').setAttribute('aria-expanded', 'false');
}

function openBrushLib() {
  const pop = $('brushlib-pop');
  if (!pop.hidden) { closeBrushLib(); return; }
  pop.replaceChildren(...savedBrushes.map((b, i) => {
    const item = document.createElement('div');
    item.className = 'brushlib-item';
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'brushlib-pick';
    pick.setAttribute('role', 'option');
    pick.title = b.w + '×' + b.h;
    const img = document.createElement('img');
    img.src = savedBrushUrl(b);
    img.alt = b.w + '×' + b.h;
    // Seitenverhältnis behalten, in 40×40 einpassen.
    const k = 40 / Math.max(b.w, b.h);
    img.style.width = Math.max(1, Math.round(b.w * k)) + 'px';
    img.style.height = Math.max(1, Math.round(b.h * k)) + 'px';
    pick.append(img);
    pick.addEventListener('click', () => {
      state.stamp = fromSaved(b);
      closeBrushLib();
      if (!STAMP_TOOLS.includes(state.tool)) setTool('pencil'); else updateToolUI();
      info(t('stamp.made', { w: b.w, h: b.h }));
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'brushlib-del';
    del.title = t('stamp.delete');
    del.setAttribute('aria-label', t('stamp.delete'));
    del.textContent = '×';
    del.addEventListener('click', () => {
      savedBrushes = savedBrushes.filter((_, k) => k !== i);
      storeBrushes();
      closeBrushLib();
      syncStamp();
      if (savedBrushes.length) openBrushLib();
    });
    item.append(pick, del);
    return item;
  }));
  pop.hidden = false;
  $('brushlib-btn').setAttribute('aria-expanded', 'true');
}

function makeStampFromSelection() {
  const px = selectionPixels();
  if (!px) return false;
  const s = makeStamp(px.cells, px.mask);
  if (!s) { info(t('stamp.empty')); return true; }
  state.stamp = { ...s, pal: getPal() };
  deselect();
  updateSelectionUI();
  if (!STAMP_TOOLS.includes(state.tool)) setTool('pencil');
  else updateToolUI();
  info(t('stamp.made', { w: s.w, h: s.h }));
  return true;
}

function dropStamp() {
  if (!state.stamp) return false;
  state.stamp = null;
  $('brush-cursor').hidden = true;
  updateToolUI();
  info(t('stamp.dropped'));
  return true;
}

// Farbe ersetzen (js/recolor.js): die gewählten Farben als Pixelwerte —
// null = noch nicht gewählt, 0 = leer. Nur für diesen Besuch.
// Gewählt wird in einer kleinen Farbwahl am Knopf: ein Klick in die Palette
// schlösse das ausgeklappte Panel.
const recolor = { from: /** @type {any} */ (null), to: /** @type {any} */ (null), open: /** @type {'from'|'to'|null} */ (null) };

function openRecolorPop(which) {
  const pop = $('recolor-pop');
  if (recolor.open === which) { closeRecolorPop(); return; }
  recolor.open = which;
  const pal = getPal();
  // Leer, alle Palettenfarben und — falls frei (Pipette) — die aktuelle Farbe.
  const values = /** @type {any[]} */ ([0]);
  for (let i = 1; i <= getMaxIdx(); i++) if (pal[i]) values.push(i);
  if (typeof state.curColor === 'string') values.push(state.curColor);
  pop.replaceChildren(...values.map(v => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'recolor-chip recolor-opt';
    b.setAttribute('role', 'option');
    const hex = cellToColor(v, pal);
    if (hex) b.style.background = hex;
    b.title = v === 0 ? t('cln.recolorEmpty') : (typeof v === 'number' && colorName(v)) || hex || '';
    b.classList.toggle('is-active', v === recolor[which]);
    b.addEventListener('click', () => { recolor[which] = v; closeRecolorPop(); syncRecolor(); });
    return b;
  }));
  const btn = $('recolor-' + which);
  pop.style.left = btn.offsetLeft + 'px';
  pop.style.top = (btn.offsetTop + btn.offsetHeight + 4) + 'px';
  pop.hidden = false;
}

function closeRecolorPop() {
  recolor.open = null;
  $('recolor-pop').hidden = true;
}

function syncRecolor() {
  const pal = getPal();
  for (const which of /** @type {const} */ (['from', 'to'])) {
    const chip = $('recolor-' + which + '-chip'), v = recolor[which];
    chip.classList.toggle('is-unset', v === null);
    const hex = v === null ? null : cellToColor(v, pal);
    chip.style.background = hex || '';
    chip.title = v === null ? '' : v === 0 ? t('cln.recolorEmpty') : hex || '';
  }
  $('recolor-scope').value = state.recolorScope;
}

function applyRecolor() {
  const { from, to } = recolor;
  if (from === null || to === null) { showInfoToast(t('cln.recolorUnset')); return; }
  const pal = getPal();
  if (from === to || (from !== 0 && to !== 0 && cellToColor(from, pal)?.toLowerCase() === cellToColor(to, pal)?.toLowerCase())) {
    showInfoToast(t('cln.recolorSame')); return;
  }
  const sp = getSprite();
  if (!sp) return;
  // Nur im aktuellen Bild zählt die Sperre der aktiven Ebene; sonst
  // überspringt recolorTargets gesperrte Ebenen selbst.
  if (state.recolorScope !== 'all' && layerBlocked(true)) return;
  // Mit Auswahl nur darin (ein schwebender Inhalt zählt nicht als Auswahl).
  const keep = selection.rect && !selection.float ? isInSelection : undefined;
  let n = 0;
  recordOp(() => { for (const g of recolorTargets(sp, /** @type {any} */ (state.recolorScope))) n += replaceColor(g, from, to, pal, keep); });
  if (n) renderAll();
  showInfoToast(n ? t('cln.recolored', { n }) : t('cln.recolorNone'));
}

// Pinselform: eckig oder rund (js/brushshape.js). Spray ist immer rund —
// dort gibt es die Wahl nicht.
function syncBrushShape() {
  for (const [id, on] of /** @type {[string, boolean][]} */ ([['brush-square-btn', !state.brushRound], ['brush-round-btn', state.brushRound]])) {
    $(id).classList.toggle('is-active', on);
    $(id).setAttribute('aria-pressed', String(on));
  }
  $('brush-shape').hidden = state.tool === 'spray';
}

function setBrushSize(n) {
  state.brushSize = clampSize(n);
  $('brush-size').value = String(sizeToSlider(state.brushSize));
  if (document.activeElement !== $('brush-size-num')) $('brush-size-num').value = String(state.brushSize);
}

const shapeLabel = tool => t(`shape.${tool}`);

// Statuszeile unter dem Canvas.
function info(msg) {
  const el = $('info-bar');
  if (el) el.textContent = msg;
}

// In eine gesperrte oder ausgeblendete Ebene wird nicht gemalt — man sähe
// es nicht bzw. will es dort gerade nicht. Gibt true zurück, wenn blockiert.
// toast = true: für Knöpfe in Panels, dort sieht man die Statuszeile kaum.
function layerBlocked(toast = false) {
  const sp = getSprite();
  const L = sp?.layers[sp.layer];
  if (!L) return false;
  // Die Maske einer gesperrten Ebene darf man bearbeiten — so nimmt man
  // z. B. Licht stellenweise weg, ohne die Licht-Ebene zu entsperren.
  const msg = L.locked && !editingMask() ? t('ly.lockedInfo', { name: L.name })
    : !L.visible ? t('ly.hiddenInfo', { name: L.name }) : null;
  if (!msg) return false;
  if (toast) showInfoToast(msg); else info(msg);
  // Bitty bietet an, es gleich zu beheben (einmal pro Besuch).
  const i = sp.layer;
  if (L.locked && !editingMask()) hint('layerLocked', t('bitty.h.locked', { name: L.name }), { label: t('bitty.h.unlock'), run: () => toggleLocked(i) }, layerRow());
  else hint('layerHidden', t('bitty.h.hidden', { name: L.name }), { label: t('bitty.h.show'), run: () => toggleVisible(i) }, layerRow());
  return true;
}

const layerRow = () => $('layer-list')?.querySelector('.ly-row.is-active');

// Bitty: man malt, sieht aber nichts — weil die Ebene unsichtbar ist, die
// Farbe durchsichtig oder die Maske die Stelle ausblendet. Läuft beim
// Ansetzen eines Strichs; die Gründe schließen sich gegenseitig nicht aus,
// genannt wird der erste.
let maskSince = 0;
function paintHints(e) {
  const sp = getSprite();
  const L = sp?.layers[sp.layer];
  if (!L || isSelectTool(state.tool) || state.tool === 'wand') return;
  const i = sp.layer;
  if (editingMask()) {
    // Lange im Masken-Modus und wieder am Malen: vielleicht vergessen?
    const now = Date.now();
    if (!maskSince) maskSince = now;
    else if (now - maskSince > 60000) hint('maskEdit', t('bitty.h.maskEdit', { name: L.name }), { label: t('bitty.h.leaveMask'), run: () => toggleMaskEdit(i) }, layerRow());
    return;
  }
  maskSince = 0;
  if (L.opacity <= 0) {
    hint('layerOpacity', t('bitty.h.opacity', { name: L.name }), { label: t('bitty.h.opacityFull'), run: () => setOpacity(i, 1) }, layerRow());
    return;
  }
  const paints = ['pencil', 'brush', 'spray', 'fill'].includes(state.tool) || isShapeTool(state.tool);
  if (paints && state.curColor === 0) {
    hint('color0', t('bitty.h.color0'), { label: t('bitty.h.color1'), run: () => { state.curColor = 1; syncColorActive(); } }, $('quick-palette'));
    return;
  }
  const c = cellFromEvent(e);
  if (c && L.mask?.on && L.mask.hide[c.y]?.[c.x]) {
    hint('masked', t('bitty.h.masked', { name: L.name }), { label: t('bitty.h.maskOff'), run: () => toggleMaskOn() }, layerRow());
  }
}

function initCanvasEvents() {
  const canvas = $('editor-canvas');

  // Kachelmodus: Die Kopien liegen auf einem eigenen Canvas (#editor-tiled).
  // Was dort ankommt, geht als dasselbe Ereignis an den eigentlichen Canvas
  // — die Zelle rechnet cellFromEvent aus der Lage zum Bild, auf einer Kopie
  // also außerhalb. Das Original hält an, sonst käme es doppelt an
  // (Verschieben in view.js).
  const tiled = $('editor-tiled');
  for (const type of ['pointerdown', 'pointermove']) {
    tiled.addEventListener(type, e => {
      e.stopPropagation();
      const fwd = new PointerEvent(type, e);
      canvas.dispatchEvent(fwd);
      if (fwd.defaultPrevented) e.preventDefault();
    });
  }
  tiled.addEventListener('pointerleave', () => { $('brush-cursor').hidden = true; });
  tiled.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('pointerdown', e => {
    // Hand-Werkzeug auf einer Hilfslinie: die Linie ziehen statt die Ansicht
    // verschieben (stopPropagation hält das Verschieben in view.js ab).
    if (state.tool === 'pan' && e.button === 0 && guideAt(e)) { e.stopPropagation(); guidePointerDown(e); return; }
    // Leertaste, Hand-Werkzeug oder mittlere Taste: verschieben, nicht malen (view.js).
    if (isPanMode() || e.button === 1) return;
    // Beim Abspielen wird nicht gemalt — der Tipp hält an.
    if (isPlaying()) { e.preventDefault(); stopPlayback(); return; }
    // Tilemap im Modus „Kacheln“: setzen, leeren, füllen, aufnehmen (tilemap.js).
    if (tileModeOn() && (e.button === 0 || e.button === 2)) {
      if (!e.altKey && layerBlocked()) return;
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      tilePointerDown(e);
      return;
    }
    // Pointer einfangen → move/up feuern weiter, auch außerhalb des Canvas.
    try { canvas.setPointerCapture(e.pointerId); } catch {}

    // ── Rechtsklick ──
    if (e.button === 2) {
      e.preventDefault();
      // Alt + Rechts ziehen: Größe verstellen statt radieren.
      if (e.altKey && !e.shiftKey && SIZED_TOOLS.includes(state.tool)) {
        sizeDrag = { x: e.clientX, size: state.brushSize, at: { clientX: e.clientX, clientY: e.clientY } };
        updateBrushCursor(sizeDrag.at);
        info(t('info.size', { n: state.brushSize }));
        return;
      }
      // Schablonen-Kürzel liegen auf Shift+Alt — Shift allein scrollt seitlich.
      if (e.shiftKey && e.altKey && tplLoaded() && tplHasOffscreen()) {
        const r = doTemplatePipette(e);
        if (r.status === 'outside')          info(t('info.tplOutside'));
        else if (r.status === 'transparent') info(t('info.tplTransp'));
        else                                 info(t('info.tplPipette', { hex: r.hex }));
      } else if (state.tool === 'shade') {
        // Rechtsklick schattiert in die Gegenrichtung, statt zu radieren.
        if (layerBlocked() || !startShade(shadeUp())) return;
        state.isDrawing = true;
        beginStroke();
        const c = cellFromEventRaw(e);
        if (c) applyTool(c.x, c.y);
        lock = c ? { start: c, dir: null, last: c } : null;
      } else {
        if (layerBlocked()) return;
        commitFloat(); // sonst radiert man in ein Loch, unter dem noch etwas hängt
        state.isErasing = true;
        beginStroke();
        ppBegin();
        eraseAt(e);
      }
      return;
    }

    if (e.button !== 0) return; // Mittelklick ignorieren
    e.preventDefault();

    // ── Shift+Alt+Links mit Schablone = verschieben ──
    if (e.shiftKey && e.altKey && tplLoaded()) { startTplDrag(e); return; }

    // Hinzufügen/Abziehen beginnt immer eine neue Form — auch über der
    // bestehenden Auswahl, die dann nicht verschoben wird. Die Anfasser
    // gewinnen trotzdem: Umschalt am Anfasser hält das Seitenverhältnis.
    const op = isSelectTool(state.tool) ? selOpFor(e) : 'new';

    // ── Auswahl anfassen (vor der Pipette, damit Alt+Ziehen kopiert) ──
    if (isSelectTool(state.tool)) {
      // Anfasser an Ecken und Kanten: skalieren (js/scale.js).
      const h = handleAt(e);
      if (h) {
        if (layerBlocked()) return;
        startScale(e, h);
        info(selectionInfo(t('info.scale')));
        return;
      }
      const c = cellFromEventClamped(e);
      if (op === 'new' && isInSelection(c.x, c.y)) {
        if (layerBlocked()) return;
        startMove(e, e.altKey);
        info(selectionInfo(t(e.altKey ? 'info.dragCopy' : 'info.move')));
        return;
      }
    }

    // ── Alt+Links = Pipette auf das Grid — greift, was man sieht ──
    if (e.altKey) {
      const c = cellFromEvent(e);
      if (c) {
        state.curColor = flatGrid(getSprite())[c.y][c.x];
        syncColorActive();
        const v = state.curColor;
        info(typeof v === 'string'
          ? t('info.pickFree', { hex: v })
          : t('info.pickIndex', { i: v, label: colorLabelShort(v, colorName(v)) }));
      }
      return;
    }

    if (layerBlocked()) return;
    paintHints(e);

    // ── Auswahl aufziehen / lassoen / nach Farbe wählen ──
    if (state.tool === 'select') {
      startMarquee(e, op);
      info(selectionInfo(t('info.marquee')));
      return;
    }
    if (state.tool === 'lasso') {
      startLasso(e, op);
      info(t('info.lassoStart'));
      return;
    }
    if (state.tool === 'magic') {
      const n = selectByColor(e, op);
      updateSelectionUI();
      info(n ? t('info.colorSel', { n, extra: selection.rect ? ' · ' + selectionInfo() : '' })
             : t('info.colorSelNone'));
      return;
    }

    // ── Formen: Startpunkt merken, gezeichnet wird beim Loslassen ──
    if (isShapeTool(state.tool)) {
      const c = cellFromEventClamped(e, true);
      shapeStart = c;
      state.shape.color = state.curColor;
      state.shape.cells = shapeCells(state.tool, c, c);
      renderEditor();
      info(t('info.shapeStart', { shape: shapeLabel(state.tool), x: c.x, y: c.y }));
      return;
    }

    // ── Ein-Klick-Werkzeuge ──
    if (state.tool === 'fill') {
      const c = cellFromEvent(e);
      if (c) recordOp(() => floodFill(c.x, c.y));
      return;
    }
    if (state.tool === 'wand') {
      const c = cellFromEvent(e);
      if (c) {
        let removed = 0;
        recordOp(() => { removed = magicWandDelete(getGrid(), getPal(), c.x, c.y, state.wandTolerance); });
        if (removed) renderAll();
        info(removed ? t('info.wandDeleted', { n: removed }) : t('info.wandNone'));
      }
      return;
    }

    if (state.tool === 'shade' && !startShade(!shadeUp())) return;
    state.isDrawing = true;
    beginStroke();
    ppBegin();
    const c = cellFromEventRaw(e);
    if (c) applyTool(c.x, c.y);
    lock = c ? { start: c, dir: null, last: c } : null;
  });

  canvas.addEventListener('pointermove', e => {
    if (tplDragging()) {
      updateTplDrag(e);
      const o = getTplOffset();
      info(t('info.tplMove', { x: o.x, y: o.y }));
      return;
    }

    if (sizeDrag) {
      const n = draggedSize(sizeDrag.size, e.clientX - sizeDrag.x);
      if (n !== state.brushSize) setBrushSize(n);
      updateBrushCursor(sizeDrag.at);
      info(t('info.size', { n }));
      return;
    }

    if (selection.mode === 'marquee') { updateMarquee(e); info(selectionInfo(t('info.marquee'))); return; }
    if (selection.mode === 'lasso')   { updateLasso(e);   info(selectionInfo()); return; }
    if (selection.mode === 'move')    { updateMove(e);    info(selectionInfo(t('info.move'))); return; }
    if (selection.mode === 'scale')   { updateScale(e);   info(selectionInfo(t('info.scale'))); return; }

    if (shapeStart) {
      const c = shapeEnd(shapeStart, cellFromEventClamped(e, true), e.shiftKey);
      state.shape.cells = shapeCells(state.tool, shapeStart, c);
      renderEditor();
      const w = Math.abs(c.x - shapeStart.x) + 1, h = Math.abs(c.y - shapeStart.y) + 1;
      info(t('info.shapeDrag', { shape: shapeLabel(state.tool), w, h, n: state.shape.cells.length }));
      return;
    }

    updateBrushCursor(e);

    const c = cellFromEvent(e);
    if (!c) return;
    // Im Kachelmodus kann der Zeiger auf einer Kopie stehen: c ist dann ins
    // Bild zurückgeholt, raw nicht — Striche laufen mit raw über den Rand.
    const raw = cellFromEventRaw(e) || c;

    // Zeiger über der Auswahl → Verschiebe-Cursor, über einem Anfasser → Skalier-Cursor.
    if (isSelectTool(state.tool)) {
      const h = handleAt(e);
      $('editor-canvas-wrap').dataset.handle = h || '';
      $('editor-canvas-wrap').classList.toggle('is-move', selOpFor(e) === 'new' && !h && isInSelection(raw.x, raw.y));
    }
    const cur = getGrid()[c.y][c.x];
    const val = typeof cur === 'string' ? cur : t('info.index', { i: cur });
    info(e.altKey
      ? t('info.pipetteAt', { x: c.x, y: c.y, val })
      : t('info.at', { x: c.x, y: c.y, val })
        + (state.isDrawing ? t('info.suffixPaint') : '')
        + (state.isErasing ? t('info.suffixErase') : ''));
    if (state.isDrawing && !e.altKey) strokeTo(raw, e.shiftKey);
    if (state.isErasing) eraseAt(e);
  });

  const endPointer = () => {
    if (sizeDrag) { sizeDrag = null; saveState(); }
    if (tplDragging()) endTplDrag();
    if (shapeStart) {
      shapeStart = null;
      let n = 0;
      recordOp(() => { n = commitShape(); });
      info(n ? t('info.drawn', { n }) : t('info.drawnNone'));
    }
    if (selection.mode) {
      endSelectionPointer();
      info(selectionInfo());
      updateSelectionUI();
    }
    if (state.isDrawing || state.isErasing) commitStroke();
    ppEnd();
    clearInterval(shadeTimer);
    shadeAt = null;
    if (shadeEnd() === false) shadeNothing();
    lock = null;
    state.isDrawing = false;
    state.isErasing = false;
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('pointerleave', () => { $('brush-cursor').hidden = true; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Strg + Mausrad zoomt — ohne Strg scrollt die Seite wie gewohnt weiter.
  // Mausrad: hoch/runter · Shift: links/rechts · Strg: Zoom auf den Zeiger.
  // Bewusst selbst gesteuert statt dem Browser überlassen — je nach Maus,
  // Treiber und System scrollt der sonst unterschiedlich oder gar nicht.
  const area = $('editor-canvas-area');
  area.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY); return; }
    // Zeilen-Modus (manche Mäuse) in Pixel umrechnen.
    const k = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? area.clientHeight : 1;
    if (e.shiftKey) area.scrollLeft += (e.deltaX || e.deltaY) * k;
    else { area.scrollTop += e.deltaY * k; area.scrollLeft += e.deltaX * k; }
  }, { passive: false });
}

// ────────────────────────────────────────────────────────────────────
// Tastatur
// ────────────────────────────────────────────────────────────────────
const TOOL_KEYS = {
  p: 'pencil', b: 'brush', s: 'spray', d: 'shade', f: 'fill', e: 'eraser', w: 'wand',
  a: 'select', l: 'lasso', k: 'magic',
  i: 'line', r: 'rect', o: 'ellipse',
  h: 'pan',
};

function isTypingTarget(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function anyModalOpen() {
  return !!document.querySelector('.modal-overlay.open');
}

function closeTopModal() {
  const open = [...document.querySelectorAll('.modal-overlay.open')].pop();
  if (open) { open.classList.remove('open'); return true; }
  return false;
}

// ── Tastenbelegung ──────────────────────────────────────────────────
// Der Reihe nach geprüft — die erste Regel, deren `when` passt, bekommt die
// Taste. Gibt `run` ausdrücklich `false` zurück, nimmt sie die Taste doch
// nicht, und die Suche geht weiter. `prevent`: vorher preventDefault().
// Alles oberhalb von KEY_BARRIER gilt auch in Eingabefeldern und offenen
// Dialogen, alles darunter nur, wenn keins von beiden den Fokus hat.
// Die Reihenfolge ist Absicht — z. B. verschieben die Pfeile eine Auswahl,
// bevor sie Frames und Ebenen blättern.
const KEY_BARRIER = { barrier: true };
const withMod = e => (e.ctrlKey || e.metaKey) && !e.altKey;
const isKey = (/** @type {string} */ k) => e => e.key.toLowerCase() === k;
// Pfeile und Enter gehören in Menüs, Reitern, Listen und auf Knöpfen diesen selbst.
const ownArrows = e => !!/** @type {HTMLElement} */ (e.target).closest?.('[role="menubar"], [role="menu"], [role="tablist"], [role="listbox"], [role="dialog"]');
const ownEnter = e => !!/** @type {HTMLElement} */ (e.target).closest?.('button, a, select, [role="option"]');
const NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

const KEYMAP = [
  // ── überall ──
  { when: e => e.key === 'Escape', run: escapeKey },
  // Alt allein = Pipette; Shift+Alt gehört der Schablone. Nur Anzeige.
  { when: e => e.key === 'Alt' || e.key === 'Shift', run: e => { eyedropHint(e); return false; } },
  { when: e => withMod(e) && isKey('z')(e) && !e.shiftKey, prevent: true, run: () => { stopRotating(false); commitFloat(); undo(); } },
  { when: e => withMod(e) && (isKey('y')(e) || (isKey('z')(e) && e.shiftKey)), prevent: true, run: () => { stopRotating(false); commitFloat(); redo(); } },
  // Datei-Menü: sichern und öffnen — statt „Seite speichern“ des Browsers.
  { when: e => withMod(e) && isKey('s')(e) && !e.shiftKey, prevent: true, run: () => { commitFloat(); saveToFile(); } },
  { when: e => withMod(e) && isKey('o')(e) && !e.shiftKey, prevent: true, run: () => $('load-file-btn').click() },
  { when: e => e.key === 'F1', prevent: true, run: () => $('help-btn').click() },
  // Strg+K: Bitty als Befehlszeile — suchen und ausführen.
  { when: e => withMod(e) && !e.shiftKey && isKey('k')(e) && !anyModalOpen(), prevent: true, run: openSearch },
  { when: e => e.key === 'Enter' && isRotating() && !isTypingTarget(e.target), run: () => { stopRotating(true); info(t('rot.applied')); } },

  KEY_BARRIER,

  // ── Timeline: Zellen kopieren, einfügen, leeren ──
  // Nur nach einem Klick in die Timeline, sonst gehören die Tasten der
  // Auswahl auf der Zeichenfläche (js/frames.js).
  { when: () => true, run: e => celKeyDown(e) },
  // Strg+Alt+N: neuer Sprite (Strg+N gehört dem Browser — und in der
  // Desktop-App dem neuen Projekt). e.code: auch bei AltGr und anderem Layout.
  { when: e => (e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.code === 'KeyN', prevent: true, run: () => $('new-sprite-btn').click() },
  // Strg + A / D / C / X / V; andere Strg-Kombis gehören dem Browser.
  { when: withMod, run: clipboardKey },
  // ── Auswahl: verschieben / leeren ──
  { when: e => !!selection.rect && !!NUDGE[e.key], prevent: true, run: e => { nudgeSelection(...NUDGE[e.key]); info(selectionInfo(t('info.moved'))); } },
  { when: e => !!selection.rect && (e.key === 'Delete' || e.key === 'Backspace'), prevent: true,
    run: () => { if (!layerBlocked()) info(t('sel.erased', { n: deleteSelection() })); } },
  { when: isKey('g'), run: toggleGuides },
  // ── Frames und Ebenen ──
  { when: e => e.key === ',', run: prevFrame },
  { when: e => e.key === '.', run: nextFrame },
  // Pfeiltasten ohne Auswahl: ← → Frame, ↑ ↓ Ebene.
  { when: e => /^Arrow/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !ownArrows(e), run: arrowKey },
  { when: e => e.key === 'Home', prevent: true, run: firstFrame },
  { when: e => e.key === 'End', prevent: true, run: lastFrame },
  { when: e => e.key === 'Enter' && !ownEnter(e), prevent: true, run: togglePlay },
  // ── Kacheln setzen: gedreht/gespiegelt (wie in Tiled) ──
  { when: e => tileModeOn() && !e.ctrlKey && !e.metaKey && !e.altKey && /^[xyz]$/.test(e.key.toLowerCase()), prevent: true,
    run: e => { const k = e.key.toLowerCase(); turnTile(k === 'x' ? 'h' : k === 'y' ? 'v' : e.shiftKey ? 'ccw' : 'cw'); } },
  // ── Farbe und Werkzeug ──
  { when: e => e.key >= '0' && e.key <= '9', run: e => { const idx = Number(e.key); if (idx <= getMaxIdx()) { state.curColor = idx; syncColorActive(); } } },
  { when: e => !!TOOL_KEYS[e.key.toLowerCase()], run: e => setTool(TOOL_KEYS[e.key.toLowerCase()]) },
];

// Häkchen „Pixelraster anzeigen“ im Menü „Ansicht“.
function syncGridItem() {
  $('grid-btn').setAttribute('aria-checked', String(state.showGrid));
}

// Kachelmodus: Punkt im Menü „Ansicht“ setzen.
function syncTiledItems() {
  for (const mode of TILED_MODES) $(`tiled-${mode}-btn`).setAttribute('aria-checked', String(state.tiled === mode));
}

function setTiled(mode) {
  state.tiled = mode;
  syncTiledItems();
  renderEditor();
  centerCanvas();
  saveState();
  info(t(`info.tiled.${mode}`));
}

// Das Bild in die Mitte der Fläche scrollen — im Kachelmodus stehen links
// und oben Kopien, ohne das sähe man zuerst eine davon.
function centerCanvas() {
  const area = $('editor-canvas-area');
  area.scrollLeft = (area.scrollWidth - area.clientWidth) / 2;
  area.scrollTop = (area.scrollHeight - area.clientHeight) / 2;
}

function handleKey(e) {
  for (const rule of KEYMAP) {
    if (rule === KEY_BARRIER) {
      if (isTypingTarget(e.target) || anyModalOpen()) return;
      continue;
    }
    if (!rule.when(e)) continue;
    if (rule.prevent) e.preventDefault();
    if (rule.run(e) !== false) return;
  }
}

// Esc schließt bzw. bricht ab, was gerade offen ist — eins nach dem anderen.
function escapeKey() {
  if (closeTopModal()) return;
  if (isPlaying()) { stopPlayback(); return; }
  if (isRotating()) { stopRotating(false); info(t('rot.discarded')); return; }
  if (shapeStart || state.shape.cells.length) {
    shapeStart = null;
    state.shape.cells = [];
    renderEditor();
    info(t('rot.shapeDrop'));
    return;
  }
  if (deselect()) { updateSelectionUI(); info(t('sel.dropped')); return; }
  if (document.body.classList.contains('editor-fullscreen')) { exitFullscreen(); return; }
  return false;
}

function eyedropHint(e) {
  if (e.key === 'Alt' && !e.shiftKey) $('editor-canvas-wrap').classList.add('is-eyedrop');
  if (e.key === 'Shift' && e.altKey) $('editor-canvas-wrap').classList.remove('is-eyedrop');
}

function clipboardKey(e) {
  const k = e.key.toLowerCase();
  if (k === 'b' && !e.shiftKey && !e.altKey) {
    // Strg+B: Auswahl wird zum Pinsel — ohne Auswahl zurück zum normalen.
    e.preventDefault();
    if (!makeStampFromSelection() && !dropStamp()) info(t('stamp.needSel'));
  } else if (k === 'a') {
    e.preventDefault();
    setTool('select'); selectAll(); updateSelectionUI();
    info(selectionInfo(t('sel.all')));
  } else if (k === 'd' && !e.shiftKey) {
    // Strg+D: Auswahl aufheben (wie in Grafikprogrammen) — nicht das
    // Lesezeichen des Browsers.
    e.preventDefault();
    if (deselect()) { updateSelectionUI(); info(t('sel.dropped')); }
  } else if (k === 'c' && selection.rect) {
    e.preventDefault();
    info(t('sel.copied', { n: copySelection() }));
    updateSelectionUI();
  } else if (k === 'x' && selection.rect) {
    e.preventDefault();
    if (layerBlocked()) return;
    info(t('sel.cut', { n: cutSelection() }));
    updateSelectionUI();
  } else if (k === 'v') {
    e.preventDefault();
    if (layerBlocked()) return;
    if (!hasClipboard()) info(t('sel.clipEmpty'));
    else {
      setTool('select');
      // Strg+Umschalt+V: die Nummern unverändert (sonst nach der Farbe, remap.js).
      info(t('sel.pasted', { n: pasteClipboard(e.shiftKey) }));
      updateSelectionUI();
    }
  }
}

function arrowKey(e) {
  const sp = getSprite();
  if (!sp) return;
  e.preventDefault();
  if (e.key === 'ArrowLeft') prevFrame();
  else if (e.key === 'ArrowRight') nextFrame();
  else setActiveLayer(sp.layer + (e.key === 'ArrowUp' ? 1 : -1));
}

function initKeyboardEvents() {
  document.addEventListener('keydown', handleKey);

  document.addEventListener('keyup', e => {
    if (e.key === 'Alt') $('editor-canvas-wrap').classList.remove('is-eyedrop');
  });
}

// ────────────────────────────────────────────────────────────────────
// Panels (auf-/zuklappen) — generisch über [data-panel]
// ────────────────────────────────────────────────────────────────────
const panelSyncs = [];

function initPanels() {
  document.querySelectorAll('[data-panel] .panel-toggle').forEach(btn => {
    const panel = btn.closest('[data-panel]');
    const sync = () => {
      const collapsed = panel.classList.contains('collapsed');
      btn.setAttribute('aria-expanded', String(!collapsed));
      btn.title = t(collapsed ? 'panel.expand' : 'panel.collapse');
    };
    panelSyncs.push(sync);
    btn.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      sync();
      saveState();
    });
    sync();
  });
}

function syncPanelTitles() { panelSyncs.forEach(fn => fn()); }

// ────────────────────────────────────────────────────────────────────
// Vollbild
// ────────────────────────────────────────────────────────────────────
function syncFullscreenBtn() {
  const btn = $('fullscreen-btn');
  if (!btn) return;
  const on = document.body.classList.contains('editor-fullscreen');
  btn.innerHTML = iconSvg(on ? 'shrink' : 'expand')
    + `<span class="btn-label">${t(on ? 'full.exit' : 'full.enter')}</span>`;
  btn.title       = t(on ? 'full.exitTitle' : 'full.enterTitle');
}


// ────────────────────────────────────────────────────────────────────
// Werkzeugleiste
// ────────────────────────────────────────────────────────────────────
function initToolbar() {
  document.querySelectorAll('.tool-btn').forEach(btn =>
    btn.addEventListener('click', () => setTool(btn.dataset.tool)));

  $('mirror-x-btn').addEventListener('click', () => toggleMirror('x'));
  $('mirror-y-btn').addEventListener('click', () => toggleMirror('y'));

  $('pixel-perfect-btn').addEventListener('click', () => {
    state.pixelPerfect = !state.pixelPerfect;
    $('pixel-perfect-btn').classList.toggle('is-active', state.pixelPerfect);
    $('pixel-perfect-btn').setAttribute('aria-pressed', String(state.pixelPerfect));
    saveState();
  });

  $('fill-visible-btn').addEventListener('click', () => {
    state.fillVisible = !state.fillVisible;
    syncFillVisible();
    saveState();
  });
  $('fill-contig-btn').addEventListener('click', () => {
    state.fillContig = !state.fillContig;
    syncFillVisible();
    saveState();
  });

  $('recolor-from').addEventListener('click', () => openRecolorPop('from'));
  $('recolor-to').addEventListener('click', () => openRecolorPop('to'));
  document.addEventListener('pointerdown', e => {
    const el = /** @type {Element} */ (e.target);
    if (recolor.open && !el.closest('#recolor-pop, .recolor-pick')) closeRecolorPop();
  });
  $('recolor-scope').addEventListener('change', e => {
    const v = /** @type {HTMLSelectElement} */ (e.target).value;
    if (RECOLOR_SCOPES.includes(/** @type {any} */ (v))) { state.recolorScope = /** @type {any} */ (v); saveState(); }
  });
  $('recolor-btn').addEventListener('click', applyRecolor);

  // Einfarbiger eigener Pinsel: die Vorschau folgt der Farbe.
  colorHooks.onChange = () => { if (state.stampMono) syncStamp(); };
  $('sel-brush-btn').addEventListener('click', () => { makeStampFromSelection(); });
  $('stamp-drop-btn').addEventListener('click', () => { dropStamp(); });
  $('stamp-save-btn').addEventListener('click', saveStamp);
  $('brushlib-btn').addEventListener('click', openBrushLib);
  document.addEventListener('pointerdown', e => {
    const el = /** @type {Element} */ (e.target);
    if (!$('brushlib-pop').hidden && !el.closest('#brushlib-group')) closeBrushLib();
  });
  $('stamp-mono-btn').addEventListener('click', () => {
    state.stampMono = !state.stampMono;
    syncStamp();
  });

  $('sel-op-new').addEventListener('click', () => setSelOp('new'));
  $('sel-op-add').addEventListener('click', () => setSelOp('add'));
  $('sel-op-sub').addEventListener('click', () => setSelOp('sub'));

  // Abstufungen aus der aktuellen Farbe: in die Palette und als Farbreihe.
  $('shade-gen-btn').addEventListener('click', () => {
    const c = state.curColor;
    const base = typeof c === 'string' ? c : c ? getPal()[c] : null;
    if (!base) { showInfoToast(t('shade.genNeedColor')); return; }
    const hexes = makeShades(base, Number($('shade-gen-count').value) || 2);
    const added = addColorsToPalette(hexes);
    state.shadeRamp = hexes;   // hell → dunkel
    renderShadeRamp();
    syncShadeMarks();
    saveState();
    showInfoToast(t('shade.genDone', { n: hexes.length, added }));
  });
  // Nach Farbstufen: die Farbreihe von hell nach dunkel ordnen. Von selbst
  // passiert das nie — wer seine Reihe anders zusammenstellt, behält sie.
  $('shade-sort-btn').addEventListener('click', () => {
    state.shadeRamp = sortRamp(state.shadeRamp);
    renderShadeRamp();
    saveState();
  });

  for (const [id, round] of /** @type {[string, boolean][]} */ ([['brush-square-btn', false], ['brush-round-btn', true]])) {
    $(id).addEventListener('click', () => {
      state.brushRound = round;
      syncBrushShape();
      saveState();
    });
  }

  $('shade-clear-btn').addEventListener('click', () => {
    state.shadeRamp = [];
    renderShadeRamp();
    syncShadeMarks();
    saveState();
  });
  $('shade-rev-btn').addEventListener('click', () => {
    state.shadeUp = !state.shadeUp;
    renderShadeRamp();
    saveState();
  });
  $('shade-soft-btn').addEventListener('click', () => {
    state.shadeSoft = !state.shadeSoft;
    renderShadeRamp();
    saveState();
  });

  $('shape-fill-btn').addEventListener('click', () => {
    state.shapeFill = !state.shapeFill;
    $('shape-fill-btn').classList.toggle('is-active', state.shapeFill);
    $('shape-fill-btn').setAttribute('aria-pressed', String(state.shapeFill));
    saveState();
  });

  const selAction = (id, fn, edits = true) => $(id).addEventListener('click', () => {
    if (edits && layerBlocked(true)) return;
    fn();
    updateSelectionUI();
  });
  selAction('sel-all-btn',    () => { selectAll(); info(selectionInfo(t('sel.all'))); }, false);
  selAction('sel-cut-btn',    () => { info(t('sel.cutShort',    { n: cutSelection() })); });
  selAction('sel-copy-btn',   () => { info(t('sel.copiedShort', { n: copySelection() })); }, false);
  selAction('sel-paste-btn',  () => { info(t('sel.pasted',      { n: pasteClipboard() })); });
  selAction('sel-delete-btn', () => { info(t('sel.erased',      { n: deleteSelection() })); });
  selAction('sel-fill-btn',   () => { info(t('sel.filled',      { n: fillSelection() })); });
  selAction('sel-none-btn',   () => { deselect(); info(t('sel.dropped')); }, false);

  // Größe: Regler (logarithmisch, js/sizedrag.js) und Zahlenfeld zeigen dasselbe (1–300).
  $('brush-size').addEventListener('input', e => setBrushSize(sliderToSize(e.target.value)));
  $('brush-size-num').addEventListener('input', e => { if (e.target.value !== '') setBrushSize(e.target.value); });
  $('brush-size-num').addEventListener('change', e => { setBrushSize(e.target.value); e.target.value = String(state.brushSize); });
  for (const id of ['brush-size', 'brush-size-num']) $(id).addEventListener('change', saveState);

  const strength = $('strength-slider');
  strength.addEventListener('input', () => {
    state.brushStrength = Number(strength.value);
    $('strength-val').textContent = strength.value + '%';
  });
  strength.addEventListener('change', saveState);

  const tolerance = $('tolerance-slider');
  tolerance.addEventListener('input', () => {
    state.wandTolerance = Number(tolerance.value);
    $('tolerance-val').textContent = tolerance.value + '%';
  });
  tolerance.addEventListener('change', saveState);

  // Zoom
  const cell = $('cell-size');
  cell.addEventListener('input', () => {
    state.cellSize = Number(cell.value);
    $('cell-size-val').textContent = state.cellSize + 'px';
    renderEditor();
  });
  cell.addEventListener('change', saveState);

  // Hintergrund hell/dunkel
  const setBg = mode => {
    state.editorBg = mode;
    $('bg-dark-btn').classList.toggle('is-active', mode === 'dark');
    $('bg-bw-btn').classList.toggle('is-active', mode === 'bw');
    renderEditor();
    saveState();
  };
  $('bg-dark-btn').addEventListener('click', () => setBg('dark'));
  $('bg-bw-btn').addEventListener('click', () => setBg('bw'));
  // Pixelraster anzeigen (Menü „Ansicht“): ohne Häkchen ein sauberes Bild ohne die feinen Linien.
  $('grid-btn').addEventListener('click', () => {
    state.showGrid = !state.showGrid;
    syncGridItem();
    renderEditor();
    saveState();
  });
  // Kachelmodus (Menü „Ansicht“, js/tiled.js): das Bild ringsum wiederholt.
  for (const mode of TILED_MODES) $(`tiled-${mode}-btn`).addEventListener('click', () => setTiled(mode));

  $('undo-btn').addEventListener('click', () => { stopRotating(false); commitFloat(); undo(); });
  $('redo-btn').addEventListener('click', () => { stopRotating(false); commitFloat(); redo(); });

  $('fullscreen-btn').addEventListener('click', () => {
    if (document.body.classList.contains('editor-fullscreen')) exitFullscreen();
    else enterFullscreen();
  });
}

// ────────────────────────────────────────────────────────────────────
// Farb-Panel
// ────────────────────────────────────────────────────────────────────
// Bildfarben-Liste in der Farbzeile auf-/zuklappen.
function initFreeColors() {
  const btn = $('free-colors-btn'), list = $('free-colors-list');
  const setOpen = open => {
    list.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => {
    const open = list.hidden;
    if (open) renderFreeColorsList();
    setOpen(open);
  });
  // Knöpfe unten in der Liste: in die Palette aufnehmen / reduzieren.
  list.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    setOpen(false);
    if (action === 'to-palette') addFreeColorsToPalette();
    else if (action === 'reduce') openReduceModal();
  });
  document.addEventListener('pointerdown', e => {
    if (!list.hidden && !/** @type {HTMLElement} */ (e.target).closest('#free-colors')) setOpen(false);
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !list.hidden) { e.stopPropagation(); setOpen(false); }
  }, true);
}

// "Farbe zeigen": hebt die aktuelle Farbe auf der Zeichenfläche hervor.
function initShowColor() {
  const btn = $('show-color-btn');
  btn.addEventListener('click', () => {
    state.showColor = !state.showColor;
    btn.setAttribute('aria-pressed', String(state.showColor));
    btn.classList.toggle('is-active', state.showColor);
    renderEditor();
    if (state.showColor) info(tn('pal.showCount', countCurrentColor()));
  });
}

function initPalettePanel() {
  // Auswählen zeigt die Palette nur an — die Zeichnung bleibt unverändert.
  renderCallbacks.onPreviewPalette = previewPalette;

  $('palette-use-btn').addEventListener('click', () => assignPalette(getPreviewName(), { keepLook: true }));
  $('palette-recolor-btn').addEventListener('click', () => assignPalette(getPreviewName(), { keepLook: false }));
  $('palette-add-btn').addEventListener('click', () => openPaletteModal());
  $('palette-fork-btn').addEventListener('click', forkPreviewPalette);
  $('palette-edit-btn').addEventListener('click', () => openPaletteModal(getPreviewName()));
  $('palette-del-btn').addEventListener('click', () => renderCallbacks.onDeletePalette(getPreviewName()));
  $('palette-from-image-btn').addEventListener('click', openReduceModal);

  // Freier Farbwähler — Klick auf die aktuelle Farbe öffnet den Picker.
  const picker = $('free-color-picker');
  $('current-color').addEventListener('click', e => {
    if (e.target === picker) return;
    if (typeof state.curColor === 'string' && state.curColor[0] === '#') {
      picker.value = state.curColor;
    } else if (state.curColor !== 0) {
      picker.value = getPal()[state.curColor] || '#888888';
    }
    placeHiddenPicker(picker, $('current-color'));
    picker.click();
  });
  picker.addEventListener('input', () => {
    state.curColor = picker.value;
    syncColorActive();
  });

  // Hex eintippen: sofort bei sechs Stellen, sonst beim Verlassen (#rgb geht
  // auch, das # darf fehlen). Liegt die Farbe in der Palette, wird es deren
  // Nummer, sonst eine freie Farbe — wie in der Desktop-App.
  const hexInp = /** @type {HTMLInputElement} */ ($('cc-hex-input'));
  const takeHex = (/** @type {boolean} */ final) => {
    const d = hexInp.value.trim().replace(/^#/, '').toLowerCase();
    if (!/^[0-9a-f]{6}$/.test(d) && !(final && /^[0-9a-f]{3}$/.test(d))) return;
    const hex = '#' + (d.length === 3 ? [...d].map(c => c + c).join('') : d);
    const pal = getPal();
    let idx = 0;
    for (let i = 1; i <= paletteSize(pal); i++) if (pal[i]?.toLowerCase() === hex) { idx = i; break; }
    state.curColor = idx || hex;
    syncColorActive();
  };
  hexInp.addEventListener('input', () => takeHex(false));
  hexInp.addEventListener('change', () => { takeHex(true); hexInp.blur(); });
  hexInp.addEventListener('focus', () => hexInp.select());
  hexInp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') hexInp.blur(); });
  hexInp.addEventListener('blur', () => updateCurrentColorIndicator());
  $('cc-add-btn').addEventListener('click', addCurrentColorToPalette);
}

// ────────────────────────────────────────────────────────────────────
// Bild-Panel — spiegeln, drehen, zuschneiden, Größe
// ────────────────────────────────────────────────────────────────────
// Zeigt im Badge an, worauf die Aktionen gerade wirken, und hält die
// Größenfelder am aktuellen Sprite.
function syncImagePanel() {
  const badge = $('image-scope');
  if (badge) badge.textContent = scopeLabel();
  const sp = getSprite();
  const w = $('resize-w'), h = $('resize-h');
  if (sp && w && h && document.activeElement !== w && document.activeElement !== h) {
    w.value = sp.grid[0].length;
    h.value = sp.grid.length;
  }
}

// Regler für die freie Drehung. Die Sitzung beginnt beim ersten Zupfen und
// endet mit Übernehmen oder Verwerfen — dazwischen ist alles nur Vorschau.
function initRotateSlider() {
  const slider = $('rotate-free');
  const num = $('rotate-free-num');
  const actions = $('rotate-actions');

  const reset = () => {
    slider.value = 0;
    num.value = 0;
    actions.hidden = true;
  };

  const preview = deg => {
    if (!getSprite()) return;
    if (!isRotating() && !beginFreeRotate()) return;
    const r = previewFreeRotate(deg);
    actions.hidden = false;
    if (r) {
      info(t('rot.preview', { scope: scopeLabelFor(r.scope), deg, w: r.w, h: r.h }) +
        t(r.scope === 'Sprite' ? 'rot.lossHint' : 'rot.applyHint'));
    }
  };

  slider.addEventListener('input', () => {
    num.value = slider.value;
    preview(Number(slider.value));
  });
  num.addEventListener('change', () => {
    const deg = Math.max(-180, Math.min(180, Number(num.value) || 0));
    num.value = deg;
    slider.value = deg;
    preview(deg);
  });

  $('rotate-apply-btn').addEventListener('click', () => {
    const scope = applyFreeRotate();
    if (scope) info(t('rot.done', { scope: scopeLabelFor(scope) }));
    reset();
    updateSelectionUI();
  });
  $('rotate-cancel-btn').addEventListener('click', () => {
    if (cancelFreeRotate()) info(t('rot.discarded'));
    reset();
    updateSelectionUI();
  });

  // Von außen aufrufbar, wenn etwas anderes die Sitzung beendet.
  resetRotateUI = reset;
}

// Wird von initRotateSlider gesetzt — bricht eine laufende Dreh-Sitzung ab.
let resetRotateUI = () => {};

function stopRotating(applyIt) {
  if (!isRotating()) return;
  if (applyIt) applyFreeRotate(); else cancelFreeRotate();
  resetRotateUI();
}

function initImagePanel() {
  // Jede andere Bild-Aktion schreibt eine laufende Drehung erst fest.
  ['flip-h-btn', 'flip-v-btn', 'rotate-btn', 'trim-btn', 'center-btn',
   'resize-btn', 'scale-up-btn', 'scale-down-btn'].forEach(id =>
    $(id).addEventListener('click', () => stopRotating(true), true));

  $('flip-h-btn').addEventListener('click', () => {
    const scope = flip('h');
    if (scope) info(t('tf.flipH', { scope: scopeLabelFor(scope) }));
    syncImagePanel();
  });
  $('flip-v-btn').addEventListener('click', () => {
    const scope = flip('v');
    if (scope) info(t('tf.flipV', { scope: scopeLabelFor(scope) }));
    syncImagePanel();
  });
  $('rotate-btn').addEventListener('click', () => {
    const scope = rotate90();
    if (scope) info(t('tf.rot90', { scope: scopeLabelFor(scope) }));
    syncImagePanel();
  });

  $('trim-btn').addEventListener('click', () => {
    const r = trimToContent();
    if (!r) return;
    showInfoToast(r.ok ? t('tf.trimmed', { w: r.w, h: r.h })
                       : t('tf.trimFail', { reason: t(`reason.${r.reason}`) }));
    syncImagePanel();
  });
  $('center-btn').addEventListener('click', () => {
    const r = centerContent();
    if (!r) return;
    showInfoToast(r.ok ? t('tf.centered') : t('tf.centerFail', { reason: t(`reason.${r.reason}`) }));
  });

  $('resize-btn').addEventListener('click', () => {
    const w = calcInput($('resize-w'));
    const h = calcInput($('resize-h'));
    const anchor = $('resize-anchor').value;
    const apply = () => {
      const r = resizeCanvas(w, h, anchor);
      if (!r) return;
      showInfoToast(r.ok
        ? t('tf.resized', { w: r.w, h: r.h, lost: r.lost ? t('tf.resizeLost', { n: r.lost }) : '' })
        : t('tf.resizeFail', { reason: t(`reason.${r.reason}`) }));
      syncImagePanel();
    };
    // Verkleinern kann Pixel kosten — vorher fragen.
    const sp = getSprite();
    if (sp && (w < sp.grid[0].length || h < sp.grid.length)) {
      showConfirmToast(t('tf.confirmShrink'), apply, t('tf.shrinkOk'));
    } else apply();
  });

  $('scale-up-btn').addEventListener('click', () => {
    const r = scaleSprite(2);
    if (r) showInfoToast(r.ok ? t('tf.scaledUp', { w: r.w, h: r.h })
                              : t('tf.scaleFail', { reason: t(`reason.${r.reason}`) }));
    syncImagePanel();
  });
  $('scale-down-btn').addEventListener('click', () => {
    showConfirmToast(t('tf.confirmHalve'), () => {
      const r = scaleSprite(0.5);
      if (r) showInfoToast(r.ok ? t('tf.scaledDown', { w: r.w, h: r.h })
                                : t('tf.scaleFail', { reason: t(`reason.${r.reason}`) }));
      syncImagePanel();
    }, t('tf.halveOk'));
  });
}

// ────────────────────────────────────────────────────────────────────
// Feinschliff-Panel (data-panel="cleanup")
// ────────────────────────────────────────────────────────────────────
function initCleanupPanel() {
  $('bg-remove-btn').addEventListener('click', () => {
    if (layerBlocked(true)) return;
    const tol = Number($('bg-tolerance').value) || 25;
    let n = 0;
    recordOp(() => { n = autoRemoveBackground(getGrid(), getPal(), tol); });
    if (n) renderAll();
    showInfoToast(n ? t('cln.bgRemoved', { n }) : t('cln.bgNone'));
  });

  $('despeckle-btn').addEventListener('click', () => {
    if (layerBlocked(true)) return;
    let n = 0;
    recordOp(() => { n = despeckleGrid(getGrid()); });
    if (n) renderAll();
    showInfoToast(n ? t('cln.despeckled', { n }) : t('cln.despeckleNone'));
  });

  $('outline-btn').addEventListener('click', () => {
    if (layerBlocked(true)) return;
    const col = $('outline-color').value;
    const th  = Number($('outline-thickness').value) || 1;
    const mode = $('outline-mode').value;
    let n = 0;
    recordOp(() => { n = outlineGrid(getGrid(), col, th, mode); });
    if (n) renderAll();
    showInfoToast(n ? t('cln.outlined', { n }) : t('cln.outlineNone'));
  });
}

// ────────────────────────────────────────────────────────────────────
// Licht-Panel — Lichtquelle wählen, Kanten beleuchten, Schatten werfen
// (Rechnung in js/light.js). Mit Auswahl wirkt beides nur darin.
// ────────────────────────────────────────────────────────────────────
// Felder mit data-calc (Sprite-Größen) rechnen: „24 * 4“ wird beim
// Verlassen des Felds zu 96 (js/calc.js). Enter löst in den Dialogen
// „Erstellen“ bzw. „OK“ aus — die rechnen dann selbst mit calcInput.
function initCalcFields() {
  document.querySelectorAll('input[data-calc]').forEach(inp => {
    inp.addEventListener('change', () => { calcInput(/** @type {HTMLInputElement} */ (inp)); });
  });
}

function initLightPanel() {
  // Licht und Schatten liegen als eigene Ebenen (light.js: layer.fx) — das
  // Original bleibt unberührt. Basis ist die aktive Ebene; ist die aktive
  // selbst eine Effekt-Ebene, ihre Quelle.
  //
  // Solange das Panel offen ist und es zur Basis noch keine Licht-Ebene
  // gibt, zeigt die Zeichenfläche eine Vorschau (render.js fragt
  // getLightPreview) — „Als Ebene übernehmen“ legt die Ebene(n) an. Gibt es
  // sie schon, rechnet jede Änderung im Panel sie sofort neu.
  let dir = { dx: -1, dy: -1 };
  const dirBtns = [...document.querySelectorAll('#light-dirs .light-dir')];
  const amount = $('light-amount');
  const castOn = $('light-cast-on');
  const panel = document.querySelector('[data-panel="light"]');
  const showDir = () => dirBtns.forEach(o => {
    const on = Number(o.dataset.dx) === dir.dx && Number(o.dataset.dy) === dir.dy;
    o.classList.toggle('is-active', on);
    o.setAttribute('aria-pressed', String(on));
  });
  // Offen = der Inhalt ist wirklich zu sehen (Schublade, angepinnt, schwebend).
  // Nicht über offsetParent: als Schublade ist das Panel position: fixed,
  // dann ist offsetParent immer null — und „collapsed“ behält es dort auch.
  const panelBody = panel?.querySelector('.panel-body');
  const panelOpen = () => !!panelBody && panelBody.getClientRects().length > 0;

  const baseOf = sp => (sp.layers[sp.layer]?.fx ? fxSource(sp.layers, sp.layer) : sp.layer);
  const fxValues = kind => normalizeFx(kind === 'light'
    ? {
      kind, dir,
      width: Number($('light-width').value) || 1,
      amount: Number(amount.value) / 100,
      highlight: $('light-highlight').checked,
      shadow: $('light-shadow').checked,
      allowHex: $('light-free').checked,
    }
    : { kind, dir, color: $('light-cast-color').value, distance: Number($('light-cast-dist').value) || 1 });

  // Effekt-Ebene der Basis mit den Panel-Werten versehen — oder anlegen
  // (create). Ohne recordOp; der Aufrufer fasst alles zu einem Schritt.
  function upsertIn(sp, base, kind, create) {
    let idx = fxFor(sp.layers, base, kind);
    if (idx < 0 && !create) return false;
    const fx = fxValues(kind);
    if (idx < 0) {
      idx = kind === 'light' ? base + 1 : base;
      const name = t(kind === 'light' ? 'lgt.layerLight' : 'lgt.layerShadow', { name: sp.layers[base].name });
      sp.layers.splice(idx, 0, { ...defaultLayer(), name, locked: true, fx });
      sp.frames.forEach(f => f.cels.splice(idx, 0, blankLike(f.cels[0])));
      if (sp.layer >= idx) sp.layer++;
    } else {
      sp.layers[idx].fx = fx;
    }
    recomputeFx(sp, idx, getPal());
    return true;
  }

  function removeIn(sp, base, kind) {
    const idx = fxFor(sp.layers, base, kind);
    if (idx < 0) return;
    sp.layers.splice(idx, 1);
    sp.frames.forEach(f => f.cels.splice(idx, 1));
    if (sp.layer > idx) sp.layer--;
  }

  // Ein Undo-Schritt für alles, was fn an der Basis ändert.
  function change(fn) {
    const sp = getSprite();
    if (!sp) return;
    const base = baseOf(sp);
    if (base < 0) { showInfoToast(t('lgt.noBase')); return; }
    commitFloat();
    recordOp(() => fn(sp, base));
    renderAll();
    saveState();
  }
  const hasLayer = kind => {
    const sp = getSprite();
    return !!sp && fxFor(sp.layers, baseOf(sp), kind) >= 0;
  };

  // Eine Einstellung hat sich geändert: vorhandene Ebenen neu rechnen,
  // sonst nur die Vorschau neu zeichnen.
  function changed(kinds) {
    const live = kinds.filter(hasLayer);
    if (live.length) change((sp, base) => live.forEach(k => upsertIn(sp, base, k, false)));
    else renderEditor();
  }

  function commit() {
    change((sp, base) => {
      upsertIn(sp, base, 'light', true);
      if (castOn.checked) upsertIn(sp, base, 'shadow', true);
    });
  }

  function recomputeAll() {
    change((sp, base) => ['light', 'shadow'].forEach(k => upsertIn(sp, base, k, false)));
  }

  // Für render.js: die Vorschau-Zellen des aktuellen Frames — oder null.
  renderCallbacks.getLightPreview = () => {
    if (!panelOpen()) return null;
    const sp = getSprite();
    if (!sp) return null;
    const base = baseOf(sp);
    if (base < 0) return null;
    const cel = sp.frames[sp.frame].cels[base];
    const light = fxFor(sp.layers, base, 'light') < 0 ? lightCel(cel, getPal(), fxValues('light')) : null;
    const shadow = castOn.checked && fxFor(sp.layers, base, 'shadow') < 0 ? shadowCel(cel, fxValues('shadow')) : null;
    return light || shadow ? { base, light, shadow } : null;
  };

  // Panel an die Effekt-Ebenen der Basis angleichen.
  function sync() {
    const sp = getSprite();
    if (!sp) return;
    const base = baseOf(sp);
    const li = fxFor(sp.layers, base, 'light');
    const si = fxFor(sp.layers, base, 'shadow');
    const lfx = li >= 0 ? sp.layers[li].fx : null;
    const sfx = si >= 0 ? sp.layers[si].fx : null;
    const own = lfx || sfx;
    if (own) dir = { ...own.dir };
    if (lfx) {
      amount.value = String(Math.round(lfx.amount * 100));
      $('light-amount-val').textContent = amount.value + '%';
      $('light-width').value = String(lfx.width);
      $('light-highlight').checked = lfx.highlight;
      $('light-shadow').checked = lfx.shadow;
      $('light-free').checked = lfx.allowHex;
    }
    if (sfx) {
      if (typeof sfx.color === 'string') $('light-cast-color').value = sfx.color;
      $('light-cast-dist').value = String(sfx.distance);
    }
    if (own) castOn.checked = !!sfx;
    showDir();
    $('light-btn').hidden = !!lfx;
    $('light-preview-note').hidden = !!lfx || base < 0;
    $('light-status').textContent = base >= 0 && own ? t('lgt.statusOn', { name: sp.layers[base].name }) : '';
    $('light-stale').hidden = !((li >= 0 && fxStale(sp, li)) || (si >= 0 && fxStale(sp, si)));
  }
  let syncTimer = 0;
  renderCallbacks.onLightPanel = () => { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 250); };
  // Panel auf- oder zugeklappt, als Schublade geöffnet, angepinnt …: die
  // Vorschau kommt bzw. geht.
  if (panel) {
    let wasOpen = panelOpen();
    const watch = () => { const o = panelOpen(); if (o !== wasOpen) { wasOpen = o; renderEditor(); sync(); } };
    // Höchstens einmal je Bild prüfen — offsetParent erzwingt ein Layout.
    let queued = false;
    const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; watch(); }); } };
    new MutationObserver(later).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'style', 'hidden'] });
  }

  dirBtns.forEach(b => b.addEventListener('click', () => {
    dir = { dx: Number(b.dataset.dx), dy: Number(b.dataset.dy) };
    showDir();
    changed(['light', 'shadow']);
  }));
  // Stärke: Vorschau schon beim Ziehen, Ebene erst beim Loslassen (ein Undo-Schritt).
  amount.addEventListener('input', () => {
    $('light-amount-val').textContent = amount.value + '%';
    if (!hasLayer('light')) renderEditor();
  });
  for (const id of ['light-amount', 'light-width', 'light-highlight', 'light-shadow', 'light-free']) {
    $(id).addEventListener('change', () => changed(['light']));
  }
  $('light-cast-color').addEventListener('input', () => { if (!hasLayer('shadow')) renderEditor(); });
  for (const id of ['light-cast-color', 'light-cast-dist']) {
    $(id).addEventListener('change', () => changed(['shadow']));
  }
  // Schlagschatten an/aus: gibt es schon Licht als Ebene, kommt bzw. geht
  // die Schatten-Ebene gleich mit — sonst nur in der Vorschau.
  castOn.addEventListener('change', () => {
    if (!hasLayer('light') && !hasLayer('shadow')) { renderEditor(); return; }
    change((sp, base) => {
      if (castOn.checked) upsertIn(sp, base, 'shadow', true);
      else removeIn(sp, base, 'shadow');
    });
  });
  $('light-btn').addEventListener('click', commit);
  $('light-redo').addEventListener('click', recomputeAll);
  sync();
}

// ────────────────────────────────────────────────────────────────────
// Schablonen-Panel (die Trace-Buttons; der Rest lebt in template.js)
// ────────────────────────────────────────────────────────────────────
function initTemplatePanel() {
  $('template-trace').addEventListener('click', () => applyTemplateTrace('palette'));
  $('template-trace-raw').addEventListener('click', () => applyTemplateTrace('raw'));
  $('template-trace-quant').addEventListener('click', () => {
    applyTemplateTrace('quantize', Number($('trace-colors').value) || 8);
  });
}

// ────────────────────────────────────────────────────────────────────
// Kopfzeile: Projekt speichern/laden, Speicherort, Reset, Hilfe
// ────────────────────────────────────────────────────────────────────
// Wird von initTopbar gesetzt, sobald es den Knopf gibt.
let syncSaveDirBtn = () => {};

function initTopbar() {
  const saveDirBtn = $('save-dir-btn');
  if (!supportsFsAccess()) {
    saveDirBtn.hidden = true; // Browser ohne API → Download-Fallback
  } else {
    let dirName = null;
    const refresh = name => {
      dirName = name || null;
      saveDirBtn.title = dirName ? t('file.dirSet', { name: dirName }) : t('file.dirUnset');
      saveDirBtn.classList.toggle('is-set', !!dirName);
    };
    syncSaveDirBtn = () => refresh(dirName);
    getStoredDirName().then(refresh);
    saveDirBtn.addEventListener('click', async () => {
      const dir = await pickSaveDirectory();
      if (dir) {
        refresh(dir.name);
        showInfoToast(t('file.dirPicked', { name: dir.name }));
      }
    });
  }

  $('save-file-btn').addEventListener('click', saveToFile);

  // Hinzugefügte Sprites zeigen: den ersten wählen (öffnet seinen Reiter).
  const showAdded = ids => {
    renderCallbacks.onSelectSprite(ids[0]);
    renderAll();
    saveState();
    showInfoToast(ids.length === 1
      ? t('file.spriteAdded', { name: sprites[ids[0]].name })
      : t('file.spritesAdded', { n: ids.length }));
  };

  const loadInput = $('load-file-input');
  $('load-file-btn').addEventListener('click', () => loadInput.click());
  loadInput.addEventListener('change', e => {
    const file = e.target.files[0];
    // Eine Sprite-Datei ersetzt das Projekt nicht, sie kommt dazu.
    if (file) loadFromFile(file, msg => showInfoToast(msg), showAdded);
    loadInput.value = '';
  });

  // Einzelne Sprites: nur den aktuellen sichern, oder Sprites aus einer
  // Datei (Sprite- oder Projektdatei) zum Projekt hinzufügen.
  $('save-sprite-btn').addEventListener('click', () => { commitFloat(); saveSpriteToFile(); });
  $('save-ase-btn').addEventListener('click', () => { commitFloat(); saveAseToFile(); });
  const addInput = $('add-sprite-input');
  $('add-sprite-btn').addEventListener('click', () => addInput.click());
  addInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) addSpritesFromFile(file, showAdded, msg => showInfoToast(msg));
    addInput.value = '';
  });

  $('clear-storage-btn').addEventListener('click', () => {
    showConfirmToast(t('file.confirmReset'), () => { forgetTemplate(); clearStorage(); }, t('file.resetOk'));
  });

  const help = $('help-modal-overlay');
  $('help-btn').addEventListener('click', () => { syncBackupRows(); help.classList.add('open'); });
  help.addEventListener('click', e => {
    const b = e.target.closest('[data-backup]');
    if (!b) return;
    if (b.dataset.do === 'download') downloadBackup(b.dataset.backup);
    else showConfirmToast(t('help.backupConfirm'), () => restoreBackup(b.dataset.backup), t('help.backupRestore'));
  });
  $('help-close').addEventListener('click', () => help.classList.remove('open'));
  help.addEventListener('click', e => { if (e.target === help) help.classList.remove('open'); });

  window.addEventListener('beforeunload', () => {
    stopRotating(true);
    commitFloat(); // schwebender Inhalt darf nicht mit dem Tab verschwinden
    forceSaveBeforeUnload();
  });
}

// ────────────────────────────────────────────────────────────────────
// Code-Panel: kopieren, .ts speichern, Grid leeren
// ────────────────────────────────────────────────────────────────────
function initOutputPanel() {
  initFormatSelect();
  $('export-include-palette').addEventListener('change', () => { updateOutput(); saveState(); });

  $('copy-btn').addEventListener('click', async () => {
    const btn = $('copy-btn');
    const ta = $('output-textarea');
    if (ta.dataset.error) { showInfoToast(ta.dataset.error); return; }
    // Großer Sprite: der Code steht nicht im Feld, er wird jetzt gebaut.
    const code = ta.dataset.lazy ? currentCode() : { code: ta.value, error: null };
    if (code.error) { showInfoToast(code.error); return; }
    try {
      await navigator.clipboard.writeText(code.code);
    } catch {
      // Clipboard-API kann blockiert sein (kein HTTPS o.ä.) — Auswahl als Fallback.
      ta.select();
      showInfoToast(t('file.clipboardOff'));
      return;
    }
    const label = btn.textContent;
    btn.textContent = t('file.copied');
    btn.classList.add('is-ok');
    setTimeout(() => { btn.textContent = label; btn.classList.remove('is-ok'); }, 1600);
  });

  $('save-code-btn').addEventListener('click', async () => {
    if (!getSprite()) return;
    if ($('output-textarea').dataset.error) { showInfoToast($('output-textarea').dataset.error); return; }
    const code = currentCode();
    if (code.error) { showInfoToast(code.error); return; }
    const fmt = getFormat(state.outputFormat);
    const filename = codeFilename(state.outputFormat);
    const blob = new Blob([code.code], { type: `${fmt.mime};charset=utf-8` });
    const result = await saveBlob(blob, filename);
    showInfoToast(result.fallback
      ? t('file.downloaded', { name: filename })
      : (result.dir ? t('file.savedIn', { name: filename, dir: result.dir })
                    : t('file.saved', { name: filename })));
  });

  $('clear-grid-btn').addEventListener('click', () => {
    if (!getSprite() || layerBlocked(true)) return;
    stopRotating(false);
    commitFloat();
    showConfirmToast(t('sprite.confirmClear'), () => {
      recordOp(clearCurrentGrid);
      renderAll();
      saveState();
    }, t('sprite.clearOk'));
  });
}

// ────────────────────────────────────────────────────────────────────
// Ausgabeformat des Code-Felds
// ────────────────────────────────────────────────────────────────────
// Ein Satz je Format — die Texte selbst stehen zweisprachig in i18n.js.
function formatHint(key) { return t(`fmt.${key}`); }

function syncFormatUI() {
  const fmt = getFormat(state.outputFormat);
  renderMaterials();
  $('save-code-btn').textContent = t('file.saveAs', { ext: fmt.ext });
  $('save-code-btn').title = t('file.saveAsTitle', { label: fmt.label });

  // Die Palette-Option gibt es nur, wo sie etwas ändert — bei SVG, CSS und
  // Text stecken die Farben ohnehin direkt im Ergebnis.
  $('include-palette-label').hidden = !fmt.palOption;

  const hint = formatHint(state.outputFormat);
  $('output-format-hint').textContent = fmt.reimport ? t('fmt.reimport', { hint }) : hint;
}

function initFormatSelect() {
  const sel = $('output-format');
  for (const [key, fmt] of Object.entries(CODE_FORMATS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = fmt.label;
    sel.appendChild(opt);
  }
  sel.value = state.outputFormat;
  sel.addEventListener('change', () => {
    state.outputFormat = sel.value;
    syncFormatUI();
    updateOutput();
    saveState();
  });
  syncFormatUI();
}

// ────────────────────────────────────────────────────────────────────
// IMPORT — TypeScript-/JS-Sprite einlesen (Grid + Palette)
// ────────────────────────────────────────────────────────────────────
function initImport() {
  const overlay = $('import-modal-overlay');
  const ta      = $('import-textarea');
  const errEl   = $('import-error');
  const okEl    = $('import-preview');
  const fileInp = $('import-file-input');
  const usePal  = $('import-use-palette');

  const close = () => overlay.classList.remove('open');
  const setError = msg => {
    errEl.textContent = msg;
    errEl.hidden = !msg;
    $('import-help').hidden = !msg;
    if (msg) okEl.hidden = true;
  };
  // Hilfe über dem Import-Dialog aufschlagen — der Text im Feld bleibt.
  $('import-help').addEventListener('click', () => openHelpAt('[data-i18n-html="help.io"]'));

  // Live-Vorschau: sagt schon vor dem Laden, was erkannt wurde.
  const preview = () => {
    setError('');
    okEl.hidden = true;
    if (!ta.value.trim()) return null;
    const r = parseTsSprite(ta.value);
    if (!r.ok) { setError(r.error); return null; }

    const parts = [];
    if (r.stats.format && r.stats.format !== 'Array') parts.push(r.stats.format);
    parts.push(t('imp.size', { w: r.stats.w, h: r.stats.h }));
    if (r.stats.frames > 1) parts.push(tn('list.frames', r.stats.frames));
    if (r.stats.paletteCount) parts.push(t('imp.paletteWith', { n: r.stats.paletteCount }));
    else parts.push(t('imp.paletteNone'));
    if (r.stats.restored) parts.push(t('imp.restored', { n: r.stats.restored }));
    if (r.name) parts.push(t('imp.name', { name: r.name }));
    okEl.textContent = t('imp.detected') + parts.join(' · ')
      + (r.stats.unknown.length
        ? t('imp.unknown', { list: r.stats.unknown.join(', ') })
        : '');
    okEl.hidden = false;

    usePal.disabled = !r.stats.paletteCount;
    $('import-use-palette-label').classList.toggle('is-disabled', !r.stats.paletteCount);
    return r;
  };

  $('import-btn').addEventListener('click', () => {
    ta.value = '';
    setError('');
    okEl.hidden = true;
    usePal.checked = true;
    usePal.disabled = false;
    overlay.classList.add('open');
    ta.focus();
  });

  $('import-modal-cancel').addEventListener('click', close);
  // Kein Schließen per Klick daneben — ein Fehlklick (oder Text markieren und
  // außerhalb loslassen) soll die Eingaben nicht verwerfen. Abbrechen oder Esc.
  ta.addEventListener('input', preview);

  // Datei einlesen → landet im Textfeld, dann läuft der normale Weg.
  $('import-file-btn').addEventListener('click', () => fileInp.click());
  fileInp.addEventListener('change', e => {
    const file = e.target.files[0];
    fileInp.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { ta.value = ev.target.result; preview(); };
    reader.onerror = () => setError(t('file.readFailed'));
    reader.readAsText(file);
  });

  // Gemeinsamer Pfad für "in aktuellen Sprite" und "als neuen Sprite".
  const doImport = asNew => {
    const r = preview();
    if (!r) { if (!ta.value.trim()) setError(t('imp.nothing')); return; }

    // Palette anlegen (falls gewünscht und vorhanden).
    let palName = null;
    if (usePal.checked && r.palette) {
      palName = createPaletteFromImport(r.palette, r.name ? r.name.toLowerCase() : 'import');
      // JSON (Spiel): Materialien gehören zur Palette.
      if (palName && r.materials) paletteMaterials[palName] = { ...r.materials };
    }

    // Frames samt Dauer. Sind alle gleich lang, wird daraus die fps-Zahl.
    const durs = r.durations || [];
    const same = durs.length && durs.every(d => d === durs[0]);
    const fps = same ? Math.round(1000 / durs[0]) : undefined;
    const frames = (r.frames || [r.grid]).map((grid, i) => ({ grid, dur: same ? 0 : durs[i] || 0 }));

    stopPlayback();
    if (asNew || !getSprite()) {
      const id = createSprite({
        name: r.name || t('imp.fallbackName'),
        palette: palName || getSprite()?.palette || DEFAULT_PALETTE,
        frames,
        fps,
      });
      state.curSprite = id;
      clearHistory(); // frischer Sprite → alte Undo-Einträge sind bedeutungslos
    } else {
      // Ersetzt den ganzen Sprite — Frames UND Ebenen. Undo holt alles zurück.
      const sp = getSprite();
      recordOp(() => {
        sp.frames = frames.map(f => ({ cels: [f.grid], dur: f.dur }));
        sp.layers = [defaultLayer(1)];
        sp.layer = 0;
        sp.frame = 0;
        if (fps) sp.fps = Math.max(1, Math.min(60, fps));
        if (palName) sp.palette = palName;
        // Tags passen nur noch, soweit es ihre Frames noch gibt.
        sp.tags = normalizeTags(sp.tags, sp.frames.length);
      });
    }

    close();
    renderAll();
    saveState();
    showInfoToast(palName ? t('imp.doneWithPal', { name: palName }) : t('imp.donePlain'));
  };

  $('import-modal-current').addEventListener('click', () => doImport(false));
  $('import-modal-new').addEventListener('click', () => doImport(true));
}

// ────────────────────────────────────────────────────────────────────
// UI aus dem geladenen State initial synchronisieren
// ────────────────────────────────────────────────────────────────────
function syncUiFromState() {
  $('cell-size').value = state.cellSize;
  $('cell-size-val').textContent = state.cellSize + 'px';
  $('strength-slider').value = state.brushStrength;
  $('strength-val').textContent = state.brushStrength + '%';
  $('tolerance-slider').value = state.wandTolerance;
  $('tolerance-val').textContent = state.wandTolerance + '%';
  $('bg-dark-btn').classList.toggle('is-active', state.editorBg === 'dark');
  $('bg-bw-btn').classList.toggle('is-active', state.editorBg === 'bw');
  syncGridItem();
  syncTiledItems();
  if (state.tiled !== 'off') requestAnimationFrame(centerCanvas);
  setBrushSize(state.brushSize);
  const fmtSel = $('output-format');
  if (fmtSel) { fmtSel.value = state.outputFormat; syncFormatUI(); }
  $('shape-fill-btn').classList.toggle('is-active', state.shapeFill);
  $('shape-fill-btn').setAttribute('aria-pressed', String(state.shapeFill));
  syncFillVisible();
  syncRecolor();
  $('pixel-perfect-btn').classList.toggle('is-active', !!state.pixelPerfect);
  $('pixel-perfect-btn').setAttribute('aria-pressed', String(!!state.pixelPerfect));
  updateMirrorUI();
  syncImagePanel();
  updateToolUI();
}

// ────────────────────────────────────────────────────────────────────
// INIT
// ────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────
// Sprachwechsel im laufenden Betrieb
// ────────────────────────────────────────────────────────────────────
// Das statische DOM hat i18n.js schon umgestellt; hier kommt alles nach,
// was JavaScript selbst schreibt. Der Sprite-Zustand wird dabei nicht
// angefasst — es wird nur neu beschriftet und neu gezeichnet.
function relabelUi() {
  syncPanelTitles();
  syncFullscreenBtn();
  syncFormatUI();
  syncSaveDirBtn();
  syncImagePanel();
  updateToolUI();
  relabelHelper();
  renderAll();
  info(''); // die alte Statuszeile stünde sonst in der alten Sprache da
}

async function init() {
  // Zuerst übersetzen: der Body ist so lange versteckt (siehe editor.html).
  applyStatic();
  initLangSwitch();
  onLangChange(relabelUi);

  // IndexedDB lädt asynchron — erst danach gibt es Sprites zum Zeichnen.
  const loaded = await loadState();

  // Leeres Projekt (erster Start oder Migration hat nichts gerettet) →
  // ein Sprite anlegen, damit der Editor nie ins Leere zeigt.
  if (!Object.keys(sprites).length) createDefaultSprite();
  if (!state.curSprite) state.curSprite = Object.keys(sprites)[0];

  applyIcons();
  initPanels();
  initDock();
  initLayout();
  initTopbar();
  initMenubar();
  initFullscreen({ onToggle: syncFullscreenBtn });
  initToolbar();
  initPalettePanel();
  initFreeColors();
  initReduceModal();
  initShowColor();
  initImagePanel();
  initRotateSlider();
  initCleanupPanel();
  initTabs();
  initWhatsNew();
  initToolWrap();
  initProjectsUi();
  initLightPanel();
  initTilemap();
  initCalcFields();
  initTemplate();
  initTemplatePanel();
  initNewSpriteModal();
  initRenameModal();
  initSizeModal();
  initPaletteModal();
  initExport();
  initFrames();
  initLayers();   // nach initFrames: hängt sich an dessen Zeichen-Callback
  initTlMenu();
  initQuickPaletteDrag();
  initPreview();  // ebenso — zeichnet bei jedem Strich mit
  initGuides();
  renderCallbacks.onGuideInfo = info;
  initOutputPanel();
  initImport();
  initCanvasEvents();
  initPan({ ignoreKey: e => isTypingTarget(e.target) || anyModalOpen() });
  // Zweiter Finger auf der Fläche: was der erste begonnen hat, zurücknehmen.
  // Die Ansicht weiß, dass es eine Zoom-Geste ist — was dabei angefangen
  // wurde, weiß nur app.js.
  initPinch({
    cancelFirstFinger: (sinceDepth, quick) => {
      if (shapeStart) { shapeStart = null; state.shape.cells = []; }
      if (selection.mode) endSelectionPointer();
      if (quick) rollbackTo(sinceDepth);
      else if (state.isDrawing || state.isErasing) commitStroke();
      state.isDrawing = false;
      state.isErasing = false;
      renderAll();
    },
  });
  initKeyboardEvents();

  $('sprite-search').addEventListener('input', renderSpriteList);

  syncUiFromState();
  renderAll();
  if (isMobileLayout()) fitZoomToArea();
  syncHistoryButtons();

  // Vollbild wird nach dem Neuladen bewusst NICHT wiederhergestellt: der
  // Browser erlaubt echtes Vollbild nur nach einem Klick. Übrig bliebe ein
  // halbes Vollbild — Kopfzeile weg, Seitenleisten eingefahren, „Vollbild
  // beenden“ sichtbar, obwohl der Browser gar nicht im Vollbild ist.
  if (loaded.note) showInfoToast(loaded.note);
  // Gespeicherter Stand war unlesbar: er liegt gesichert daneben und wird
  // nicht überschrieben. Gleich zum Herunterladen anbieten.
  if (loaded.rescued) showConfirmToast(t('store.rescued'), () => downloadBackup('rescue'), t('help.backupDownload'));
  else offerStartDrawing();
  initHelper(); // Bitty — wartet mit der Tour, bis keine Rückfrage mehr offen ist
}

// Vom Probier-Raster der Startseite gekommen (editor.html#start=…)?
// Erst fragen — das Projekt kann schon voll sein. Der Hash geht in jedem
// Fall weg, sonst käme die Frage bei jedem Neuladen wieder.
function offerStartDrawing() {
  const r = parseStartHash(location.hash);
  if (!location.hash.startsWith('#start=')) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (!r) return;
  showConfirmToast(t('start.ask'), () => {
    // Gleiche Palette schon da (zweites Mal übernommen)? Dann die nehmen.
    const base = 'start_' + r.name;
    const same = paletteExists(base) && JSON.stringify(getPaletteByName(base)) === JSON.stringify(r.palette);
    const palName = same ? base : createPaletteFromImport(r.palette, base);
    stopPlayback();
    const id = createSprite({ name: t(r.sketch ? 'start.nameSketch' : 'start.name'), palette: palName || DEFAULT_PALETTE, grid: r.grid });
    renderCallbacks.onSelectSprite(id); // zeichnet und speichert
  }, t('start.take'));
}

// Hilfe → Sicherung: Zeilen nur für vorhandene Sicherungen, mit Datum.
function syncBackupRows() {
  const info = backupInfo();
  const fmt = d => d.toLocaleString(getLang() === 'en' ? 'en-GB' : 'de-AT', { dateStyle: 'medium', timeStyle: 'short' });
  for (const k of ['backup', 'rescue']) {
    $(`backup-row-${k}`).hidden = !info[k];
    if (info[k]) $(`backup-label-${k}`).textContent = t(`help.backupLabel.${k}`, { date: fmt(info[k]) });
  }
  $('backup-none').hidden = !!(info.backup || info.rescue);
}

init();
