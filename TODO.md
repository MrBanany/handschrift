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
- [ ] **Ausfüllen in der App am iPad testen** (neu, nur mit Maus und simuliertem Stift getestet): Handschriften → „Hier mit dem Pencil ausfüllen“. Fühlt sich das Schreiben gut an? Verschiebt die Hand beim Schreiben die Seite? Ist „Größer“ zum Schreiben nötig?
- [ ] **Pfeile & Symbole selbst schreiben**: Handschriften → „nur Pfeile & Symbole“ herunterladen (1 Seite), in GoodNotes ausfüllen, als PDF exportieren und mit **demselben Namen** importieren. Danach im Reiter Zeichen unter „Pfeile & Symbole“ prüfen, ob alles drin ist.

## Erledigt am 5. November 2026

- [x] **Überschriften** (`## …` aus KI-Antworten) werden 1,3× größer geschrieben und unterstrichen.
- [x] **KI-Formeln**: LaTeX (`\frac`, `\sqrt`, `\cdot`, `\pm`, `\approx`, `^\circ`, griechische Buchstaben, Pfeile) und Chemie (`\ce{…}`, `H2SO4`, `6CO2`, `⇌`) werden in schreibbare Zeichen umgewandelt (`src/renderer/latex.ts`). „A4“ oder „MP3“ bleiben unverändert.
- [x] **Mehr Abwechslung**: Buchstabenbreite schwankt leicht, die Größe wandert langsam von Zeile zu Zeile, zum Seitenende wird die Schrift minimal lockerer.
- [x] **Notizen lernen**: mehrere Seiten/Dateien auf einmal (Hinweis in der App), Ergebnis nennt die Seitenzahl, danach **Vergleich** „Deine Seite“ / „So schreibt die App jetzt“. Getestet mit 3 Seiten: eingestellt 2,6 mm / 7,1 mm / Wort 1,4 / Buchstabe 0,22 → gemessen 2,7 / 7,1 / 1,43 / 0,21.
- [x] **Pencil-Ausfüllen**: „Kästchen-Ansicht“ zeigt vier Kästchen groß, „Weiter ›“ springt zu den nächsten (am Seitenende auf die nächste Seite).
- [x] **Erster Start**: Willkommen-Fenster mit 3 Schritten und „Meine Handschrift anlegen“ / „Erst mit Muster ausprobieren“.

- [x] Prüf-Fenster: Das ganze Fenster war der Knopf „Alle übernehmen“ (CSS-Namenskonflikt `.sheet`). Repariert. Die Zeichen kommen jetzt mit der größten Änderung zuerst.
- [x] „Text kopieren“ war als Buchstaben-Kopieren gebaut (unsichtbare Textebene im PDF). Die Ebene ist entfernt, damit GoodNotes nicht mehr Buchstaben statt Handschrift kopiert. Kopiert wird die Handschrift als Bild.
  - **Grenze**: Echte, radierbare GoodNotes-Tinte kann keine fremde App erzeugen. Der Radierer löscht nur Stift- und Marker-Striche, keine Bilder oder PDFs; das `.goodnotes`-Format ist nicht offen. Bilder lassen sich aber mit dem Lasso verschieben, skalieren, kopieren, löschen und zuschneiden.
- [x] Schreiben-Seite einfacher: zwei Knöpfe „Handschrift kopieren“ und „Als PDF teilen“ direkt unter dem Text. „Exportieren als“ und „Auf Text zuschneiden“ sind entfernt.
- [x] Notizen-Erkennung neu: Zeilen werden an der dichten x-Höhen-Zone erkannt (Ober- und Unterlängen verbinden die Zeilen sonst). Linien, Karos und Rand werden entfernt, helle Stifte und dunkles Papier funktionieren, der Abgleich läuft über eine Probeseite in der eigenen Handschrift. Getestet mit 2 Seiten in eigener Handschrift auf engen Linien: Größe 2,5 statt 2,6 mm, Zeilenabstand 7,1 mm exakt.
- [x] Fehlende Symbole werden in der eigenen Strichstärke gezeichnet (`src/glyphstore/symbols.ts`), im Reiter Zeichen als „Ersatz“ markiert. Ohne Ersatz (also „fehlt“): `± ÷ · § [ ] # |`.
- [x] **Fett** und Überschriften aus KI-Antworten werden unterstrichen statt entfernt.
- [x] Neue Vorlagenseite 8 **Pfeile & Symbole** (36 Zeichen je 3×: `→ ← ↑ ↓ ⇒ ⇔ ↔ + = ≠ ≈ < > ≤ ≥ ± × ÷ · ² ³ √ π ° Δ ∞ ✓ ✗ • * § ~ [ ] # |`), auch einzeln herunterladbar. Seiten 1–7 sind unverändert, alte ausgefüllte Vorlagen gehen weiter. Selbst geschriebene Symbole ersetzen die gezeichneten.
- [x] Hochzahlen: `x^2`/`m^3` werden zu `²`/`³`; ohne eigene Hochzahlen nimmt die App die eigenen Ziffern 2 und 3, verkleinert und angehoben.
- [x] **Vorlage direkt in der App ausfüllen**: Handschriften → „Hier mit dem Pencil ausfüllen“. Alle 8 Seiten, blättern, Rückgängig, „Größer“ (2,5×). Pencil schreibt, ein Finger verschiebt die Seite; ohne Pencil schreibt ein Finger und zwei Finger verschieben. „Übernehmen“ liest die Seiten wie einen PDF-Import ein.
- [x] **Textmarker**: `==Text==` bekommt einen gelben Marker-Strich hinter die Schrift.
- [x] Hoch- und Tiefzahlen für alle Ziffern aus den eigenen Ziffern: `x^4`, `10^{12}`, `CO_2`, `H_2O`, `a_1` und direkt eingefügte `x⁴ CO₂`.
- [x] KI-Antworten: `=>` bleibt `⇒`, `<=>` wird `⇔`, `<->` wird `↔`, ✅ wird ✓, ❌ wird ✗, das Minuszeichen `−` wird `-`.

## Ideen (aus der Recherche)

**Konkurrenz kurz:**
- **Apple Notizen „Smart Script“** (iPadOS 18+): fügt Text in eigener Handschrift ein, aber nur in Apple Notizen, nur in bestehende handschriftliche Notizen, wirkt laut Tests „zu perfekt“. Nicht in GoodNotes.
- **Conwrite** (iPadOS 26+): jeden Buchstaben einmal mit dem Pencil schreiben, dann Text in eigener Handschrift; In-App-Käufe.
- **CursiveAI, Text To Handwriting (7,99 $/Monat), texxio, Text2Handwriting**: nur fertige Schriftarten, nicht die eigene Handschrift.

**Wo wir besser sind:** eigene Handschrift mit mehreren Varianten pro Zeichen plus Paaren und Wörtern, kostenlos, ohne Konto, offline, Daten bleiben auf dem Gerät, direkt für GoodNotes (Kopieren als Bild oder PDF-Seiten mit Linien), KI-Antworten einfach einfügen (Pfeile, Symbole, Unterstreichungen).

**Feature-Ideen, grob nach Wirkung sortiert:**
1. [x] **Vorlage direkt in der App ausfüllen** – erledigt, mit Kästchen-Ansicht.
2. [ ] **Weitere Hervorhebungen**: Einkreisen, Markerfarbe wählbar. (Unterstreichen, größere Überschriften, Textmarker `==Text==` und Aufzählungspunkte sind erledigt.)
3. [ ] **Eigene Schriftart erzeugen** (Idee aus dieser Runde): aus der Handschrift eine Schrift (TTF) bauen und per Profil auf dem iPad installieren. Dann ist Text in GoodNotes echter Text in eigener Handschrift-Optik (mit der Tastatur änderbar, aber nicht radierbar und ohne Varianten). Großer Aufwand.
4. [ ] **Kurzbefehl „In Handschrift“**: iOS-Kurzbefehl öffnet die App mit `?text=…` vorbefüllt. Achtung: Links öffnen Safari, nicht die Home-Bildschirm-App, und die beiden haben getrennten Speicher (Handschrift wäre in Safari nicht da). Erst klären, ob das trotzdem lohnt.
5. [ ] **Mathe**: Buchstaben als Hochzahl (xⁿ), Minus in Hochzahlen (10⁻³), echte Bruchstriche (Zähler über Nenner statt a/b). (Ziffern hoch/tief und LaTeX aus KI-Antworten sind erledigt.)
6. [ ] **Chemie-Strukturformeln** (Wunsch): Skelettformeln zeichnen (z. B. aus SMILES). Großer Aufwand, eigener Baustein.
7. [ ] **Lernzettel-Layouts**: Cornell-Notizen, Karteikarten (A6/A7), später Mindmap (niedrige Priorität).
8. [ ] **Stifte**: Kuli, Füller (Strichbreite schwankt), Bleistift-Körnung; mehrere Farben (Überschrift blau, Text schwarz).
9. [ ] **Natürlicher**: eigene Wörterliste (Fachwörter) als Vorlage-Zusatzseite. (Lockerer zum Seitenende ist erledigt.)
10. [ ] Alte offene Punkte: Ein-/Austrittspunkte in der Prüf-Ansicht verschieben, SVG-Export.

Hinweis aus der Recherche: Manche Schulen haben Regeln zu „generierter Handschrift“ bei Abgaben. Die App ist vor allem für eigene Notizen und Lernzettel gedacht.

## Technische Notizen für später

- Vorlage: Kästchen-Positionen nicht verschieben, sonst passen bereits ausgefüllte Vorlagen nicht mehr (sonst `TEMPLATE_VERSION` erhöhen und alte Version weiter unterstützen). Neue Zeichen nur als neue Gruppe **hinten** in `GROUPS` (template/layout.ts) anfügen; jede Gruppe beginnt auf einer eigenen Seite. Höchstens 32 Seiten (5 Bit Seitenkennung).
- Helvetica (PDF-Standardschrift) kann `→ ≈ ✓ π …` nicht schreiben: Für solche Zeichen zeichnet `sketch()` in template/pdf.ts den grauen Hilfsbuchstaben und die Beschriftung aus den Strichen in `SYMBOLS`. Ein neues Vorlagen-Zeichen, das Helvetica nicht kann, braucht dort einen Eintrag (der Test „builds the PDF“ fällt sonst durch).
- Dunkler Text auf der Vorlage muss mehr als 15 mm Abstand zu den Eckmarken halten (`register.ts` zählt alles mit Helligkeit < 100 im Umkreis).
- Alles mit Helligkeit > 180 gilt nicht als Tinte (`extract.ts`); die grauen Hilfsbuchstaben haben ~222.
- Die eigene Test-Vorlage liegt in `samples/vorlage.pdf` (nicht im Repository).
- Notizen-Erkennung (`segmentation/style.ts`): misst Tinte, also x-Höhe plus Strichdicke. `probeStyle()` in main.ts misst eine Probeseite in der eigenen Handschrift genauso und rechnet über das Verhältnis zurück. Test im Browser: Seite mit `layout` + `drawPage` rendern, mit `toPdf` zum PDF machen und über das Datei-Feld `#notes` laden.
- Ausfüllen in der App: `src/import/pencil.ts`. Die Striche liegen nur im Speicher (bis die App geschlossen wird); beim Übernehmen wird jede beschriebene Seite als Vorlage gerendert, die Striche darauf gemalt und durch dieselbe Erkennung wie ein PDF geschickt (`importInto` in main.ts).
- Textmarker: `clean()` setzt `MARK`-Zeichen, `layout()` legt `page.marks` an, `drawPage()` malt sie vor der Tinte.
- Hervorhebung: `clean()` markiert Fett/Überschriften mit `EMPH` (Steuerzeichen /), `layout()` zeichnet den Unterstrich als `Connector`.
