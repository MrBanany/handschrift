# Knopf „Auf eine Seite einpassen“

Neben der Vorschau (Zeile „Buchstaben antippen …“) steht jetzt „1 Seite“ / „N Seiten“ und der Knopf „Auf eine Seite einpassen“.
Der Knopf verkleinert **Größe (xh) und Zeilenabstand gemeinsam**, gerade so weit, dass der Text auf eine Seite passt. Die Werte landen in den normalen Reglern („Größe“, „Zeilenabstand“) und lassen sich dort wieder ändern.

- `src/renderer/fit.ts`: `fitSize()` – Bisektion über den Maßstab zwischen 60 % und 100 % (8 Schritte, Werte in 0,1-mm-Schritten abgerundet). Es zählt nur Seiten mit `layout()`, es wird nichts gezeichnet. Test: `tests/fit.test.ts`.
- **GoodNotes:** Bei liniert/kariert nimmt der GoodNotes-Export den Zeilenabstand vom Papier (`gnPaper`) und eine eigene A4-Seite. Die Suche zählt deshalb für jeden Maßstab beides (Seite wie in Vorschau/PDF **und** GoodNotes-Layout, neu `gnSetup()` in `main.ts`, wird auch vom GoodNotes-Knopf benutzt) und verlangt, dass beides auf eine Seite passt. Geht das nicht, wird nur für Bild/PDF eingepasst und gemeldet: „Eingepasst, aber in GoodNotes sind es wegen der Papierlinien N Seiten.“
- Meldungen: „Passt schon auf eine Seite.“, „Passt auch klein nicht auf eine Seite.“ (nichts wird geändert), „Auf eine Seite eingepasst (Größe …, Zeilenabstand … mm).“
- Reglergrenzen gesenkt, damit 60 % auch bei enger Linierung möglich ist: Größe 1,5 → 1,1 mm, Zeilenabstand 6 → 3,6 mm (index.html). Namen und andere Knöpfe unverändert.
- Eingepasst wird der ganze Text im Feld (nicht nur eine Markierung).

**Gemessen/gesehen** (Dev-App, iPad hoch 768×1024, Muster-Handschrift, echter Klick auf den Knopf):
- 34 Zeilen liniert: „2 Seiten“ (Größe 2,6, Abstand 8,7) → „1 Seite“ (2,1 / 7,2); GoodNotes: 1 Datei.
- 34 Zeilen kariert (3,0 / 10): „3 Seiten“, GoodNotes 2 Dateien → nach dem Einpassen (2,0 / 6,6) „1 Seite“, GoodNotes 1 Datei.
- Zweiter Klick: „Passt schon auf eine Seite.“ 120 Zeilen: „Passt auch klein nicht auf eine Seite.“, Werte unverändert.

Nicht geprüft: echtes iPad, GoodNotes selbst (nur die Zahl der erzeugten Dateien).
