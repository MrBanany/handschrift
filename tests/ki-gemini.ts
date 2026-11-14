// Typical Gemini answers (app and web, German): "Hier ist …" intros, **bold** sub-headings instead of ##, "* " lists with 4-space nesting,
// $$…$$ and \[…\] display maths, \text{…} chemistry, tables, emoji, citation markers, code blocks, horizontal rules.
// Merged into ANSWERS (ki-answers.ts) for the leftover/overflow sweep; the exact results are checked in gemini.test.ts.
const FENCE = '```';

export const GEMINI: Record<string, string> = {
  gemini_mathe: String.raw`Hier ist die Lösung der Gleichung Schritt für Schritt:

### **Aufgabe: Löse $2x + 3 = 11$**

**1. Gegebene Werte**
*   **Gleichung:** $2x + 3 = 11$
*   **Gesucht:** $x$

**2. Umformen**
Wir bringen zuerst die Zahl auf die rechte Seite:

$$2x + 3 = 11 \quad | -3$$
$$2x = 8 \quad | :2$$
$$x = \dfrac{8}{2} = 4$$

**3. Probe**
$$2 \cdot 4 + 3 = 11 \implies 11 = 11 \quad \checkmark$$

---

**Ergebnis:** $x = 4$ ✅

Ich hoffe, das hilft dir weiter! Sag einfach Bescheid, wenn du noch eine Aufgabe hast. 😊`,

  gemini_mathe_funktion: String.raw`Sehr gerne! Hier ist die Untersuchung der Funktion $f(x) = x^2 - 4x + 3$.

\[
f'(x) = 2x - 4
\]

*   **Nullstellen:** Setze $f(x) = 0$:
    *   $x_{1,2} = \frac{4 \pm \sqrt{16 - 12}}{2} = \frac{4 \pm 2}{2}$
    *   Also $x_1 = 3$ und $x_2 = 1$
*   **Scheitelpunkt:** $S(2 \mid -1)$
*   **Wertebereich:** $W = [-1; \infty)$

$$\begin{aligned} f(x) &= x^2 - 4x + 3 \\ &= (x-2)^2 - 1 \end{aligned}$$

Die Fläche unter der Kurve von $0$ bis $1$:
$$\int_{0}^{1} (x^2 - 4x + 3) \, dx = \left[ \frac{x^3}{3} - 2x^2 + 3x \right]_{0}^{1} = \frac{1}{3} - 2 + 3 = \frac{4}{3}$$

Es gilt: $\lim_{x \to \infty} f(x) = \infty$ und $f(x) \geq -1$ für alle $x \in \mathbb{R}$.`,

  gemini_physik: String.raw`Hier ist die Berechnung zum **freien Fall** 🍎

### **Gegebene Größen**

| Größe | Symbol | Wert |
| :--- | :---: | ---: |
| Fallhöhe | $h$ | $20 \, \text{m}$ |
| Erdbeschleunigung | $g$ | $9{,}81 \, \text{m/s}^2$ |
| Masse | $m$ | $2 \, \text{kg}$ |

### **Rechnung**

*   **Fallzeit:**
    $$t = \sqrt{\frac{2h}{g}} = \sqrt{\frac{2 \cdot 20 \, \text{m}}{9{,}81 \, \text{m/s}^2}} \approx 2{,}02 \, \text{s}$$
*   **Endgeschwindigkeit:**
    $$v = g \cdot t \approx 19{,}8 \, \frac{\text{m}}{\text{s}} \approx 71 \, \frac{\text{km}}{\text{h}}$$
*   **Energie:** $E_{\text{pot}} = m \cdot g \cdot h = 2 \cdot 9{,}81 \cdot 20 \, \text{J} \approx 392 \, \text{J}$
*   Widerstand $R = 4{,}7 \, \text{k}\Omega$, Temperatur $T = 293 \, \text{K}$ ($20^\circ\text{C}$), Kraft $\vec{F} = m \cdot \vec{a}$

> **Tipp:** Die Masse spielt beim freien Fall keine Rolle!`,

  gemini_chemie: `Gerne! Hier ist eine Übersicht zur **Verbrennung von Methan** 🔥

### **1. Reaktionsgleichung**

$$\\text{CH}_4 + 2\\,\\text{O}_2 \\rightarrow \\text{CO}_2 + 2\\,\\text{H}_2\\text{O}$$

Oder in Textform:

${FENCE}
CH4 + 2 O2 -> CO2 + 2 H2O
${FENCE}

### **2. Beteiligte Stoffe**
*   **Methan** ($\\text{CH}_4$): brennbares Gas, Hauptbestandteil von Erdgas
*   **Sauerstoff** ($\\text{O}_2$)
*   **Kohlenstoffdioxid** ($\\text{CO}_2$)
*   **Wasser** ($\\text{H}_2\\text{O}$), bei der Verbrennung gasförmig: $\\text{H}_2\\text{O}_{(g)}$

### **3. Ionen und Gleichgewichte**
*   Natrium: $\\text{Na}^+$, Calcium: $\\text{Ca}^{2+}$, Sulfat: $\\text{SO}_4^{2-}$, Hydroxid: $\\text{OH}^-$
*   Neutralisation: $\\text{HCl} + \\text{NaOH} \\rightarrow \\text{NaCl} + \\text{H}_2\\text{O}$
*   Ammoniaksynthese: $\\text{N}_2 + 3\\,\\text{H}_2 \\rightleftharpoons 2\\,\\text{NH}_3$ mit $\\Delta H = -92 \\, \\text{kJ/mol}$
*   Mit Katalysator: $\\text{A} \\xrightarrow{\\text{Pt}} \\text{B}$
*   Direkt als Unicode: H₂O, CO₂, Na⁺, SO₄²⁻

---
*Quelle: Chemie-Lehrbuch Kapitel 4* [1]`,

  gemini_bio: String.raw`Hier ist eine kurze Zusammenfassung zur **Zellatmung** 🧬

### **Überblick**
Die Zellatmung wandelt Glucose und Sauerstoff in Energie (ATP) um.[1] Sie läuft in **drei Schritten** ab:

1.  **Glykolyse** (Cytoplasma)
    *   Abbau von Glucose zu Pyruvat
    *   Ausbeute: 2 ATP
2.  **Citratzyklus** (Mitochondrien-Matrix)
    *   Pyruvat wird zu $\text{CO}_2$ abgebaut [2, 3]
3.  **Atmungskette** (innere Mitochondrienmembran)
    *   Hier entstehen etwa 32 ATP

**Gesamtgleichung:**
$$\text{C}_6\text{H}_{12}\text{O}_6 + 6\,\text{O}_2 \rightarrow 6\,\text{CO}_2 + 6\,\text{H}_2\text{O} + \text{Energie (ATP)}$$

* **Merke:** Ohne Sauerstoff läuft nur die Glykolyse (Gärung) ab. [cite: 4]

**Quellen:**
* [1] Campbell Biologie
* [2] Lehrbuch Biologie, S. 112`,

  gemini_mindmap: `Klar! Hier ist eine Mindmap zum Thema Photosynthese:

**Mindmap: Photosynthese**

*   **Ort**
    *   Chloroplasten
    *   Thylakoidmembran
*   **Edukte**
    *   Wasser
    *   Kohlenstoffdioxid
    *   Licht
*   **Produkte**
    *   Glucose
    *   Sauerstoff
*   **Phasen**
    *   Lichtreaktion
    *   Calvin-Zyklus

Soll ich dazu auch Karteikarten erstellen?`,

  gemini_karteikarten: `Hier sind drei Karteikarten zur Zelle 🃏

**Karteikarte 1**
**Frage:** Was ist die Aufgabe der Mitochondrien?
**Antwort:** Sie erzeugen ATP durch die Zellatmung ("Kraftwerke der Zelle").

**Karteikarte 2**
**Frage:** Was unterscheidet Pro- und Eukaryoten?
**Antwort:** Eukaryoten haben einen Zellkern, Prokaryoten nicht.

*   **Frage:** Wo findet die Proteinsynthese statt?
*   **Antwort:** An den Ribosomen.

**Merke:** Die Zelle ist die kleinste lebende Einheit.`,

  gemini_geschichte: `### **Die Französische Revolution (1789)**

Gerne fasse ich die wichtigsten Punkte für dich zusammen:

*   **Ursachen:**
    *   Finanzkrise des Staates 💸
    *   Ständegesellschaft (Adel, Klerus, Bürger)
    *   Ideen der Aufklärung
*   **Verlauf:**
    1.  **1789:** Sturm auf die Bastille (14. Juli)
    2.  **1791:** Verfassung
    3.  **1793:** Hinrichtung Ludwigs XVI.
*   **Folgen:** Ende der Monarchie ⇒ Republik

| Jahr | Ereignis |
|---|---|
| 1789 | Sturm auf die Bastille |
| 1799 | Napoleon übernimmt die Macht |

Möchtest du, dass ich dir dazu ein Quiz erstelle? 🧠`,
};
