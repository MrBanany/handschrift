# Prüfliste am iPad: „In GoodNotes öffnen“

Das GoodNotes-Format ist inoffiziell. Was die Datei enthält, prüfen die Tests (`tests/goodnotes.test.ts`); ob GoodNotes sie richtig anzeigt, zeigt nur das iPad. Dauer: etwa 10 Minuten.

Bitte zu jedem Punkt „ja“ oder „nein“ notieren, bei „nein“ ein Bildschirmfoto.

## Vorbereitung

1. Die App neu laden (Safari: Seite nach unten ziehen; Home-Bildschirm-App: schließen und neu öffnen), damit die neueste Version läuft.
2. Zahnrad → Papier **Kariert**.
3. Diesen Text einfügen:

   ```
   ## Test
   Das ist ein Test meiner Handschrift.
   A -> B und A => B
   ==wichtig== und $\frac{1}{2}$
   ```

4. „In GoodNotes öffnen“ → im Teilen-Menü GoodNotes wählen → als neues Dokument importieren.

## 1. Schrift und Papier (der wichtigste Teil)

| Was du siehst | Bedeutung | Weiter mit |
|---|---|---|
| Schrift da, Karos da | Alles richtig | Abschnitt 2 |
| Schrift da, Seite weiß | GoodNotes zeigt unser Papier-PDF nicht (oder die Linien sind zu blass) | Stark hineinzoomen: sind ganz blasse Linien zu sehen? Ergebnis melden. Dann gibt es zwei Testdateien |
| Schrift da, Punktraster statt Karos | GoodNotes nimmt sein eigenes Papier und ignoriert unseres | Melden. Dann müssen die Linien als Stiftstriche in die Datei |
| Seite ganz leer, keine Schrift | Seite und Tinte sind nicht verbunden | Melden, das wäre ein Rückfall |
| GoodNotes lehnt die Datei ab | Format nicht erkannt | Fehlermeldung wörtlich notieren, GoodNotes-Version dazu (Einstellungen → Über) |

Zusätzlich:
- [ ] Liegen die Karo-Linien genau unter den Grundlinien der Schrift, oder sind sie verschoben?
- [ ] Zeigt das Vorschaubild in der Dokumentübersicht dasselbe wie die Seite?

## 2. Ist es echte Tinte?

- [ ] **Radieren**: Mit dem Radierer über ein Wort fahren. Verschwinden einzelne Buchstaben bzw. Striche (nicht das ganze Bild)?
- [ ] **Pfeile und Bruchstrich** lassen sich genauso radieren wie Buchstaben.
- [ ] **Lasso**: Ein Wort einkreisen und verschieben. Bewegt sich nur dieses Wort?
- [ ] **Lasso → Farbe ändern**: Wird das Wort umgefärbt?
- [ ] **Lasso → Kopieren**, in ein anderes Notizbuch wechseln, einfügen. Kommt die Schrift dort als Tinte an (wieder radierbar)?
- [ ] Die Überschrift hat die eingestellte Überschriften-Farbe.

Bekannt: Der Textmarker (`==wichtig==`) fehlt in der GoodNotes-Datei, das Wort steht ohne Markierung da.

## 3. Größe

- [ ] Wirkt die Schrift so groß wie eigene Handschrift auf einer GoodNotes-Seite? (zu groß / passt / zu klein)
- [ ] In ein vorhandenes Notizbuch mit eigenem Text kopieren (Lasso → Kopieren → Einfügen): Passt die Größe neben der eigenen Schrift? Passen die Zeilen auf die Linien dort?
- [ ] Strichstärke im Vergleich zum eigenen Kugelschreiber in GoodNotes: dünner / gleich / dicker?

## 4. Mehrere Seiten

1. Einen langen Text einfügen (mehr als eine Seite, zum Beispiel den Testtext zehnmal).
2. „In GoodNotes öffnen“.

- [ ] Wie viele Dateien bietet das Teilen-Menü an? (Erwartet: eine Datei pro Seite, `handschrift-1.goodnotes`, `handschrift-2.goodnotes` …)
- [ ] Lassen sich alle auf einmal an GoodNotes geben, oder nur einzeln?
- [ ] Jede Datei wird ein eigenes Dokument mit einer Seite. Stimmt die Reihenfolge, fehlt Text am Seitenwechsel?
- [ ] Hat jede Seite Schrift **und** Papier?

## 5. Zweiter Import

Früher zeigte GoodNotes beim wiederholten Import altes Papier. Deshalb:

1. Papier auf **Liniert** stellen, denselben Text noch einmal „In GoodNotes öffnen“.

- [ ] Zeigt das neue Dokument Linien (nicht die Karos vom ersten Import)?
- [ ] Ist das erste Dokument unverändert?

## Was melden

GoodNotes-Version, iPadOS-Version, und die Antworten zu Abschnitt 1 bis 5. Bei Abweichungen reicht ein Bildschirmfoto der Seite.
