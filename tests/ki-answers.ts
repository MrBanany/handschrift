// Realistic AI answers (ChatGPT/Claude style, following src/prompt.ts and also sloppy ones) for the leftover/overflow sweep in ki-texte.test.ts.
export const ANSWERS: Record<string, string> = {
  ableitung: `## Ableitung von $f(x) = 3x^4 - 2x^2 + 5x - 7$

- **Potenzregel**: $(x^n)' = n \\cdot x^{n-1}$
- Term für Term ableiten:
  - $(3x^4)' = 12x^3$
  - $(-2x^2)' = -4x$
  - $(5x)' = 5$
  - $(-7)' = 0$

$f'(x) = 12x^3 - 4x + 5$

Kettenregel: $f(x) = (2x+1)^3 \\Rightarrow f'(x) = 3 \\cdot (2x+1)^2 \\cdot 2 = 6(2x+1)^2$

Quotientenregel: $\\left(\\frac{u}{v}\\right)' = \\frac{u'v - uv'}{v^2}$

$$\\boxed{f'(x) = 12x^3 - 4x + 5}$$`,

  integral: `## Integral

$\\int_0^2 (3x^2 + 1)\\,dx = \\left[x^3 + x\\right]_0^2 = (8 + 2) - 0 = 10$

- Stammfunktion: $F(x) = \\frac{x^{n+1}}{n+1} + C$
- Fläche zwischen $x = 0$ und $x = 2$
- Allgemein: $\\int_a^b f(x)\\,dx = F(b) - F(a)$
- $\\int e^{2x}\\,dx = \\frac{1}{2}e^{2x} + C$
- $\\int \\sin(x)\\,dx = -\\cos(x) + C$

$\\boxed{A = 10\\ \\text{FE}}$`,

  quadratisch: `## Quadratische Gleichung

$x^2 - 5x + 6 = 0$

**Mitternachtsformel** (abc-Formel):

$$x_{1,2} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

Einsetzen mit $a = 1$, $b = -5$, $c = 6$:

$x_{1,2} = \\frac{5 \\pm \\sqrt{25 - 24}}{2} = \\frac{5 \\pm 1}{2}$

- $x_1 = 3$
- $x_2 = 2$

Probe: $3^2 - 5 \\cdot 3 + 6 = 0$ ✓

$\\boxed{x_1 = 3,\\; x_2 = 2}$

Diskriminante $D = b^2 - 4ac$: $D > 0$ zwei Lösungen, $D = 0$ eine, $D < 0$ keine.`,

  vektoren: `## Vektoren

$\\vec{a} = \\begin{pmatrix} 1 \\\\ 2 \\\\ 3 \\end{pmatrix}$, $\\vec{b} = \\begin{pmatrix} 4 \\\\ 0 \\\\ -1 \\end{pmatrix}$

- Skalarprodukt: $\\vec{a} \\cdot \\vec{b} = 1 \\cdot 4 + 2 \\cdot 0 + 3 \\cdot (-1) = 1$
- Betrag: $|\\vec{a}| = \\sqrt{1^2 + 2^2 + 3^2} = \\sqrt{14} \\approx 3{,}74$
- Winkel: $\\cos\\varphi = \\frac{\\vec{a} \\cdot \\vec{b}}{|\\vec{a}| \\cdot |\\vec{b}|}$
- Orthogonal, wenn $\\vec{a} \\cdot \\vec{b} = 0$
- Kreuzprodukt: $\\vec{a} \\times \\vec{b} = \\begin{pmatrix} a_2 b_3 - a_3 b_2 \\\\ a_3 b_1 - a_1 b_3 \\\\ a_1 b_2 - a_2 b_1 \\end{pmatrix}$

$\\boxed{\\vec{a} \\cdot \\vec{b} = 1}$`,

  physik: `## Freier Fall

- Fallzeit: $t = \\sqrt{\\frac{2h}{g}}$
- $g = 9{,}81\\,\\frac{\\text{m}}{\\text{s}^2}$
- Geschwindigkeit: $v = g \\cdot t$

Beispiel mit $h = 20\\,\\text{m}$:

$t = \\sqrt{\\frac{2 \\cdot 20\\,\\text{m}}{9{,}81\\,\\text{m/s}^2}} \\approx 2{,}02\\,\\text{s}$

$v = 9{,}81\\,\\text{m/s}^2 \\cdot 2{,}02\\,\\text{s} \\approx 19{,}8\\,\\text{m/s}$

Energie: $E_\\text{pot} = m \\cdot g \\cdot h$, $E_\\text{kin} = \\frac{1}{2} m v^2$

Ohmsches Gesetz: $U = R \\cdot I$, $R = 230\\,\\Omega$, $P = U \\cdot I = 2{,}3\\,\\text{kW}$

Temperatur $T = 293{,}15\\,\\text{K} = 20\\,^\\circ\\text{C}$, Dichte $\\rho = 1{,}2\\,\\text{kg/m}^3$

$\\boxed{v \\approx 19{,}8\\,\\text{m/s}}$`,

  chemie: `## Verbrennung von Methan

$\\ce{CH4 + 2O2 -> CO2 + 2H2O}$

- Reaktionsenthalpie: $\\Delta_R H = -890\\,\\text{kJ/mol}$
- Mit Strukturformeln: [[Methan]] + 2 [[Sauerstoff]] → [[Kohlenstoffdioxid]] + 2 [[Wasser]]
- Zustände: $\\ce{CH4(g) + 2O2(g) -> CO2(g) + 2H2O(l)}$

## Ionen

- Natrium-Ion: $\\ce{Na+}$
- Sulfat: $\\ce{SO4^2-}$
- Calcium: $\\ce{Ca^2+}$
- Ammonium: $\\ce{NH4+}$, Phosphat: $\\ce{PO4^3-}$
- Salzbildung: $\\ce{Na+ + Cl- -> NaCl}$

## Gleichgewicht

$\\ce{N2 + 3H2 <=> 2NH3}$ (Haber-Bosch)

Ethanol: [[Ethanol]], Essigsäure: [[Essigsäure skelett]]

Säure-Base: $\\ce{HCl + NaOH -> NaCl + H2O}$, $pH = -\\log[\\ce{H3O+}]$

$\\boxed{\\ce{CH4 + 2O2 -> CO2 + 2H2O}}$`,

  biologie: `## Photosynthese

- **Ort**: Chloroplasten (Chlorophyll)
- **Edukte**: Wasser und Kohlenstoffdioxid
- **Produkte**: Glucose und Sauerstoff
- Gleichung: $\\ce{6CO2 + 6H2O ->[Licht] C6H12O6 + 6O2}$
- Zwei Phasen:
  - Lichtreaktion (Thylakoid)
  - Calvin-Zyklus (Stroma)
    - CO₂-Fixierung
    - Reduktion
- Wichtig: ==ATP und NADPH== entstehen in der Lichtreaktion
- DNA → RNA → Protein (Transkription, Translation)
- Mendel: Verhältnis 3 : 1, Genotyp *Aa* × *Aa*
- Zellatmung: Glucose + O₂ → CO₂ + H₂O + Energie (≈ 38 ATP)`,

  deutsch: `## Zusammenfassung: „Der Sandmann“ (E.T.A. Hoffmann)

Nathanael erzählt in Briefen von einem „schrecklichen“ Erlebnis aus seiner Kindheit — der Advokat Coppelius sei der „Sandmann“.

- **Epoche**: Romantik (1816)
- **Motive**: Augen, Automat (Olimpia), Wahnsinn
- Zitat: „Ha! Ha! Ha! – Feuerkreis dreh' dich – Feuerkreis dreh' dich“
- Klara steht für Vernunft, Nathanael für Fantasie – gegensätzliche Figuren
- Erzählperspektive: Briefe + auktorialer Erzähler
- Sprachliche Mittel: Metapher, Ironie, Antithese (z. B. "Licht" vs. "Dunkel")

> „Du lebloses, verdammtes Automat!“ ruft Nathanael.

Fazit: Ein Text über die Grenze zwischen Realität & Wahn – 200 Jahre alt, aber aktuell.`,

  english: `## Summary: "The Great Gatsby"

Jay Gatsby's life is built on one dream: winning back Daisy Buchanan. Nick Carraway, the narrator, says: "He had an extraordinary gift for hope."

- **Setting**: Long Island, 1922 — "the Jazz Age"
- **Themes**: the American Dream, wealth vs. class, illusion/reality
- Symbol: the green light → hope & the future
- Key quote: "So we beat on, boats against the current, borne back ceaselessly into the past."
- Don't forget: Gatsby's real name is James Gatz; it's a well-known rags-to-riches story
- Tom's affair with Myrtle Wilson → conflict

Grammar: Present Perfect = have/has + past participle (e.g. I've seen it).`,

  tabelle: `# Vergleich der Aggregatzustände 🧊💧♨️

| Zustand | Teilchenabstand | Beispiel |
|---------|:---------------:|----------|
| **fest** | sehr klein | Eis |
| flüssig | klein | Wasser |
| gasförmig | groß | Wasserdampf |

✅ Faustregel: Mehr Energie → mehr Bewegung
❌ Falsch: Teilchen stehen still

---

**Tipp:** Merke dir *fest → flüssig → gasförmig* 😊`,

  verschachtelt: `1. Zellaufbau
   - Zellkern
     - Chromosomen
       - Gene
   - Mitochondrien
2. Zellteilung
   * Mitose
   * Meiose
10. Sonstiges
    1. Unterpunkt A
    2. Unterpunkt B

- [x] Hausaufgabe gemacht
- [ ] Vokabeln lernen
- Normal ~~falsch~~ richtig`,

  code: `Hier ein kleines Python-Beispiel 🐍:

\`\`\`python
def fakultaet(n):
    if n <= 1:
        return 1
    return n * fakultaet(n - 1)

print(fakultaet(5))  # 120
\`\`\`

Die Funktion ruft sich selbst auf (\`fakultaet(n - 1)\`). Siehe auch [Python Docs](https://docs.python.org/3/) oder https://example.com/ein/sehr/langer/pfad/zur/seite?id=12345&ref=abc.

Laufzeit: $O(n)$, Speicher: $O(n)$ wegen des Aufrufstapels.`,

  chatgpt_latex: `Die Lösung der Gleichung \\( 2x + 3 = 11 \\) ist:

\\[
x = \\frac{11 - 3}{2} = 4
\\]

Weitere Beispiele:

\\[
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
\\]

\\[
\\lim_{x \\to \\infty} \\frac{1}{x} = 0
\\]

\\[
\\begin{aligned}
a &= b + c \\\\
  &= d
\\end{aligned}
\\]

Mit \\(\\alpha = 30^\\circ\\) und \\(\\beta = 60^\\circ\\) gilt \\(\\sin\\alpha = \\tfrac{1}{2}\\).`,

  statistik: `## Statistik

- Mittelwert: $\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i$
- Standardabweichung: $\\sigma = \\sqrt{\\frac{1}{n}\\sum_{i=1}^{n}(x_i - \\bar{x})^2}$
- Wahrscheinlichkeit: $P(A) = \\frac{\\text{günstige}}{\\text{mögliche}} = \\frac{3}{6} = 50\\,\\%$
- Binomial: $\\binom{n}{k} p^k (1-p)^{n-k}$
- $P(A \\cap B)$, $P(A \\cup B)$, $A \\subset B$, $x \\in \\mathbb{R}$, $\\forall x$, $\\exists y$
- Gleichung: $y = mx + b$ mit $m = \\dfrac{\\Delta y}{\\Delta x}$
- $a \\neq 0$, $x \\geq 2$, $x \\leq -1$, $\\log_{10}(100) = 2$, $\\ln(e) = 1$
- $\\text{Fläche} = \\pi r^2$, $U = 2\\pi r$, $\\sqrt[3]{27} = 3$`,

  geschichte: `**Der Erste Weltkrieg (1914–1918)**

Auslöser: Attentat von Sarajevo am 28. Juni 1914. Erzherzog Franz Ferdinand wurde erschossen – das führte zur „Julikrise“.

Ursachen (MAIN):
• Militarismus
• Allianzsysteme
• Imperialismus
• Nationalismus

Folgen → Versailler Vertrag (1919); Völkerbund; Reparationen i. H. v. 132 Mrd. Goldmark.

*Hinweis:* Die Zahlen sind Näherungswerte (ca. 17 Mio. Tote).
Preis: 5 € / 3,50 $ / 10 £ – etwa 100% mehr als 1913.`,
};
