import SmilesDrawer from 'smiles-drawer';
import { SUB, SUP } from './clean';

/** Atom in bond lengths (y down); label '' = a carbon corner without letters. dir: which way the H's are written. */
export interface MolAtom { x: number; y: number; label: string; element: string; dir: 'left' | 'right' | 'up' | 'down'; lone?: number[] }
/** order 1–3; inner: for a double bond in a ring, the ring centre the second line moves towards. */
export interface MolBond { a: number; b: number; order: number; inner?: { x: number; y: number } }
export interface Molecule { atoms: MolAtom[]; bonds: MolBond[]; rings: { x: number; y: number; r: number }[] }

// Common school molecules (German names) -> SMILES.
const NAMES: Record<string, string> = {
  wasser: 'O', ammoniak: 'N', kohlenstoffdioxid: 'O=C=O', methan: 'C', ethan: 'CC', propan: 'CCC', butan: 'CCCC', pentan: 'CCCCC',
  hexan: 'CCCCCC', heptan: 'CCCCCCC', octan: 'CCCCCCCC', ethen: 'C=C', propen: 'C=CC', 'but-1-en': 'C=CCC', ethin: 'C#C',
  cyclohexan: 'C1CCCCC1', methanol: 'CO', ethanol: 'CCO', propanol: 'CCCO', 'propan-1-ol': 'CCCO', 'propan-2-ol': 'CC(O)C',
  butanol: 'CCCCO', 'ethan-1,2-diol': 'OCCO', glykol: 'OCCO', glycerin: 'OCC(O)CO', methanal: 'C=O', formaldehyd: 'C=O',
  ethanal: 'CC=O', acetaldehyd: 'CC=O', propanon: 'CC(C)=O', aceton: 'CC(C)=O', methansäure: 'OC=O', ameisensäure: 'OC=O',
  ethansäure: 'CC(=O)O', essigsäure: 'CC(=O)O', propansäure: 'CCC(=O)O', butansäure: 'CCCC(=O)O', buttersäure: 'CCCC(=O)O',
  milchsäure: 'CC(O)C(=O)O', oxalsäure: 'OC(=O)C(=O)O', citronensäure: 'OC(=O)CC(O)(CC(=O)O)C(=O)O',
  essigsäureethylester: 'CCOC(C)=O', ethylacetat: 'CCOC(C)=O', ethansäureethylester: 'CCOC(C)=O',
  harnstoff: 'NC(N)=O', glycin: 'NCC(=O)O', alanin: 'CC(N)C(=O)O', chlormethan: 'CCl', dichlormethan: 'ClCCl', chloroform: 'ClC(Cl)Cl',
  trichlormethan: 'ClC(Cl)Cl', benzol: 'c1ccccc1', phenol: 'Oc1ccccc1', toluol: 'Cc1ccccc1', benzoesäure: 'OC(=O)c1ccccc1',
  glucose: 'OCC1OC(O)C(O)C(O)C1O', 'glucose offen': 'O=CC(O)C(O)C(O)C(O)CO', fructose: 'OCC1(O)OCC(O)C(O)C1O',
  sauerstoff: 'O=O', wasserstoff: '[H][H]', stickstoff: 'N#N', chlor: 'ClCl', fluor: 'FF', brom: 'BrBr', iod: 'II', ozon: '[O-][O+]=O',
  kohlenstoffmonooxid: '[C-]#[O+]', kohlenstoffmonoxid: '[C-]#[O+]', chlorwasserstoff: 'Cl', salzsäure: 'Cl', fluorwasserstoff: 'F',
  schwefelwasserstoff: 'S', schwefeldioxid: 'O=S=O', schwefelsäure: 'OS(=O)(=O)O', schweflige: 'OS(=O)O', salpetersäure: 'O[N+](=O)[O-]',
  kohlensäure: 'OC(=O)O', phosphorsäure: 'OP(=O)(O)O', hydroxid: '[OH-]', 'hydroxid-ion': '[OH-]', oxonium: '[OH3+]', 'oxonium-ion': '[OH3+]',
  ammonium: '[NH4+]', 'ammonium-ion': '[NH4+]', carbonat: '[O-]C([O-])=O', 'carbonat-ion': '[O-]C([O-])=O', hydrogencarbonat: 'OC([O-])=O',
  sulfat: '[O-]S(=O)(=O)[O-]', 'sulfat-ion': '[O-]S(=O)(=O)[O-]', nitrat: '[O-][N+](=O)[O-]', 'nitrat-ion': '[O-][N+](=O)[O-]', acetat: 'CC([O-])=O',
  methylamin: 'CN', ethylamin: 'CCN', propin: 'CC#C', 'but-2-en': 'CC=CC', cyclohexen: 'C1CC=CCC1', anilin: 'Nc1ccccc1', nitrobenzol: '[O-][N+](=O)c1ccccc1',
  styrol: 'C=Cc1ccccc1', naphthalin: 'c1ccc2ccccc2c1', isopren: 'CC(=C)C=C', ethanolat: 'CC[O-]', methanolat: 'C[O-]',
  coffein: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', aspirin: 'CC(=O)Oc1ccccc1C(=O)O', acetylsalicylsäure: 'CC(=O)Oc1ccccc1C(=O)O',
};

// Valence electrons, for the free electron pairs in the valence-stroke formula.
const VALENCE: Record<string, number> = { N: 5, P: 5, O: 6, S: 6, F: 7, Cl: 7, Br: 7, I: 7 };

interface Raw { atoms: MolAtom[]; bonds: MolBond[]; rings: Molecule['rings']; implicitH: number[]; heavy: number }

function draw(smiles: string, full: boolean): Raw | null {
  let out: Raw | null = null;
  SmilesDrawer.parse(smiles, (tree) => {
    try {
      // The SVG drawer's preprocessor computes the 2-D layout without touching the DOM.
      const p = new (SmilesDrawer as unknown as { SvgDrawer: new (o: object) => { preprocessor: Pre } }).SvgDrawer({}).preprocessor;
      p.initDraw(tree, 'light', true, []);
      p.processGraph();
      const vs = p.graph.vertices, L = p.opts.bondLength;
      const ringOf = new Map(p.rings.map((r) => [r.id, r]));
      out = {
        heavy: vs.filter((v) => v.value.element !== 'H').length,
        implicitH: vs.map((v) => v.value.countImplicitHydrogens()),
        rings: p.rings.filter((r) => r.members.every((m) => vs[m].value.isPartOfAromaticRing))
          .map((r) => ({ x: r.center.x / L, y: r.center.y / L, r: 0.55 })),
        atoms: vs.map((v, i) => {
          const el = v.value.element, n = v.value.countImplicitHydrogens(), dir = v.getTextDirection(vs);
          const c = Number(v.value.bracket?.charge) || 0;
          const hs = n ? `H${n > 1 ? SUB[n] : ''}` : '';
          const q = c ? (Math.abs(c) > 1 ? SUP[Math.abs(c)] : '') + (c > 0 ? '⁺' : '⁻') : '';
          const shown = el !== 'C' || full || vs.length < 3 || !!c;
          const at = { x: v.position.x / L, y: v.position.y / L, element: el, dir, label: shown ? (dir === 'left' ? hs + el + q : el + hs + q) : '' };
          // Valence-stroke formula: free electron pairs as short dashes in the widest gaps between the bonds
          const ve = VALENCE[el];
          if (!full || !ve) return at;
          const nb = p.graph.edges.filter((e) => e.sourceId === i || e.targetId === i);
          const used = nb.reduce((s, e) => s + (e.bondType === '=' ? 2 : e.bondType === '#' ? 3 : 1), 0) + n;
          const angles = nb.map((e) => { const o = vs[e.sourceId === i ? e.targetId : e.sourceId].position; return Math.atan2(o.y - v.position.y, o.x - v.position.x); });
          const lone: number[] = [];
          for (let k = Math.max(0, Math.floor((ve - used - c) / 2)); k > 0; k--) {
            const all = [...angles, ...lone].sort((a, b) => a - b);
            if (!all.length) { lone.push(-Math.PI / 2); continue; }
            let best = 0, at0 = 0;
            all.forEach((a, j) => { const g = (j + 1 < all.length ? all[j + 1] : all[0] + 2 * Math.PI) - a; if (g > best) { best = g; at0 = a + g / 2; } });
            lone.push(Math.atan2(Math.sin(at0), Math.cos(at0)));
          }
          return { ...at, lone };
        }),
        bonds: p.graph.edges.map((e) => {
          const order = e.bondType === '=' ? 2 : e.bondType === '#' ? 3 : 1;
          const shared = vs[e.sourceId].value.rings.find((id) => vs[e.targetId].value.rings.includes(id));
          const r = shared === undefined ? undefined : ringOf.get(shared);
          return { a: e.sourceId, b: e.targetId, order, inner: order === 2 && r ? { x: r.center.x / L, y: r.center.y / L } : undefined };
        }),
      };
    } catch { out = null; }
  }, () => { out = null; });
  return out;
}

/** The SMILES with every implicit hydrogen written out, so the full structural formula shows each H. */
function withHydrogens(smiles: string, counts: number[]): string {
  let i = 0;
  // before a triple bond the first H goes in front: "[H]C#C[H]" comes out straight, "C([H])#C[H]" bent
  return smiles.replace(/(\[[^\]]*\]|Br|Cl|[BCNOSPFIbcnosp])((?:[-=#$:/\\]?(?:\d|%\d\d))*)/g, (m, _a, _r, at: number) => {
    const n = counts[i++] ?? 0, triple = smiles[at + m.length] === '#';
    const a = m.replace(/^\[(\d*(?:[A-Z][a-z]?|[cnops]))H\d*/, '[$1'); // [NH4+] -> [N+] plus four written-out H
    return n && triple ? '[H]' + a + '([H])'.repeat(n - 1) : a + '([H])'.repeat(n);
  });
}

/** Turns an elongated molecule so its long side lies along the line, like one writes it (O=C=O not slanted). */
function level(m: Molecule): Molecule {
  const n = m.atoms.length, cx = m.atoms.reduce((s, a) => s + a.x, 0) / n, cy = m.atoms.reduce((s, a) => s + a.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const a of m.atoms) { sxx += (a.x - cx) ** 2; syy += (a.y - cy) ** 2; sxy += (a.x - cx) * (a.y - cy); }
  const t = 0.5 * Math.atan2(2 * sxy, sxx - syy), d = Math.hypot(sxx - syy, 2 * sxy), tr = sxx + syy;
  if (n < 2 || tr - d > 0.33 * (tr + d) || Math.abs(t) < 0.05) return m; // roundish (rings) or already level
  const c = Math.cos(-t), s = Math.sin(-t);
  const rot = <P extends { x: number; y: number }>(p: P): P => ({ ...p, x: cx + c * (p.x - cx) - s * (p.y - cy), y: cy + s * (p.x - cx) + c * (p.y - cy) });
  return { atoms: m.atoms.map((a) => ({ ...rot(a), lone: a.lone?.map((l) => l - t) })), bonds: m.bonds.map((b) => (b.inner ? { ...b, inner: rot(b.inner) } : b)), rings: m.rings.map(rot) };
}

const cache = new Map<string, Molecule | null>();

/**
 * "[[Ethanol]]", "[[CCO]]", "[[Benzol]]": a German name from the list or SMILES. Small chains come as full structural
 * formula with every H, rings and bigger molecules as skeletal formula; " voll" or " skelett" at the end chooses.
 */
export function molecule(spec: string): Molecule | null {
  if (cache.has(spec)) return cache.get(spec)!;
  const m = /\s+(voll|skelett)$/i.exec(spec.trim());
  const name = (m ? spec.trim().slice(0, m.index) : spec.trim());
  const smiles = NAMES[name.toLowerCase()] ?? name;
  let res: Molecule | null = null;
  if (/^[A-Za-z0-9@+\-[\]()=#$:/\\%.]+$/.test(smiles)) {
    const skel = draw(smiles, false);
    if (skel) {
      const full = m ? m[1].toLowerCase() === 'voll' : !skel.rings.length && !skel.atoms.some((_, i) => skel.bonds.filter((b) => b.a === i || b.b === i).length > 4) && skel.heavy <= 8 && !/\d/.test(smiles.replace(/\[[^\]]*\]/g, '')); // ring digits, not [NH4+]
      const r = full ? draw(withHydrogens(smiles, skel.implicitH), true) ?? skel : skel;
      res = level({ atoms: r.atoms, bonds: r.bonds, rings: r.rings });
    }
  }
  cache.set(spec, res);
  return res;
}

// The bits of smiles-drawer's preprocessor used here (it ships no types for it).
interface Pre {
  opts: { bondLength: number };
  initDraw(tree: unknown, theme: string, infoOnly: boolean, highlight: unknown[]): void;
  processGraph(): void;
  graph: {
    vertices: { position: { x: number; y: number }; value: { element: string; bracket: { charge?: number } | null; rings: number[]; isPartOfAromaticRing: boolean; countImplicitHydrogens(): number }; getTextDirection(vs: unknown[]): MolAtom['dir'] }[];
    edges: { sourceId: number; targetId: number; bondType: string }[];
  };
  rings: { id: number; members: number[]; center: { x: number; y: number } }[];
}
