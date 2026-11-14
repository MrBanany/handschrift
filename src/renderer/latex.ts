// Formulas in AI answers (LaTeX, mhchem) -> plain characters a handwriting can write.
import { BOX, FRAC, LABEL, LIT_BRACE, SP, TEX_BRACE } from './markers';

export { BOX, FRAC } from './markers'; // the codes live in markers.ts

const SYMBOL: Record<string, string> = {
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', approx: '≈', sim: '~', neq: '≠', ne: '≠', leq: '≤', le: '≤', geq: '≥', ge: '≥',
  infty: '∞', int: '∫', sum: 'Σ', pi: 'π', Delta: 'Δ', delta: 'δ', alpha: 'α', beta: 'β', gamma: 'γ', lambda: 'λ', mu: 'μ', rho: 'ρ', sigma: 'σ',
  Sigma: 'Σ', omega: 'ω', Omega: 'Ω', theta: 'θ', varphi: 'φ', phi: 'φ', degree: '°', circ: '°', percent: '%',
  to: '→', rightarrow: '→', longrightarrow: '⟶', Longrightarrow: '⟹', leftarrow: '←', Rightarrow: '⇒', implies: '⇒', Leftrightarrow: '⇔', iff: '⇔',
  cap: '∩', cup: '∪', subset: '⊂', in: '∈', forall: '∀', exists: '∃', equiv: '≡', perp: '⊥', emptyset: '∅', varnothing: '∅', epsilon: 'ε', varepsilon: 'ε', tau: 'τ', eta: 'η', nu: 'ν', kappa: 'κ',
  displaystyle: '', textstyle: '', limits: '', nolimits: '', big: '', Big: '', bigl: '', bigr: '', Bigl: '', Bigr: '',
  Longleftrightarrow: '⇔', longleftrightarrow: '↔', longleftarrow: '←', geqslant: '≥', leqslant: '≤', iint: '∫∫', oint: '∫',
  checkmark: '✓', mapsto: '→', lbrace: '{', rbrace: '}', hline: '', therefore: '∴', because: '∵', angle: '∠', partial: '∂', nabla: '∇', psi: 'ψ', chi: 'χ', xi: 'ξ', zeta: 'ζ', triangle: 'Δ', parallel: '||',
  prime: "'", quad: ' ', qquad: ' ', mid: '|', ll: '<<', gg: '>>', propto: '~', land: '∧', lor: '∨', neg: '¬', cdotp: '·', ast: '*', colon: ':',
  leftrightarrow: '↔', rightleftharpoons: '⇌', uparrow: '↑', downarrow: '↓', cdots: '...', ldots: '...', dots: '...',
};

// Element symbols, so "H2O" or "C6H12O6" get subscripts but "A4" or "MP3" do not.
const ELEMENTS = new Set(('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr '
  + 'Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi '
  + 'Po At Rn Fr Ra Ac Th Pa U Np Pu').split(' '));

/** Unicode fractions -> numerator, denominator. */
const VULGAR: Record<string, [string, string]> = {
  '½': ['1', '2'], '¼': ['1', '4'], '¾': ['3', '4'], '⅓': ['1', '3'], '⅔': ['2', '3'], '⅕': ['1', '5'], '⅖': ['2', '5'], '⅗': ['3', '5'],
  '⅘': ['4', '5'], '⅙': ['1', '6'], '⅚': ['5', '6'], '⅛': ['1', '8'], '⅜': ['3', '8'], '⅝': ['5', '8'], '⅞': ['7', '8'],
};

const group = (x: string) => (/^[\p{L}\p{N}.,²³]+$/u.test(x) ? x : `(${x})`);

/** Stacked fractions inside x back to a/b (a fraction inside a fraction or a root stays on one line). */
export const flatFrac = (x: string) => x.replace(/\u0011([^\u0012]*)\u0012([^\u0013]*)\u0013/g, (_, a: string, b: string) => `${group(a.trim())}/${group(b.trim())}`);

/** A chemical formula written with plain digits ("H2SO4", "Ca(OH)2") -> the same with _n subscript markup. */
export function chem(word: string): string {
  const state = /\((?:s|l|g|aq)\)$/.exec(word)?.[0]; // H2O(l), NaCl(aq)
  if (state) return chem(word.slice(0, -state.length)) + state;
  const [, n, f] = /^(\d*)(.*)$/s.exec(word)!; // "6CO2": 6 molecules of CO2
  if (!/\d/.test(f) || !/^(?:[A-Z][a-z]?\d*|\(|\)\d*|\[|\]\d*)+$/.test(f)) return word;
  const parts = f.match(/[A-Z][a-z]?/g) ?? [];
  if (!parts.every((p) => ELEMENTS.has(p))) return word;
  if (parts.length < 2 && !/^(?:H|N|O|F|Cl|Br|I)[23]$/.test(f)) return word; // H2, O2, O3 – but not "F1" or "B2"
  return n + f.replace(/([A-Za-z)\]])(\d+)/g, '$1_$2');
}

/** mhchem species with charge: "Na+", "Ca2+", "SO4^2-", "SO4^{2-}" -> formula with ^{charge}. */
function ion(tok: string): string {
  const st = /\((?:s|l|g|aq)\)$/.exec(tok)?.[0]; // Cu^2+(aq): the state goes behind the charge
  if (st && /[+-]$/.test(tok.slice(0, -st.length))) return ion(tok.slice(0, -st.length)) + st;
  const m = /^(.+)\^\{?(\d*[+-])\}?$/.exec(tok) ?? /^(.*[A-Za-z)\]])(\d*[+-])$/.exec(tok);
  if (!m) return chem(tok);
  // without a caret, digits after a formula of several atoms belong to it: NH4+ (one +), but Ca2+ (charge 2+)
  const [, f, c] = m, sub = !tok.includes('^') && /^\d/.test(c) && !/^[A-Z][a-z]?$/.test(f);
  return sub ? `${chem(f + c.slice(0, -1))}^{${c.slice(-1)}}` : `${chem(f)}^{${c}}`;
}

// siunitx (\SI{12}{\meter\per\second}, \qty, \si, \unit, \num): written the way a pupil would, "12 m/s".
const UNIT: Record<string, string> = {
  meter: 'm', metre: 'm', second: 's', gram: 'g', kilogram: 'kg', newton: 'N', joule: 'J', watt: 'W', pascal: 'Pa', hertz: 'Hz', volt: 'V',
  ampere: 'A', ohm: 'Ω', kelvin: 'K', degreeCelsius: '°C', celsius: '°C', degree: '°', mole: 'mol', mol: 'mol', liter: 'L', litre: 'L',
  percent: '%', minute: 'min', hour: 'h', day: 'd', coulomb: 'C', farad: 'F', tesla: 'T', bar: 'bar', electronvolt: 'eV', molar: 'mol/L',
};
const PREFIX: Record<string, string> = { kilo: 'k', mega: 'M', giga: 'G', milli: 'm', micro: 'μ', nano: 'n', centi: 'c', deci: 'd' };
function units(u: string): string {
  let out = '', pre = '', pow = '';
  for (const [, name, lit] of u.matchAll(/\\([A-Za-z]+)|([^\\]+)/g)) {
    if (lit) out += lit.trim();
    else if (name === 'per') out += '/';
    else if (name === 'square' || name === 'cubic') pow = name === 'square' ? '²' : '³';
    else if (name === 'squared' || name === 'cubed') out += name === 'squared' ? '²' : '³';
    else if (PREFIX[name]) pre += PREFIX[name];
    else { out += (out && !out.endsWith('/') ? '·' : '') + pre + (UNIT[name] ?? name) + pow; pre = pow = ''; }
  }
  return out;
}
const num = (n: string) => n.trim().replace(/^([\d.,]+)[eE]([+-]?\d+)$/, (_, m: string, e: string) => `${m}·10^{${e.replace('+', '')}}`);

/** An arrow with its condition above it (->[Kat], \xrightarrow{Kat}): the label between \u001b and \u001c, its spaces hidden; the layout writes it over the shaft. */
const over = (l: string) => (l.trim() ? `${LABEL[0]}${l.trim().replace(/\s+/g, SP)}${LABEL[1]}→` : '⟶');

export function latex(text: string): string {
  let t = text
    .replace(/\$\$|\\\[|\\\]/g, ' ')
    .replace(/\\\(\s*|\s*\\\)/g, '') // ChatGPT's inline math: no gap before the comma after it
    .replace(/\{,\}/g, ',') // German decimal comma: 9{,}81
    .replace(/\\([%&#_$*.=+~-])/g, '$1') // Gemini escapes these: 20\%, \$5, R\&D; Markdown ones too: 5 \* 3, 1\. Platz
    .replace(/\\\{/g, LIT_BRACE[0]).replace(/\\\}/g, LIT_BRACE[1]) // \{1, 2\}: literal braces, turned back at the end
    .replace(/\\(?:label|eqref|ref)\{[^{}]*\}|\\(?:nonumber|notag)\b/g, '').replace(/\\tag\*?\{([^{}]*)\}/g, ' ($1)') // equation numbers: (1) stays, as text refers to it
    // matrices in one line: (1 2; 3 4); aligned equations one per line, cases separated by ";"
    .replace(/\\begin\{([pbvBV]?matrix)\}([\s\S]*?)\\end\{\1\}/g, (_, _k: string, b: string) => '(' + b.split(/\\\\/).map((r) => r.split('&').map((c) => c.trim()).join(' ')).filter(Boolean).join('; ') + ')')
    .replace(/\\begin\{(cases|aligned|align\*?|gathered|gather\*?|array|equation\*?|split|multline\*?|alignat\*?|flalign\*?|eqnarray\*?)\}(?:\{[^{}]*\})?([\s\S]*?)\\end\{\1\}/g, (_, k: string, b: string) => b.split(/\\\\/).map((r) => r.split('&').map((c) => c.trim()).filter(Boolean).join(k === 'cases' ? ', ' : ' ')).filter(Boolean).join(k === 'cases' ? '; ' : '\n'))
    .replace(/[½¼¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (c) => { const [a, b] = VULGAR[c]; return FRAC[0] + a + FRAC[1] + b + FRAC[2]; })
    .replace(/∑/g, 'Σ').replace(/∆/g, 'Δ')
    .replace(/\\pu\{([^{}]*)\}/g, '$1') // mhchem's units: \pu{0,1 mol/L}
    // mhchem: " ^" gas escapes, " v" precipitate
    .replace(/\\ce\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_, f: string) => f.replace(/<=>/g, '⇌').replace(/->\[([^\]]*)\]/g, (_, l: string) => over(l)).replace(/->/g, '→').replace(/(?<=\s)\^(?=\s|$)/g, '↑').replace(/(?<=\s)v(?=\s|$)/g, '↓').split(/(\s+)/).map(ion).join(''))
    .replace(/\\(?:SI|qty)\{([^{}]*)\}\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_, n: string, u: string) => `${num(n)}\\,${units(u)}`)
    .replace(/\\(?:si|unit)\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_, u: string) => units(u))
    .replace(/\\num\{([^{}]*)\}/g, (_, n: string) => num(n))
    .replace(/\\(?:limits|nolimits)(?![A-Za-z])/g, '') // \lim\limits_{n\to\infty}: before the limit rule below
    .replace(/\\(?:frac|dfrac|tfrac|cfrac)(\d)(\d)/g, '\\frac{$1}{$2}').replace(/\\sqrt(\d)/g, '\\sqrt{$1}') // \frac12, \sqrt2
    .replace(/\\(?:overset|underset)\{[^{}]*\}\{([^{}]*)\}/g, '$1')
    .replace(/\\underbrace\{([^{}]*)\}_\{[^{}]*\}/g, '$1')
    .replace(/_\\(?:text|mathrm|textrm)\{([^{}]*)\}/g, '_{$1}') // E_\text{pot}
    .replace(/\\(?:text|textbf|textit|textrm|textsf|mathrm|mathbf|mathit|mathsf|operatorname|vec|overline|bar|hat|widehat|tilde|mathbb|mathcal|boldsymbol|underline|dot|ddot|color|overrightarrow|overleftarrow|cancel)\{([^{}]*)\}/g, '$1')
    .replace(/\\xrightarrow(?:\[[^\]]*\])?\{([^{}]*)\}/g, (_, l: string) => over(l))
    // limits written out in words: a writer puts them under the sign, the app on the line
    .replace(/\\lim_\{([^{}]*)\}/g, (_, a: string) => `lim(${a})`)
    .replace(/\\(sum|int)_\{?([^{}\s^]*)\}?\^\{?([^{}\s]*)\}?/g, (_, f: string, a: string, b: string) => (f === 'sum' ? `Σ(${a} bis ${b})` :`∫ von ${a} bis ${b}: `))
    .replace(/\\sqrt\[(\d)\]\{([^{}]*)\}/g, (_, n: string, a: string) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+n] + `√${group(a)}`)
    .replace(/\^\{?\\circ\}?/g, '°') // 90^\circ
    .replace(/\\right([\]|])_\{?([^{}\s^]+)\}?\^\{?([^{}\s]+)\}?/g, '\\right$1 von $2 bis $3') // [F(x)]_0^2: limits of evaluation in words
    .replace(/\\left\./g, '')
    .replace(/\\(?:left|right)(?![A-Za-z])/g, '') // \left( … \right), not \rightarrow
    .replace(/\\[,;:! ]/g, ' ');
  t = t.replace(/([\^_])\{([^{}]*)\}/g, (_, c: string, x: string) => c + TEX_BRACE[0] + x + TEX_BRACE[1]); // x^{n+1} inside a fraction or root must not block it
  // Innermost first, so nested fractions and roots come out right.
  for (let prev = ''; prev !== t;) {
    prev = t;
    t = t
      .replace(/\\[dtc]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) => FRAC[0] + flatFrac(a) + FRAC[1] + flatFrac(b) + FRAC[2])
      .replace(/\\sqrt\{([^{}]*)\}/g, (_, a: string) => `√${group(flatFrac(a))}`)
      .replace(/\\boxed\{([^{}]*)\}/g, (_, a: string) => ` ${BOX[0]}${a.trim()}${BOX[1]} `);
  }
  return t
    .replaceAll(TEX_BRACE[0], '{').replaceAll(TEX_BRACE[1], '}').replaceAll(LIT_BRACE[0], '{').replaceAll(LIT_BRACE[1], '}')
    .replace(/\\binom\{([^{}]*)\}\{([^{}]*)\}/g, '($1 über $2)')
    .replace(/\\([A-Za-z]+)/g, (m, name: string) => SYMBOL[name] ?? name) // \sin -> sin
    // x^{n-1}: only plain digits/letters and charges can be raised; anything else keeps its brackets as x^(n-1)
    .replace(/\^\{([^{}]+)\}/g, (m, x: string) => (/^[0-9a-z]{2,}$|^\d+$|^\d*[+-]$|^-\d+$/.test(x) ? m : /^[A-Za-z]$/.test(x) ? '^' + x : `^(${x})`))
    // x_{kin} and x_{1,2} keep their brackets for clean() to lower them; x_{Gesamtmasse} loses them, x_{n+1} becomes x_(n+1)
    .replace(/_\{([^{}]+)\}/g, (m, x: string) => (/^\w{1,8}$|^\w+,\w+$/.test(x) ? m : /^[A-Za-z]+$/.test(x) ? '_' + x : `_(${x})`))
    .replace(/(^|[\s(])(\d*(?:[A-Z][a-z]?\d*|\(|\)\d*)+(?:\((?:s|l|g|aq)\))?)(?=[\s.,;:)+]|$)/gm, (m, pre: string, f: string) => pre + chem(f));
}
