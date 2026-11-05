import { describe, expect, it } from 'vitest';
import { molecule } from '../src/renderer/structure';

describe('molecule', () => {
  it('draws ethanol as full structural formula with every H', () => {
    const m = molecule('Ethanol')!;
    const count = (l: string) => m.atoms.filter((a) => a.label === l).length;
    expect(count('C')).toBe(2);
    expect(count('O')).toBe(1);
    expect(count('H')).toBe(6);
    expect(m.bonds.length).toBe(8);
  });

  it('draws benzene as skeletal formula with a ring', () => {
    const m = molecule('Benzol')!;
    expect(m.atoms.every((a) => a.label === '')).toBe(true);
    expect(m.bonds.length).toBe(6);
    expect(m.rings.length).toBe(1);
  });

  it('takes SMILES and labels groups', () => {
    const m = molecule('CC(=O)O')!;
    expect(m.atoms.map((a) => a.label).filter(Boolean).sort()).toEqual(expect.arrayContaining(['O']));
    expect(m.bonds.some((b) => b.order === 2)).toBe(true);
    expect(molecule('CC(=O)O skelett')!.atoms.some((a) => /OH|HO/.test(a.label))).toBe(true);
  });

  it('writes ethyne and CO2 straight and level', () => {
    for (const name of ['Ethin', 'Kohlenstoffdioxid']) {
      const ys = molecule(name)!.atoms.map((a) => a.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.05);
    }
  });

  it('returns null for nonsense', () => {
    expect(molecule('Hallo Welt')).toBeNull();
  });
});
