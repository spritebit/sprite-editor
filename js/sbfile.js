// ════════════════════════════════════════════════════════════════════
// SBFILE — Projektdateien (.sb) wie die Desktop-App
// ════════════════════════════════════════════════════════════════════
// Web und Desktop speichern Projekte als .sb. Aufbau (spritebit-rs,
// core::io save_native / load_native):
//
//   "SPRITEBIT\0"  10 Byte Kennung
//   u32 LE         Fassung (1)
//   zlib           u32 LE Länge des Kopfs, Kopf als JSON,
//                  danach je Bild: u32 Anzahl Kacheln, je Kachel
//                  u32 Nummer und 64×64 Pixel als u16 LE
//
// Ein Bild liegt in Kacheln von 64×64 Pixeln, Zeile für Zeile; nur bemalte
// Kacheln stehen in der Datei. Ein Pixel: 0 leer, 1–255 Palettenfarbe,
// ab 256 freie Farbe Nr. (v − 256) aus der Liste `free` des Sprites.
//
// Hier wird zwischen .sb und dem Inhalt einer Web-Projektdatei (buildPayload
// in storage.js, Schema 2) übersetzt — alles andere bleibt wie gehabt.
// Sprites, die größer sind als das Web erlaubt (MAX_SIDE), lässt das Öffnen
// weg; `skipped` nennt sie.
//
// Rechnung ohne DOM — läuft unter Node (tests/sbfile.test.js); gepackt wird
// mit CompressionStream/DecompressionStream ('deflate' = zlib), die Browser
// und Node beide haben.

export const SB_MAGIC = 'SPRITEBIT\0';
export const SB_VERSION = 1;
const TILE = 64;
const TILE_PX = TILE * TILE;
const FREE_BASE = 256;

/** Endung .sb (oder die alte .spritebit)? */
export function isSbName(name) {
  return /\.(sb|spritebit)$/i.test(name || '');
}

/** Beginnt der Inhalt mit der Kennung einer .sb-Datei? */
export function looksLikeSb(bytes) {
  if (bytes.length < 14) return false;
  for (let i = 0; i < SB_MAGIC.length; i++) if (bytes[i] !== SB_MAGIC.charCodeAt(i)) return false;
  return true;
}

const err = (code, msg) => Object.assign(new Error(msg), { code });

// ── Packen ───────────────────────────────────────────────────────────
async function viaStream(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
const inflate = bytes => viaStream(bytes, new DecompressionStream('deflate'));
const deflate = bytes => viaStream(bytes, new CompressionStream('deflate'));

// ── Hilfen ───────────────────────────────────────────────────────────
const hex2 = n => n.toString(16).padStart(2, '0');
const normHex = s => (typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : null);

/** Id wie in der Web-Version (spritebit-rs io.rs web_id) — eindeutig. */
function webId(name, taken) {
  let base = String(name || '').replace(/[^A-Za-z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || 'sprite';
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
}

// ════════════════════════════════════════════════════════════════════
// Lesen
// ════════════════════════════════════════════════════════════════════

/**
 * .sb-Datei → Inhalt einer Web-Projektdatei.
 * @param {Uint8Array} bytes
 * @param {number} maxSide  größere Sprites werden weggelassen
 * @returns {Promise<{doc: any, skipped: {name: string, width: number, height: number}[]}>}
 */
export async function readSb(bytes, maxSide) {
  if (!looksLikeSb(bytes)) throw err('format', 'keine .sb-Datei');
  const version = new DataView(bytes.buffer, bytes.byteOffset + 10, 4).getUint32(0, true);
  if (version !== SB_VERSION) throw err('version', `Fassung ${version}`);
  let body;
  try { body = await inflate(bytes.subarray(14)); } catch { throw err('corrupt', 'nicht entpackbar'); }
  return sbBodyToDoc(body, maxSide);
}

/**
 * Entpackter Inhalt → Web-Projektdatei.
 * @param {Uint8Array} body
 * @param {number} maxSide
 */
export function sbBodyToDoc(body, maxSide) {
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let pos = 0;
  const need = n => { if (pos + n > body.length) throw err('corrupt', 'zu kurz'); };
  const u32 = () => { need(4); const v = dv.getUint32(pos, true); pos += 4; return v; };
  const headLen = u32();
  need(headLen);
  let head;
  try { head = JSON.parse(new TextDecoder().decode(body.subarray(pos, pos + headLen))); } catch { throw err('corrupt', 'Kopf'); }
  pos += headLen;
  if (!head || !Array.isArray(head.sprites)) throw err('corrupt', 'keine Sprites');

  /** @type {Record<string, any>} */
  const sprites = {};
  const taken = new Set();
  const skipped = [];
  let currentId = null;
  head.sprites.forEach((s, si) => {
    const w = s.width | 0, h = s.height | 0;
    const nImages = s.images | 0;
    const free = (Array.isArray(s.free) ? s.free : []).map(c => normHex(c) || '#000000');
    const big = w > maxSide || h > maxSide || w < 1 || h < 1;
    // Bilder lesen (bei zu großen nur überspringen — die Kacheln stehen trotzdem in der Datei).
    const cols = Math.ceil(w / TILE);
    const px = v => (v >= FREE_BASE ? free[v - FREE_BASE] || 0 : v);
    const images = [];
    for (let k = 0; k < nImages; k++) {
      const n = u32();
      const grid = big ? null : Array.from({ length: h }, () => new Array(w).fill(0));
      for (let t = 0; t < n; t++) {
        const index = u32();
        need(TILE_PX * 2);
        if (grid) {
          const tx = (index % cols) * TILE, ty = Math.floor(index / cols) * TILE;
          for (let i = 0; i < TILE_PX; i++) {
            const v = dv.getUint16(pos + i * 2, true);
            if (!v) continue;
            const x = tx + (i % TILE), y = ty + Math.floor(i / TILE);
            if (x < w && y < h) grid[y][x] = px(v);
          }
        }
        pos += TILE_PX * 2;
      }
      images.push(grid);
    }
    if (big) { skipped.push({ name: String(s.name || 'Sprite'), width: w, height: h }); return; }
    // Zellen: ein Bild, das schon ein früherer Frame auf derselben Ebene zeigt, wird { link }.
    const frames = (Array.isArray(s.frames) ? s.frames : []).map((f, i, all) => {
      const cels = (Array.isArray(f.cels) ? f.cels : []).map((imgId, l) => {
        const k = all.slice(0, i).findIndex(g => g.cels?.[l] === imgId);
        if (k >= 0) return { link: k };
        return images[imgId] ? images[imgId].map(r => [...r]) : Array.from({ length: h }, () => new Array(w).fill(0));
      });
      return f.dur > 0 ? { cels, dur: f.dur } : { cels };
    });
    const layers = (Array.isArray(s.layers) ? s.layers : []).map(l => {
      if (!l?.tileset?.tiles) return l;
      const tiles = l.tileset.tiles.map(rows => rows.map(r => r.map(v => (typeof v === 'number' ? px(v) : 0))));
      return { ...l, tileset: { ...l.tileset, tiles } };
    });
    const id = webId(s.name, taken);
    taken.add(id);
    if (si === (head.current | 0)) currentId = id;
    sprites[id] = {
      name: s.name, palette: s.palette, fps: s.fps, frame: s.frame, layer: s.layer,
      layers, tags: s.tags || [], guides: s.guides, frames,
    };
  });

  const customPalettes = {}, paletteColorNames = {};
  for (const p of Array.isArray(head.palettes) ? head.palettes : []) {
    if (!p || typeof p.name !== 'string') continue;
    const obj = {};
    (Array.isArray(p.colors) ? p.colors : []).forEach((c, i) => { obj[i + 1] = normHex(c) || '#000000'; });
    customPalettes[p.name] = obj;
    if (p.names && typeof p.names === 'object' && Object.keys(p.names).length) paletteColorNames[p.name] = { ...p.names };
  }
  const doc = {
    version: 2,
    name: typeof head.name === 'string' ? head.name : '',
    sprites,
    customPalettes,
    paletteMaterials: head.materials && typeof head.materials === 'object' ? head.materials : {},
    paletteColorNames,
    ui: { curSprite: currentId || Object.keys(sprites)[0] || null },
  };
  if (head.tilesetLib && typeof head.tilesetLib === 'object' && Object.keys(head.tilesetLib).length) doc.tilesetLib = head.tilesetLib;
  return { doc, skipped };
}

// ════════════════════════════════════════════════════════════════════
// Schreiben
// ════════════════════════════════════════════════════════════════════

/**
 * Inhalt einer Web-Projektdatei → .sb-Datei.
 * @param {any} doc  wie buildPayload() in storage.js
 * @returns {Promise<Uint8Array>}
 */
export async function writeSb(doc) {
  const z = await deflate(docToSbBody(doc));
  const out = new Uint8Array(14 + z.length);
  for (let i = 0; i < SB_MAGIC.length; i++) out[i] = SB_MAGIC.charCodeAt(i);
  new DataView(out.buffer).setUint32(10, SB_VERSION, true);
  out.set(z, 14);
  return out;
}

/**
 * Web-Projektdatei → entpackter Inhalt einer .sb-Datei.
 * @param {any} doc
 * @returns {Uint8Array}
 */
export function docToSbBody(doc) {
  const ids = Object.keys(doc.sprites || {});
  const headSprites = [];
  /** @type {Uint8Array[]} */
  const chunks = [];
  const u32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; };

  for (const id of ids) {
    const s = doc.sprites[id];
    const frames = Array.isArray(s.frames) ? s.frames : [];
    const celsOf = f => (Array.isArray(f.cels) ? f.cels : f.grid ? [f.grid] : []);
    const first = frames.flatMap(celsOf).find(c => Array.isArray(c));
    const h = first ? first.length : 1, w = first?.[0]?.length || 1;
    const nLayers = Math.max(1, ...frames.map(f => celsOf(f).length));
    // Freie Farben: jede Hex-Farbe bekommt eine Nummer ab 256.
    const free = [], freeIdx = new Map();
    const val = v => {
      if (typeof v === 'number') return v > 0 && v < FREE_BASE ? v : 0;
      const hx = normHex(v);
      if (!hx) return 0;
      if (!freeIdx.has(hx)) { freeIdx.set(hx, free.length); free.push(hx); }
      return FREE_BASE + freeIdx.get(hx);
    };
    // Bilder: jedes Grid einmal; { link: k } zeigt auf das Bild von Frame k.
    const images = [];
    const celIds = [];
    frames.forEach((f, i) => {
      const cels = celsOf(f);
      const row = [];
      for (let l = 0; l < nLayers; l++) {
        const c = cels[l];
        if (c && typeof c === 'object' && !Array.isArray(c) && Number.isInteger(c.link) && c.link < i) row.push(celIds[c.link][l]);
        else { images.push(Array.isArray(c) ? c : null); row.push(images.length - 1); }
      }
      celIds.push(row);
    });
    const cols = Math.ceil(w / TILE), rows = Math.ceil(h / TILE);
    for (const grid of images) {
      /** @type {[number, Uint8Array][]} */
      const tiles = [];
      if (grid) {
        for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
          const data = new Uint8Array(TILE_PX * 2);
          const dv = new DataView(data.buffer);
          let any = false;
          for (let y = 0; y < TILE; y++) {
            const r = grid[ty * TILE + y];
            if (!r) break;
            for (let x = 0; x < TILE; x++) {
              const v = val(r[tx * TILE + x] ?? 0);
              if (v) { dv.setUint16((y * TILE + x) * 2, v, true); any = true; }
            }
          }
          if (any) tiles.push([ty * cols + tx, data]);
        }
      }
      chunks.push(u32(tiles.length));
      for (const [index, data] of tiles) { chunks.push(u32(index)); chunks.push(data); }
    }
    const layers = (Array.isArray(s.layers) ? s.layers : []).slice(0, nLayers).map(l => {
      if (!l?.tileset?.tiles) return l;
      return { ...l, tileset: { ...l.tileset, tiles: l.tileset.tiles.map(rs => rs.map(r => r.map(val))) } };
    });
    while (layers.length < nLayers) layers.push({ name: `Ebene ${layers.length + 1}`, visible: true, locked: false, opacity: 1, continuous: false });
    headSprites.push({
      name: s.name || id, width: w, height: h, palette: s.palette, fps: s.fps ?? 8,
      frame: s.frame ?? 0, layer: s.layer ?? 0, layers,
      free, tags: s.tags || [], guides: s.guides || { h: [], v: [], heads: 0, top: 0, bottom: h },
      frames: frames.map((f, i) => ({ cels: celIds[i], dur: f.dur > 0 ? f.dur : 0 })),
      images: images.length,
    });
  }
  const pals = doc.customPalettes || {};
  const head = {
    name: doc.name || '',
    current: Math.max(0, ids.indexOf(doc.ui?.curSprite)),
    palettes: Object.keys(pals).map(name => {
      const p = pals[name] || {};
      const max = Math.max(0, ...Object.keys(p).map(Number).filter(Number.isInteger));
      const colors = [];
      for (let i = 1; i <= max; i++) colors.push(normHex(p[i]) || '#000000');
      return { name, colors, names: doc.paletteColorNames?.[name] || {} };
    }),
    materials: doc.paletteMaterials || {},
    tilesetLib: doc.tilesetLib || {},
    sprites: headSprites,
  };
  const headBytes = new TextEncoder().encode(JSON.stringify(head));
  const total = 4 + headBytes.length + chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  out.set(u32(headBytes.length), 0);
  out.set(headBytes, 4);
  let at = 4 + headBytes.length;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
