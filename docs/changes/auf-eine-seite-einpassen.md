# „Auf eine Seite einpassen“

Braucht der Text mehr als eine Seite, erscheint direkt unter den Knöpfen „In GoodNotes öffnen / Als Bild kopieren / PDF“ eine Hinweiszeile „Der Text braucht N Seiten.“ mit dem Knopf **Auf eine Seite einpassen** (Hausstil: `.note info` mit primärem Knopf). Bei einer Seite ist sie weg. Neben der Vorschau steht außerdem „1 Seite“ / „N Seiten“.

Der Knopf verkleinert **nur die Schrift (Größe/xh)**, **der Zeilenabstand bleibt immer wie eingestellt** (er gehört zu den Papierlinien). Kleinere Buchstaben heißt mehr Wörter pro Zeile, also weniger Zeilen. Der Wert landet im Regler „Größe“ und lässt sich dort ändern.

- `src/renderer/fit.ts`: `fitSize(xh, pages)` – Bisektion zwischen 60 % der Größe und der Größe (8 Schritte, 0,1-mm-Schritte), gezählt wird mit `layout()` ohne zu zeichnen. Untergrenze 60 %, nie unter dem Reglerminimum 1,1 mm. Test: `tests/fit.test.ts`.
- **GoodNotes:** gezählt wird das normale Layout und das GoodNotes-Layout (`gnSetup()`: A4, Papier-Zeilenabstand), beides muss auf eine Seite passen. Sonst wird nur für Bild/PDF eingepasst und gemeldet: „Eingepasst, aber in GoodNotes sind es wegen der Papierlinien N Seiten.“
- Meldungen: „Passt schon auf eine Seite.“, „Passt auch klein nicht auf eine Seite. Der Zeilenabstand bleibt, wie er ist.“ (nichts wird geändert; auch bei vielen kurzen Zeilen, wo kleinere Schrift nichts bringt).
- Der Zeilenabstand-Regler hat wieder seine alte Untergrenze 6 mm; nur die Größe darf bis 1,1 mm (vorher 1,5).
- Eingepasst wird der ganze Text im Feld (nicht nur eine Markierung).

**Gesehen** (Dev-App, iPad hoch 768×1024, Muster-Handschrift, echter Klick):
- 12 lange Absätze liniert (Größe 2,6, Abstand 8,7): „2 Seiten“ + Hinweiszeile → Klick → „1 Seite“, Größe 2,1, Abstand 8,7, GoodNotes 1 Datei, Hinweiszeile weg.
- Kariert (3,0 / 10): „2 Seiten“, GoodNotes 2 Dateien → Größe 2,0, Abstand 10, „1 Seite“, GoodNotes 1 Datei.
- 40 lange Absätze: „Passt auch klein nicht …“, Werte unverändert. 40 kurze Zeilen: dieselbe Meldung.

Nicht geprüft: echtes iPad, GoodNotes selbst (nur die Zahl der erzeugten Dateien).
