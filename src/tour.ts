// The short tour: a one-minute "video" made of a mock of the app (HTML/SVG), played on a clock.
// Everything is a function of the time t, so pause, jump and the still pictures (reduced motion) all come for free.
import { AI_PROMPT } from './prompt';
import { HELLO, MAIN, SWAP, type Stroke } from './tour-ink';

const W = 440, H = 700; // stage size; it is scaled to the screen as a whole
const $ = (id: string) => document.getElementById(id)!;

type Target = string | (() => [number, number]); // data-t name of an element, or a point on the stage
type Tap = [at: number, target: Target, to?: Target, dur?: number]; // to + dur: press and drag
type On = [from: number, to: number, sel: string, cls?: string];
interface Scene { name: string; dur: number; still: number; subs: [number, string][]; on: On[]; taps: Tap[] }
const E = 1e9; // until the scene ends

// ---------- the stage ----------
const QUESTION = 'Erklär mir kurz die Fotosynthese.';
const KI_TEXT = '## Fotosynthese\n- Pflanzen brauchen Licht.\n- Aus $\\ce{CO2}$ und Wasser wird Zucker.\n- Dabei entsteht ==Sauerstoff==.';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const paths = (ss: Stroke[]) => ss.map(([k, w, d]) => `<path class="${k ? 'mk' : ''}" stroke-width="${w}" d="${d}"/>`).join('');
const rules = (h: number) => Array.from({ length: Math.floor((h - 16) / 10) }, (_, i) => `<path class="rule" d="M0 ${18 + 10 * i}H130"/>`).join('');
const paper = (inner: string, h = 62) => `<svg viewBox="0 0 130 ${h}">${rules(h)}${inner}</svg>`;
const ICON = {
  gear: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
  write: '<svg viewBox="0 0 24 24"><path d="M4 20c3-1 5-4 7-7l6-6a2 2 0 0 0-3-3l-6 6c-3 2-6 4-7 7z"/><path d="M14 20h6"/></svg>',
  sets: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20l4-1L19 8l-3-3L5 16l-1 4z"/></svg>',
  eraser: '<svg viewBox="0 0 24 24"><path d="M8 20h12"/><path d="M4.5 14.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 18H8z"/><path d="M9 10l5 5"/></svg>',
  lasso: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="9" rx="8" ry="5" stroke-dasharray="3 2.5"/><path d="M8 13.5c-1 2 0 4 2 5"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13c1.5-1 2.5-2.5 3-1s.5 2.5 3 1"/></svg>',
};

function stage() {
  return `
<div class="tv" aria-hidden="true">
  <div class="tv-top"><span class="tv-brand"><svg class="logo" viewBox="0 0 512 512"><use href="#mark"/></svg>Handschrift</span>
    <span class="tv-select" data-t="select"><span class="tv-sel-none">Keine ausgewählt</span><span class="tv-sel-print">Muster: Druckschrift, ordentlich</span><i></i></span>
    <span class="button icon">${ICON.gear}</span></div>
  <div class="tv-body">
    <div class="tv-textbar"><span class="button small-btn" data-t="paste">Kopierten Text einfügen</span><span class="button small-btn">Leeren</span><span class="button small-btn" data-t="ai">KI-Vorgabe kopieren</span></div>
    <div class="tv-text"><span class="tv-t-empty">Text eintippen oder einfügen, zum Beispiel eine KI-Antwort</span><span class="tv-t-hello">Hallo, das ist meine Handschrift.</span><span class="tv-t-ki">${esc(KI_TEXT)}</span></div>
    <div class="tv-actions"><span class="button primary" data-t="gn">In GoodNotes öffnen</span><span class="button" data-t="png">Als Bild kopieren</span><span class="button" data-t="pdf">PDF</span></div>
    <div class="tv-fit note info"><span><span class="tv-fit-a">Der Text braucht 2 Seiten.</span><span class="tv-fit-b">Eingepasst: Schrift 4 → 3,5 mm.</span></span><span class="button primary" data-t="fit">Auf eine Seite einpassen</span></div>
    <div class="tv-bar"><span class="muted small">Buchstaben antippen zum Austauschen</span><span class="page-count"><span class="tv-pc2">2 Seiten</span><span class="tv-pc1">1 Seite</span></span></div>
    <div class="tv-paper" data-t="paper">${paper(`<g class="ink tv-hello">${paths(HELLO)}</g><g class="ink tv-main"><g class="mks"></g><g class="pen">${paths(MAIN)}</g></g>`)}</div>
  </div>
  <div class="tv-tabbar"><span class="on">${ICON.write}Schreiben</span><span data-t="tab-sets">${ICON.sets}Handschriften</span><span>${ICON.grid}Zeichen</span></div>

  <div class="tv-menu"><span class="muted small">Muster zum Ausprobieren</span><span data-t="opt-print">Muster: Druckschrift, ordentlich</span><span>Muster: locker und schnell</span><span>Muster: Schreibschrift, verbunden</span></div>
  <div class="tv-bubble tv-bubble-app" data-t="ins-app">Einsetzen</div>
  <div class="tv-toast tv-toast-ai">Kopiert. Füge es in Gemini oder ChatGPT ein und schreib deine Frage dahinter.</div>
  <div class="tv-toast tv-toast-paste">Eingefügt. Der vorige Text steht im Verlauf.</div>

  <div class="tv-chat">
    <div class="tv-chat-head"><b>KI-Chat</b><span class="muted small">zum Beispiel ChatGPT oder Gemini</span></div>
    <div class="tv-chat-log"><span class="tv-chat-new muted small">Neuer Chat</span>
      <div class="tv-msg me"><span class="tv-msg-prompt">${esc(AI_PROMPT.slice(0, 150))} …</span><span>${QUESTION}</span></div>
      <div class="tv-msg ai"><b>Fotosynthese</b><ul><li>Pflanzen brauchen Licht.</li><li>Aus CO<sub>2</sub> und Wasser wird Zucker.</li><li>Dabei entsteht <mark>Sauerstoff</mark>.</li></ul>
        <span class="tv-tools"><span class="tv-copy" data-t="copy">${ICON.copy}${ICON.check}</span><span class="muted small tv-copied">Kopiert</span></span></div>
    </div>
    <div class="tv-chat-input" data-t="input"><span class="tv-in"><span class="tv-in-empty">Nachricht schreiben</span><span class="tv-in-prompt">${esc(AI_PROMPT.slice(0, 60))} …</span><span class="tv-in-q"></span></span><span class="tv-send" data-t="send">${ICON.send}</span></div>
    <div class="tv-bubble tv-bubble-chat" data-t="ins-chat">Einsetzen</div>
  </div>

  <div class="tv-share"><div class="tv-sheet">
    <div class="tv-file">${ICON.file}<span><b>handschrift.goodnotes</b><span class="muted small">GoodNotes-Datei</span></span></div>
    <div class="tv-apps"><span data-t="app-gn"><i class="gn">${ICON.pen}</i>GoodNotes</span><span><i></i>Dateien</span><span><i></i>Mail</span><span><i></i>Nachrichten</span></div>
    <div class="tv-rows"><span>Kopieren</span><span>In Dateien sichern</span></div>
  </div></div>

  <div class="tv-nb">
    <div class="tv-nb-bar"><span class="muted small">Notizbuch</span><span class="tv-nb-tools"><i data-t="pen">${ICON.pen}</i><i data-t="eraser">${ICON.eraser}</i><i>${ICON.lasso}</i></span></div>
    <div class="tv-nb-page" data-t="nbpage">${paper(`<g class="ink"><g class="mks"></g><g class="pen">${paths(MAIN)}</g></g>`, 150)}</div>
  </div>

  <div class="tv-swap"><div class="tv-swap-sheet">
    <b>„Z“ austauschen</b>
    <span class="muted small">Tippe eine andere Variante an – oder schreib den Buchstaben unten neu.</span>
    <span class="tv-variants">${SWAP.alts.map((a, i) => `<span class="thumb" data-t="var${i}"><svg viewBox="92.1 29.6 7.6 10.4"><g class="ink">${paths(a.map(([w, d]) => [0, w, d]))}</g></svg></span>`).join('')}</span>
    <span class="tv-pad"></span>
    <span class="tv-swap-row"><span class="button primary">Speichern</span><span class="button">Leeren</span><span class="link">Schließen</span></span>
  </div></div>

  <div class="tv-ripple"></div><div class="tv-finger"></div>
</div>`;
}

// ---------- the script ----------
/** a point on a paper (mm) in stage units */
const onPaper = (t: string, x: number, y: number) => (): [number, number] => {
  const svg = stageEl!.querySelector(`[data-t="${t}"] svg`)!, r = svg.getBoundingClientRect(), s = stageRect();
  const k = r.width / 130;
  return [(r.left - s.left) / scale + (x * k) / scale, (r.top - s.top) / scale + (y * k) / scale];
};

const SCENES: Scene[] = [
  { name: 'Handschrift wählen', dur: 10500, still: 9000,
    subs: [[0, 'Wähle oben eine Handschrift aus.'], [1500, 'Zum Ausprobieren gibt es drei Muster.'], [6300, 'Deine eigene Handschrift legst du einmal unter „Handschriften“ an.']],
    on: [[0, 2900, '.tv-sel-none'], [2900, E, '.tv-sel-print'], [0, 2900, '.tv-t-empty'], [2900, E, '.tv-t-hello'], [1250, 3100, '.tv-menu'],
      [6500, E, '[data-t=tab-sets]', 'ring']],
    taps: [[1100, 'select'], [2800, 'opt-print']] },
  { name: 'Mit KI', dur: 17500, still: 13600,
    subs: [[0, 'Mit KI: Tippe auf „KI-Vorgabe kopieren“.'], [3600, 'Öffne ChatGPT oder Gemini und füge die Vorgabe ein.'], [7200, 'Schreib deine Frage dahinter und schick sie ab.'], [12600, 'Kopiere die Antwort der KI.']],
    on: [[0, E, '.tv-sel-print'], [0, E, '.tv-t-hello'], [1500, 3900, '.tv-toast-ai'], [4000, E, '.tv-chat'],
      [5700, 6500, '.tv-bubble-chat'], [6500, 9700, '.tv-in-prompt'], [0, 5700, '.tv-in-empty'], [9700, E, '.tv-in-empty'],
      [0, 9900, '.tv-chat-new'], [9900, E, '.tv-msg.me'], [10900, E, '.tv-msg.ai'], [14200, E, '.tv-copy', 'done'], [14200, 16800, '.tv-copied']],
    taps: [[1300, 'ai'], [5500, 'input'], [6300, 'ins-chat'], [9700, 'send'], [14000, 'copy']] },
  { name: 'Einfügen', dur: 14500, still: 12000,
    subs: [[0, 'Zurück in der App: Tippe auf „Kopierten Text einfügen“.'], [3300, 'Die App schreibt den Text in deiner Handschrift.'], [9000, 'Überschriften, Formeln und Markierungen gehen auch.']],
    on: [[0, 500, '.tv-chat'], [0, E, '.tv-sel-print'], [0, 2700, '.tv-t-hello'], [2700, E, '.tv-t-ki'], [1900, 2700, '.tv-bubble-app'], [2800, 5400, '.tv-toast-paste']],
    taps: [[1600, 'paste'], [2500, 'ins-app']] },
  { name: 'GoodNotes', dur: 16000, still: 9400,
    subs: [[0, 'Fertig? Tippe auf „In GoodNotes öffnen“.'], [2100, 'Wähle im Menü GoodNotes.'], [4600, 'In GoodNotes ist es echte Stiftschrift.'], [6400, 'Du kannst radieren und mit dem Lasso verschieben.'], [12000, 'Kein GoodNotes? Nimm „PDF“ oder „Als Bild kopieren“.']],
    on: [[0, E, '.tv-sel-print'], [0, E, '.tv-t-ki'], [1600, 4200, '.tv-share'], [4000, 11600, '.tv-nb'], [0, 6200, '[data-t=pen]', 'on'], [6200, 11600, '[data-t=eraser]', 'on'],
      [12200, E, '[data-t=pdf]', 'ring'], [12200, E, '[data-t=png]', 'ring']],
    taps: [[1400, 'gn'], [3700, 'app-gn'], [6000, 'eraser'], [7200, onPaper('nbpage', 93, 35.5), onPaper('nbpage', 114, 35.5), 1900]] },
  { name: 'Tipps', dur: 14000, still: 10600,
    subs: [[0, 'Ein Buchstabe gefällt dir nicht? Tipp ihn an.'], [2300, 'Wähle eine andere Variante.'], [6000, 'Zu lang für eine Seite? Tippe auf „Auf eine Seite einpassen“.'], [11000, 'Jetzt probier es selbst aus.']],
    on: [[0, E, '.tv-sel-print'], [0, E, '.tv-t-ki'], [1700, 5000, '.tv-swap'], [0, 4300, '[data-t=var2]', 'on'], [4300, E, '[data-t=var0]', 'on'],
      [5800, E, '.tv-fit'], [5800, 8700, '.tv-fit-a'], [8700, E, '.tv-fit-b'], [5800, 8700, '.tv-pc2'], [0, 5800, '.tv-pc1'], [8700, E, '.tv-pc1'], [8700, E, '.tv-main', 'fit']],
    taps: [[1500, onPaper('paper', 95.8, 35)], [4200, 'var0'], [8500, 'fit']] },
];
const START = SCENES.reduce<number[]>((a, s, i) => [...a, i ? a[i - 1] + SCENES[i - 1].dur : 0], []);
const TOTAL = START[SCENES.length - 1] + SCENES[SCENES.length - 1].dur;

// ---------- clock and drawing ----------
let stageEl: HTMLElement | null = null, scale = 1, t = 0, playing = false, raf = 0, last = 0, still = false, opener: HTMLElement | null = null;
const stageRect = () => stageEl!.getBoundingClientRect();
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);
const sceneAt = (time: number) => { let i = SCENES.length - 1; while (i > 0 && START[i] > time) i--; return i; };

/** pen strokes of one ink group, with their length (mm) for the writing animation */
function pens(g: Element) {
  return [...g.querySelectorAll<SVGPathElement>('path')].map((p) => {
    const n = (p.getAttribute('d') ?? '').match(/-?[\d.]+/g)!.map(Number);
    let len = 0;
    for (let i = 2; i < n.length; i += 2) len += Math.hypot(n[i] - n[i - 2], n[i + 1] - n[i - 1]);
    p.style.strokeDasharray = `${len + 0.01} ${len + 1}`;
    return { p, len: len + 0.01, x: Math.min(...n.filter((_, i) => i % 2 === 0)), y: n[1] };
  });
}
let ink: { hello: ReturnType<typeof pens>; main: ReturnType<typeof pens>; nb: ReturnType<typeof pens> } | null = null;
/** f = 0..1 of the group written, in writing order; a short pause for every pen lift */
function write(list: ReturnType<typeof pens>, f: number) {
  const LIFT = 1.2, sum = list.reduce((a, s) => a + s.len + LIFT, 0);
  let left = f * sum;
  for (const s of list) {
    const k = clamp((left - LIFT) / s.len);
    left -= s.len + LIFT;
    s.p.style.strokeDashoffset = String(s.len * (1 - k));
    s.p.style.visibility = k > 0 ? '' : 'hidden'; // a zero-length dash would still show a round cap
  }
}

function pointOf(tg: Target): [number, number] {
  if (typeof tg !== 'string') return tg();
  const r = stageEl!.querySelector(`[data-t="${tg}"]`)!.getBoundingClientRect(), s = stageRect();
  return [(r.left + r.width / 2 - s.left) / scale, (r.top + r.height / 2 - s.top) / scale];
}

/** The tap circle: glides from target to target, presses, and drags (eraser). Returns the element being pressed. */
function finger(taps: Tap[], lt: number) {
  const f = stageEl!.querySelector<HTMLElement>('.tv-finger')!, rip = stageEl!.querySelector<HTMLElement>('.tv-ripple')!;
  let pos: [number, number] = [0, 0], op = 0, down = false, pressed: string | null = null;
  let i = taps.length - 1;
  while (i >= 0 && taps[i][0] > lt) i--;
  if (still || !taps.length) { f.style.opacity = rip.style.opacity = '0'; return null; }
  if (i < 0) {
    const nx = taps[0], p = pointOf(nx[1]), q = clamp((lt - nx[0] + 900) / 800);
    pos = [p[0] + 40 * (1 - ease(q)), p[1] + 60 * (1 - ease(q))]; op = q;
  } else {
    const c = taps[i], end = c[0] + (c[3] ?? 0), endP = pointOf(c[2] ?? c[1]), nx = taps[i + 1];
    if (lt < end) { const a = pointOf(c[1]), q = (lt - c[0]) / c[3]!; pos = [a[0] + (endP[0] - a[0]) * q, a[1] + (endP[1] - a[1]) * q]; down = true; }
    else if (nx) {
      const from = Math.max(end + 250, nx[0] - 800), q = ease(clamp((lt - from) / Math.max(1, nx[0] - 100 - from))), b = pointOf(nx[1]);
      pos = [endP[0] + (b[0] - endP[0]) * q, endP[1] + (b[1] - endP[1]) * q];
    } else pos = endP;
    op = nx ? 1 : 1 - clamp((lt - end - 700) / 400);
    if (Math.abs(lt - c[0]) < 140) down = true;
    if (lt - c[0] < 260 && typeof c[1] === 'string') pressed = c[1];
    const r = clamp((lt - c[0]) / 550);
    rip.style.transform = `translate(${(c[2] ? pointOf(c[1]) : endP).map((v) => v - 22 + 'px').join(',')}) scale(${0.4 + r * 1.2})`;
    rip.style.opacity = String(0.55 * (1 - r));
  }
  f.style.transform = `translate(${pos[0] - 19}px, ${pos[1] - 19}px) scale(${down ? 0.82 : 1})`;
  f.style.opacity = String(op);
  return pressed;
}

const toggles: [Element, string][] = [];
function draw() {
  if (!stageEl || !ink) return;
  const cur = sceneAt(t), sc = SCENES[cur], lt = t - START[cur];
  // states: on while inside [from, to) of the current scene
  const want = new Set<string>();
  sc.on.forEach(([a, b, sel, cls = 'on']) => { if (lt >= a && lt < b) stageEl!.querySelectorAll(sel).forEach((el) => want.add(toggles.findIndex(([e, c]) => e === el && c === cls) + '')); });
  toggles.forEach(([el, cls], i) => el.classList.toggle(cls, want.has(i + '')));
  // ink: the short line in scene 1, the KI answer from scene 3 on
  write(ink.hello, cur === 0 ? clamp((lt - 3200) / 2600) : cur === 1 || (cur === 2 && lt < 2700) ? 1 : 0);
  write(ink.main, cur < 2 ? 0 : cur === 2 ? clamp((lt - 3300) / 7600) : 1);
  // the swapped Z (scene 5)
  const alt = cur === 4 && lt >= 5000 ? 0 : SWAP.cur;
  stageEl.querySelectorAll('.tv-main .alt').forEach((el, i) => (el as SVGElement).style.display = i === alt && alt !== SWAP.cur ? '' : 'none');
  ink.main.slice(SWAP.from, SWAP.to).forEach((s) => { if (alt !== SWAP.cur) s.p.style.visibility = 'hidden'; });
  // GoodNotes: everything there, the eraser takes "Zucker." away as it passes
  const ex = cur === 3 && lt >= 7200 ? 93 + 21 * clamp((lt - 7200) / 1900) : 0;
  ink.nb.forEach((s) => { s.p.style.visibility = ex && s.y > 31 && s.y < 40 && s.x >= 93.5 && s.x < ex ? 'hidden' : ''; });
  // typing the question
  const q = cur === 1 && lt >= 7400 && lt < 9700 ? QUESTION.slice(0, Math.round(QUESTION.length * clamp((lt - 7400) / 1900))) : '';
  const qe = stageEl.querySelector('.tv-in-q')!;
  if (qe.textContent !== q) qe.textContent = q;
  // finger and the button under it
  const pressed = finger(sc.taps, lt);
  stageEl.querySelectorAll('.tv-down').forEach((el) => el.getAttribute('data-t') !== pressed && el.classList.remove('tv-down'));
  if (pressed) stageEl.querySelector(`[data-t="${pressed}"]`)?.classList.add('tv-down');
  // subtitles, scene, progress
  const sub = still ? sc.subs.map((s) => s[1]).join(' ') : [...sc.subs].reverse().find((s) => s[0] <= lt)?.[1] ?? '';
  if ($('tourSub').textContent !== sub) $('tourSub').textContent = sub;
  $('tourScene').textContent = `${cur + 1} / ${SCENES.length} · ${sc.name}`;
  [...$('tourSeg').children].forEach((b, i) => {
    (b.firstElementChild as HTMLElement).style.width = `${100 * clamp((t - START[i]) / SCENES[i].dur)}%`;
    b.classList.toggle('on', i === cur);
  });
}

function tick(now: number) {
  if (playing) {
    t = Math.min(TOTAL, t + (now - last > 1000 ? 16 : now - last)); // back from a hidden tab: carry on, don't jump
    if (t >= TOTAL) setPlaying(false);
  }
  last = now;
  draw();
  if (playing) raf = requestAnimationFrame(tick);
}
const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>', PAUSE = '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  AGAIN = '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4.5h4.5"/></svg>';
function setPlaying(on: boolean) {
  if (on && t >= TOTAL) t = 0;
  playing = on;
  const b = $('tourPlay');
  b.innerHTML = on ? PAUSE : t >= TOTAL ? AGAIN : PLAY;
  b.setAttribute('aria-label', on ? 'Pause' : t >= TOTAL ? 'Nochmal ansehen' : 'Abspielen');
  cancelAnimationFrame(raf);
  last = performance.now();
  raf = requestAnimationFrame(tick);
}
/** jump without the in-between transitions */
function seek(to: number) {
  t = Math.max(0, Math.min(TOTAL, to));
  stageEl!.classList.add('jump');
  draw();
  void stageEl!.offsetWidth;
  stageEl!.classList.remove('jump');
  if (!playing) setPlaying(false);
}
const goScene = (i: number) => { const k = Math.max(0, Math.min(SCENES.length - 1, i)); seek(START[k] + (still ? SCENES[k].still : 0)); };

function fit() {
  const view = $('tourView'), sheet = view.closest('.sheet') as HTMLElement;
  const side = matchMedia('(min-width: 820px) and (max-height: 900px) and (orientation: landscape)').matches;
  const chrome = side ? sheet.querySelector('.sheet-head')!.getBoundingClientRect().height + 56 : sheet.getBoundingClientRect().height - view.getBoundingClientRect().height + 8;
  view.style.width = '';
  scale = Math.min(side ? Infinity : view.clientWidth / W, (innerHeight - 24 - chrome) / H, 1.5);
  if (side) view.style.width = `${Math.round(W * scale)}px`; // landscape: the stage sets the column, text and buttons sit beside it
  view.style.height = `${Math.round(H * scale)}px`;
  stageEl!.style.transform = `translateX(-50%) scale(${scale})`;
}

function build() {
  $('tourView').innerHTML = stage();
  stageEl = $('tourView').querySelector('.tv');
  // the marker is drawn under the writing, but in writing order it comes last
  stageEl!.querySelectorAll('.ink').forEach((g) => g.querySelectorAll('path.mk').forEach((p) => g.querySelector('.mks')?.append(p)));
  const main = stageEl!.querySelector('.tv-main .pen')!;
  SWAP.alts.forEach((a) => { const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', 'alt'); g.innerHTML = paths(a.map(([w, d]) => [0, w, d])); main.append(g); });
  ink = { hello: pens(stageEl!.querySelector('.tv-hello')!), main: pens(stageEl!.querySelector('.tv-main .pen')!).filter((s) => !s.p.closest('.alt')), nb: pens(stageEl!.querySelector('.tv-nb .pen')!) };
  ink.main.push(...pens(stageEl!.querySelector('.tv-main .mks')!)); // the marker last
  // "einpassen" makes the writing smaller but keeps the lines: every stroke shrinks towards its own baseline
  stageEl!.querySelectorAll<SVGPathElement>('.tv-main path').forEach((p) => {
    const y = Number(p.getAttribute('d')!.split(/[ L]/)[1]);
    p.style.transformOrigin = `8px ${18 + 10 * Math.max(0, Math.min(3, Math.round((y - 15) / 10)))}px`;
  });
  for (const sc of SCENES) for (const [, , sel, cls = 'on'] of sc.on) stageEl!.querySelectorAll(sel).forEach((el) => {
    if (!toggles.some(([e, c]) => e === el && c === cls)) toggles.push([el, cls]);
  });
  $('tourSeg').replaceChildren(...SCENES.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.flexGrow = String(s.dur);
    b.setAttribute('aria-label', `Teil ${i + 1}: ${s.name}`);
    b.append(document.createElement('i'));
    b.onclick = () => goScene(i);
    return b;
  }));
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closeTour();
  else if (e.key === 'ArrowRight') goScene(sceneAt(t) + 1);
  else if (e.key === 'ArrowLeft') goScene(sceneAt(t) - 1);
  else if (e.key === ' ' && !still && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); setPlaying(!playing); }
}

export function openTour() {
  opener = document.activeElement as HTMLElement | null;
  if (!stageEl) build();
  still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('tour').classList.toggle('still', still);
  $('tour').hidden = false;
  fit();
  addEventListener('resize', fit);
  addEventListener('keydown', onKey);
  t = 0;
  if (still) { seek(SCENES[0].still); $('tourNext').focus(); }
  else { seek(0); setPlaying(true); $('tourPlay').focus(); }
}

export function closeTour() {
  playing = false;
  cancelAnimationFrame(raf);
  $('tour').hidden = true;
  removeEventListener('resize', fit);
  removeEventListener('keydown', onKey);
  opener?.focus();
}

if (import.meta.env.DEV) Object.assign(window, { tourSeek: (ms: number) => { setPlaying(false); seek(ms); } });
$('tourClose').onclick = closeTour;
$('tour').onclick = (e) => { if (e.target === $('tour')) closeTour(); };
$('tourPlay').onclick = () => setPlaying(!playing);
$('tourView').onclick = () => { if (!still) setPlaying(!playing); };
$('tourPrev').onclick = () => goScene(sceneAt(t) - 1);
$('tourNext').onclick = () => { if (sceneAt(t) === SCENES.length - 1) closeTour(); else goScene(sceneAt(t) + 1); };
