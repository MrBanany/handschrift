// Formulas in AI answers (LaTeX, mhchem) -> plain characters a handwriting can write.

const SYMBOL: Record<string, string> = {
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', approx: '≈', sim: '~', neq: '≠', ne: '≠', leq: '≤', le: '≤', geq: '≥', ge: '≥',
  infty: '∞', pi: 'π', Delta: 'Δ', delta: 'δ', alpha: 'α', beta: 'β', gamma: 'γ', lambda: 'λ', mu: 'μ', rho: 'ρ', sigma: 'σ',
  Sigma: 'Σ', omega: 'ω', Omega: 'Ω', theta: 'θ', varphi: 'φ', phi: 'φ', degree: '°', circ: '°', percent: '%',
  to: '→', rightarrow: '→', longrightarrow: '→', leftarrow: '←', Rightarrow: '⇒', implies: '⇒', Leftrightarrow: '⇔', iff: '⇔',
  leftrightarrow: '↔', rightleftharpoons: '⇌', uparrow: '↑', downarrow: '↓', cdots: '...', ldots: '...', dots: '...',
};

// Element symbols, so "H2O" or "C6H12O6" get subscripts but "A4" or "MP3" do not.
const ELEMENTS = new Set(('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr '
  + 'Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi '
  + 'Po At Rn Fr Ra Ac Th Pa U Np Pu').split(' '));

const group = (x: string) => (/^[\p{L}\p{N}.,²³]+$/u.test(x) ? x : `(${x})`);

/** Stacked fraction: FRAC[0] numerator FRAC[1] denominator FRAC[2]; the layout writes it over a fraction bar. */
export const FRAC = ['\u0011', '\u0012', '\u0013'] as const;
/** Stacked fractions inside x back to a/b (a fraction inside a fraction or a root stays on one line). */
export const flatFrac = (x: string) => x.replace(/\u0011([^\u0012]*)\u0012([^\u0013]*)\u0013/g, (_, a: string, b: string) => `${group(a.trim())}/${group(b.trim())}`);

/** A chemical formula written with plain digits ("H2SO4", "Ca(OH)2") -> the same with _n subscript markup. */
export function chem(word: string): string {
  const [, n, f] = /^(\d*)(.*)$/s.exec(word)!; // "6CO2": 6 molecules of CO2
  if (!/\d/.test(f) || !/^(?:[A-Z][a-z]?\d*|\(|\)\d*)+$/.test(f)) return word;
  const parts = f.match(/[A-Z][a-z]?/g) ?? [];
  if (!parts.every((p) => ELEMENTS.has(p))) return word;
  if (parts.length < 2 && !/^(?:H|N|O|F|Cl|Br|I)[23]$/.test(f)) return word; // H2, O2, O3 – but not "F1" or "B2"
  return n + f.replace(/([A-Za-z)])(\d+)/g, '$1_$2');
}

/** mhchem species with charge: "Na+", "Ca2+", "SO4^2-", "SO4^{2-}" -> formula with ^{charge}. */
function ion(tok: string): string {
  const m = /^(.+)\^\{?(\d*[+-])\}?$/.exec(tok) ?? /^(.*[A-Za-z)\]])(\d*[+-])$/.exec(tok);
  return m ? `${chem(m[1])}^{${m[2]}}` : chem(tok);
}

export function latex(text: string): string {
  let t = text
    .replace(/\$\$|\\\[|\\\]|\\\(|\\\)/g, ' ')
    .replace(/\\ce\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_, f: string) => f.replace(/<=>/g, '⇌').replace(/->/g, '→').split(/(\s+)/).map(ion).join(''))
    .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\{([^{}]*)\}/g, '$1')
    .replace(/\^\{?\\circ\}?/g, '°') // 90^\circ
    .replace(/\\(?:left|right)(?![A-Za-z])/g, '') // \left( … \right), not \rightarrow
    .replace(/\\[,;:! ]/g, ' ');
  // Innermost first, so nested fractions and roots come out right.
  for (let prev = ''; prev !== t;) {
    prev = t;
    t = t
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) => FRAC[0] + flatFrac(a) + FRAC[1] + flatFrac(b) + FRAC[2])
      .replace(/\\sqrt\{([^{}]*)\}/g, (_, a: string) => `√${group(flatFrac(a))}`);
  }
  return t
    .replace(/\\([A-Za-z]+)/g, (m, name: string) => SYMBOL[name] ?? name) // \sin -> sin
    .replace(/\^\{([^{}0-9][^{}]*)\}/g, '^$1')
    .replace(/_\{([^{}0-9][^{}]*)\}/g, '_$1')
    .replace(/(^|[\s(])(\d*(?:[A-Z][a-z]?\d*|\(|\)\d*)+)(?=[\s.,;:)+]|$)/gm, (m, pre: string, f: string) => pre + chem(f));
}
