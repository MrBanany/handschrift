import './style.css';
import { DEFAULT_SET, deleteSet, exportBackup, importBackup, listSets, loadSet, remove, saveMany } from './glyphstore/db';
import { DEFAULT_LETTER_GAP, merge, optimize, reviewKeys, type Decision, type Tuned } from './glyphstore/optimize';
import { SAMPLE_SET, buildSampleSet } from './glyphstore/sample';
import { symbolVariants } from './glyphstore/symbols';
import type { Variant } from './glyphstore/types';
import { copyPng, download, shareFiles, toPng } from './export/png';
import { toPdf } from './export/pdf';
import { pagesOf } from './import/load';
import { setupPencil } from './import/pencil';
import { clearMaskCache, drawPage, type Background, type DrawOpts } from './renderer/draw';
import { DEFAULT_WORD_GAP, layout, profile, type Settings } from './renderer/layout';
import { extractPage } from './segmentation/extract';
import { clean } from './renderer/clean';
import { measureLines, summarize, type LineMeasure, type TextStyle } from './segmentation/style';
import { buildTemplatePdf } from './template/pdf';
import { PAIRS, SINGLES, SYMBOL_KEYS, SYMBOL_PAGE, WORDS } from './template/layout';

const FORMATS: Record<string, { w: number; h: number }> = { a4: { w: 210, h: 297 }, a4q: { w: 297, h: 210 }, a5: { w: 148, h: 210 } };
const pageSize = () => FORMATS[$<HTMLInputElement>('page').value] ?? FORMATS.a4;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const EXPORT_PX_PER_MM = 12; // ~300 dpi

let toastTimer = 0;
function toast(msg: string) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 3500);
}

// ---------- handwriting sets ----------
let sets: string[] = [];
let active = localStorage.getItem('set') ?? '';
let raw: Variant[] = []; // active set as imported
let tuned: Tuned = { variants: [], excluded: new Set(), letterGap: null };
let bySrc = new Map<string, Variant>();
let lib = new Map<string, Variant[]>();
let style: TextStyle | null = null; // learned from free-text notes, per handwriting

const loadStyle = () => { style = active ? JSON.parse(localStorage.getItem(`style:${active}`) ?? 'null') : null; };

let strong: Tuned = tuned; // strongest pass, shown in the review sheet
const decisions = (): Record<string, Decision> => JSON.parse(localStorage.getItem(`review:${active}`) ?? '{}');

function rebuild() {
  strong = optimize(raw, 1.5);
  tuned = merge(raw, optimize(raw, n('optimize')), strong, decisions());
  // Symbols the set lacks (arrows, +, =, ✓ …) are drawn as pen strokes, so pasted AI answers come out complete.
  const all = [...tuned.variants, ...symbolVariants(tuned.variants)];
  for (const v of all) v.prof = profile(v.alpha, v.w, v.h, v.baseline);
  bySrc = new Map(all.map((v) => [v.src, v]));
  lib = new Map();
  for (const v of all) lib.set(v.key, [...(lib.get(v.key) ?? []), v]);
  clearMaskCache(); // box ids repeat across sets
  schedule();
  renderGrid();
}

async function useSet(name: string) {
  if (name === SAMPLE_SET && !sets.includes(SAMPLE_SET)) {
    toast('Muster-Handschrift wird erzeugt …');
    await saveMany(SAMPLE_SET, await buildSampleSet());
    sets = await listSets();
  }
  active = sets.includes(name) ? name : '';
  localStorage.setItem('set', active);
  raw = active ? await loadSet(active) : [];
  loadStyle();
  renderStyle();
  renderSets();
  rebuild();
}

function renderSets() {
  const sel = $<HTMLSelectElement>('set');
  const names = sets.includes(SAMPLE_SET) ? sets : [...sets, SAMPLE_SET];
  sel.replaceChildren(...(active ? [] : [new Option('Keine ausgewählt', '', true, true)]),
    ...names.map((n) => new Option(n === SAMPLE_SET ? `${n} (zum Ausprobieren)` : n, n, false, n === active)));
  if (!active) sel.options[0].disabled = true;

  $('sets').replaceChildren(...(sets.length ? sets.map((name) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = name;
    li.append(label);
    if (name === active) { const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = 'aktiv'; li.append(tag); }
    else li.append(button('Verwenden', () => useSet(name).then(() => show('write'))));
    li.append(
      button('Backup speichern', async () => download(await exportBackup(name), `${name}.handschrift.json`)),
      button('Löschen', async () => {
        if (!confirm(`„${name}“ von diesem Gerät löschen? Vorher sichern, falls du sie noch brauchst.`)) return;
        await deleteSet(name);
        sets = await listSets();
        await useSet(name === active ? sets[0] ?? '' : active);
      }, 'danger'),
    );
    return li;
  }) : [Object.assign(document.createElement('li'), { textContent: 'Noch keine – leg unten eine an.', className: 'muted' })]));

  const nameField = $<HTMLInputElement>('setName');
  if (!nameField.value || nameField.dataset.auto) {
    nameField.value = active && active !== SAMPLE_SET ? active : DEFAULT_SET;
    nameField.dataset.auto = '1';
  }
}

function button(text: string, onclick: () => unknown, cls = '') {
  const b = document.createElement('button');
  b.textContent = text;
  b.className = cls;
  b.onclick = () => { onclick(); };
  return b;
}

$<HTMLSelectElement>('set').onchange = (e) => useSet((e.target as HTMLSelectElement).value);
$('trySample').onclick = () => useSet(SAMPLE_SET);
$('setName').oninput = () => { delete $('setName').dataset.auto; };

// ---------- settings (persisted locally) ----------
const NUM = ['hasty', 'xh', 'lineH', 'margin', 'weight', 'seed', 'optimize'] as const;
const saved = JSON.parse(localStorage.getItem('settings') ?? '{}');
if (saved.v !== 2) delete saved.optimize; // v2: optimizing starts at "leicht" instead of the old default "mittel"
for (const id of [...NUM, 'ink', 'background', 'page']) if (saved[id] !== undefined) $<HTMLInputElement>(id).value = saved[id];
$<HTMLTextAreaElement>('text').value = localStorage.getItem('text') ?? 'Hallo, das ist ein Test meiner Handschrift.\nEs sieht hoffentlich echt aus!';

// Clamp to the input's limits: a stored 0 line spacing once froze the page for good.
function n(id: string) {
  const el = $<HTMLInputElement>(id), v = Number(el.value);
  if (el.value === '' || !Number.isFinite(v)) return Number(el.defaultValue);
  return Math.min(el.max === '' ? Infinity : Number(el.max), Math.max(el.min === '' ? -Infinity : Number(el.min), v));
}
for (const id of NUM) {
  const el = $<HTMLInputElement>(id);
  el.value = String(n(id));
  el.addEventListener('change', () => { el.value = String(n(id)); });
}

const FORMAT: Record<string, (v: number) => string> = {
  xh: (v) => `${v.toFixed(1)} mm`, lineH: (v) => `${v.toFixed(1)} mm`, margin: (v) => `${v} mm`,
  hasty: (v) => (v < 0.25 ? 'sauber' : v < 0.6 ? 'normal' : 'hastig'), weight: (v) => (v ? `+${v}` : 'normal'),
  optimize: (v) => (v < 0.45 ? 'leicht' : v < 0.8 ? 'mittel' : 'stark'),
};

// Line presets (mm): narrow / college / wide ruling; on grid paper a line spans two boxes of 4 / 5 / 6 mm.
const RULES: Record<string, number[]> = { lined: [6.4, 7.1, 8.7], grid: [8, 10, 12] };
const rules = () => RULES[$<HTMLInputElement>('background').value] ?? RULES.lined;
const ruleAt = () => rules().findIndex((v) => Math.abs(v - n('lineH')) < 0.05);
function applyRule(i: number) {
  const lineH = rules()[i];
  $<HTMLInputElement>('lineH').value = String(lineH);
  $<HTMLInputElement>('xh').value = (Math.round(lineH * 3) / 10).toFixed(1); // x-height ~30 % of the line: room for ascenders and descenders
  schedule();
}
document.querySelectorAll<HTMLButtonElement>('[data-rule]').forEach((b) => b.onclick = () => applyRule(Number(b.dataset.rule)));

function settings() {
  const s: Settings = {
    xh: n('xh'), lineH: n('lineH'), margin: n('margin'), pageW: pageSize().w, pageH: pageSize().h, hasty: n('hasty'), seed: n('seed'),
    letterGap: style?.letterGap ?? tuned.letterGap,
    wordGap: style?.wordGap ?? null,
  };
  const o = {
    ink: $<HTMLInputElement>('ink').value, weight: n('weight'), background: $<HTMLInputElement>('background').value as Background,
  };
  localStorage.setItem('settings', JSON.stringify({
    ...s, ...o, optimize: n('optimize'), letterGap: undefined, wordGap: undefined, v: 2,
    page: $<HTMLInputElement>('page').value,
  }));
  return { s, o };
}

/** page: paper + ink for export · ink: transparent full page (preview) · clip: transparent, cut to the text (copy) */
function renderAll(pxPerMm: number, mode: 'page' | 'ink' | 'clip') {
  const { s, o } = settings();
  const res = layout(clean($<HTMLTextAreaElement>('text').value, (ch) => lib.has(ch)), lib, s);
  const paper: DrawOpts = { ...o, crop: false, pxPerMm, pageW: s.pageW, pageH: s.pageH, lineH: s.lineH, margin: s.margin };
  const opts: DrawOpts = {
    ...paper,
    background: mode === 'page' ? o.background : 'transparent',
    crop: mode === 'clip', // PDF pages keep the full page size, otherwise GoodNotes would stretch a cropped image
  };
  return { ...res, paper, canvases: res.pages.map((p) => drawPage(p, opts, (src) => bySrc.get(src)!)) };
}

let timer = 0, gen = 0, urls: string[] = [];
let ready: File[] | null = null; // rendered export, kept if the share sheet needs a second tap
function schedule() { ready = null; clearTimeout(timer); timer = window.setTimeout(preview, 150); }

function preview() {
  for (const out of document.querySelectorAll<HTMLOutputElement>('output[data-for]')) out.value = FORMAT[out.dataset.for!](n(out.dataset.for!));
  for (const [attr, id] of SEGS) {
    const v = $<HTMLInputElement>(id).value;
    document.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`).forEach((b) => b.classList.toggle('on', b.dataset[attr] === v));
  }
  const rule = ruleAt();
  document.querySelectorAll<HTMLButtonElement>('[data-rule]').forEach((b) => b.classList.toggle('on', Number(b.dataset.rule) === rule));

  $('empty').hidden = raw.length > 0;
  $('styleNote').hidden = !style;
  $('styleNote').textContent = style ? `Abstände aus deinen Notizen gelernt (${style.lines} Zeilen).` : '';
  const box = $('preview');
  box.hidden = $('previewHint').hidden = !raw.length;
  if (!raw.length) { $('missing').hidden = true; return; }
  const px = Math.max(2, (box.clientWidth * devicePixelRatio) / pageSize().w);
  const { pages, canvases, paper, missing } = renderAll(Math.min(px, 8), 'ink');
  const my = ++gen;
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  // Paper underneath, ink on top as its own transparent layer.
  box.replaceChildren(...canvases.map((ink, i) => {
    const sheet = document.createElement('div');
    sheet.className = paper.background === 'transparent' ? 'page-view clear' : 'page-view';
    sheet.append(drawPage({ glyphs: [], connectors: [], missing: [], lines: [], marks: [] }, paper, () => { throw new Error('no glyphs'); }), ink);
    // As an image the ink can be long-pressed → Kopieren, or dragged into GoodNotes, on the iPad.
    toPng(ink).then((b) => {
      if (my !== gen) return;
      const img = new Image();
      img.src = URL.createObjectURL(b);
      img.alt = pages[i].lines.map((l) => l.text).join('\n');
      urls.push(img.src);
      img.onload = () => ink.replaceWith(img);
    }, () => {}); // the canvas stays visible
    return sheet;
  }));
  $('missing').hidden = !missing.size;
  $('missing').textContent = `Fehlt in dieser Handschrift (rot markiert): ${[...missing].join(' ')}`;
}

document.querySelectorAll('#write input, #write textarea').forEach((el) => el.addEventListener('input', () => {
  localStorage.setItem('text', $<HTMLTextAreaElement>('text').value);
  schedule();
}));
$('optimize').addEventListener('change', rebuild); // on release: rebuilding the review grid is not instant
// Button groups that write into a hidden input: [data attribute, input id]
const SEGS = [['ink', 'ink'], ['bg', 'background'], ['format', 'page']] as const;
for (const [attr, id] of SEGS) {
  document.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`).forEach((b) => b.onclick = () => {
    const rule = ruleAt();
    $<HTMLInputElement>(id).value = b.dataset[attr]!;
    if (attr === 'bg' && rule >= 0) applyRule(rule); // Liniert ↔ Kariert: keep "Eng/Mittel/Weit"
    schedule();
  });
}
$('dice').onclick = () => { $<HTMLInputElement>('seed').value = String(Math.floor(Math.random() * 1e6)); schedule(); };
addEventListener('resize', schedule);

$('share').onclick = async () => {
  if (!raw.length) return toast('Erst eine Handschrift auswählen oder anlegen.');
  try {
    if (!ready) {
      const { canvases } = renderAll(EXPORT_PX_PER_MM, 'page');
      const pngs = await Promise.all(canvases.map(toPng));
      const { w, h } = pageSize();
      ready = [new File([await toPdf(pngs, w, h)], 'handschrift.pdf', { type: 'application/pdf' })];
    }
    await shareFiles(ready);
    ready = null;
  } catch (e) {
    const err = e as Error;
    // iPad only opens the share sheet right after a tap; rendering can take longer than that.
    if (err.name === 'NotAllowedError') toast('Export ist fertig – bitte noch einmal auf „Teilen“ tippen.');
    else if (err.name !== 'AbortError') { ready = null; toast(err.message); }
  }
};
$('copy').onclick = () => {
  if (!raw.length) return toast('Erst eine Handschrift auswählen oder anlegen.');
  let more = false;
  // Clipboard call must happen inside the tap; the rendering runs inside the promise it waits for.
  const blob = Promise.resolve().then(() => {
    const { canvases } = renderAll(EXPORT_PX_PER_MM, 'clip');
    more = canvases.length > 1;
    return toPng(canvases[0]);
  });
  copyPng(blob).then(
    () => toast(more ? 'Seite 1 kopiert – für längere Texte „Als PDF teilen“ nutzen.' : 'Kopiert – in GoodNotes auf die Seite tippen → Einsetzen.'),
    (e) => toast(`Kopieren nicht möglich: ${e.message}`),
  );
};

// ---------- tabs ----------
function show(tab: string) {
  document.querySelectorAll('.tabbar button, .tab').forEach((el) => el.classList.remove('on'));
  document.querySelector(`.tabbar [data-tab=${tab}]`)!.classList.add('on');
  $(tab).classList.add('on');
  scrollTo(0, 0);
  if (tab === 'write') schedule();
}
document.querySelectorAll<HTMLButtonElement>('.tabbar button').forEach((b) => b.onclick = () => show(b.dataset.tab!));
document.querySelectorAll<HTMLButtonElement>('[data-goto]').forEach((b) => b.onclick = () => show(b.dataset.goto!));

// ---------- capture ----------
const log = (msg: string) => { $('log').textContent += msg + '\n'; };

$('template').onclick = async () => {
  const pdf = await buildTemplatePdf();
  download(new Blob([pdf as BlobPart], { type: 'application/pdf' }), 'handschrift-vorlage.pdf');
};
$('templateSymbols').onclick = async () => {
  const pdf = await buildTemplatePdf(SYMBOL_PAGE);
  download(new Blob([pdf as BlobPart], { type: 'application/pdf' }), 'handschrift-symbole.pdf');
};

/** Cut out and save every page of the given sources into the set named in the form; false if nothing was found. */
async function importInto(sources: [label: string, pages: () => AsyncIterable<{ img: ImageData }>][]): Promise<boolean> {
  const name = $<HTMLInputElement>('setName').value.trim() || DEFAULT_SET;
  $('log').textContent = '';
  if (name === SAMPLE_SET) { log('Bitte einen anderen Namen als „Muster“ wählen.'); return false; }
  let total = 0;
  for (const [label, pages] of sources) {
    let n = 0;
    try {
      for await (const { img } of pages()) {
        n++;
        try {
          const { page, variants: vs } = extractPage(img);
          await saveMany(name, vs);
          total += vs.length;
          log(`${label}, Seite ${n}: Vorlagenseite ${page + 1} erkannt, ${vs.length} Proben übernommen.`);
        } catch (e) { log(`${label}, Seite ${n}: ${(e as Error).message}`); }
      }
    } catch (e) { log(`${label}: konnte nicht gelesen werden (${(e as Error).message})`); }
  }
  sets = await listSets();
  if (total) { await useSet(name); log(`Fertig – „${name}“ ist jetzt aktiv.`); toast(`„${name}“ importiert.`); }
  else log('Keine Proben gefunden.');
  return total > 0;
}

$<HTMLInputElement>('file').onchange = async (ev) => {
  const input = ev.target as HTMLInputElement;
  await importInto([...input.files ?? []].map((f) => [f.name, () => pagesOf(f)]));
  input.value = '';
};
setupPencil((pages) => importInto([['Mit dem Pencil ausgefüllt', () => pages]]), toast);

function renderStyle() {
  const r = $('styleResult');
  r.hidden = !style;
  $('styleReset').hidden = !style;
  if (style) {
    r.textContent = `Gelernt für „${active}“ aus ${style.lines} Zeilen: Schriftgröße ${style.xh.toFixed(1)} mm, Zeilenabstand ${style.lineH.toFixed(1)} mm`
      + (style.wordGap && style.letterGap ? `, Wortabstand ${style.wordGap.toFixed(2)} × und Buchstabenabstand ${style.letterGap.toFixed(2)} × x-Höhe.` : '.');
  }
}

$<HTMLInputElement>('notes').onchange = async (ev) => {
  const input = ev.target as HTMLInputElement;
  if (!active) { toast('Erst eine Handschrift auswählen.'); input.value = ''; return; }
  const lines: LineMeasure[] = [];
  let page = 0;
  toast('Notizen werden analysiert …');
  try {
    for (const file of input.files ?? []) {
      for await (const { img, pxPerMm } of pagesOf(file)) lines.push(...measureLines(img, pxPerMm, page++));
    }
  } catch (e) { input.value = ''; return toast(`Konnte nicht gelesen werden: ${(e as Error).message}`); }
  input.value = '';
  const found = summarize(lines);
  if (!found) {
    return toast(lines.length ? `Nur ${lines.length} Textzeilen erkannt – bitte Seiten mit mehr Fließtext wählen.` : 'Keine Schrift erkannt – bitte beschriebene Seiten wählen.');
  }
  // Measure our own rendering at known settings the same way; the ratios cancel what the measurement adds (stroke width, rounding).
  const ref = probeStyle();
  if (ref) {
    found.xh *= PROBE_XH / ref.xh;
    if (found.wordGap && ref.wordGap) found.wordGap *= DEFAULT_WORD_GAP / ref.wordGap;
    if (found.letterGap && ref.letterGap) found.letterGap *= DEFAULT_LETTER_GAP / ref.letterGap;
  }
  style = found;
  localStorage.setItem(`style:${active}`, JSON.stringify(found));
  // Measured size and spacing go straight into the sliders; they stay adjustable.
  $<HTMLInputElement>('xh').value = String(Math.round(found.xh * 10) / 10);
  $<HTMLInputElement>('lineH').value = String(Math.round(found.lineH * 10) / 10);
  for (const id of ['xh', 'lineH']) $<HTMLInputElement>(id).value = String(n(id));
  renderStyle();
  schedule();
  toast(found.wordGap ? 'Schreibstil übernommen.' : 'Größe und Zeilenabstand übernommen – die Abstände waren nicht messbar.');
};

const PROBE_XH = 3;
const PROBE = 'Die Zellatmung findet in den Mitochondrien statt. Dabei wird Traubenzucker mit Sauerstoff zu Wasser und Kohlenstoffdioxid abgebaut, die Zelle gewinnt Energie. ';
function probeStyle() {
  const s: Settings = {
    xh: PROBE_XH, lineH: 10, margin: 15, pageW: 210, pageH: 297, hasty: n('hasty'), seed: 1, letterGap: DEFAULT_LETTER_GAP, wordGap: DEFAULT_WORD_GAP,
  };
  const text = [...PROBE.repeat(8)].filter((ch) => ch === ' ' || lib.has(ch)).join('');
  const o: DrawOpts = { pxPerMm: 10, ink: '#000', weight: 0, background: 'blank', pageW: 210, pageH: 297, lineH: 10, margin: 15, crop: false };
  const c = drawPage(layout(text, lib, s).pages[0], o, (src) => bySrc.get(src)!);
  return summarize(measureLines(c.getContext('2d')!.getImageData(0, 0, c.width, c.height), 10));
}
$('styleReset').onclick = () => { localStorage.removeItem(`style:${active}`); style = null; renderStyle(); schedule(); };

$<HTMLInputElement>('restore').onchange = async (ev) => {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  try {
    const { set, count } = await importBackup(f);
    sets = await listSets();
    await useSet(set);
    toast(`„${set}“ geladen (${count} Proben).`);
  } catch (e) { toast((e as Error).message); }
};

// ---------- review grid ----------
const ABOVE = 2.5 * 50, BELOW = 1.1 * 50; // frame around the baseline (glyph px, template x-height = 50 px)

/** A raw variant drawn into a fixed frame (with tuned baseline/scale t, if given), so all variants share one baseline. */
function frame(v: Variant, t?: Variant) {
  const g = t ?? v, k = t?.scale ?? 1;
  const c = document.createElement('canvas');
  c.width = Math.ceil(v.w * k); c.height = ABOVE + BELOW;
  const ctx = c.getContext('2d')!;
  const src = document.createElement('canvas');
  src.width = v.w; src.height = v.h;
  const img = new ImageData(v.w, v.h);
  for (let i = 0; i < v.alpha.length; i++) img.data[i * 4 + 3] = v.alpha[i];
  src.getContext('2d')!.putImageData(img, 0, 0);
  ctx.strokeStyle = '#a9c3e0';
  ctx.beginPath(); ctx.moveTo(0, ABOVE); ctx.lineTo(c.width, ABOVE); ctx.stroke();
  ctx.setTransform(k, 0, 0, k, 0, ABOVE - g.baseline * k);
  ctx.drawImage(src, 0, 0);
  const dot = (a: Variant['entry'], col: string) => {
    if (!a) return;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(a.x, a.y, 8 / k, 0, 7); ctx.fill();
  };
  dot(v.entry, '#1a1'); dot(v.exit, '#d22');
  c.style.width = `${c.width * 0.45}px`; // one common scale, so a dash stays a short dash
  const box = document.createElement('div');
  box.className = 'thumb';
  box.append(c);
  return box;
}

function thumb(v: Variant) {
  const box = frame(v, bySrc.get(v.src));
  if (tuned.excluded.has(v.src)) { box.classList.add('out'); box.title = 'beim Optimieren weggelassen'; }
  else box.title = v.connected === undefined ? '' : v.connected ? 'verbunden' : 'getrennt';
  box.onclick = async () => {
    if (!confirm(`Diese Variante von „${v.key}“ löschen?`)) return;
    await remove(active, v.src);
    raw = await loadSet(active);
    rebuild();
  };
  return box;
}

// ---------- review sheet: approve the strong optimisation per character ----------
let rKeys: string[] = [], rAt = 0;

function openReview() {
  const d = decisions();
  rKeys = reviewKeys(raw, strong);
  rAt = Math.max(0, rKeys.findIndex((k) => !d[k]));
  if (!rKeys.length) return toast('Hier gibt es nichts zu prüfen.');
  $('review').hidden = false;
  renderReview();
}

function renderReview() {
  if (rAt >= rKeys.length) { closeReview(); toast('Alles geprüft.'); return; }
  const key = rKeys[rAt], d = decisions()[key];
  const vs = raw.filter((v) => v.key === key);
  const strongBy = new Map(strong.variants.map((v) => [v.src, v]));
  $('reviewKey').replaceChildren(key, Object.assign(document.createElement('small'), {
    textContent: d === 'accept' ? 'übernommen' : d === 'reject' ? 'Original behalten' : 'noch offen',
  }));
  $('reviewProgress').textContent = `${rAt + 1} / ${rKeys.length}`;
  $('reviewBefore').replaceChildren(...vs.map((v) => frame(v)));
  $('reviewAfter').replaceChildren(...vs.map((v) => {
    const box = frame(v, strongBy.get(v.src));
    if (strong.excluded.has(v.src)) box.classList.add('out');
    return box;
  }));
  $<HTMLButtonElement>('reviewBack').disabled = rAt === 0;
  const all = decisions(), left = rKeys.filter((k) => !all[k]).length;
  $('reviewAll').hidden = !left;
  $('reviewAll').textContent = `Alle ${left} offenen übernehmen`;
}

function decide(d: Decision, keys = [rKeys[rAt]]) {
  const all = decisions();
  for (const k of keys) all[k] = d;
  localStorage.setItem(`review:${active}`, JSON.stringify(all));
  rAt += keys.length;
  renderReview();
}

// Close first, rebuild after the sheet is gone: on the iPad the rebuild takes a moment, and a second tap
// during that time used to land on a glyph below (which asks to delete it).
function closeReview() { $('review').hidden = true; setTimeout(rebuild, 50); }

/** Strong optimisation for every character not decided yet; returns how many. */
function acceptOpen() {
  const all = decisions(), open = reviewKeys(raw, strong).filter((k) => !all[k]);
  for (const k of open) all[k] = 'accept';
  localStorage.setItem(`review:${active}`, JSON.stringify(all));
  return open.length;
}

$('reviewOpen').onclick = openReview;
$('reviewClose').onclick = closeReview;
$('reviewBack').onclick = () => { rAt = Math.max(0, rAt - 1); renderReview(); };
$('reviewAccept').onclick = () => decide('accept');
$('reviewReject').onclick = () => decide('reject');
$('reviewAll').onclick = () => { const count = acceptOpen(); closeReview(); toast(`${count} Zeichen übernommen.`); };
$('acceptAll').onclick = () => { const count = acceptOpen(); rebuild(); toast(`${count} Zeichen übernommen.`); };
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('review').hidden) closeReview(); });

const GROUPS: [string, string[]][] = [
  ['Kleinbuchstaben', SINGLES.filter((k) => /\p{Ll}/u.test(k))],
  ['Großbuchstaben', SINGLES.filter((k) => /\p{Lu}/u.test(k))],
  ['Ziffern', SINGLES.filter((k) => /\p{N}/u.test(k))],
  ['Satzzeichen', SINGLES.filter((k) => !/\p{L}|\p{N}/u.test(k))],
  ['Paare & Dreier', PAIRS],
  ['Wörter', WORDS],
  ['Pfeile & Symbole', SYMBOL_KEYS],
];

function renderGrid() {
  const byKey = new Map<string, Variant[]>();
  for (const v of raw) byKey.set(v.key, [...(byKey.get(v.key) ?? []), v]);
  const all = GROUPS.flatMap(([, keys]) => keys);
  $('glyphsTitle').textContent = active ? `Zeichen von „${active}“` : 'Keine Handschrift ausgewählt';
  $('coverage').textContent = active ? `${all.filter((k) => byKey.has(k)).length} von ${all.length} vorhanden.` : '';
  const d = decisions(), toReview = active ? reviewKeys(raw, strong) : [], open = toReview.filter((k) => !d[k]).length;
  $('reviewOpen').hidden = !toReview.length;
  $('reviewOpen').textContent = open ? `Optimierung prüfen (${open} offen)` : 'Optimierung erneut prüfen';
  $('acceptAll').hidden = !open;
  $('grid').replaceChildren(...(!active ? [] : GROUPS.flatMap(([title, keys]) => {
    const h = document.createElement('h3');
    h.textContent = title;
    const group = document.createElement('div');
    group.className = 'group';
    group.append(...keys.map((key) => {
      const vs = byKey.get(key) ?? [];
      const el = document.createElement('div');
      el.className = vs.length ? 'glyph' : 'glyph missing';
      const head = document.createElement('b');
      head.textContent = key;
      const info = document.createElement('small');
      info.textContent = !vs.length ? (lib.has(key) ? 'Ersatz' : 'fehlt') : [...key].length > 1 ? `${vs.filter((v) => v.connected).length}/${vs.length} verbunden` : `${vs.length}×`;
      head.append(info);
      const row = document.createElement('div');
      row.className = 'variants';
      row.append(...vs.map(thumb));
      el.append(head, row);
      return el;
    }));
    return [h, group];
  })));
}

// ---------- appearance (the inline script in index.html applies it before first paint) ----------
const lightQuery = matchMedia('(prefers-color-scheme: light)');
function applyTheme() {
  const t = localStorage.getItem('theme') || 'dark';
  const eff = t === 'auto' ? (lightQuery.matches ? 'light' : 'dark') : t;
  document.documentElement.dataset.theme = eff;
  document.querySelector('meta[name=theme-color]')!.setAttribute('content', eff === 'light' ? '#f3f2ee' : '#101217');
  document.querySelectorAll<HTMLButtonElement>('#theme button').forEach((b) => b.classList.toggle('on', b.dataset.theme === t));
}
document.querySelectorAll<HTMLButtonElement>('#theme button').forEach((b) => b.onclick = () => { localStorage.setItem('theme', b.dataset.theme!); applyTheme(); });
lightQuery.addEventListener('change', applyTheme);
applyTheme();

// ---------- install hint: the home-screen app keeps its own storage, so it matters which one people use ----------
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
if (!standalone && !localStorage.getItem('installHidden')) {
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) {
    $('installText').textContent = 'Tipp: Über Teilen → „Zum Home-Bildschirm“ wird die App wie eine echte App installiert. Danach immer dort öffnen.';
    $('install').hidden = false;
  }
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    $('installText').textContent = 'Als App installieren – startet schneller und funktioniert offline.';
    $('installBtn').hidden = false;
    $('install').hidden = false;
    $('installBtn').onclick = () => { (e as Event & { prompt(): void }).prompt(); $('install').hidden = true; };
  });
}
$('installClose').onclick = () => { localStorage.setItem('installHidden', '1'); $('install').hidden = true; };

navigator.storage?.persist?.();
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js');
listSets().then((s) => { sets = s; return useSet(sets.includes(active) ? active : sets[0] ?? ''); });
