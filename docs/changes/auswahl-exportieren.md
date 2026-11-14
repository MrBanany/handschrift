# Nur den markierten Text exportieren

Ist im Textfeld etwas markiert, exportieren „In GoodNotes öffnen“, „Als Bild kopieren“ und „PDF“ nur diesen Teil; die Vorschau zeigt weiter alles.
Unter den Knöpfen steht dann „Nur der markierte Text wird exportiert (N Zeichen). Markierung aufheben, dann kommt wieder alles.“ (`#selNote`).

- `exportText()` in `src/main.ts` liefert Auswahl oder ganzen Text; `renderAll` (PDF/Kopieren) und der GoodNotes-Knopf benutzen sie.
- Ein fertig gerendertes Export-Ergebnis (`ready`, für das zweite Tippen auf dem iPad) wird verworfen, wenn sich der markierte Text ändert.
- Einschränkung (`shortcut:` im Code): Buchstaben-Tausch aus der Vorschau wird bei Auswahl nicht angewendet, weil er vom Textanfang an zählt.

Geprüft im Browser (3 Seiten Text): ohne Auswahl 8 GoodNotes-Dateien / PDF 1,2 MB; mit Auswahl von 3 Zeilen 1 Datei / PDF 72 KB; Hinweis erscheint und verschwindet. Nicht geprüft: Markieren per Finger auf dem iPad (Auswahl bleibt dort nach dem Tippen auf einen Knopf erhalten, ist aber nicht gesehen).
