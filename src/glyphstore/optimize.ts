import { MM, XH } from '../template/layout';
import type { Variant } from './types';

const xhPx = XH * MM;
// Characters whose ink should end on the baseline (no descenders).
const SITS = /^[a-eh-ik-orstuvwxzäöüA-IK-PR-ZÄÖÜ0-9.!?]+$/u;
// Ink exactly one x-height tall (no ascenders, descenders or dots): their heights should match each other.
const XLET = /^[acemnorsuvwxz]+$/u;

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };

function inkRows(v: Variant) {
  let top = v.h, bottom = -1;
  for (let y = 0; y < v.h; y++) for (let x = 0; x < v.w; x++) if (v.alpha[y * v.w + x] >= 128) { top = Math.min(top, y); bottom = y; break; }
  return { top, bottom };
}

/** Gap (px) between the two letters of a non-joined pair: longest run of empty columns in the middle. */
export function pairGap(v: Variant): number {
  const used = Array.from({ length: v.w }, (_, x) => { for (let y = 0; y < v.h; y++) if (v.alpha[y * v.w + x] >= 128) return true; return false; });
  let best = 0, run = 0;
  for (let x = 0; x < v.w; x++) {
    run = used[x] ? 0 : run + 1;
    const start = x - run + 1;
    if (run > best && start > 0.2 * v.w && x < 0.8 * v.w) best = run;
  }
  return best;
}

export interface Tuned { variants: Variant[]; excluded: Set<string>; letterGap: number | null }

/** Default gap between unjoined letters (x-heights) when nothing was learned. */
export const DEFAULT_LETTER_GAP = 0.16;

/**
 * Clean up a handwriting set so text looks like normal writing. strength 0 = untouched, 1 = full,
 * up to 1.5 = strong (only used after the writer approved it per character):
 * - letters that float above or sink below the baseline are pulled back to it,
 * - variants of one character are evened out in size; far-off ones are left out (at least two stay),
 * - small letters (a, e, n, o …) are brought to one common height, so words don't look bumpy,
 * - the writer's own letter spacing is learned from the pairs that are not joined.
 */
export function optimize(vs: Variant[], strength = 1): Tuned {
  const s = Math.max(0, Math.min(1.5, strength)), full = Math.min(1, s);
  if (s === 0) return { variants: vs, excluded: new Set(), letterGap: null };
  const fixed = vs.map((v) => {
    if (!SITS.test(v.key)) return v;
    const { bottom } = inkRows(v);
    return bottom < 0 ? v : { ...v, baseline: v.baseline + full * (bottom - v.baseline) };
  });

  const excluded = new Set<string>();
  const byKey = new Map<string, Variant[]>();
  for (const v of fixed) byKey.set(v.key, [...(byKey.get(v.key) ?? []), v]);
  const sizes = new Map([...byKey].map(([key, group]) => [key, group.map((v) => ({ v, h: v.baseline - inkRows(v).top, w: v.w }))]));
  const keyH = new Map([...sizes].map(([key, size]) => [key, median(size.map((x) => x.h))]));
  const xHeights = [...keyH].filter(([k, h]) => XLET.test(k) && h > 0).map(([, h]) => h);
  const common = xHeights.length >= 3 ? median(xHeights) : NaN;

  const scaled = new Map<string, number>();
  for (const [key, size] of sizes) {
    const group = byKey.get(key)!;
    const mh = keyH.get(key)!, mw = median(size.map((x) => x.w));
    const toCommon = XLET.test(key) && common > 0 && mh > 0 ? 1 + (common / mh - 1) * 0.6 * s : 1;
    for (const x of size) {
      const k = (group.length >= 2 && x.h > 0 ? 1 + (mh / x.h - 1) * 0.6 * s : 1) * toCommon;
      scaled.set(x.v.src, k);
    }
    if (group.length < 3) continue;
    const limit = 1.6 - 0.6 * s; // gentle settings only drop extreme outliers
    const off = size
      .map((x) => ({ v: x.v, d: Math.max(Math.abs(x.h / mh - 1) / 0.35, Math.abs(x.w / mw - 1) / 0.45) }))
      .filter((x) => x.d > limit)
      .sort((a, b) => b.d - a.d)
      .slice(0, group.length - 2);
    for (const x of off) excluded.add(x.v.src);
  }

  const gapOf = new Map(fixed.filter((v) => [...v.key].length === 2 && v.connected === false).map((v) => [v.src, pairGap(v)]));
  const gaps = [...gapOf.values()];
  // A pair written far apart reads like two words in a sentence; without it the single letters are set with the usual gap.
  if (gaps.length >= 5) {
    const maxGap = Math.max(0.45 * xhPx, 2.5 * median(gaps)) * (1.6 - 0.6 * s);
    for (const [src, g] of gapOf) if (g > maxGap) excluded.add(src);
  }
  const learned = gaps.length >= 5 ? Math.min(0.6, Math.max(0.05, median(gaps) / xhPx)) : null;
  return {
    variants: fixed.filter((v) => !excluded.has(v.src)).map((v) => (scaled.has(v.src) ? { ...v, scale: scaled.get(v.src) } : v)),
    excluded,
    letterGap: learned === null ? null : DEFAULT_LETTER_GAP + (learned - DEFAULT_LETTER_GAP) * full,
  };
}

export type Decision = 'accept' | 'reject';

/** Characters where the strong pass visibly changes something, biggest change first, to be reviewed side by side. */
export function reviewKeys(raw: Variant[], strong: Tuned): string[] {
  const t = new Map(strong.variants.map((v) => [v.src, v]));
  const impact = new Map<string, number>();
  for (const v of raw) {
    const s = t.get(v.src);
    // Shift in x-heights or relative size change; a dropped variant counts most.
    const d = s ? Math.max(Math.abs(s.baseline - v.baseline) / xhPx, Math.abs((s.scale ?? 1) - 1)) : 1;
    if (d > 0.04) impact.set(v.key, Math.max(impact.get(v.key) ?? 0, d));
  }
  return [...impact.keys()].sort((a, b) => impact.get(b)! - impact.get(a)!);
}

/** Per character: approved → strong, rejected → original, not reviewed → automatic. */
export function merge(raw: Variant[], auto: Tuned, strong: Tuned, decisions: Record<string, Decision>): Tuned {
  const maps = new Map([auto, strong].map((t) => [t, new Map(t.variants.map((v) => [v.src, v]))]));
  const pick = (key: string) => (decisions[key] === 'accept' ? strong : decisions[key] === 'reject' ? null : auto);
  const variants: Variant[] = [], excluded = new Set<string>();
  for (const v of raw) {
    const t = pick(v.key);
    if (!t) variants.push(v);
    else if (t.excluded.has(v.src)) excluded.add(v.src);
    else variants.push(maps.get(t)!.get(v.src) ?? v);
  }
  return { variants, excluded, letterGap: auto.letterGap };
}
