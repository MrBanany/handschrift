import './style.css';
import { clearAll, exportBackup, importBackup, loadAll, remove, saveMany } from './glyphstore/db';
import type { Variant } from './glyphstore/types';
import { copyPng, download, sharePngs, toPng } from './export/png';
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
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 3000);
}

let variants: Variant[] = [];
let bySrc = new Map<string, Variant>();
let lib: Map<string, Variant[]> = new Map();

async function reload() {
  variants = await loadAll();
  for (const v of variants) v.prof = profile(v.alpha, v.w, v.h, v.baseline);
  bySrc = new Map(variants.map((v) => [v.src, v]));
  lib = new Map();
  for (const v of variants) lib.set(v.key, [...(lib.get(v.key) ?? []), v]);
  clearMaskCache();
  schedule();
  renderGrid();
}

// ---------- settings (persisted locally) ----------
const NUM = ['hasty', 'xh', 'lineH', 'margin', 'weight', 'seed'] as const;
const saved = JSON.parse(localStorage.getItem('settings') ?? '{}');
for (const id of [...NUM, 'ink', 'background']) if (saved[id] !== undefined) $<HTMLInputElement>(id).value = saved[id];
$<HTMLInputElement>('crop').checked = !!saved.crop;
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

function settings() {
  const s: Settings = { xh: n('xh'), lineH: n('lineH'), margin: n('margin'), pageW: PAGE.w, pageH: PAGE.h, hasty: n('hasty'), seed: n('seed') };
  const o = {
    ink: $<HTMLInputElement>('ink').value, weight: n('weight'), background: $<HTMLSelectElement>('background').value as Background,
    crop: $<HTMLInputElement>('crop').checked,
  };
  localStorage.setItem('settings', JSON.stringify({ ...s, ...o }));
  return { s, o };
}

function renderAll(pxPerMm: number, forExport: boolean) {
  const { s, o } = settings();
  const text = $<HTMLTextAreaElement>('text').value;
  const res = layout(text, lib, s);
  const opts: DrawOpts = { ...o, crop: forExport && o.crop, pxPerMm, pageW: s.pageW, pageH: s.pageH, lineH: s.lineH, margin: s.margin };
  return { ...res, canvases: res.pages.map((p) => drawPage(p, opts, (src) => bySrc.get(src)!)) };
}

let timer = 0;
function schedule() { clearTimeout(timer); timer = window.setTimeout(preview, 200); }

function preview() {
  const box = $('preview');
  $('empty').hidden = variants.length > 0;
  const px = Math.max(2, (box.clientWidth * devicePixelRatio) / PAGE.w);
  const { canvases, missing } = renderAll(Math.min(px, 8), false);
  box.replaceChildren(...canvases);
  const warn = $('missing');
  warn.hidden = !missing.size || !variants.length;
  warn.textContent = `Fehlende Zeichen (rot markiert): ${[...missing].join(' ')}`;
  document.querySelectorAll<HTMLButtonElement>('[data-ink]').forEach((b) => b.classList.toggle('on', b.dataset.ink === $<HTMLInputElement>('ink').value));
}

document.querySelectorAll('#write input, #write select, #write textarea').forEach((el) => el.addEventListener('input', () => {
  localStorage.setItem('text', $<HTMLTextAreaElement>('text').value);
  schedule();
}));
document.querySelectorAll<HTMLButtonElement>('[data-ink]').forEach((b) => b.onclick = () => { $<HTMLInputElement>('ink').value = b.dataset.ink!; schedule(); });
$('dice').onclick = () => { $<HTMLInputElement>('seed').value = String(Math.floor(Math.random() * 1e6)); schedule(); };
addEventListener('resize', schedule);

$('share').onclick = async () => {
  try {
    const blobs = await Promise.all(renderAll(EXPORT_PX_PER_MM, true).canvases.map(toPng));
    await sharePngs(blobs);
  } catch (e) { if ((e as Error).name !== 'AbortError') toast((e as Error).message); }
};
$('copy').onclick = () => {
  const blob = toPng(renderAll(EXPORT_PX_PER_MM, true).canvases[0]);
  copyPng(blob).then(() => toast('Kopiert – in GoodNotes einfach einfügen.'), (e) => toast(`Kopieren nicht möglich: ${e.message}`));
};

// ---------- tabs ----------
function show(tab: string) {
  document.querySelectorAll('nav button, .tab').forEach((el) => el.classList.remove('active'));
  document.querySelector(`nav [data-tab=${tab}]`)!.classList.add('active');
  $(tab).classList.add('active');
  scrollTo(0, 0);
  if (tab === 'write') schedule();
}
document.querySelectorAll<HTMLButtonElement>('nav button').forEach((b) => b.onclick = () => show(b.dataset.tab!));
document.querySelectorAll<HTMLButtonElement>('[data-goto]').forEach((b) => b.onclick = () => show(b.dataset.goto!));

// ---------- capture ----------
const log = (msg: string) => { $('log').textContent += msg + '\n'; };

$('template').onclick = async () => {
  const pdf = await buildTemplatePdf();
  download(new Blob([pdf as BlobPart], { type: 'application/pdf' }), 'handschrift-vorlage.pdf');
};

$<HTMLInputElement>('file').onchange = async (ev) => {
  const input = ev.target as HTMLInputElement;
  $('log').textContent = '';
  for (const file of input.files ?? []) {
    let n = 0;
    try {
      for await (const img of pagesOf(file)) {
        n++;
        try {
          const { page, variants: vs } = extractPage(img);
          await saveMany(vs);
          log(`${file.name}, Seite ${n}: Vorlagenseite ${page + 1} erkannt, ${vs.length} Proben übernommen.`);
        } catch (e) { log(`${file.name}, Seite ${n}: ${(e as Error).message}`); }
      }
    } catch (e) { log(`${file.name}: konnte nicht gelesen werden (${(e as Error).message})`); }
  }
  input.value = '';
  await reload();
  log('Fertig.');
};

$('backup').onclick = async () => download(await exportBackup(), `meine.handschrift.json`);
$<HTMLInputElement>('restore').onchange = async (ev) => {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;
  try { toast(`${await importBackup(f)} Proben geladen.`); } catch (e) { toast((e as Error).message); }
  input.value = '';
  await reload();
};
$('wipe').onclick = async () => {
  if (!confirm('Wirklich alle Handschrift-Proben auf diesem Gerät löschen? Vorher sichern!')) return;
  await clearAll();
  await reload();
};

// ---------- review grid ----------
function thumb(v: Variant) {
  const c = document.createElement('canvas');
  c.width = v.w; c.height = v.h;
  const ctx = c.getContext('2d')!;
  const img = new ImageData(v.w, v.h);
  for (let i = 0; i < v.alpha.length; i++) { img.data[i * 4 + 3] = v.alpha[i]; }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = '#9bd';
  ctx.beginPath(); ctx.moveTo(0, v.baseline); ctx.lineTo(v.w, v.baseline); ctx.stroke();
  const dot = (a: Variant['entry'], col: string) => {
    if (!a) return;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(a.x, a.y, 8, 0, 7); ctx.fill();
  };
  dot(v.entry, '#1a1'); dot(v.exit, '#d22');
  c.style.width = `${v.w * 0.36}px`; // one common scale, so a dash stays a short dash
  c.title = v.connected === undefined ? '' : v.connected ? 'verbunden' : 'getrennt';
  c.onclick = async () => { if (confirm(`Diese Variante von „${v.key}“ löschen?`)) { await remove(v.src); await reload(); } };
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
  const all = GROUPS.flatMap(([, keys]) => keys);
  $('coverage').textContent = `${all.filter((k) => lib.has(k)).length} von ${all.length} Zeichen/Paaren/Wörtern vorhanden.`;
  $('grid').replaceChildren(...GROUPS.flatMap(([title, keys]) => {
    const h = document.createElement('h2');
    h.textContent = title;
    const group = document.createElement('div');
    group.className = 'group';
    group.append(...keys.map((key) => {
      const vs = lib.get(key) ?? [];
      const el = document.createElement('div');
      el.className = vs.length ? 'glyph' : 'glyph empty';
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
  }));
}

navigator.storage?.persist?.();
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js');
reload();
