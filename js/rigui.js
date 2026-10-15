// ════════════════════════════════════════════════════════════════════
// RIGUI — „Bewegung erzeugen“: das Fenster und das Anhängen der Frames
// ════════════════════════════════════════════════════════════════════
// Die Rechnung steht in js/rig.js und kommt ohne DOM aus; hier ist alles,
// was man sieht: Vorlage, Bildzahl und Stärke wählen, die Bewegung laufen
// sehen, und am Ende landen die Frames in der Timeline.
//
// ── Wohin die Frames kommen ─────────────────────────────────────────
// Hinten angehängt, mit einem Tag, der wie die Bewegung heißt. Gibt es den
// Tag schon, werden SEINE Frames ersetzt — man kann also die Stärke
// durchprobieren, ohne hinterher aufzuräumen. Der Grundframe selbst wird nie
// angefasst: er ist die Vorlage, aus der alles gerechnet wird.
//
// Alles zusammen ist EIN Undo-Schritt.
import { getSprite, getPaletteByName, flatCels, clearSelection } from './state.js';
import { TEMPLATES, TEMPLATE_NAMES, buildFrames, hasRig, rigParts } from './rig.js';
import { renderAll } from './render.js';
import { recordOp } from './history.js';
import { saveState } from './storage.js';
import { commitFloat } from './selection.js';
import { stop as stopPlayback } from './frames.js';
import { showInfoToast } from './toast.js';
import { tagsDelete, TAG_COLORS } from './tags.js';
import { gridToCanvas } from './raster.js';
import { t, onLangChange } from './i18n.js';

/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);

// Die Vorschau läuft, solange das Fenster offen ist.
let timer = null;
let preview = [];   // die gerechneten Zellen je Frame
let at = 0;

const count = () => Math.max(2, Math.min(64, Math.round(Number($('rig-count').value) || 8)));
const strength = () => Number($('rig-strength').value) / 100;
const template = () => $('rig-tpl').value;

/** Der Name, unter dem die Bewegung als Tag in der Timeline steht. */
const tagName = name => t('rig.tplName.' + name);

// ────────────────────────────────────────────────────────────────────
// Erzeugen
// ────────────────────────────────────────────────────────────────────
/**
 * Die Frames der Bewegung an den Sprite hängen (oder die eines gleichnamigen
 * Tags ersetzen) und den Tag setzen. Gibt die Zahl der Frames zurück.
 */
export function generate(name, n, s) {
  const sp = getSprite();
  if (!sp || !hasRig(sp)) return 0;
  const cels = buildFrames(sp.frames[sp.frame].cels, sp.layers, name, n, s);
  if (!cels.length) return 0;
  const label = tagName(name);

  recordOp(() => {
    // Lief die Bewegung schon einmal durch, stehen ihre Frames noch da —
    // weg damit, sonst wächst der Sprite bei jedem Versuch.
    const old = sp.tags.find(g => g.name === label);
    if (old) {
      const ids = [];
      for (let f = old.from; f <= old.to; f++) ids.push(f);
      // Den Grundframe nie wegwerfen — aus ihm wird gerechnet.
      const keep = ids.indexOf(sp.frame);
      if (keep >= 0) ids.splice(keep, 1);
      if (ids.length) {
        for (const f of [...ids].sort((a, b) => b - a)) sp.frames.splice(f, 1);
        tagsDelete(sp.tags, ids);
      }
    }

    // Hinten anhängen verschiebt keine Frame-Nummer, also auch keinen Tag.
    // (tagsInsert wäre hier sogar falsch: es ließe den LETZTEN vorhandenen
    // Tag mitwachsen und die neue Bewegung verschlucken.)
    const start = sp.frames.length;
    for (const c of cels) sp.frames.push({ cels: c, dur: 0 });

    // Den Tag auf die neuen Frames setzen — oder neu anlegen. Immer vorwärts:
    // ein Laufzyklus im Hin und Her liefe die zweite Hälfte rückwärts.
    const g = sp.tags.find(x => x.name === label);
    const to = start + cels.length - 1;
    if (g) { g.from = start; g.to = to; }
    else sp.tags.push({ name: label, from: start, to, color: TAG_COLORS[sp.tags.length % TAG_COLORS.length], dir: 'forward' });

    sp.frame = start;
  });
  return cels.length;
}

// ────────────────────────────────────────────────────────────────────
// Vorschau
// ────────────────────────────────────────────────────────────────────
function rebuild() {
  const sp = getSprite();
  preview = sp && hasRig(sp)
    ? buildFrames(sp.frames[sp.frame].cels, sp.layers, template(), count(), strength())
    : [];
  at = 0;
  $('rig-strength-val').textContent = $('rig-strength').value + '%';
  draw();
}

function draw() {
  const sp = getSprite();
  const cv = /** @type {HTMLCanvasElement} */ ($('rig-preview'));
  if (!sp || !preview.length || !cv) return;
  const cels = preview[at % preview.length];
  gridToCanvas(cv, flatCels(sp, cels), getPaletteByName(sp.palette));
  // Groß genug zum Erkennen, aber nie über das Fenster hinaus.
  const k = Math.max(1, Math.min(8, Math.floor(160 / Math.max(cv.width, cv.height))));
  cv.style.width = cv.width * k + 'px';
  cv.style.height = cv.height * k + 'px';
  $('rig-preview-info').textContent = t('rig.previewAt', { i: (at % preview.length) + 1, n: preview.length });
}

function play() {
  stopPreview();
  timer = setInterval(() => { at++; draw(); }, Math.round(1000 / Math.max(1, getSprite()?.fps || 8)));
}

function stopPreview() {
  if (timer) clearInterval(timer);
  timer = null;
}

// ────────────────────────────────────────────────────────────────────
// Fenster
// ────────────────────────────────────────────────────────────────────
function fillTemplates() {
  const sel = $('rig-tpl');
  if (!sel) return;
  const keep = sel.value;
  sel.innerHTML = TEMPLATE_NAMES.map(n => `<option value="${n}">${tagName(n)}</option>`).join('');
  if (TEMPLATE_NAMES.includes(keep)) sel.value = keep;
}

export function openRigModal() {
  const sp = getSprite();
  if (!sp) return;
  if (!hasRig(sp)) { showInfoToast(t('rig.needParts')); return; }
  stopPlayback();
  commitFloat();
  clearSelection();

  fillTemplates();
  // Die Bildzahl schlägt die Vorlage vor — bis der Nutzer selbst etwas tippt.
  $('rig-count').value = String(TEMPLATES[template()].frames);
  $('rig-modal-parts').textContent = t('rig.parts', {
    n: rigParts(sp).length,
    list: rigParts(sp).map(p => t('rig.role.' + p.role)).join(', '),
  });
  $('rig-modal-overlay').classList.add('open');
  rebuild();
  play();
}

export function initRigModal() {
  const overlay = $('rig-modal-overlay');
  if (!overlay) return;
  const close = () => { stopPreview(); overlay.classList.remove('open'); preview = []; };

  $('ly-part-gen')?.addEventListener('click', openRigModal);
  $('rig-modal-cancel').addEventListener('click', close);
  // Esc schließt über closeTopModal (app.js) — dann läuft die Vorschau noch.
  // Darum hier zusätzlich am Overlay horchen, statt sie weiterticken zu lassen.
  new MutationObserver(() => { if (!overlay.classList.contains('open')) stopPreview(); })
    .observe(overlay, { attributes: true, attributeFilter: ['class'] });

  $('rig-tpl').addEventListener('change', () => {
    $('rig-count').value = String(TEMPLATES[template()].frames);
    rebuild();
  });
  $('rig-count').addEventListener('input', rebuild);
  $('rig-strength').addEventListener('input', rebuild);

  $('rig-modal-ok').addEventListener('click', () => {
    const name = template(), n = count(), s = strength();
    close();
    const made = generate(name, n, s);
    if (!made) { showInfoToast(t('rig.needParts')); return; }
    renderAll();
    saveState();
    showInfoToast(t('rig.genDone', { n: made, name: tagName(name) }));
  });

  onLangChange(fillTemplates);
}
