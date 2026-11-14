# GoodNotes-Export: Fehlersuche

Geprüft mit `tests/gn-reader.ts` (unabhängiger Leser) und einer Beispiel-Handschrift aus Strichen (Stamm + Fuß je Zeichen), jeweils auf liniertem, kariertem und leerem Papier: leerer Text, nur Leerzeichen, 1 Zeichen, Überschrift, `==Marker==`, Unterstreichen, `\boxed`, Mindmap, Funktionsgraph, Karteikarte, Cornell, Merkkasten, alle 23 KI-Antworten aus `tests/ki-answers.ts` (Strichstärke 3, breites Papier), Strichstärke 0 und 3, Schreibschrift an/aus, ein Text mit 39 Seiten.

## Gefunden und behoben (`src/export/goodnotes.ts`, Tests in `tests/goodnotes.test.ts`)

1. **Textmarker fehlte ganz.** `inkStrokes` kannte `page.marks` nicht: ein mit `==…==` markiertes Wort stand in der Vorschau, im Bild und im PDF gelb hinterlegt, in der GoodNotes-Datei gar nicht. Jetzt wird jede Markierung ein breiter Strich (Breite = Höhe der Markierung, Farbe wie im Bild: gelb mit 42 % Deckkraft, auf Wunsch eigene Farbe über den neuen letzten Parameter `mark` von `goodnotesFile`). Er steht **vor** der Schrift, liegt also darunter. GoodNotes-Stiftenden sind rund und würden um die halbe Breite überstehen: die Linie wird um die halbe Höhe gekürzt, so endet die Markierung dort, wo die im Bild endet; eine Markierung, die kürzer als dick ist, wird ein Punkt in der Mitte.
2. **Kleine Striche auf jeder Rundung.** Beim Ausdünnen bleiben an Treppenstufen einzelne Pixel übrig; `centerlines` machte aus jedem einen eigenen Mini-Strich in voller Stiftbreite, auf der Linie liegend: ein kleines „o“ (5 px dick) ergab den Ring **plus 15 Zwei-Punkt-Striche**, ein 300 px langer Bogen 50 statt 1 Strich. Unsichtbar, solange man nichts anfasst, aber nach dem Radieren eines Buchstabens bleiben Punkte stehen, und die Datei wird größer. Jetzt werden solche Reste (1–3 Pixel neben einer schon gezeichneten Linie) weggelassen: Ring 1 Strich, Bogen 1 Strich.
3. **Farbe nur als `#rrggbb` lesbar.** Alles andere (`#abc`, `rgb(…)`, Unsinn) ergab NaN-Farben in der Datei. Neu `cssRgba()` liest `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()`; was nicht lesbar ist, fällt auf Tinte/Schwarz zurück.
4. **Strich mit NaN spoilte die ganze Seite.** Ein Strich mit NaN in Punkten oder Breite wird jetzt weggelassen, statt NaN in die Datei zu schreiben.

## Geprüft, in Ordnung

- Jede Seite kommt vollständig: Strichzahl in der Datei = Strichzahl aus `inkStrokes` in allen Fällen (leer, nur Leerzeichen, 1 Zeichen: leere Seite mit Papier, 4 KB).
- Kein Strich außerhalb der A4-Seite, keine NaN-Punkte, in keinem der Fälle.
- Grundlinien: höchstens 0,4 mm neben der Papierlinie (Schreibschwung des Satzes, `hasty` 0,3), auf allen drei Papieren.
- Farben: Tinte, Überschrift (Glyphen und Unterstreichung) und Fehlend-Kästchen stimmen; Breiten bei Strichstärke 0: 0,3–0,63 mm, bei 3: 0,6–0,93 mm (genau +0,3 mm).
- 39 Seiten (25 Seiten Text à 24 Zeilen, Node): 2,9 s, 5,6 MB gesamt, größte Datei 149 KB.
- Leere, 1×1-, 0×0-, vollflächige (400×300), Ring-, Wellen- und Rausch-Glyphen: kein Absturz, höchstens 0,8 s (vollflächiger 400×300-Block).

## Beobachtet, nicht geändert

- Bei sehr dicken Strichen (8 px statt 5) bleiben an Bogenspitzen echte Seitenäste von 5–7 px stehen (Auslöser: Wellenband). Eine Abstimmungsfrage der Spur-Schwelle (`edge + 2`), kein Fehler; mit der echten Muster-Handschrift am iPad ansehen.
- In `main.ts` (nicht angefasst): (a) `goodnotesFile` bekommt `o.mark` nicht übergeben, eigene Markerfarben erscheinen in GoodNotes noch gelb; als 8. Argument durchreichen. (b) Bei 10 oder mehr Seiten heißen die Dateien `handschrift-1` … `handschrift-10`: alphabetisch steht die 10 vor der 2. Mit `padStart` auf die Stellenzahl würde die Reihenfolge beim Öffnen stimmen.
- Der Textmarker als Stift (breiter Kugelschreiber mit Deckkraft) ist nur im Test gelesen, nicht in GoodNotes gesehen: ob GoodNotes die Deckkraft und so große Breiten beim Kugelschreiber annimmt, zeigt erst das iPad.
