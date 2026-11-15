import { afterEach, describe, expect, it, vi } from 'vitest';
import { count, countExport } from '../src/count';

const g = globalThis as { goatcounter?: unknown };
afterEach(() => { delete g.goatcounter; });

describe('usage counter', () => {
  it('does nothing and does not throw without GoatCounter (not set up, offline, blocked)', () => {
    expect(() => { count('x', 'X'); countExport('pdf', 3); }).not.toThrow();
    g.goatcounter = {};
    expect(() => count('x', 'X')).not.toThrow();
  });
  it('does not throw when GoatCounter itself fails', () => {
    g.goatcounter = { count: () => { throw new Error('boom'); } };
    expect(() => count('x', 'X')).not.toThrow();
  });
  it('sends events with a path, a German title and nothing else', () => {
    const fn = vi.fn();
    g.goatcounter = { count: fn };
    countExport('goodnotes', 3);
    expect(fn.mock.calls.map((c) => c[0])).toEqual([
      { path: 'export-goodnotes', title: 'Export: GoodNotes', event: true },
      { path: 'export-seiten-3', title: 'Export: 3 Seiten', event: true },
      { path: 'text-erzeugt', title: 'Text in Handschrift erzeugt', event: true },
    ]);
    fn.mockClear();
    countExport('bild', 12);
    expect(fn.mock.calls[1][0]).toMatchObject({ path: 'export-seiten-10-und-mehr' });
  });
});
