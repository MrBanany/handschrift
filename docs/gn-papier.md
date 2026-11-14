# GoodNotes zeigt Punkte statt unseres Papiers

Stand 14. November. Fehler: Die importierte Seite zeigt das Punktraster, obwohl unser Anhang-PDF kariert ist (auch mit frischen UUIDs). Nur `thumbnail.jpg` ist kariert.

## Was die echten Dateien belegen

Geprüft: `ex1`, `ex2`, `ex3`, `record` aus parser-for-goodnotes (alle mit Punktraster, eine Seite).

- **Papiername**: In allen vier Dateien steht im Papier-Ereignis (Ereignis-Feld 2) derselbe Name f9 = `CC365888-75C9-5DBF-B1D4-A7E8E0AD3B7F_standard_1_2 - White`. Namen für kariert oder liniert kommen nirgends vor. Die Websuche (Name, UUID, „GoodNotes file format“) fand nichts dazu. Lösung (a) „echten Namen einsetzen“ ist ohne eine echte karierte Datei nicht möglich.
- **Rasterangabe f18** im selben Ereignis: Rechteck (44; 58,67)–(746,24; 961,49), dann 28,417 und 0,917, dann f5 = 1. Das passt zu Rand, Punktabstand (28,417 Einheiten = 5,47 mm), Punktgröße und Musterart. Dazu im Seiten-Ereignis (Feld 54) f17 mit zwei Farben: Grau 0,867 und Weiß. Deutung (nicht bewiesen): GoodNotes zeichnet das Muster selbst aus diesen Angaben und benutzt das PDF dafür nicht.
- **Papier-PDF**: Anhang, im Ereignis „Anhang hinzugefügt“ (Feld 6) mit f12 = {1, 1}. Zwei Fassungen: 41791 Byte (ex1, ex3) und 41951 Byte (ex2, record).
- **Bilder auf der Seite** (ex1: 3 PNG, ex3: 2 JPEG): Anhang-Datei, Eintrag in `index.attachments.pb`, Ereignis Feld 6 mit leerem f12, und in `notes/<id>` ein Satzpaar wie bei einem Strich. Der zweite Satz hat Feld 1 statt 7: Rahmen (Ursprung, Größe), Mitte und Größe, Anhang-UUID. Kein Eintrag in `index.search.pb`.
- Keine der Dateien ist ein importiertes PDF. Wie GoodNotes eine solche Seite kennzeichnet, ist nicht belegt.

## Testdateien

Erzeugen: `GN_TEST=1 npx vitest run tests/goodnotes.test.ts` schreibt nach `public/gn-test/` (nicht im Repository). Inhalt: kariertes Papier, sechs Zeilen Wellen, die auf den Grundlinien stehen.

| Datei | Änderung | Zeigt die Seite Karos, heißt das |
|---|---|---|
| `1-ohne-papiername.goodnotes` | Papier-Ereignis ohne f9 und f18 | GoodNotes nimmt unser PDF, sobald Name und Rasterangabe fehlen |
| `2-ohne-raster-angabe.goodnotes` | nur f18 entfernt, Name bleibt | die Rasterangabe f18 steuert das Muster, nicht der Name |
| `3-papier-als-bild.goodnotes` | Papier unverändert, dazu die Karos als deckendes PNG unter der Schrift | Bild-Elemente funktionieren; das Bild verdeckt die Punkte |

Am iPad jede Datei öffnen und notieren:

1. Öffnet GoodNotes die Datei? (Fehlermeldung wörtlich)
2. Was ist auf der Seite: Karos, Punkte, weiß, oder Karos und Punkte zugleich?
3. Stehen die Wellen auf den Linien?
4. Nur Datei 3: Lässt sich das Karo-Bild antippen und verschieben? Wählt das Lasso es mit aus, wenn man eine Welle einkreist? Radiert der Radierer nur die Wellen?

## Wie es weitergeht

- Datei 1 oder 2 zeigt Karos: den Weg in `goodnotesFile` fest einbauen (`trial.drop`).
- Nur Datei 3 zeigt Karos: Papier als Bild einbauen. Nachteil: das Bild ist ein Objekt auf der Seite, es lässt sich möglicherweise verschieben oder löschen.
- Keine zeigt Karos: Linien als helle Stiftstriche schreiben. Sie sind radierbar, und die Punkte bleiben darunter sichtbar.
- Mit einer echten, leeren karierten und linierten Seite aus GoodNotes (als `.goodnotes` exportiert) lassen sich f9 und f18 direkt ablesen. Das wäre die sauberste Lösung: GoodNotes zeichnet dann sein eigenes Papier, und wir richten den Zeilenabstand danach aus.
