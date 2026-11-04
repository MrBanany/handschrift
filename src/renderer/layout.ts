import { connectionModel, makeConnector, type Connector, type Library } from '../connectors/connect';
import type { Anchor, GlyphMeta } from '../glyphstore/types';
import { MM, XH } from '../template/layout';

export interface Settings {
  xh: number; // x-height on the page (mm)
  lineH: number; // line spacing (mm)
  margin: number; // mm
  pageW: number; pageH: number; // mm
  hasty: number; // 0 = tidy, 1 = hasty
  seed: number;
  letterGap?: number | null; // learned gap between letters (x-heights), see glyphstore/optimize
  wordGap?: number | null; // learned gap between words (x-heights), see segmentation/style
}

/** Canvas-order affine: x' = a x + c y + e, y' = b x + d y + f. Glyph px -> page mm. */
export type Mat = [number, number, number, number, number, number];
export interface Placed { g: GlyphMeta; m: Mat }
export interface Missing { ch: string; x: number; y: number; w: number; h: number }
export interface Page { glyphs: Placed[]; connectors: Connector[]; missing: Missing[] }

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tf = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const dir = (m: Mat, a: Anchor): [number, number] => {
  const x = m[0] * a.dx + m[2] * a.dy, y = m[1] * a.dx + m[3] * a.dy, l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
const scaleOf = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

/** Split a word into the largest available samples: whole word > trigram > pair > single letter. */
export function segment(word: string, lib: Library): string[] {
  const out: string[] = [];
  for (const run of word.match(/\p{L}+|[^\p{L}]/gu) ?? []) {
    const chars = [...run];
    if (chars.length > 1 && lib.has(run)) { out.push(run); continue; }
    for (let i = 0; i < chars.length;) {
      const len = [3, 2].find((n) => i + n <= chars.length && lib.has(chars.slice(i, i + n).join('')));
      if (len) { out.push(chars.slice(i, i + len).join('')); i += len; }
      else out.push(chars[i++]);
    }
  }
  return out;
}

interface WordItem { g: GlyphMeta; m: Mat; join: boolean }

/** Band centres of GlyphMeta.prof, relative to the baseline in glyph px (see segmentation/analyze profiles). */
export const BAND = (XH * MM) * 0.35;
export const BANDS = Array.from({ length: 10 }, (_, i) => -2.6 * XH * MM + (i + 0.5) * BAND);

export function profile(alpha: Uint8Array, w: number, h: number, baseline: number): NonNullable<GlyphMeta['prof']> {
  const l: (number | null)[] = BANDS.map(() => null), r: (number | null)[] = BANDS.map(() => null);
  for (let y = 0; y < h; y++) {
    const i = Math.floor((y - baseline + 2.6 * XH * MM) / BAND);
    if (i < 0 || i >= BANDS.length) continue;
    for (let x = 0; x < w; x++) if (alpha[y * w + x] >= 128) {
      l[i] = Math.min(l[i] ?? x, x);
      r[i] = Math.max(r[i] ?? x, x);
    }
  }
  return { l, r };
}

/**
 * Smallest x shift of the next glyph so its ink clears the previous glyph's ink band by band,
 * like real letters fitting together ("T" + "e" tucks under the bar). null when profiles are missing.
 */
function opticalShift(pg: GlyphMeta, pm: Mat, g: GlyphMeta, m: Mat): number | null {
  if (!pg.prof || !g.prof) return null;
  let need = -Infinity;
  pg.prof.r.forEach((R, i) => {
    if (R === null) return;
    const pr = pm[0] * R + pm[2] * (pg.baseline + BANDS[i]) + pm[4];
    for (let j = Math.max(0, i - 1); j <= Math.min(BANDS.length - 1, i + 1); j++) {
      const L = g.prof!.l[j];
      if (L !== null) need = Math.max(need, pr - (m[0] * L + m[2] * (g.baseline + BANDS[j]) + m[4]));
    }
  });
  return need === -Infinity ? null : need;
}

export function layout(text: string, lib: Library, s: Settings): { pages: Page[]; missing: Set<string> } {
  const rand = mulberry32(s.seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const h = s.hasty, sig = 0.6 + 1.4 * h, xh = s.xh;
  const s0 = xh / (XH * MM); // glyph px -> mm
  const pConnect = connectionModel(lib);
  const lastUsed = new Map<string, string>();
  const missingSet = new Set<string>();

  const pick = (key: string): GlyphMeta => {
    const all = lib.get(key)!;
    const prev = lastUsed.get(key);
    const pool = all.length > 1 ? all.filter((v) => v.src !== prev) : all; // never the same sample twice in a row
    const g = pool[Math.floor(rand() * pool.length)];
    lastUsed.set(key, g.src);
    return g;
  };

  function layoutWord(word: string) {
    const items: WordItem[] = [], missing: Missing[] = [];
    const wordSize = 1 + gauss() * 0.02 * sig, wordSlant = gauss() * 0.02 * sig + 0.06 * h;
    let cursor = 0, walk = gauss() * 0.04 * xh * sig;
    let prev: { g: GlyphMeta; m: Mat; right: number; last: string } | null = null;

    for (const key of segment(word, lib)) {
      if (!lib.has(key)) {
        const w = 0.7 * xh;
        missing.push({ ch: key, x: cursor + (prev ? 0.15 * xh : 0), y: -1.1 * xh, w, h: 1.4 * xh });
        missingSet.add(key);
        cursor += w + (prev ? 0.15 * xh : 0);
        prev = null;
        continue;
      }
      const g = pick(key);
      const k = s0 * (g.scale ?? 1) * wordSize * (1 + gauss() * 0.025 * sig);
      const sl = wordSlant + gauss() * 0.02 * sig;
      const rot = gauss() * 0.012 * sig;
      const cs = Math.cos(rot), sn = Math.sin(rot);
      // L = Rotate * Shear * Scale; shear leans the top to the right
      const a = cs * k, b = sn * k, c = (-sl * cs - sn) * k, d = (-sl * sn + cs) * k;
      walk = 0.55 * walk + gauss() * 0.03 * xh * sig;
      const base: Mat = [a, b, c, d, -c * g.baseline, -d * g.baseline];
      const xs = [[0, 0], [g.w, 0], [0, g.h], [g.w, g.h]].map(([x, y]) => tf(base, x, y)[0]);
      const left = Math.min(...xs), right = Math.max(...xs);

      const first = [...key][0];
      const join = !!(prev && prev.g.exit && g.entry && rand() < Math.min(1, pConnect(prev.last, first) * (1 + 0.25 * h)));
      let tx: number;
      if (join) {
        const ex = tf(prev!.m, prev!.g.exit!.x, prev!.g.exit!.y);
        const en = tf(base, g.entry!.x, g.entry!.y);
        const gap = Math.max(0.05 * xh, (0.18 - 0.05 * h) * xh * (1 + gauss() * 0.2 * sig)) + 0.25 * Math.abs(en[1] + walk - ex[1]);
        tx = Math.max(ex[0] + gap - en[0], prev!.right - 0.35 * xh - left);
      } else {
        const punct = !/\p{L}|\p{N}/u.test(first);
        const gap = prev ? Math.max(0.04 * xh, (0.16 - 0.06 * h) * xh * (punct ? 0.6 : 1) * (1 + gauss() * 0.25 * sig)) : 0;
        const tuck = prev ? opticalShift(prev.g, prev.m, g, base) : null;
        const own = prev && s.letterGap != null ? Math.max(0.03 * xh, s.letterGap * (1 - 0.3 * h) * xh * (punct ? 0.6 : 1) * (1 + gauss() * 0.2 * sig)) : gap;
        tx = tuck === null ? cursor + gap - left : Math.max(tuck + own, cursor - left - 0.6 * xh);
      }
      const m: Mat = [a, b, c, d, base[4] + tx, base[5] + walk];
      items.push({ g, m, join });
      cursor = Math.max(cursor, right + tx); // a letter tucked under the previous one must not shrink the word
      prev = { g, m, right: cursor, last: [...key].at(-1)! };
    }
    return { items, missing, width: cursor };
  }

  const pages: Page[] = [];
  let page: Page, y = 0, lineX = 0, lineStart = 0, slope = 0, amp = 0, phase = 0, lambda = 1;
  const newPage = () => { page = { glyphs: [], connectors: [], missing: [] }; pages.push(page); y = s.margin + s.lineH; };
  const newLine = (first = false) => {
    if (!first) y += s.lineH;
    if (first || y > s.pageH - s.margin) newPage();
    lineStart = lineX = s.margin + Math.abs(gauss()) * 0.4 * sig;
    slope = gauss() * 0.006 * sig;
    amp = 0.06 * xh * sig * rand();
    phase = rand() * 2 * Math.PI;
    lambda = 60 + 60 * rand();
  };
  const drift = (x: number) => slope * (x - lineStart) + amp * Math.sin((2 * Math.PI * x) / lambda + phase);

  newLine(true);
  text.split('\n').forEach((line, li) => {
    if (li > 0) newLine();
    for (const word of line.split(/\s+/).filter(Boolean)) {
      const wd = layoutWord(word);
      if (lineX > lineStart && lineX + wd.width > s.pageW - s.margin) newLine();
      let prevM: Mat | null = null, prevG: GlyphMeta | null = null;
      for (const it of wd.items) {
        const m: Mat = [...it.m];
        m[4] += lineX;
        m[5] += y + drift(m[4]);
        if (it.join && prevM && prevG) {
          page!.connectors.push(makeConnector(
            tf(prevM, prevG.exit!.x, prevG.exit!.y), dir(prevM, prevG.exit!),
            tf(m, it.g.entry!.x, it.g.entry!.y), dir(m, it.g.entry!),
            prevG.exit!.w * scaleOf(prevM), it.g.entry!.w * scaleOf(m), xh,
          ));
        }
        page!.glyphs.push({ g: it.g, m });
        prevM = m; prevG = it.g;
      }
      for (const ms of wd.missing) page!.missing.push({ ...ms, x: ms.x + lineX, y: ms.y + y + drift(ms.x + lineX) });
      lineX += wd.width + Math.max(0.6 * xh, ((s.wordGap ?? 0.95) - 0.15 * h) * xh * (1 + gauss() * 0.1 * sig));
    }
  });
  return { pages, missing: missingSet };
}
