# GoodNotes-Papier: kariert und liniert

Stand 14. November. Fehler war: Die importierte Seite zeigte das Punktraster, obwohl unser Anhang-PDF kariert war.

## Befund

GoodNotes zeigt das Papier, das zum **Papiernamen** im Papier-Ereignis gehört (Ereignis-Feld 2, f9). Unsere Dateien trugen immer den Namen des Punktrasters. Jedes Papier hat einen eigenen Namen `<UUID>_<Größe>_1_2 - White`.

Abgelesen aus drei leeren A4-Seiten, die GoodNotes selbst exportiert hat (`samples/`, nicht im Repository), und aus den vier alten Beispieldateien (parser-for-goodnotes, Punktraster, Größe „standard“):

| Papier | UUID im Namen | Größe | Linienabstand | erste Linie (Unterkante) | Textbereich ab |
|---|---|---|---|---|---|
| liniert breit | `AA273C17-F440-5125-B34E-F9C3C62F89E2` | a4 | 25 pt = 8,82 mm | 50 pt | 25 pt |
| liniert schmal | `238EE861-EE9A-51BD-B010-832CD3C50D2C` | a4 | 17,5 pt = 6,17 mm | 50,5 pt | 33 pt |
| kariert | `9FE8F365-4BEE-5057-8573-1A56C77CAC19` | a4 | 16 pt = 5,64 mm | 16 pt | 32 pt |
| Punkte | `CC365888-75C9-5DBF-B1D4-A7E8E0AD3B7F` | standard | 16 pt | – | 32 pt |

Weitere Felder im Papier-Ereignis:

- f8: Seitengröße in GoodNotes-Einheiten (132 pro Zoll). A4 = 1091,35 × 1543,46.
- f7 und f12.f1 (nur in den neuen Dateien): Linienabstand in Einheiten, als Double.
- f18: Textbereich (Ursprung 24 pt; „ab“ aus der Tabelle, Größe = Seite minus zweimal den Rand), dann Linienabstand minus 0,5 pt, dann 0,5 pt (Linienstärke), dann f5 = 1. f18 beschreibt die Schreibzeilen, nicht die Art des Musters: f5 ist bei allen Papieren 1.
- Seiten-Ereignis (Feld 54) f17: Grau 0,867 und Weiß, bei allen Papieren gleich.
- Das Papier-PDF (svg2pdf, weiße Fläche, graue 0,5-pt-Linien, Farbe 0,816 / 0,824 / 0,827) liegt als Anhang bei.

## Was der Export jetzt macht

`gnPaper()` in `src/export/goodnotes.ts` wählt zum eingestellten Papier das GoodNotes-Papier:

- **Liniert**: schmal, wenn der eingestellte Zeilenabstand höchstens 7,26 mm ist, sonst breit.
- **Kariert**: so viele Kästchen pro Zeile, dass der Zeilenabstand nicht mehr als 15 % unter dem eingestellten liegt (8–12 mm → 2 Kästchen = 11,29 mm).
- Seite A4, Zeilenabstand und Rand kommen vom Papier, damit jede Grundlinie auf einer Linie steht. Der eingestellte Zeilenabstand und Rand gelten in der GoodNotes-Datei also nicht.
- Das Papier-Ereignis bekommt Name, Größe, f7, f12.f1 und f18 wie in den echten Dateien (Bit für Bit gleich, geprüft gegen `samples/`). Das PDF zeichnen wir selbst an denselben Stellen (`paperPdf`).
- **Leer**: kein GoodNotes-Name bekannt. Die Datei geht den alten Weg (Seite „standard“, Name des Punktrasters) und zeigt vermutlich weiter Punkte. Dafür fehlt eine leere Seite ohne Muster aus GoodNotes.

## Testdateien

`GN_TEST=1 npx vitest run --dir tests tests/goodnotes.test.ts` schreibt nach `public/gn-test/` (nicht im Repository): `kariert.goodnotes`, `liniert-schmal.goodnotes`, `liniert-breit.goodnotes`, je sechs Zeilen Wellen auf den Grundlinien.

Am iPad je Datei prüfen:

1. Öffnet GoodNotes die Datei?
2. Zeigt die Seite das richtige Papier (keine Punkte)?
3. Stehen die Wellen mit dem Fuß genau auf den Linien?
4. Seite hinzufügen: Hat die neue Seite dasselbe Papier?

## Falls es nicht reicht

Noch im Code, ungenutzt: Papier-Ereignis ohne Name (`drop`) und Papier als deckendes Bild unter der Schrift (`image`, so speichert GoodNotes eingefügte Bilder: Anhang, Ereignis Feld 6 mit leerem f12, in `notes/<id>` ein Satzpaar mit Feld 1 statt 7). Das Bild wäre der Weg für „Leer“, wenn kein Name zu bekommen ist.
