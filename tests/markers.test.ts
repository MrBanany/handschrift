import { describe, expect, it } from 'vitest';
import { clean } from '../src/renderer/clean';
import * as M from '../src/renderer/markers';
import { checkMarkers } from '../src/renderer/markers';
import { decodeMap } from '../src/renderer/mindmap';

const has = () => true;
const mapOf = (text: string) => decodeMap(clean(text, has).split('\n').find((l) => l.startsWith(M.MAP[0]))!)!;

describe('markers', () => {
  it('has no code twice, and every one is in the allowed ranges', () => {
    const all = Object.values(M).flatMap((v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v : v && typeof v === 'object' && !(v instanceof RegExp) ? Object.values(v) : []));
    expect(all.length).toBeGreaterThanOrEqual(26);
    expect(new Set(all).size).toBe(all.length);
    expect(() => checkMarkers()).not.toThrow();
  });

  it('checkMarkers catches a duplicate and a code outside the ranges', () => {
    expect(() => checkMarkers({ a: '\u0002', b: '\u0002' })).toThrow(/both/);
    expect(() => checkMarkers({ a: 'x' })).toThrow(/outside/);
    expect(() => checkMarkers({ a: '' })).toThrow(/outside/); // U+E000+ belongs to the lowered letters
  });

  it('a mind map keeps an arrow with a label and x^{n+1} in a branch', () => {
    const t = mapOf(String.raw`Mindmap: Reaktion
- $\ce{A ->[Kat] B}$
  - x^{n+1} und H_{2}O
- C`);
    expect(t.branches[0].title).toBe('A → (Kat) B');
    expect(t.branches[0].items[0]).toContain('x');
    expect(t.branches[0].items[0]).not.toMatch(/[{}]/);
    expect(t.branches[1].title).toBe('C');
    expect(t.topic).toBe('Reaktion');
  });

  it('control characters in the input are dropped, not read as markers', () => {
    expect(clean('ein \u0002Wort\u0003 hier', has)).toBe('ein Wort hier');
    expect(clean('a\u0006b\u0019c\u001Ad\uF700e\uF710f', has)).toBe('abcdef');
    expect(clean('a\tb\nc', has)).toBe('a\tb\nc');
    expect(clean('ein **Wort** hier', has)).toBe(`ein ${M.EMPH[0]}Wort${M.EMPH[1]} hier`); // our own markers still appear
  });
});
