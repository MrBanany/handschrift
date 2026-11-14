import { describe, expect, it } from 'vitest';
import { clean } from '../src/renderer/clean';
import { PLOT, compile, decodePlot, labelWidth, parsePlot, planPlot, type PlotPlan } from '../src/renderer/plot';

const at = (src: string, x: number) => compile(src)!(x);
const opts = { width: 180, xh: 2.6, lineH: 8.7, maxRows: 28 };
const plan = (spec: string) => planPlot(parsePlot(spec)!, opts)!;

describe('formula evaluator', () => {
  it('knows precedence, powers, brackets and unary minus', () => {
    expect(at('1 + 2 * 3', 0)).toBe(7);
    expect(at('(1 + 2) * 3', 0)).toBe(9);
    expect(at('-x^2', 3)).toBe(-9);
    expect(at('2^3^2', 0)).toBe(512); // right-associative
    expect(at('2^-x', 1)).toBe(0.5);
    expect(at('x^2 - 1', -3)).toBe(8);
    expect(at('8 / 4 / 2', 0)).toBe(1);
  });
  it('reads implicit products', () => {
    expect(at('2x', 4)).toBe(8);
    expect(at('3(x+1)', 1)).toBe(6);
    expect(at('2x^2', 3)).toBe(18);
    expect(at('x sin(x)', Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(at('2pi', 0)).toBeCloseTo(2 * Math.PI);
    expect(at('(x+1)(x-1)', 3)).toBe(8);
  });
  it('has the school functions and constants', () => {
    expect(at('sin(pi/2) + cos(0)', 0)).toBeCloseTo(2);
    expect(at('e^x', 1)).toBeCloseTo(Math.E);
    expect(at('exp(x)', 0)).toBe(1);
    expect(at('ln(e)', 0)).toBeCloseTo(1);
    expect(at('sqrt(x)', 16)).toBe(4);
    expect(at('abs(x) + |x|', -2)).toBe(4);
    expect(at('tan(x)', 0)).toBe(0);
  });
  it('accepts what AIs write: LaTeX, x², decimal comma, f(x) =', () => {
    expect(at('\\frac{1}{x}', 4)).toBe(0.25);
    expect(at('2 \\cdot x', 3)).toBe(6);
    expect(at('\\sqrt{x}', 9)).toBe(3);
    expect(at('x² − 1', 2)).toBe(3);
    expect(at('0,5x', 4)).toBe(2);
    expect(at('f(x) = x + 1', 1)).toBe(2);
    expect(at('y = 2X', 1)).toBe(2);
  });
  it('rejects everything else instead of running it', () => {
    for (const bad of ['', 'alert(1)', 'x +', '(x', 'sin x', 'x; y', 'constructor', 'x.y', '2 ** 3', 'window', 'a + b'])
      expect(compile(bad), bad).toBeNull();
  });
});

describe('plot spec', () => {
  it('reads functions and ranges', () => {
    expect(parsePlot('x^2-1, -3..3')).toEqual({ fns: ['x^2-1'], x: [-3, 3] });
    expect(parsePlot('sin(x); cos(x), -pi..pi')).toEqual({ fns: ['sin(x)', 'cos(x)'], x: [-Math.PI, Math.PI] });
    expect(parsePlot('1/x, -4..4, -5..5')).toEqual({ fns: ['1/x'], x: [-4, 4], y: [-5, 5] });
    expect(parsePlot('0,5x^2, -2.5..2.5')).toEqual({ fns: ['0,5x^2'], x: [-2.5, 2.5] });
    expect(parsePlot('x')).toEqual({ fns: ['x'], x: [-5, 5] });
  });
  it('rejects bad ranges and too many functions', () => {
    expect(parsePlot('x, 3..-3')).toBeNull();
    expect(parsePlot('x, 0..2000000')).toBeNull();
    expect(parsePlot('x;x;x;x;x, -1..1')).toBeNull();
    expect(parsePlot('x, x..3')).toBeNull(); // a range end must be a number
    expect(planPlot(parsePlot('quatsch(x), -1..1')!, opts)).toBeNull();
    expect(planPlot(parsePlot('sqrt(x), -5..-1')!, opts)).toBeNull(); // nothing to see
  });
});

/** Rough box of a label (mm), as the layout writes it. */
const box = (l: PlotPlan['labels'][number], xh: number) => {
  const w = labelWidth(l.text, xh) * (l.size / 0.65), x0 = l.align === 'left' ? l.x : l.align === 'right' ? l.x - w : l.x - w / 2;
  return { x0, x1: x0 + w, y0: l.y - 1.3 * xh * l.size, y1: l.y };
};

describe('plot plan', () => {
  it('keeps everything inside its box, labels apart, the height limited', () => {
    for (const spec of ['x^2-1, -3..3', 'sin(x); cos(x), -2pi..2pi', '1/x, -4..4', 'e^x, -3..3', 'x^3, -10..10', '0.001x, 0..5000', 'tan(x), -5..5', 'x^2, 1..4', '2, -1..1', 'ln(x), -2..8']) {
      const p = plan(spec);
      expect(p, spec).not.toBeNull();
      expect(p.width, spec).toBeLessThanOrEqual(opts.width);
      expect(p.rows, spec).toBeLessThanOrEqual(15);
      expect(p.height, spec).toBeLessThanOrEqual(p.rows * opts.lineH + 1e-9);
      for (const pt of [...p.axes.flat(), ...p.ticks.flat(), ...p.curves.flat()]) {
        expect(pt[0], spec).toBeGreaterThanOrEqual(0); expect(pt[0], spec).toBeLessThanOrEqual(p.width);
        expect(pt[1], spec).toBeGreaterThanOrEqual(0); expect(pt[1], spec).toBeLessThanOrEqual(p.height);
      }
      const boxes = p.labels.map((l) => box(l, opts.xh));
      boxes.forEach((a, i) => {
        expect(a.x0, `${spec} ${p.labels[i].text}`).toBeGreaterThanOrEqual(-0.5); expect(a.x1, spec).toBeLessThanOrEqual(p.width + 0.5);
        expect(a.y0, spec).toBeGreaterThanOrEqual(-0.5); expect(a.y1, spec).toBeLessThanOrEqual(p.height + 0.5);
        for (const b of boxes.slice(i + 1)) expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0, `${spec}: ${p.labels[i].text} overlaps`).toBe(true);
      });
    }
  });
  it('uses the same unit on both axes when the height allows it', () => {
    const p = plan('x, -3..3');
    const [a, b] = p.curves[0], slope = (b[1] - a[1]) / (b[0] - a[0]);
    expect(slope).toBeCloseTo(-1, 1); // y runs down on the page
  });
  it('cuts the curve at a pole instead of drawing through it', () => {
    const p = plan('1/x, -4..4');
    expect(p.curves).toHaveLength(2);
    const axisX = p.axes[1][0][0];
    for (const c of p.curves) expect(c.every((q) => q[0] < axisX) || c.every((q) => q[0] > axisX)).toBe(true);
    // the left branch runs off the bottom, the right one comes in from the top
    const [left, right] = p.curves[0][0][0] < axisX ? p.curves : [p.curves[1], p.curves[0]];
    expect(left.at(-1)![1]).toBeGreaterThan(p.height / 2);
    expect(right[0][1]).toBeLessThan(p.height / 2);
    expect(plan('tan(x), -5..5').curves.length).toBeGreaterThanOrEqual(4);
  });
  it('cuts at a jump and where the function is not defined', () => {
    expect(plan('abs(x)/x, -2..2').curves).toHaveLength(2);
    const root = plan('sqrt(x), -4..4'), axisX = root.axes[1][0][0];
    expect(root.curves).toHaveLength(1);
    expect(root.curves[0][0][0]).toBeGreaterThanOrEqual(axisX - 0.5);
    expect(plan('x^3, -10..10').curves).toHaveLength(1); // steep, but unbroken
  });
});

describe('plot in clean()', () => {
  it('keeps the block as one token on its own line, untouched by the other rules', () => {
    const lines = clean('Die Parabel:\n[[plot: x^2 - 1, -3..3]]\nFertig. **fett**', () => true).split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(lines[1].startsWith(PLOT[0])).toBe(true);
    expect(decodePlot(lines[1])).toBe('x^2-1,-3..3');
    expect(decodePlot('kein Graph')).toBeNull();
    // inside a sentence: still a line of its own; a structural formula stays one
    const mixed = clean('Siehe [[plot: sin(x), 0..2pi]] und [[Ethanol]].', () => true).split('\n');
    expect(mixed.filter((l) => l.startsWith(PLOT[0]))).toHaveLength(1);
    expect(mixed.join(' ')).toContain('\u000EEthanol\u000F');
  });
});
