import { MM, XH } from '../template/layout';
import type { Variant } from './types';

const xhPx = XH * MM;
// Characters whose ink should end on the baseline (no descenders).
const SITS = /^[a-eh-ik-orstuvwxzäöüA-IK-PR-ZÄÖÜ0-9.!?]+$/u;

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

/**
 * Clean up a handwriting set so text looks like normal writing:
 * - letters that float above or sink below the baseline are pulled most of the way back,
 * - variants far off in size are left out (at least two stay),
 * - the writer's own letter spacing is learned from the pairs that are not joined.
 */
export function optimize(vs: Variant[]): Tuned {
  const fixed = vs.map((v) => {
    if (!SITS.test(v.key)) return v;
    const { bottom } = inkRows(v);
    return bottom < 0 ? v : { ...v, baseline: v.baseline + 0.8 * (bottom - v.baseline) };
  });

  const excluded = new Set<string>();
  const byKey = new Map<string, Variant[]>();
  for (const v of fixed) byKey.set(v.key, [...(byKey.get(v.key) ?? []), v]);
  for (const group of byKey.values()) {
    if (group.length < 3) continue;
    const size = group.map((v) => ({ v, h: v.baseline - inkRows(v).top, w: v.w }));
    const mh = median(size.map((s) => s.h)), mw = median(size.map((s) => s.w));
    const off = size
      .map((s) => ({ v: s.v, d: Math.max(Math.abs(s.h / mh - 1) / 0.35, Math.abs(s.w / mw - 1) / 0.45) }))
      .filter((s) => s.d > 1)
      .sort((a, b) => b.d - a.d)
      .slice(0, group.length - 2);
    for (const s of off) excluded.add(s.v.src);
  }

  const gaps = fixed.filter((v) => [...v.key].length === 2 && v.connected === false).map(pairGap);
  const letterGap = gaps.length >= 5 ? Math.min(0.6, Math.max(0.05, median(gaps) / xhPx)) : null;
  return { variants: fixed.filter((v) => !excluded.has(v.src)), excluded, letterGap };
}
