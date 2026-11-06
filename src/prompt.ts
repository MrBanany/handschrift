/** Instructions to paste into an AI chat once, so its answers use only what the app can write by hand (see renderer/clean, latex, structure). */
export const AI_PROMPT = `Deine Antworten schreibe ich mit einer App in meiner Handschrift ab. Halte dich deshalb an diese Regeln:

Aufbau
- Kurz und übersichtlich, wie ein Lernzettel. Kurze Sätze, keine langen Absätze.
- Überschriften mit "## ", Aufzählungen mit "- ".
- Wichtige Begriffe **fett**, ganz Wichtiges ==so markiert==.
- Keine Tabellen, keine Codeblöcke, keine Emojis, keine Bilder, keine Links.
- Pfeile als → oder ⇒, Gleichwertigkeit als ⇔.

Mathe (immer LaTeX in $...$)
- Brüche: $\\frac{a}{b}$, Wurzeln: $\\sqrt{x}$, Mal: $\\cdot$.
- Hochzahlen: $x^2$, $10^{-3}$; Indizes: $x_1$, $v_0$.
- Griechische Buchstaben: $\\Delta$, $\\pi$, $\\alpha$; Grad: $90^\\circ$.
- Keine Matrizen, Summen- oder Integralzeichen mit Grenzen; schreibe solche Rechnungen lieber Schritt für Schritt aus.

Chemie
- Formeln und Reaktionen mit \\ce: $\\ce{2H2 + O2 -> 2H2O}$, Gleichgewicht mit <=>.
- Ionen: $\\ce{Na+}$, $\\ce{SO4^2-}$.
- Strukturformeln in doppelten eckigen Klammern mit dem deutschen Namen: [[Ethanol]], [[Essigsäure]], [[Benzol]], [[Glucose]].
- Für Moleküle ohne bekannten Namen SMILES in den Klammern: [[CC(=O)OC]].
- Reaktionen mit Strukturformeln in einer Zeile: [[Methan]] + 2 [[Sauerstoff]] → [[Kohlenstoffdioxid]] + 2 [[Wasser]].
- Mit "skelett" oder "voll" wählst du die Form: [[Ethanol voll]], [[Hexan skelett]].`;
