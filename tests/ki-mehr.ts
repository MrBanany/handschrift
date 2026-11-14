// More realistic chatbot answers (Gemini, ChatGPT), copied with the "Kopieren" button, i.e. as Markdown.
// Each one carries something that went wrong or could: tables, code, footnotes, siunitx, HTML tags, Markdown escapes, …
const F = '```'; // a code fence (backticks can't stand in String.raw)

export const MEHR: Record<string, string> = {
  gpt_tabelle_formeln: String.raw`Hier ist eine Übersicht:

| Größe | Formel | Einheit |
|:------|:------:|-------:|
| Geschwindigkeit | $v = \frac{s}{t}$ | m/s |
| Beschleunigung | $a = \frac{\Delta v}{\Delta t}$ | m/s² |
| **Kraft** | $F = m \cdot a$ | N |

Ich hoffe, das hilft dir!`,

  gpt_tabelle_br: String.raw`| Phase | Was passiert? |
|---|---|
| Prophase | Chromosomen kondensieren<br>Kernhülle löst sich auf |
| Metaphase | Chromosomen in der Äquatorialebene |`,

  gemini_code_python: `Klar! Hier ein Beispiel in Python:

${F}python
# Liste anlegen
zahlen = [3, 1, 2]
## Sortieren
zahlen.sort()
def __init__(self):
    return self.x * 2
${F}

**Erklärung:** \`sort()\` sortiert die Liste.`,

  gpt_verschachtelt_3: `1. **Zellkern**
   - enthält die DNA
      - als Chromatin
   - Kernhülle mit Poren
2. **Mitochondrien**
   - Zellatmung
3) **Ribosomen**`,

  gemini_emojis: `## 🧪 Versuch: Nachweis von Stärke

1️⃣ Kartoffel schneiden 🥔
2️⃣ Iod-Kaliumiodid-Lösung auftropfen 💧
3️⃣ Beobachtung: Blauschwarz-Färbung ✅

👉 **Tipp:** Handschuhe tragen! ⚠️
✨ Fertig! 🎉`,

  gpt_links_urls: `Mehr dazu findest du hier:

- [Wikipedia: Photosynthese](https://de.wikipedia.org/wiki/Photosynthese)
- <https://www.leifiphysik.de/mechanik/kraft-und-bewegungsaenderung>
- Quelle: https://www.bpb.de/themen/erster-weltkrieg-weimar/ersterweltkrieg/155300/der-weg-in-den-krieg/?utm_source=chatgpt.com`,

  fett_im_wort: `Die **Photo**synthese findet im **Chloro**plasten statt.
Zell**kern** und Zell*plasma* sind wichtig.
__Wichtig__: Das **ATP** liefert Energie.`,

  gpt_align: String.raw`Wir lösen das Gleichungssystem:

\[
\begin{align}
2x + y &= 7 \tag{1}\\
x - y &= 2 \tag{2}
\end{align}
\]

Aus (1) + (2) folgt:
\begin{equation}
3x = 9 \quad \Rightarrow \quad x = 3 \label{eq:x}
\end{equation}

\begin{equation*}
y = 7 - 2 \cdot 3 = 1
\end{equation*}`,

  frac_fliesstext: String.raw`Die kinetische Energie ist $E_{kin} = \frac{1}{2} m v^2$, also bei $m = 2\,\text{kg}$ und $v = 3\,\frac{\text{m}}{\text{s}}$ genau $E = \frac12 \cdot 2 \cdot 9 = 9\,\text{J}$. Die Steigung $m = \frac{\Delta y}{\Delta x}$ ist ein \cfrac{1}{2}-Wert, die Wahrscheinlichkeit $\tfrac{1}{6}$.`,

  chemie_gleichungen: String.raw`## Redoxreaktionen

- Knallgas: $\ce{2H2 + O2 -> 2H2O}$
- Kalkbrennen: $\ce{CaCO3 ->[\Delta] CaO + CO2 ^}$
- Eisen: $\ce{Fe^{3+} + 3OH- -> Fe(OH)3 v}$
- Gleichgewicht: $\ce{CH3COOH + H2O <=> CH3COO- + H3O+}$
- Konzentration: $c = \pu{0,1 mol/L}$
- Unicode: CO₂ + H₂O ⇌ H₂CO₃`,

  fussnoten: `Die Französische Revolution begann 1789[^1] mit dem Sturm auf die Bastille.[^2]
Sie veränderte Europa grundlegend.[1][2]

[^1]: Vgl. Schulbuch Geschichte, S. 112.
[^2]: https://de.wikipedia.org/wiki/Sturm_auf_die_Bastille`,

  siunitx: String.raw`Gegeben: $v = \SI{12}{\meter\per\second}$, $m = \SI{1,5}{\kilogram}$, $T = \SI{20}{\degreeCelsius}$
Gesucht: $p$ in $\si{\kilogram\meter\per\second}$
$p = m \cdot v = \qty{18}{\kilogram\meter\per\second}$
$g = \SI{9,81}{\meter\per\square\second}$, $V = \SI{2}{\cubic\centi\meter}$, $\num{3e8}$`,

  html_tags: `**Wasser** ist H<sub>2</sub>O, die Fläche ist 5 m<sup>2</sup>.<br>
Neue Zeile nach <b>br</b> und <i>kursiv</i>, <strong>stark</strong>.`,

  markdown_escapes: String.raw`5 \* 3 = 15
1\. Platz: Anna
Preis \- Rabatt \= Endpreis
a\_1 und 50\% und R\&D`,

  sonderzeichen: `- Zahlenbereiche: ℕ ⊂ ℤ ⊂ ℚ ⊂ ℝ
- Zitat: «Der Mensch ist frei» und ‹so›
- Brüche: ⅓ + ⅔ = 1, ⅛ Liter
- Promille: 0,5 ‰, Paragraf § 3, © 2024, ™
- Grad: 20 °C, Winkel 90°
- Pfeile: ↑ steigt, ↓ fällt`,

  gpt_latex_pfeile: String.raw`\( a > 0 \Longleftrightarrow f \text{ ist steigend} \)
\( A \longleftrightarrow B \), \( x \longleftarrow y \)
\( x \geqslant 0 \) und \( y \leqslant 1 \)
\( \overrightarrow{AB} = \begin{pmatrix} 1 \\ 2 \end{pmatrix} \)
\( \iint_A f \, dA \) und \( \oint_C F \cdot ds \)`,

  setext_ueberschrift: `Zusammenfassung
===============

Die Zelle ist die kleinste Einheit des Lebens.

## Aufbau ##

- Zellmembran`,

  tabs: `Name\tWert\tEinheit
Masse\t5\tkg
Zeit\t2\ts`,

  gemini_stern_listen: `**Die Zelle**

* **Zellmembran:** grenzt die Zelle ab.
    * besteht aus einer Lipiddoppelschicht
    * enthält Proteine
* **Zellkern:** steuert die Zelle.

---

*Hinweis: Dies ist eine vereinfachte Darstellung.*`,

  betrag_und_intervalle: String.raw`- Betrag: $|x - 3| < 2$, also $|-x| = x$ für $x \le 0$
- Intervall: $x \in [1, 5]$ bzw. $]0; 1[$
- Menge: $L = \{1, 2\}$
- Teilbarkeit: $3 \mid 12$`,

  gpt_aligned_block: String.raw`So rechnest du:

$$
\begin{aligned}
3(x - 2) &= 12 \\
3x - 6 &= 12 \quad | +6 \\
3x &= 18 \quad | :3 \\
x &= 6
\end{aligned}
$$

**Antwort:** $x = 6$`,

  gemini_cases_und_lim: String.raw`Die Funktion ist abschnittsweise definiert:
$$f(x) = \begin{cases} x^2 & \text{für } x < 0 \\ 2x & \text{für } x \geq 0 \end{cases}$$
Grenzwert: $\lim_{x \to 0} f(x) = 0$ und $\lim\limits_{n\to\infty} \left(1 + \frac{1}{n}\right)^n = e$`,
};
