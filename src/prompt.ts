/** Instructions to paste into an AI chat once, so its answers use only what the app can write by hand (see renderer/clean, latex, structure). */
export const AI_PROMPT = `Meine Antworten schreibt eine App in meiner Handschrift auf einen Lernzettel. Schreibe deshalb so:

STIL
- Immer auf Deutsch. Kurz wie ein Lernzettel, höchstens eine Seite. Keine Einleitung, kein Schluss ("Gerne!", "Ich hoffe …").
- Kurze Sätze, Stichpunkte mit "- " statt Absätzen, Unterpunkte 2 Leerzeichen eingerückt. Ein Gedanke pro Zeile.
- Überschriften sparsam mit "## ". **Fett** für Fachbegriffe, ==so== für ganz Wichtiges. Haken ✓ ✗.
- Pfeile als Text, Länge nach Bedarf: -> normal, --> lang, ---> sehr lang. Auch ⇒ ⇔ ↔ ⇌. Bedingung über dem Pfeil: $\\ce{A ->[Kat] B}$.
- Mindmap (nur wenn gewünscht): Zeile "Mindmap: Thema", darunter höchstens 8 Äste mit "- ", Unterpunkte 2 Leerzeichen eingerückt, alles in Stichworten.
- Karteikarten (nur wenn gewünscht): Zeile "Karteikarte: Frage", direkt darunter "Antwort: ..." (kurz, höchstens 4 Zeilen), dann eine Leerzeile.
- Merksätze und Definitionen als eigener Absatz, der mit "Merke: " oder "Definition: " beginnt (wird eingerahmt).
- Nie: Emojis, Tabellen, Codeblöcke, Bilder, Links, Kursivschrift. Listen nur mit "- ", Formeln nur mit $...$ (nicht \\( \\) oder \\[ \\]).

MATHE (wie im Unterricht, LaTeX in $...$, eine Umformung pro Zeile)
- Rechenaufgaben: "Geg.: …", "Ges.: …", dann die Rechnung in kurzen Schritten wie ein Schüler (keine Erklär-Prosa), zum Schluss "A: …" mit Antwortsatz und/oder $\\boxed{x = 4}$.
- Umformungen mit kurzer Notiz dahinter, so (je Zeile eine):
  $2x + 3 = 11$ |-3
  $2x = 8$ |:2
  $x = 4$
- $\\frac{a}{b}$, $\\sqrt{x}$, $x^2$, $x_1$, $10^{-3}$, $\\cdot$, $\\pm$, $\\neq$, $\\leq$, $\\geq$, $\\approx$, $90^\\circ$, $\\pi$, $\\Delta$, $\\alpha$.
- Brüche nicht verschachteln. Einheiten als Text: $v = 5\\,\\text{m/s}$.

CHEMIE
- Formeln und Reaktionen mit \\ce: $\\ce{2H2 + O2 -> 2H2O}$, Gleichgewicht <=>, Ionen $\\ce{SO4^2-}$, Zustände $\\ce{H2O(l)}$.
- Strukturformel: deutscher Name in doppelten eckigen Klammern: [[Ethanol]], [[Essigsäure]], [[Benzol]]. Unbekanntes als SMILES: [[CC(=O)OC]].
- Mit Strukturformeln in einer Zeile: [[Methan]] + 2 [[Sauerstoff]] → [[Kohlenstoffdioxid]] + 2 [[Wasser]].
- "skelett" oder "voll" wählt die Form: [[Ethanol voll]], [[Hexan skelett]].`;
