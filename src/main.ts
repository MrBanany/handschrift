import './style.css';
import { DEFAULT_SET, deleteSet, exportAll, exportBackup, freeName, importBackup, listSets, loadSet, markDirty, markSaved, remove, renameSet, saveMany, staleSets } from './glyphstore/db';
import { DEFAULT_LETTER_GAP, merge, optimize, reviewKeys, type Decision, type Tuned } from './glyphstore/optimize';
import { SAMPLE_SET, buildSampleSet } from './glyphstore/sample';
import { symbolVariants } from './glyphstore/symbols';
import type { Variant } from './glyphstore/types';
import { copyPng, download, shareFiles, toPng } from './export/png';
import { toPdf } from './export/pdf';
import { forEachPage } from './export/pages';
import { GN_PAGE, backgroundPdf, goodnotesFile } from './export/goodnotes';
import { pagesOf } from './import/load';
import { paint, setupPencil } from './import/pencil';
import { drawPage, type Background, type DrawOpts } from './renderer/draw';
import { DEFAULT_WORD_GAP, glyphAt, layout, profile, swapVariant, type Page, type Settings } from './renderer/layout';
import { extractBox, extractPage } from './segmentation/extract';
import { clean } from './renderer/clean';
import { measureLines, summarize, type LineMeasure, type TextStyle } from './segmentation/style';
import { buildTemplatePdf } from './template/pdf';
import { AI_PROMPT } from './prompt';
import { TEXT_MAX, takeText } from './handover';
import { CELL, CURSIVE_KEYS, CURSIVE_PAGES, GUIDES, MM, PAIRS, SINGLES, SYMBOL_KEYS, SYMBOL_PAGE, TEMPLATE_PAGES, WORDS } from './template/layout';

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
  schedule();
  renderGrid();
}

async function useSet(name: string) {
  if (name === SAMPLE_SET && !sets.includes(SAMPLE_SET)) {
    toast('Muster-Handschrift wird erzeugt …');
    // takes a few seconds: don't keep saying "Keine ausgewählt" / "Noch keine Handschrift" meanwhile
    if (!active) { $<HTMLSelectElement>('set').options[0].text = 'Muster wird erzeugt …'; $('empty').hidden = true; }
    await saveMany(SAMPLE_SET, await buildSampleSet());
    sets = await listSets();
  }
  const before = active;
  active = sets.includes(name) ? name : '';
  overrides.clear();
  localStorage.setItem('set', active);
  raw = active ? await loadSet(active) : [];
  loadStyle();
  if (style && before && before !== active) applyStyle(style); // another person's notes: their size and line spacing
  renderStyle();
  renderSets();
  rebuild();
}

function renderSets() {
  const sel = $<HTMLSelectElement>('set');
  const names = sets.includes(SAMPLE_SET) ? sets : [...sets, SAMPLE_SET];
  sel.replaceChildren(...(active ? [] : [new Option('Keine ausgewählt', '', true, true)]),
    ...names.map((n) => new Option(n === SAMPLE_SET ? `${n} (Beispiel)` : n, n, false, n === active)));
  if (!active) sel.options[0].disabled = true;

  $('sets').replaceChildren(...(sets.length ? sets.map((name) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = name;
    li.append(label);
    if (name === active) {
      const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = 'aktiv';
      const check = Object.assign(document.createElement('input'), { type: 'checkbox', checked: cursive() });
      check.onchange = () => { localStorage.setItem(`cursive:${name}`, check.checked ? '1' : '0'); rebuild(); };
      const lab = document.createElement('label');
      lab.className = 'check';
      lab.append(check, 'Verbunden schreiben');
      lab.title = 'Schreibschrift: Buchstaben in einem Wort werden immer verbunden';
      li.append(tag, lab);
    }
    else li.append(button('Verwenden', () => useSet(name).then(() => show('write'))));
    li.append(
      button('Backup speichern', () => backup([name])),
      button('Umbenennen', async () => {
        const to = prompt(`Neuer Name für „${name}“:`, name)?.trim();
        if (!to || to === name) return;
        try { await renameSet(name, to); } catch (e) { return toast((e as Error).message); }
        sets = await listSets();
        await useSet(name === active ? to : active);
      }),
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

/** Backup file(s) via the share sheet (Dateien, iCloud, AirDrop, Mail …); a plain download where sharing isn't available. */
async function backup(names: string[]) {
  if (!names.length) return toast('Noch keine Handschrift zum Sichern.');
  try {
    const blob = names.length === 1 ? await exportBackup(names[0]) : await exportAll(names);
    await shareFiles([new File([blob], names.length === 1 ? `${names[0]}.handschrift.json` : 'Alle-Handschriften.handschrift.json', { type: 'application/json' })]);
    markSaved(names);
    $('install').hidden = true;
  } catch (e) { if ((e as Error).name !== 'AbortError') toast(`Sichern fehlgeschlagen: ${(e as Error).message}`); }
}
$('backupAll').onclick = () => backup(sets.filter((n) => n !== SAMPLE_SET));

/** Joined-up writing for the active handwriting: as ticked, else guessed from the pairs (mostly joined → on). */
function cursive() {
  const v = localStorage.getItem(`cursive:${active}`);
  if (v !== null) return v === '1';
  // only pairs and word parts tell joined-up writing; single letters carry a "connected" value too
  const pairs = raw.filter((x) => x.connected !== undefined && /^\p{L}{2,}$/u.test(x.key));
  return pairs.length >= 5 && pairs.filter((x) => x.connected).length >= pairs.length / 2;
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
// dev only (left out of the build): a joined-up test set from a German school cursive; run cursiveSample() in the console
if (import.meta.env.DEV) Object.assign(window, { cursiveSample: async () => {
  const name = 'Test Schreibschrift';
  const url = (await import('@fontsource/playwrite-de-va/files/playwrite-de-va-latin-400-normal.woff2?url')).default;
  document.fonts.add(await new FontFace('Playwrite DE VA', `url(${url})`).load());
  await saveMany(name, await buildSampleSet('"Playwrite DE VA"'));
  sets = await listSets();
  await useSet(name);
} });
$('setName').oninput = () => { delete $('setName').dataset.auto; };

// ---------- settings (persisted locally) ----------
const NUM = ['hasty', 'xh', 'lineH', 'margin', 'weight', 'seed', 'optimize'] as const;
const saved = JSON.parse(localStorage.getItem('settings') ?? '{}');
if (saved.v !== 2) delete saved.optimize; // v2: optimizing starts at "leicht" instead of the old default "mittel"
for (const id of [...NUM, 'ink', 'headInk', 'markInk', 'background', 'page']) if (saved[id] !== undefined) $<HTMLInputElement>(id).value = saved[id];
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
    cursive: cursive(),
  };
  const o = {
    ink: $<HTMLInputElement>('ink').value, head: $<HTMLInputElement>('headInk').value || undefined, mark: $<HTMLInputElement>('markInk').value || undefined,
    weight: n('weight'), background: $<HTMLInputElement>('background').value as Background,
  };
  localStorage.setItem('settings', JSON.stringify({
    ...s, ...o, optimize: n('optimize'), letterGap: undefined, wordGap: undefined, cursive: undefined, v: 2,
    page: $<HTMLInputElement>('page').value, headInk: $<HTMLInputElement>('headInk').value, markInk: $<HTMLInputElement>('markInk').value, head: undefined, mark: undefined,
  }));
  return { s, o };
}

// Layout only changes with the text, the settings, the handwriting or a swapped letter – not with the window size.
let laid: { key: string; lib: typeof lib; res: ReturnType<typeof layout> } | null = null;
function laidOut(s: Settings) {
  const key = JSON.stringify([$<HTMLTextAreaElement>('text').value, s, [...overrides]]);
  if (laid?.key !== key || laid.lib !== lib) {
    const res = layout(clean($<HTMLTextAreaElement>('text').value, (ch) => lib.has(ch)), lib, s);
    applyOverrides(res.pages);
    laid = { key, lib, res };
  }
  return laid.res;
}

/** page: paper + ink for export · ink: transparent full page (preview) · clip: transparent, cut to the text (copy) */
function renderAll(pxPerMm: number, mode: 'page' | 'ink' | 'clip') {
  const { s, o } = settings();
  const res = laidOut(s);
  const paper: DrawOpts = { ...o, crop: false, pxPerMm, pageW: s.pageW, pageH: s.pageH, lineH: s.lineH, margin: s.margin };
  const opts: DrawOpts = {
    ...paper,
    background: mode === 'page' ? o.background : 'transparent',
    crop: mode === 'clip', // PDF pages keep the full page size, otherwise GoodNotes would stretch a cropped image
  };
  // draw(i) is lazy: the export draws, encodes and frees one page at a time (see export/pages.ts)
  return { ...res, paper, draw: (i: number) => drawPage(res.pages[i], opts, (src) => bySrc.get(src)!) };
}

let timer = 0, gen = 0, urls: string[] = [];
let ready: { kind: string; files: File[]; asked?: boolean } | null = null; // rendered export, kept if the share sheet needs a second tap
function schedule() { ready = null; clearTimeout(timer); timer = window.setTimeout(preview, 150); }

const EAGER_PAGES = 2;
let io: IntersectionObserver | null = null, lastW = 0;
let paperCache: { key: string; url: string } | null = null;
/** The ruled/grid paper is the same on every page: draw it once per format and line type. */
function paperUrl(paper: DrawOpts) {
  if (paper.background === 'transparent') return '';
  const key = [paper.background, paper.pageW, paper.pageH, paper.lineH, paper.margin, paper.pxPerMm].join('|');
  if (paperCache?.key !== key) {
    const c = drawPage({ glyphs: [], connectors: [], missing: [], lines: [], marks: [] }, paper, () => { throw new Error('no glyphs'); });
    paperCache = { key, url: c.toDataURL() };
    c.width = 0;
  }
  return paperCache.url;
}

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
  $('styleNote').textContent = style ? `Abstände aus deinen Notizen übernommen (${style.lines} Zeilen).` : '';
  const box = $('preview');
  box.hidden = $('previewHint').hidden = !raw.length;
  if (!raw.length) { $('missing').hidden = true; return; }
  lastW = box.clientWidth;
  const px = Math.min(6, Math.max(2, (lastW * devicePixelRatio) / pageSize().w)); // 6 px/mm is sharp enough on screen
  const { pages, draw, paper, missing } = renderAll(px, 'ink');
  shown = pages;
  const my = ++gen;
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  io?.disconnect();
  io = new IntersectionObserver((hits) => hits.forEach((h) => {
    if (h.isIntersecting) { io!.unobserve(h.target); fill(h.target as HTMLElement); }
  }), { rootMargin: '600px 0px' });
  const url = paperUrl(paper);
  // Paper underneath (one shared image), ink on top as its own transparent layer. The first pages are drawn now,
  // the others only when they get near the screen.
  const fill = (sheet: HTMLElement) => {
    if (my !== gen) return;
    const i = Number(sheet.dataset.i), ink = draw(i);
    sheet.append(ink);
    // As an image the ink can be long-pressed → Kopieren, or dragged into GoodNotes, on the iPad.
    toPng(ink).then((b) => {
      if (my !== gen) return;
      const img = new Image();
      img.src = URL.createObjectURL(b);
      img.alt = pages[i].lines.map((l) => l.text).join('\n');
      urls.push(img.src);
      img.onload = () => { ink.replaceWith(img); ink.width = 0; };
    }, () => {}); // the canvas stays visible
  };
  box.replaceChildren(...pages.map((_, i) => {
    const sheet = document.createElement('div');
    sheet.className = paper.background === 'transparent' ? 'page-view clear' : 'page-view';
    sheet.dataset.i = String(i);
    sheet.style.aspectRatio = `${paper.pageW} / ${paper.pageH}`;
    if (url) sheet.style.backgroundImage = `url(${url})`;
    if (i < EAGER_PAGES) fill(sheet); else io!.observe(sheet);
    return sheet;
  }));
  $('missing').hidden = !missing.size;
  $('missing').replaceChildren(`${missing.size === 1 ? '1 Zeichen fehlt' : `${missing.size} Zeichen fehlen`} in diesem Text (rot markiert) – jetzt schreiben: `,
    ...[...missing].map((k) => button(k, () => openLetter(k), 'chip gone')));
}

document.querySelectorAll('#write textarea, #settings input').forEach((el) => el.addEventListener('input', () => {
  localStorage.setItem('text', $<HTMLTextAreaElement>('text').value);
  if (el.id === 'text') overrides.clear();
  schedule();
}));
$('optimize').addEventListener('change', rebuild); // on release: rebuilding the review grid is not instant
// Button groups that write into a hidden input: [data attribute, input id]
const SEGS = [['ink', 'ink'], ['head', 'headInk'], ['mark', 'markInk'], ['bg', 'background'], ['format', 'page']] as const;
for (const [attr, id] of SEGS) {
  document.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`).forEach((b) => b.onclick = () => {
    const rule = ruleAt();
    $<HTMLInputElement>(id).value = b.dataset[attr]!;
    if (attr === 'bg' && rule >= 0) applyRule(rule); // Liniert ↔ Kariert: keep "Eng/Mittel/Weit"
    schedule();
  });
}
$('dice').onclick = () => { $<HTMLInputElement>('seed').value = String(Math.floor(Math.random() * 1e6)); schedule(); };
addEventListener('resize', () => { if ($('preview').clientWidth !== lastW) schedule(); }); // height alone (iPad address bar) changes nothing

$('clearText').onclick = () => {
  const area = $<HTMLTextAreaElement>('text');
  remember(); // still there under "Verlauf"
  area.value = '';
  area.dispatchEvent(new Event('input')); // saves it, clears letter swaps, redraws
  area.focus();
};
$('aiPrompt').onclick =() => navigator.clipboard.writeText(AI_PROMPT).then(
  () => toast('Anleitung kopiert. Füge sie einmal am Anfang des Chats mit der KI ein, dann schreibt sie passend (bei ChatGPT auch unter „Personalisierung“).'),
  () => toast('Kopieren ging nicht.'),
);

// ---------- history: the last texts that were sent somewhere, to send them again ----------
const HISTORY_MAX = 15;
const history = (): string[] => { try { return JSON.parse(localStorage.getItem('history') ?? '[]'); } catch { return []; } };
function remember() {
  const t = $<HTMLTextAreaElement>('text').value.trim();
  if (!t) return;
  localStorage.setItem('history', JSON.stringify([t, ...history().filter((h) => h !== t)].slice(0, HISTORY_MAX)));
  renderHistory();
}
function renderHistory() {
  const sel = $<HTMLSelectElement>('history'), list = history();
  sel.hidden = !list.length;
  sel.replaceChildren(new Option('Verlauf', '', true, true), ...list.map((t, i) => new Option(t.replace(/\s+/g, ' ').slice(0, 60), String(i))));
  sel.options[0].disabled = true;
}
$<HTMLSelectElement>('history').onchange = (e) => {
  const t = history()[Number((e.target as HTMLSelectElement).value)];
  if (t === undefined) return;
  const area = $<HTMLTextAreaElement>('text');
  area.value = t;
  area.dispatchEvent(new Event('input')); // saves it, clears letter swaps, redraws
  renderHistory();
};
renderHistory();

// ---------- text from outside: copied AI answer, or handed over in the address by a link / iOS shortcut ----------
/** Replaces the text; the previous one stays under "Verlauf". */
function setText(t: string) {
  const area = $<HTMLTextAreaElement>('text');
  remember();
  area.value = t.slice(0, TEXT_MAX);
  area.dispatchEvent(new Event('input')); // saves it, clears letter swaps, redraws
}
$('pasteText').hidden = !navigator.clipboard?.readText;
// Only on a tap: browsers ask before a page may read the clipboard (iPad shows a small "Einsetzen" bubble).
$('pasteText').onclick = () => navigator.clipboard.readText().then(
  (t) => { if (t.trim()) { setText(t); toast('Eingefügt. Der vorige Text steht im Verlauf.'); } else toast('In der Zwischenablage ist kein Text.'); },
  () => toast('Einfügen ging nicht. Tippe ins Textfeld und wähle dort „Einsetzen“.'),
);
function handover(starting: boolean) {
  const handed = takeText(location.href);
  if (handed.text !== null) window.history.replaceState(null, '', handed.rest); // a reload must not bring it back
  if (!handed.text?.trim()) return;
  if (!starting) return setText(handed.text);
  remember(); // the text from last time stays under "Verlauf"
  // no input event while the page is still starting: the first preview comes with the handwriting
  localStorage.setItem('text', $<HTMLTextAreaElement>('text').value = handed.text);
}
handover(true);
addEventListener('hashchange', () => handover(false)); // page already open: a new #text= does not reload it

async function shareAs(kind: string, make: () => Promise<File[]>) {
  if (!raw.length) return toast('Erst eine Handschrift auswählen oder anlegen.');
  remember();
  try {
    if (ready?.kind !== kind) ready = { kind, files: await make() };
    await shareFiles(ready.files);
    ready = null;
  } catch (e) {
    const err = e as Error;
    // iPad only opens the share sheet right after a tap; rendering can take longer than that.
    if (err.name === 'NotAllowedError' && ready && !ready.asked) { ready.asked = true; toast('Export ist fertig – bitte noch einmal tippen.'); }
    // sharing refused again (some desktop browsers never allow it): save the files instead of asking forever
    else if (err.name === 'NotAllowedError' && ready) { ready.files.forEach((f) => download(f, f.name)); ready = null; }
    else if (err.name !== 'AbortError') { ready = null; toast(err.message); }
  }
}
$('share').onclick = () => shareAs('pdf', async () => {
  const { pages, draw } = renderAll(EXPORT_PX_PER_MM, 'page');
  const pngs = await forEachPage(pages.length, draw, toPng);
  const { w, h } = pageSize();
  return [new File([await toPdf(pngs, w, h)], 'handschrift.pdf', { type: 'application/pdf' })];
});
// Real GoodNotes ink: laid out on the template's page size, one file per page.
$('shareGn').onclick = () => shareAs('gn', async () => {
  const { s, o } = settings();
  const margin = Math.min(s.margin, 12), paper = o.background === 'transparent' ? 'blank' : o.background; // no transparent paper in a notebook
  const res = layout(clean($<HTMLTextAreaElement>('text').value, (ch) => lib.has(ch)), lib, { ...s, pageW: GN_PAGE.w, pageH: GN_PAGE.h, margin });
  applyOverrides(res.pages);
  const get = (src: string) => bySrc.get(src)!;
  const bg = await backgroundPdf(paper, s.lineH, margin);
  const thumbOpts: DrawOpts = { ...o, background: paper, crop: false, pxPerMm: 2, pageW: GN_PAGE.w, pageH: GN_PAGE.h, lineH: s.lineH, margin };
  // one page after the other: thumbnail drawn, encoded, freed before the next page starts
  return forEachPage(res.pages.length, (i) => drawPage(res.pages[i], thumbOpts, get), async (thumb, i) => {
    const jpg = new Uint8Array(await (await new Promise<Blob>((ok) => thumb.toBlob((b) => ok(b!), 'image/jpeg', 0.8))).arrayBuffer());
    const name = res.pages.length > 1 ? `handschrift-${i + 1}.goodnotes` : 'handschrift.goodnotes';
    return new File([(await goodnotesFile(res.pages[i], get, o.ink, jpg, o.head ?? o.ink, o.weight, bg)) as BlobPart], name, { type: 'application/octet-stream' });
  });
});
$('copy').onclick = () => {
  if (!raw.length) return toast('Erst eine Handschrift auswählen oder anlegen.');
  remember();
  let more = false;
  // Clipboard call must happen inside the tap; the rendering runs inside the promise it waits for.
  const blob = Promise.resolve().then(() => {
    const { pages, draw } = renderAll(EXPORT_PX_PER_MM, 'clip');
    more = pages.length > 1;
    const first = draw(0); // only page 1 goes onto the clipboard
    return toPng(first).finally(() => { first.width = 0; });
  });
  copyPng(blob).then(
    () => toast(more ? 'Seite 1 kopiert – für längere Texte „PDF“ nutzen.' : 'Kopiert – in GoodNotes auf die Seite tippen → Einsetzen.'),
    (e) => toast(`Kopieren nicht möglich: ${e.message}`),
  );
};

// ---------- tabs ----------
function show(tab: string) {
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('on', el.id === tab));
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  scrollTo(0, 0);
  if (tab === 'write') schedule();
}
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.onclick = () => show(b.dataset.tab!));
$('settingsOpen').onclick = () => { $('settings').hidden = false; };
$('settingsClose').onclick = () => { $('settings').hidden = true; };
$('settings').onclick = (e) => { if (e.target === $('settings')) $('settings').hidden = true; };
document.querySelectorAll<HTMLButtonElement>('[data-goto]').forEach((b) => b.onclick = () => show(b.dataset.goto!));

// ---------- capture ----------
const log = (msg: string) => { $('log').textContent += msg + '\n'; };

$('template').onclick = async () => {
  const pdf = await buildTemplatePdf();
  download(new Blob([pdf as BlobPart], { type: 'application/pdf' }), 'handschrift-vorlage.pdf');
};
$('templateSymbols').onclick = async () => {
  const pdf = await buildTemplatePdf([SYMBOL_PAGE]);
  download(new Blob([pdf as BlobPart], { type: 'application/pdf' }), 'handschrift-symbole.pdf');
};
$('templateCursive').onclick = async () => {
  const pdf = await buildTemplatePdf(CURSIVE_PAGES);
  download(new Blob([pdf as BlobPart], { type: 'application/pdf' }), 'handschrift-schreibschrift.pdf');
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
          log(`${label}, Seite ${n}: Vorlagenseite ${page + 1} erkannt, ${vs.length} Zeichen übernommen.`);
        } catch (e) { log(`${label}, Seite ${n}: ${(e as Error).message}`); }
      }
    } catch (e) { log(`${label}: konnte nicht gelesen werden (${(e as Error).message})`); }
  }
  sets = await listSets();
  if (total) { await useSet(name); log(`Fertig – „${name}“ ist jetzt aktiv.`); toast(`„${name}“ importiert.`); openSetup(); }
  else log('Keine Zeichen gefunden.');
  return total > 0;
}

$<HTMLInputElement>('file').onchange = async (ev) => {
  const input = ev.target as HTMLInputElement;
  await importInto([...input.files ?? []].map((f) => [f.name, () => pagesOf(f)]));
  input.value = '';
};
setupPencil((pages) => importInto([['In der App ausgefüllt', () => pages]]), toast);

/** Ruling preset (index into rules()) the learned line spacing matches: within 0.35 mm, the notes were written on it. */
const ruleOf = (lineH: number) => rules().findIndex((v) => Math.abs(v - lineH) <= 0.35);
/** Measured size and line spacing go into the sliders (they stay adjustable); a spacing close to a preset snaps to it. */
function applyStyle(st: TextStyle) {
  const i = ruleOf(st.lineH);
  $<HTMLInputElement>('lineH').value = String(i >= 0 ? rules()[i] : Math.round(st.lineH * 10) / 10);
  $<HTMLInputElement>('xh').value = String(Math.round(st.xh * 10) / 10);
  for (const id of ['xh', 'lineH']) $<HTMLInputElement>(id).value = String(n(id)); // clamp to the slider limits
}

function renderStyle() {
  const r = $('styleResult');
  r.hidden = !style;
  $('styleReset').hidden = !style;
  if (style) {
    r.textContent = `Übernommen für „${active}“ aus ${style.lines} Zeilen${style.pages ? ` auf ${style.pages} Seite${style.pages > 1 ? "n" : ""}` : ""}: Schriftgröße ${style.xh.toFixed(1)} mm, Zeilenabstand ${style.lineH.toFixed(1)} mm`
      + (style.wordGap && style.letterGap ? `, Wortabstand ${style.wordGap.toFixed(2)} × und Buchstabenabstand ${style.letterGap.toFixed(2)} × x-Höhe.` : '.');
    const i = ruleOf(style.lineH), names = ['Eng', 'Mittel', 'Weit'];
    r.textContent += i >= 0
      ? ` Der Zeilenabstand passt zu den Linien „${names[i]}“ (${rules()[i]} mm).`
      : ` Der Zeilenabstand passt zu keiner Linien-Vorgabe (${rules().map((v, k) => `${names[k]} ${v}`).join(' / ')} mm), deshalb ist genau dein Abstand eingestellt.`;
    r.textContent = r.textContent.replace(/(\d)\.(\d)/g, '$1,$2'); // German decimal comma
  }
}

$<HTMLInputElement>('notes').onchange = async (ev) => {
  const input = ev.target as HTMLInputElement;
  if (!active) { toast('Erst eine Handschrift auswählen.'); input.value = ''; return; }
  const lines: LineMeasure[] = [];
  let page = 0, first: { img: ImageData; px: number; base: number } | null = null;
  toast('Notizen werden analysiert …');
  try {
    for (const file of input.files ?? []) {
      for await (const { img, pxPerMm } of pagesOf(file)) {
        const found = measureLines(img, pxPerMm, page++);
        if (!first && found.length >= 3) first = { img, px: pxPerMm, base: found[0].baseline }; // kept for the comparison
        lines.push(...found);
      }
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
  found.pages = page;
  style = found;
  localStorage.setItem(`style:${active}`, JSON.stringify(found));
  markDirty(active);
  renderCompare(first, found);
  applyStyle(found);
  renderStyle();
  schedule();
  toast(found.wordGap ? 'Abstände übernommen.' : 'Größe und Zeilenabstand übernommen – die Abstände waren nicht messbar.');
};

/** Side by side: a few lines of the uploaded page and the same amount of text written by the app with the learned style. */
function renderCompare(first: { img: ImageData; px: number; base: number } | null, st: TextStyle) {
  const box = $('styleCompare');
  box.hidden = !first;
  if (!first) return;
  const W = 900, top = 10, Hmm = top + 4.6 * st.lineH, y0 = Math.max(0, first.base - st.lineH - top);
  const mine = document.createElement('canvas');
  mine.width = first.img.width; mine.height = first.img.height;
  mine.getContext('2d')!.putImageData(first.img, 0, 0);
  const crop = document.createElement('canvas');
  crop.width = W; crop.height = Math.round((W * Hmm) / 210);
  crop.getContext('2d')!.drawImage(mine, 0, y0 * first.px, mine.width, Hmm * first.px, 0, 0, W, crop.height);
  mine.width = 0;
  const { s: cur, o: look } = settings();
  const s: Settings = { ...cur, xh: st.xh, lineH: st.lineH, margin: top, pageW: 210, pageH: Hmm + st.lineH + top, wordGap: st.wordGap, letterGap: st.letterGap };
  const text = [...PROBE.repeat(3)].filter((ch) => ch === ' ' || lib.has(ch)).join('');
  const o: DrawOpts = { pxPerMm: W / 210, ink: look.ink, weight: look.weight, background: 'lined', pageW: 210, pageH: Hmm, lineH: st.lineH, margin: top, crop: false };
  const app = drawPage(layout(text, lib, s).pages[0], o, (src) => bySrc.get(src)!);
  const fig = (c: HTMLCanvasElement, cap: string) => {
    const f = document.createElement('figure');
    const img = new Image(); img.src = c.toDataURL('image/png'); img.alt = cap;
    const t = document.createElement('figcaption'); t.textContent = cap;
    f.append(t, img);
    return f;
  };
  box.replaceChildren(fig(crop, 'Deine Seite'), fig(app, 'So schreibt die App jetzt'));
}

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

async function restoreFrom(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  try {
    // a name already in use: ask for another one ("Name (2)" suggested); the same name merges into the existing handwriting
    const { sets: got, count } = await importBackup(f, (name, existing) => existing.includes(name)
      ? prompt(`„${name}“ gibt es auf diesem Gerät schon. Unter welchem Namen laden?
(Derselbe Name ergänzt die vorhandene Handschrift.)`, freeName(name, existing)) : name);
    sets = await listSets();
    if (!got.length) return;
    welcomed(); // a handwriting loaded from the first-start window counts as set up
    await useSet(got[0]);
    toast(got.length === 1 ? `„${got[0]}“ geladen (${count} Zeichen).` : `${got.length} Handschriften geladen.`);
  } catch (e) { toast((e as Error).message); }
}
$('restore').onchange = restoreFrom;
$('welcomeRestore').onchange = restoreFrom;

// ---------- swap one letter in the written text: tap it in the preview ----------
// n-th letter of the text (across pages, so any page size keeps it) -> variant src. Typing clears it.
const overrides = new Map<number, { key: string; src: string }>();
let shown: Page[] = [];
let swapAt: { pi: number; gi: number; n: number; key: string } | null = null;
let pad: number[][] = [];

function applyOverrides(pages: Page[]) {
  let n = 0;
  for (const page of pages) page.glyphs.forEach((p, i) => {
    const o = overrides.get(n++), g = o && bySrc.get(o.src);
    if (g && p.g.key === o.key) page.glyphs[i] = swapVariant(p, g);
  });
}

$('preview').addEventListener('click', (e) => {
  const el = e.target as HTMLElement, sheet = el.closest('.page-view');
  if (!sheet || !(el instanceof HTMLImageElement || el instanceof HTMLCanvasElement)) return;
  const pi = [...$('preview').children].indexOf(sheet), r = el.getBoundingClientRect(), { w, h } = pageSize();
  const gi = shown[pi] ? glyphAt(shown[pi], ((e.clientX - r.left) / r.width) * w, ((e.clientY - r.top) / r.height) * h) : -1;
  if (gi < 0) return;
  swapAt = { pi, gi, n: shown.slice(0, pi).reduce((s, p) => s + p.glyphs.length, gi), key: shown[pi].glyphs[gi].g.key };
  openSwap();
});

/** One dialog for a letter: from the preview (n >= 0: tap a variant to use it here) or from the
 *  Handschriften grid (n = -1: tap a variant to delete it). The pencil pad is open right away. */
function openSwap() {
  const { pi, gi, n, key } = swapAt!, inText = n >= 0, cur = inText ? shown[pi].glyphs[gi].g.src : '';
  $('swapTitle').textContent = inText ? `„${key}“ austauschen` : `„${key}“`;
  $('swapHint').textContent = !active ? 'Tippe eine andere Version an.'
    : inText ? 'Tippe eine andere Version an – oder schreib den Buchstaben unten neu.'
    : 'Schreib unten eine neue Version. Eine vorhandene antippen löscht sie.';
  $('swapVariants').replaceChildren(...(inText ? lib.get(key) ?? [] : raw.filter((v) => v.key === key)).map((v) => {
    const box = frame(raw.find((r) => r.src === v.src) ?? v, bySrc.get(v.src) ?? v);
    box.classList.toggle('on', v.src === cur);
    box.onclick = inText ? () => { overrides.set(n, { key, src: v.src }); schedule(); closeSwap(); } : async () => {
      if (!confirm(`Diese Version von „${key}“ löschen?`)) return;
      await remove(active, v.src);
      raw = await loadSet(active);
      rebuild();
      openSwap();
    };
    return box;
  }));
  for (const id of ['swapPad', 'swapSave', 'swapWrite']) $(id).hidden = !active;
  if (active) clearPad();
  $('swap').hidden = false;
}
const openLetter = (key: string) => { swapAt = { pi: -1, gi: -1, n: -1, key }; openSwap(); };
const closeSwap = () => { $('swap').hidden = true; };
$('swapClose').onclick = closeSwap;

// Write the letter anew in a template box (same guides), cut out like a filled-in template.
const boxFor = (key: string) => TEMPLATE_PAGES.flat().find((b) => b.key === key) ?? { ...TEMPLATE_PAGES[0][0], key, w: CELL.w * Math.min(6, Math.max(1, [...key].length)) };
function drawPad() {
  const c = $<HTMLCanvasElement>('swapPad'), ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#c8d3e3'; ctx.lineWidth = 2; // lighter than ink: extraction ignores it
  for (const yy of [GUIDES.asc, GUIDES.xh, GUIDES.base, GUIDES.desc]) { ctx.beginPath(); ctx.moveTo(0, yy * MM); ctx.lineTo(c.width, yy * MM); ctx.stroke(); }
  for (const s of pad) paint(ctx, s);
}
function clearPad() {
  const b = boxFor(swapAt!.key), c = $<HTMLCanvasElement>('swapPad');
  c.width = b.w * MM; c.height = b.h * MM;
  pad = [];
  drawPad();
}
$('swapWrite').onclick = clearPad;
{
  const c = $<HTMLCanvasElement>('swapPad');
  const at = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height, (0.3 + 0.45 * (e.pressure || 0.5)) * MM]; };
  c.onpointerdown = (e) => { try { c.setPointerCapture(e.pointerId); } catch { /* synthetic events */ } pad.push(at(e)); drawPad(); };
  c.onpointermove = (e) => { if (e.buttons && pad.length) { pad.at(-1)!.push(...at(e)); drawPad(); } };
}
$('swapSave').onclick = async () => {
  const { n, key } = swapAt!, c = $<HTMLCanvasElement>('swapPad');
  const b = boxFor(key), img = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
  const v = extractBox(img, [MM, 0, 0, 0, MM, 0], { ...b, x: 0, y: 0 });
  if (!v) return toast('Da ist noch nichts geschrieben.');
  const src = `pen:${key}:${Date.now()}`;
  try { await saveMany(active, [{ ...v, src }]); } catch (e) { return toast((e as Error).message); }
  raw = await loadSet(active);
  if (n >= 0) overrides.set(n, { key, src });
  rebuild();
  if (n >= 0) closeSwap(); else openSwap(); // in the grid: stay open for the next variant
  toast(`Neues „${key}“ gespeichert – es wird ab jetzt auch sonst verwendet.`);
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
  if (tuned.excluded.has(v.src)) { box.classList.add('out'); box.title = 'wird nicht verwendet: weicht zu stark von den anderen ab'; }
  else box.title = v.connected === undefined ? '' : v.connected ? 'verbunden' : 'getrennt';
  return box;
}

// ---------- review sheet: approve the strong optimisation per character ----------
let rKeys: string[] = [], rAt = 0;

function openReview() {
  const d = decisions();
  rKeys = reviewKeys(raw, strong);
  rAt = Math.max(0, rKeys.findIndex((k) => !d[k]));
  if (!rKeys.length) return toast('Hier gibt es nichts anzusehen.');
  $('review').hidden = false;
  renderReview();
}

function renderReview() {
  if (rAt >= rKeys.length) { closeReview(); toast('Alles angesehen.'); return; }
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
  markDirty(active);
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
  markDirty(active);
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
  ['Buchstabengruppen', PAIRS],
  ['Wörter', WORDS],
  ['Symbole', SYMBOL_KEYS],
];
const KNOWN = new Set([...GROUPS.flatMap(([, keys]) => keys), ...CURSIVE_KEYS]);
// Most frequent letters in German text: with few variants the same shapes repeat visibly.
const FREQUENT = [...'enisratdhulgmocbfkwz'];

/** Single characters worth having, most important first (arrows, maths signs, digits, umlauts, punctuation, letters). */
const rank = (k: string) => /[↑↓]/.test(k) ? 0 : /[+=≠≈<>≤≥±×÷]/.test(k) ? 1 : /\p{N}/u.test(k) ? 2 : /[äöüÄÖÜß]/.test(k) ? 3 : /\p{L}/u.test(k) ? 5 : 4;
// The layout always draws these as pen strokes (renderer/layout ARROWS), a handwritten one is never used: never ask for them.
const DRAWN = /^[→←⇒⇔↔⇌]$/;
const missingKeys = () => {
  const have = new Set(raw.map((v) => v.key));
  return [...new Set([...SINGLES, ...SYMBOL_KEYS])].filter((k) => !have.has(k) && !DRAWN.test(k)).sort((a, b) => rank(a) - rank(b));
};
const SHOWN = 36;

/** "Diese Zeichen fehlen noch": not written at all (red) or only drawn as stand-in strokes (dashed). A tap opens the writing pad. */
function missingCard() {
  const miss = missingKeys();
  if (!active || !miss.length) return null;
  const card = document.createElement('div');
  card.className = 'card missing-card';
  const part = (keys: string[], cls: string) => {
    const p = document.createElement('p');
    p.className = 'note info need';
    p.append(...keys.slice(0, SHOWN).map((k) => button(k, () => openLetter(k), `chip ${cls}`)),
      ...(keys.length > SHOWN ? [`… und ${keys.length - SHOWN} weitere (Reiter Zeichen)`] : []));
    return p;
  };
  const note = (text: string) => Object.assign(document.createElement('p'), { className: 'muted small', textContent: text });
  const gone = miss.filter((k) => !lib.has(k)), stand = miss.filter((k) => lib.has(k));
  card.append(Object.assign(document.createElement('h2'), { textContent: 'Diese Zeichen fehlen noch' }),
    note('Antippen und schreiben. Rechenzeichen und Ziffern zuerst – sie kommen in Texten oft vor.'),
    ...(gone.length ? [part(gone, 'gone')] : []),
    ...(stand.length ? [note('Diese Zeichen zeichnet die App gerade mit einfachen Strichen. In deiner Handschrift sehen sie besser aus:'), part(stand, 'sub')] : []));
  return card;
}

function renderGrid() {
  const byKey = new Map<string, Variant[]>();
  for (const v of raw) byKey.set(v.key, [...(byKey.get(v.key) ?? []), v]);
  const own = [...byKey.keys()].filter((k) => !KNOWN.has(k));
  const groups: [string, string[]][] = [
    ...GROUPS,
    ...(cursive() || CURSIVE_KEYS.some((k) => byKey.has(k)) ? [['Verbundene Silben', CURSIVE_KEYS] as [string, string[]]] : []),
    ['Eigene Silben & Wörter', own],
  ];
  const all = groups.flatMap(([, keys]) => keys);
  $('glyphsTitle').textContent = active ? `Zeichen von „${active}“` : 'Keine Handschrift ausgewählt';
  const wanted = all.filter((k) => !DRAWN.test(k)); // arrows are always drawn, not counted
  $('coverage').textContent = active ? `${wanted.filter((k) => byKey.has(k)).length} von ${wanted.length} vorhanden.` : '';
  const d = decisions(), toReview = active ? reviewKeys(raw, strong) : [], open = toReview.filter((k) => !d[k]).length;
  $('reviewOpen').hidden = !toReview.length;
  $('reviewOpen').textContent = open ? `Änderungen ansehen (${open} offen)` : 'Änderungen erneut ansehen';
  $('acceptAll').hidden = !open;

  const gone = missingCard();
  $('missingManage').replaceChildren(...(active && gone ? [gone] : []));
  const few = FREQUENT.filter((k) => (byKey.get(k)?.length ?? 0) < 3);
  const need = document.createElement('p');
  need.className = 'note info need';
  need.append('Diese häufigen Buchstaben hast du erst wenige Male geschrieben – antippen und noch einen dazuschreiben, dann wiederholt sich die Schrift weniger: ',
    ...few.map((k) => button(k, () => openLetter(k), 'chip')));

  const add = document.createElement('form');
  add.className = 'add-part';
  const field = Object.assign(document.createElement('input'), { placeholder: 'z. B. sch, ung, der, dein Name', maxLength: 12, autocomplete: 'off' });
  add.append(field, Object.assign(document.createElement('button'), { type: 'submit', textContent: 'Schreiben' }));
  add.onsubmit = (e) => {
    e.preventDefault();
    const k = field.value.trim();
    if (/\s/.test(k)) return toast('Bitte ein Wort oder Wortteil ohne Leerzeichen.');
    if (k) openLetter(k);
  };

  $('grid').replaceChildren(...(!active ? [] : [...(gone ? [missingCard()!] : []), ...(few.length ? [need] : []), ...groups.flatMap(([title, keys]) => {
    const h = document.createElement('h3');
    h.textContent = title;
    const group = document.createElement('div');
    group.className = 'group';
    group.append(...keys.map((key) => {
      const vs = byKey.get(key) ?? [];
      const el = document.createElement('div');
      el.className = vs.length || DRAWN.test(key) ? 'glyph' : 'glyph missing';
      el.onclick = () => openLetter(key);
      const head = document.createElement('b');
      head.textContent = key;
      const info = document.createElement('small');
      // Word parts are used whether joined or not; mention joins only when there are some (print writers saw "0/3 verbunden" as "not recognised").
      const joined = [...key].length > 1 ? vs.filter((v) => v.connected).length : 0;
      info.textContent = !vs.length ? (lib.has(key) ? 'gezeichnet' : 'fehlt') : `${vs.length}×${joined ? ` · ${joined} verbunden` : ''}`;
      head.append(info);
      const row = document.createElement('div');
      row.className = 'variants';
      row.append(...vs.map(thumb));
      el.append(head, row);
      return el;
    }));
    if (title !== 'Eigene Silben & Wörter') return [h, group];
    const hint = Object.assign(document.createElement('p'), { className: 'muted small', textContent: 'Silben und Wörter so, wie du sie schreibst. Sie ersetzen im Text die einzelnen Buchstaben (bis 5 Buchstaben, längere nur als ganzes Wort).' });
    return [h, hint, add, group];
  })]));
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
// Safari may wipe a site's storage after a week of not using it: nudge towards a backup once something has been unsaved for 3 days.
function backupReminder() {
  const stale = staleSets(3).filter((n) => n !== SAMPLE_SET && sets.includes(n));
  if (!stale.length) return;
  $('installText').textContent = `Seit Tagen nicht gesichert: ${stale.join(', ')}. Sichere sie im Teilen-Menü in „Dateien“ oder iCloud – falls der Speicher einmal gelöscht wird.`;
  $('installBtn').textContent = 'Jetzt sichern';
  $('installBtn').hidden = false;
  $('installBtn').onclick = () => backup(stale);
  $('installClose').onclick = () => { $('install').hidden = true; };
  $('install').hidden = false;
}
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js');
listSets().then((s) => {
  sets = s;
  if (!sets.length && !localStorage.getItem('welcomed')) $('welcome').hidden = false; // first start
  return useSet(sets.includes(active) ? active : sets[0] ?? '');
}).then(backupReminder);
const welcomed = () => { localStorage.setItem('welcomed', '1'); $('welcome').hidden = true; };
$('welcomeOwn').onclick = () => { welcomed(); show('manage'); $('pencilOpen').click(); };
$('welcomeSample').onclick = () => { welcomed(); void useSet(SAMPLE_SET); };
$('welcomeLater').onclick = welcomed;
const howto = (on: boolean) => { $('howto').hidden = !on; };
$('howtoOpen').onclick = $('welcomeHowto').onclick = () => howto(true);
$('howtoClose').onclick = () => howto(false);
// Setup checklist: shown after an import (what is missing now?) and any time from the Handschriften tab.
function openSetup() {
  const own = sets.some((n) => n !== SAMPLE_SET), miss = active && active !== SAMPLE_SET ? missingKeys().length : 0;
  $('setup1').textContent = own ? 'erledigt' : 'noch offen';
  $('setup2').textContent = !own ? '' : miss ? `${miss} Zeichen fehlen noch` : 'alles da';
  $('setup').hidden = false;
}
const closeSetup = () => { $('setup').hidden = true; };
$('setupOpen').onclick = openSetup;
$('setupClose').onclick = closeSetup;
$('setupPencil').onclick = () => { closeSetup(); show('manage'); $('pencilOpen').click(); };
$('setupPdf').onclick = () => { closeSetup(); show('manage'); $('template').scrollIntoView({ block: 'center' }); };
$('setupMissing').onclick = () => { closeSetup(); show('glyphs'); };
$('setupWrite').onclick = () => { closeSetup(); show('write'); };
$('shareApp').onclick = async () => {
  const data = { title: 'Handschrift', text: 'Mit dieser App schreibt dein iPad getippten Text in deiner eigenen Handschrift – zum Einfügen in GoodNotes. Alles bleibt auf deinem Gerät.', url: 'https://mrbanany.github.io/handschrift/' };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(data.url); toast('Link kopiert.'); }
  } catch (e) { if ((e as Error).name !== 'AbortError') toast('Link: ' + data.url); }
};
