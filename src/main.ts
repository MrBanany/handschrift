import './style.css';
import { DEFAULT_SET, deleteSet, exportBackup, importBackup, listSets, loadSet, remove, saveMany } from './glyphstore/db';
import { optimize, type Tuned } from './glyphstore/optimize';
import { SAMPLE_SET, buildSampleSet } from './glyphstore/sample';
import type { Variant } from './glyphstore/types';
import { asFiles, copyPng, download, shareFiles, toPng } from './export/png';
import { pagesOf } from './import/load';
import { clearMaskCache, drawPage, type Background, type DrawOpts } from './renderer/draw';
import { layout, profile, type Settings } from './renderer/layout';
import { extractPage } from './segmentation/extract';
import { buildTemplatePdf } from './template/pdf';
import { PAGE, PAIRS, SINGLES, WORDS } from './template/layout';

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

function rebuild() {
  tuned = $<HTMLInputElement>('optimize').checked ? optimize(raw) : { variants: raw, excluded: new Set(), letterGap: null };
  for (const v of tuned.variants) v.prof = profile(v.alpha, v.w, v.h, v.baseline);
  bySrc = new Map(tuned.variants.map((v) => [v.src, v]));
  lib = new Map();
  for (const v of tuned.variants) lib.set(v.key, [...(lib.get(v.key) ?? []), v]);
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
      button('Sichern', async () => download(await exportBackup(name), `${name}.handschrift.json`)),
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
const NUM = ['hasty', 'xh', 'lineH', 'margin', 'weight', 'seed'] as const;
const saved = JSON.parse(localStorage.getItem('settings') ?? '{}');
for (const id of [...NUM, 'ink', 'background']) if (saved[id] !== undefined) $<HTMLInputElement>(id).value = saved[id];
$<HTMLInputElement>('crop').checked = !!saved.crop;
$<HTMLInputElement>('optimize').checked = saved.optimize !== false;
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
};

function settings() {
  const s: Settings = {
    xh: n('xh'), lineH: n('lineH'), margin: n('margin'), pageW: PAGE.w, pageH: PAGE.h, hasty: n('hasty'), seed: n('seed'),
    letterGap: tuned.letterGap,
  };
  const o = {
    ink: $<HTMLInputElement>('ink').value, weight: n('weight'), background: $<HTMLInputElement>('background').value as Background,
    crop: $<HTMLInputElement>('crop').checked,
  };
  localStorage.setItem('settings', JSON.stringify({ ...s, ...o, optimize: $<HTMLInputElement>('optimize').checked }));
  return { s, o };
}

function renderAll(pxPerMm: number, forExport: boolean) {
  const { s, o } = settings();
  const res = layout($<HTMLTextAreaElement>('text').value, lib, s);
  const opts: DrawOpts = { ...o, crop: forExport && o.crop, pxPerMm, pageW: s.pageW, pageH: s.pageH, lineH: s.lineH, margin: s.margin };
  return { ...res, canvases: res.pages.map((p) => drawPage(p, opts, (src) => bySrc.get(src)!)) };
}

let timer = 0;
let ready: File[] | null = null; // rendered export, kept if the share sheet needs a second tap
function schedule() { ready = null; clearTimeout(timer); timer = window.setTimeout(preview, 150); }

function preview() {
  for (const out of document.querySelectorAll<HTMLOutputElement>('output[data-for]')) out.value = FORMAT[out.dataset.for!](n(out.dataset.for!));
  const ink = $<HTMLInputElement>('ink').value, bg = $<HTMLInputElement>('background').value;
  document.querySelectorAll<HTMLButtonElement>('[data-ink]').forEach((b) => b.classList.toggle('on', b.dataset.ink === ink));
  document.querySelectorAll<HTMLButtonElement>('[data-bg]').forEach((b) => b.classList.toggle('on', b.dataset.bg === bg));

  $('empty').hidden = raw.length > 0;
  const box = $('preview');
  box.hidden = !raw.length;
  if (!raw.length) { $('missing').hidden = true; return; }
  const px = Math.max(2, (box.clientWidth * devicePixelRatio) / PAGE.w);
  const { canvases, missing } = renderAll(Math.min(px, 8), false);
  box.replaceChildren(...canvases);
  $('missing').hidden = !missing.size;
  $('missing').textContent = `Fehlt in dieser Handschrift (rot markiert): ${[...missing].join(' ')}`;
}

document.querySelectorAll('#write input, #write textarea').forEach((el) => el.addEventListener('input', () => {
  localStorage.setItem('text', $<HTMLTextAreaElement>('text').value);
  schedule();
}));
$('optimize').addEventListener('change', rebuild);
document.querySelectorAll<HTMLButtonElement>('[data-ink]').forEach((b) => b.onclick = () => { $<HTMLInputElement>('ink').value = b.dataset.ink!; schedule(); });
document.querySelectorAll<HTMLButtonElement>('[data-bg]').forEach((b) => b.onclick = () => { $<HTMLInputElement>('background').value = b.dataset.bg!; schedule(); });
$('dice').onclick = () => { $<HTMLInputElement>('seed').value = String(Math.floor(Math.random() * 1e6)); schedule(); };
addEventListener('resize', schedule);

$('share').onclick = async () => {
  if (!raw.length) return toast('Erst eine Handschrift auswählen oder anlegen.');
  try {
    ready ??= asFiles(await Promise.all(renderAll(EXPORT_PX_PER_MM, true).canvases.map(toPng)));
    await shareFiles(ready);
    ready = null;
  } catch (e) {
    const err = e as Error;
    // iPad only opens the share sheet right after a tap; rendering can take longer than that.
    if (err.name === 'NotAllowedError') toast('Bild ist fertig – bitte noch einmal auf „Teilen“ tippen.');
    else if (err.name !== 'AbortError') { ready = null; toast(err.message); }
  }
};
$('copy').onclick = () => {
  if (!raw.length) return toast('Erst eine Handschrift auswählen oder anlegen.');
  const blob = toPng(renderAll(EXPORT_PX_PER_MM, true).canvases[0]);
  copyPng(blob).then(() => toast('Kopiert – in GoodNotes einfach einfügen.'), (e) => toast(`Kopieren nicht möglich: ${e.message}`));
};

// ---------- tabs ----------
function show(tab: string) {
  document.querySelectorAll('header nav button, .tab').forEach((el) => el.classList.remove('on'));
  document.querySelector(`header nav [data-tab=${tab}]`)!.classList.add('on');
  $(tab).classList.add('on');
  scrollTo(0, 0);
  if (tab === 'write') schedule();
}
document.querySelectorAll<HTMLButtonElement>('header nav button').forEach((b) => b.onclick = () => show(b.dataset.tab!));
document.querySelectorAll<HTMLButtonElement>('[data-goto]').forEach((b) => b.onclick = () => show(b.dataset.goto!));

// ---------- capture ----------
const log = (msg: string) => { $('log').textContent += msg + '\n'; };

$('template').onclick = async () => {
  const pdf = await buildTemplatePdf();
  download(new Blob([pdf as BlobPart], { type: 'application/pdf' }), 'handschrift-vorlage.pdf');
};

$<HTMLInputElement>('file').onchange = async (ev) => {
  const input = ev.target as HTMLInputElement;
  const name = $<HTMLInputElement>('setName').value.trim() || DEFAULT_SET;
  $('log').textContent = '';
  if (name === SAMPLE_SET) { log('Bitte einen anderen Namen als „Muster“ wählen.'); input.value = ''; return; }
  let total = 0;
  for (const file of input.files ?? []) {
    let n = 0;
    try {
      for await (const img of pagesOf(file)) {
        n++;
        try {
          const { page, variants: vs } = extractPage(img);
          await saveMany(name, vs);
          total += vs.length;
          log(`${file.name}, Seite ${n}: Vorlagenseite ${page + 1} erkannt, ${vs.length} Proben übernommen.`);
        } catch (e) { log(`${file.name}, Seite ${n}: ${(e as Error).message}`); }
      }
    } catch (e) { log(`${file.name}: konnte nicht gelesen werden (${(e as Error).message})`); }
  }
  input.value = '';
  sets = await listSets();
  if (total) { await useSet(name); log(`Fertig – „${name}“ ist jetzt aktiv.`); toast(`„${name}“ importiert.`); }
  else log('Keine Proben gefunden.');
};

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
function thumb(v: Variant) {
  const c = document.createElement('canvas');
  c.width = v.w; c.height = v.h;
  const ctx = c.getContext('2d')!;
  const img = new ImageData(v.w, v.h);
  for (let i = 0; i < v.alpha.length; i++) img.data[i * 4 + 3] = v.alpha[i];
  ctx.putImageData(img, 0, 0);
  const shown = bySrc.get(v.src) ?? v; // baseline after optimizing
  ctx.strokeStyle = '#9bd';
  ctx.beginPath(); ctx.moveTo(0, shown.baseline); ctx.lineTo(v.w, shown.baseline); ctx.stroke();
  const dot = (a: Variant['entry'], col: string) => {
    if (!a) return;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(a.x, a.y, 8, 0, 7); ctx.fill();
  };
  dot(v.entry, '#1a1'); dot(v.exit, '#d22');
  c.style.width = `${v.w * 0.36}px`; // one common scale, so a dash stays a short dash
  if (tuned.excluded.has(v.src)) { c.classList.add('out'); c.title = 'beim Optimieren weggelassen'; }
  else c.title = v.connected === undefined ? '' : v.connected ? 'verbunden' : 'getrennt';
  c.onclick = async () => {
    if (!confirm(`Diese Variante von „${v.key}“ löschen?`)) return;
    await remove(active, v.src);
    raw = await loadSet(active);
    rebuild();
  };
  return c;
}

const GROUPS: [string, string[]][] = [
  ['Kleinbuchstaben', SINGLES.filter((k) => /\p{Ll}/u.test(k))],
  ['Großbuchstaben', SINGLES.filter((k) => /\p{Lu}/u.test(k))],
  ['Ziffern', SINGLES.filter((k) => /\p{N}/u.test(k))],
  ['Satzzeichen', SINGLES.filter((k) => !/\p{L}|\p{N}/u.test(k))],
  ['Paare & Dreier', PAIRS],
  ['Wörter', WORDS],
];

function renderGrid() {
  const byKey = new Map<string, Variant[]>();
  for (const v of raw) byKey.set(v.key, [...(byKey.get(v.key) ?? []), v]);
  const all = GROUPS.flatMap(([, keys]) => keys);
  $('glyphsTitle').textContent = active ? `Zeichen von „${active}“` : 'Keine Handschrift ausgewählt';
  $('coverage').textContent = active ? `${all.filter((k) => byKey.has(k)).length} von ${all.length} vorhanden.` : '';
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
      info.textContent = !vs.length ? 'fehlt' : [...key].length > 1 ? `${vs.filter((v) => v.connected).length}/${vs.length} verbunden` : `${vs.length}×`;
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

navigator.storage?.persist?.();
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js');
listSets().then((s) => { sets = s; return useSet(sets.includes(active) ? active : sets[0] ?? ''); });
