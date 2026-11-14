# Lernzettel-Vorlagen (Entwurf)

Stand: 14. November 2026. Umgesetzt sind Karteikarten, Merkkasten und Cornell-Notizen.

## Was Schülern am meisten bringt

| Format | Nutzen | Aufwand | Stand |
|---|---|---|---|
| **Karteikarten** (Frage / Antwort) | Am größten: sich selbst abfragen ist die wirksamste Lernmethode, und KIs erzeugen Fragen gern. | mittel | umgesetzt |
| **Merkkasten** (Merksatz, Definition) | Hoch: steht in fast jedem Schulheft, KIs schreiben „Merke:“ von sich aus. | klein | umgesetzt |
| **Cornell-Notizen** | Mittel: gute Methode, aber an deutschen Schulen wenig bekannt. | mittel | umgesetzt |

## Karteikarte = Faltkarte

Eine Karte ist ein Rahmen über die ganze Breite mit einem senkrechten Strich in der Mitte: links die Frage, rechts die Antwort.

- **Gedruckt:** ausschneiden, an der Mitte falten. Vorne steht die Frage, hinten die Antwort. Kein Vorder-/Rückseiten-Druck nötig (der passt bei den meisten Druckern nicht genau).
- **In GoodNotes:** die rechte Hälfte abdecken und sich abfragen. Rahmen und Schrift sind Stiftstriche, also radierbar und mit dem Lasso kopierbar.
- Eine Karte wird nie über zwei Seiten geteilt, sie rutscht als Ganzes auf die nächste Seite. Ist sie höher als eine ganze Seite, wird sie als normaler Text geschrieben.
- Nicht umgesetzt: feste Größen A6/A7 und „eine Karte pro GoodNotes-Seite“. Die Karte ist so hoch wie ihr Text (mindestens zwei Zeilen).

Schreibweise in der KI-Antwort:

```
Karteikarte: Was ist die Glykolyse?
Antwort: Abbau von Glucose zu Pyruvat
- im Zytoplasma
- Gewinn: 2 ATP

Karteikarte: Wo läuft der Citratzyklus ab?
Antwort: In der Matrix der Mitochondrien.
```

Vertragen wird, was Gemini, Claude und ChatGPT tatsächlich schreiben: `**Karteikarte 3:**`, `Karte:`, `Frage:` statt `Karteikarte:`, ein `- ` davor, eine Leerzeile zwischen Frage und Antwort, Karten ohne Leerzeile dazwischen. Eine Karte entsteht nur, wenn direkt danach eine `Antwort:`-Zeile folgt; ein „Frage:“ im Fließtext bleibt Text. Die Antwort endet an einer Leerzeile, der nächsten Karte, einer Überschrift, einem Merkkasten oder einer Mindmap.

## Merkkasten

Ein Absatz, der mit `Merke:`, `Merksatz:` oder `Definition:` beginnt, bekommt einen Rahmen über die ganze Breite. Das Wort davor wird unterstrichen. Der Kasten endet an der Leerzeile, an einer Aufzählung oder an einer Überschrift.

```
Merke: Ohne Sauerstoff entstehen nur 2 ATP.
```

## Cornell-Notizen

```
Cornell: Zellatmung
Glykolyse | im Zytoplasma, 2 ATP
- weitere Zeile der Notiz
Citratzyklus | in den Mitochondrien
Zusammenfassung: Glucose wird in drei Schritten zu CO2 und Wasser abgebaut.
```

- Das Thema wird eine Überschrift. Die Stichwortspalte links nimmt 30 % der Breite, rechts stehen die Notizen, dazwischen ein senkrechter Stiftstrich.
- Zeilen ohne `|` gehören zur Notiz darüber. Eine Markdown-Tabelle (`| Stichwort | Notizen |` mit Trennzeile) wird genauso gelesen, Kopf- und Trennzeile fallen weg.
- Die Zusammenfassung steht unter einem Strich über die ganze Breite, das Wort ist unterstrichen.
- Seitenwechsel: Ein Stichwort mit seiner Notiz bleibt zusammen, der senkrechte Strich wird auf jeder Seite neu gezogen.
- Technisch dieselbe Funktion wie die Karteikarte (`placeBlock` mit zwei ungleich breiten Spalten, ohne Rahmen).

## Technik

- `src/renderer/cards.ts`, `markBlocks()`: hängt an jede Zeile eines Blocks nur ein Zeichen aus dem Privatbereich an (`CARD`, `NOTE`). Der Text selbst läuft durch alle normalen Regeln von `clean()`, deshalb gehen Brüche, Fett, Pfeile und Chemie auch in Karten.
- `layout()`, `placeBlock()`: schreibt die Zeilen mit dem normalen Zeilen-Schreiber in eine schmalere Spalte (`colL`/`colR`) und zieht danach den Rahmen als gerade Stiftstriche (`Connector`). Damit erscheinen Karten ohne weitere Änderung in Vorschau, Bild, PDF und GoodNotes-Datei.
- Die KI-Vorgabe (`src/prompt.ts`) nennt beide Schreibweisen.
