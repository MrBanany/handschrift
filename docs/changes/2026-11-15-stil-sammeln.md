# 2026-11-15 – Schreibstil lernt bei jedem Upload dazu

Dateien: `src/segmentation/style.ts` (neu `mergeStyles`), `src/main.ts` (nur der Notizen-Upload), `tests/style.test.ts`, `tests/backup.test.ts` (Beispiel-Stil mit Abständen und Seitenzahl).

- Vorher ersetzte jeder neue Upload unter „Schreibstil aus Notizen lernen“ das alte Ergebnis. Jetzt wird jedes neue Ergebnis mit dem gespeicherten verrechnet: Größe, Zeilenabstand, Wort- und Buchstabenabstand sind der Mittelwert beider, gewichtet nach der Zeilenzahl dahinter. Zeilen und Seiten werden addiert, die Anzeige „aus N Zeilen auf M Seiten“ zeigt die Gesamtzahl.
- Kalibrierung (`probeStyle`) wird nur auf das neue Ergebnis angewendet, bevor es zum gespeicherten (schon kalibrierten) addiert wird, also nie doppelt.
- Gleiche Notizen zweimal hochgeladen ändern die Werte nicht (nur die Zähler wachsen). Kann ein Upload die Abstände nicht messen, gelten die des anderen.
- Format unverändert (`style:<Handschrift>` mit denselben Feldern): alte gespeicherte Werte laden weiter, Backup und Import nehmen es wie bisher mit. „Zurücksetzen“ löscht alles. Die Vergleichsansicht zeigt die neueste hochgeladene Seite mit dem gesamten gelernten Stil.
- Nicht in der App mit echten Notizen ausprobiert, nur die Verrechnung ist getestet.
