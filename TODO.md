# To-do – Handschrift-App

Stand: 5. November 2026. Live: https://mrbanany.github.io/handschrift/ (jeder Push auf `main` geht automatisch online).

## Als Nächstes

- [ ] **iPad-Test** (bewusst ans Ende gelegt)
  - Safari → Teilen → „Zum Home-Bildschirm“, dort die Vorlage neu importieren (eigener Speicher)
  - „Handschrift kopieren“ → in GoodNotes einsetzen → mit dem Lasso verschieben/größer ziehen. Wie groß kommt sie an? (Laut Nutzerberichten hängt das vom Zoom beim Einsetzen ab.)
  - Schrift in der Vorschau lange drücken → Kopieren; in Split View hinüberziehen
  - „Als PDF teilen“ → in GoodNotes importieren
  - Hell/Dunkel, Linien Eng/Mittel/Weit, Kariert, Prüf-Ansicht (Zeichen → „Optimierung prüfen“)
- [ ] **Notizen erneut hochladen**: Die Erkennung ist neu (siehe unten). Bitte die vollgeschriebene GoodNotes-Datei noch einmal unter „Schreibstil aus Notizen lernen“ wählen und sagen, was herauskommt.
- [ ] **GoodNotes-Linien abgleichen**: Linien auf einer GoodNotes-Seite (liniert schmal/breit) zählen und die Werte in `RULES` (src/main.ts) anpassen. Aktuell 6,4 / 7,1 / 8,7 mm – nicht bestätigt.
- [ ] **Hochzahlen** `² ³` und `≈` fehlen noch (Idee: die eigenen Ziffern verkleinert und angehoben verwenden).

## Erledigt am 5. November 2026

- [x] Prüf-Fenster: Das ganze Fenster war der Knopf „Alle übernehmen“ (CSS-Namenskonflikt `.sheet`). Repariert. Die Zeichen kommen jetzt mit der größten Änderung zuerst.
- [x] „Text kopieren“ war als Buchstaben-Kopieren gebaut (unsichtbare Textebene im PDF). Die Ebene ist entfernt, damit GoodNotes nicht mehr Buchstaben statt Handschrift kopiert. Kopiert wird die Handschrift als Bild.
  - **Grenze**: Echte, radierbare GoodNotes-Tinte kann keine fremde App erzeugen. Der Radierer löscht nur Stift- und Marker-Striche, keine Bilder oder PDFs; das `.goodnotes`-Format ist nicht offen. Bilder lassen sich aber mit dem Lasso verschieben, skalieren, kopieren, löschen und zuschneiden.
- [x] Schreiben-Seite einfacher: zwei Knöpfe „Handschrift kopieren“ und „Als PDF teilen“ direkt unter dem Text. „Exportieren als“ und „Auf Text zuschneiden“ sind entfernt.
- [x] Notizen-Erkennung neu: Zeilen werden an der dichten x-Höhen-Zone erkannt (Ober- und Unterlängen verbinden die Zeilen sonst). Linien, Karos und Rand werden entfernt, helle Stifte und dunkles Papier funktionieren, der Abgleich läuft über eine Probeseite in der eigenen Handschrift. Getestet mit 2 Seiten in eigener Handschrift auf engen Linien: Größe 2,5 statt 2,6 mm, Zeilenabstand 7,1 mm exakt.
- [x] Fehlende Symbole `→ ← > < + = × * ✓ ° •` werden in der eigenen Strichstärke gezeichnet (`src/glyphstore/symbols.ts`).
- [x] **Fett** und Überschriften aus KI-Antworten werden unterstrichen statt entfernt.

## Ideen (aus der Recherche)

**Konkurrenz kurz:**
- **Apple Notizen „Smart Script“** (iPadOS 18+): fügt Text in eigener Handschrift ein, aber nur in Apple Notizen, nur in bestehende handschriftliche Notizen, wirkt laut Tests „zu perfekt“. Nicht in GoodNotes.
- **Conwrite** (iPadOS 26+): jeden Buchstaben einmal mit dem Pencil schreiben, dann Text in eigener Handschrift; In-App-Käufe.
- **CursiveAI, Text To Handwriting (7,99 $/Monat), texxio, Text2Handwriting**: nur fertige Schriftarten, nicht die eigene Handschrift.

**Wo wir besser sind:** eigene Handschrift mit mehreren Varianten pro Zeichen plus Paaren und Wörtern, kostenlos, ohne Konto, offline, Daten bleiben auf dem Gerät, direkt für GoodNotes (Kopieren als Bild oder PDF-Seiten mit Linien), KI-Antworten einfach einfügen (Pfeile, Symbole, Unterstreichungen).

**Feature-Ideen, grob nach Wirkung sortiert:**
1. [ ] **Vorlage direkt in der App ausfüllen** mit dem Apple Pencil (Zeichenfeld pro Kästchen) – kein Umweg über GoodNotes-Export. Größte Vereinfachung.
2. [ ] **Weitere Hervorhebungen**: `==Text==` → Textmarker, Überschriften etwas größer, Einkreisen. (Fett/Überschriften unterstreichen und handgezeichnete Aufzählungspunkte sind erledigt.)
3. [ ] **Eigene Schriftart erzeugen** (Idee aus dieser Runde): aus der Handschrift eine Schrift (TTF) bauen und per Profil auf dem iPad installieren. Dann ist Text in GoodNotes echter Text in eigener Handschrift-Optik (mit der Tastatur änderbar, aber nicht radierbar und ohne Varianten). Großer Aufwand.
4. [ ] **Kurzbefehl „In Handschrift“**: iOS-Kurzbefehl öffnet die App mit `?text=…` vorbefüllt. Achtung: Links öffnen Safari, nicht die Home-Bildschirm-App, und die beiden haben getrennten Speicher (Handschrift wäre in Safari nicht da). Erst klären, ob das trotzdem lohnt.
5. [ ] **Mathe**: Hochzahlen (x²), einfache Brüche, `$…$`-Formeln aus KI-Antworten.
6. [ ] **Lernzettel-Layouts**: Cornell-Notizen, Karteikarten (A6/A7), später Mindmap (niedrige Priorität).
7. [ ] **Stifte**: Kuli, Füller (Strichbreite schwankt), Bleistift-Körnung; mehrere Farben (Überschrift blau, Text schwarz).
8. [ ] **Natürlicher**: zum Seitenende minimal unordentlicher werdend; eigene Wörterliste (Fachwörter) als Vorlage-Zusatzseite.
9. [ ] **Erster Start**: 3-Schritte-Assistent (Muster ausprobieren → Vorlage → Import).
10. [ ] Alte offene Punkte: Ein-/Austrittspunkte in der Prüf-Ansicht verschieben, SVG-Export.

Hinweis aus der Recherche: Manche Schulen haben Regeln zu „generierter Handschrift“ bei Abgaben. Die App ist vor allem für eigene Notizen und Lernzettel gedacht.

## Technische Notizen für später

- Vorlage: Kästchen-Positionen nicht verschieben, sonst passen bereits ausgefüllte Vorlagen nicht mehr (sonst `TEMPLATE_VERSION` erhöhen und alte Version weiter unterstützen).
- Dunkler Text auf der Vorlage muss mehr als 15 mm Abstand zu den Eckmarken halten (`register.ts` zählt alles mit Helligkeit < 100 im Umkreis).
- Alles mit Helligkeit > 180 gilt nicht als Tinte (`extract.ts`); die grauen Hilfsbuchstaben haben ~222.
- Die eigene Test-Vorlage liegt in `samples/vorlage.pdf` (nicht im Repository).
- Notizen-Erkennung (`segmentation/style.ts`): misst Tinte, also x-Höhe plus Strichdicke. `probeStyle()` in main.ts misst eine Probeseite in der eigenen Handschrift genauso und rechnet über das Verhältnis zurück. Test im Browser: Seite mit `layout` + `drawPage` rendern, mit `toPdf` zum PDF machen und über das Datei-Feld `#notes` laden.
- Hervorhebung: `clean()` markiert Fett/Überschriften mit `EMPH` (Steuerzeichen /), `layout()` zeichnet den Unterstrich als `Connector`.
