# To-do – Handschrift-App

Stand: 6. November 2026. Live: https://mrbanany.github.io/handschrift/ (jeder Push auf `main` geht automatisch online).

## Als Nächstes

- [ ] **„In GoodNotes öffnen“ am iPad testen** (wichtigster Test, neu): Text eingeben → „In GoodNotes öffnen“ → im Teilen-Menü GoodNotes wählen. Öffnet sich die Datei? Lässt sich die Schrift radieren und mit dem Lasso in ein anderes Notizbuch kopieren? Hat sie dort die richtige Größe? Falls GoodNotes die Datei ablehnt: Fehlermeldung notieren. Das Format ist inoffiziell (getestet hat es nur die Mac-Version von GoodNotes 7.1 bei InkLift).
- [ ] **Buchstaben in der Vorschau antippen** am iPad ausprobieren: andere Variante wählen, „Neu schreiben“ mit dem Pencil.
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

## Erledigt am 6. November 2026

- [x] **Eingefügter Text ohne Zeilenumbrüche** (alles klebte zusammen: „BruchrechnungAddition … machen.Aufgabe 1“): Ein langer Text ganz ohne Umbruch wird dort getrennt, wo ein Wort, Satz oder eine Formel direkt in ein großgeschriebenes Wort läuft. Kurze Zeilen ohne Punkt und Formel („Chemie: Wichtige Ionen“) werden zu Überschriften (`unflatten` in clean.ts). Texte mit Umbrüchen bleiben unverändert.
- [x] **Platz zwischen Themen**: vor jeder Überschrift automatisch eine Leerzeile, nach einem eingerahmten Ergebnis auch. Der Kasten richtet sich nach seinem Inhalt (Brüche passen hinein).
- [x] **Schreibschrift-Testsatz** (nur beim Entwickeln, nicht in der App): in der Konsole `cursiveSample()` füllt die Vorlage mit der Schulschrift Playwrite DE VA (Vereinfachte Ausgangsschrift, OFL) und legt „Test Schreibschrift“ an. Wird als Schreibschrift erkannt, Wörter hängen zusammen.
  - Gefunden und behoben: Das z mit Unterlänge (Schulschrift, viele deutsche Handschriften) wurde auf die Linie hochgezogen und geschrumpft, „zu“ schwebte klein über der Zeile.
  - Grenze: Eine Schrift ist sauberer als echte Hand. Die echten Proben bleiben der eigentliche Test.
- [x] **Fehlersuche** (Konsole, alle Reiter, PDF- und GoodNotes-Export, Sonderfälle), behoben:
  - **Schreibschrift wurde falsch geraten**: Beim Raten zählten auch Einzelbuchstaben mit (die haben auch einen „verbunden“-Wert). „Meine Handschrift“ (Druckschrift, 13 von 171 Paaren verbunden) bekam deshalb den Haken und wurde eng verbunden geschrieben. Jetzt zählen nur Paare und Wortteile.
  - Ein hoher Kasten (Bruch im Kasten) schnitt durch die Zeile darüber. Jetzt rückt seine Zeile eine Linie nach unten, wie bei Strukturformeln.
  - Wörter, die länger als eine Zeile sind (lange Fachwörter, Links), liefen über den Rand. Jetzt werden sie mit Bindestrich umbrochen.
  - Geprüft ohne Fehler: leerer Text, nur Leerzeichen, nur Überschrift, unbekanntes Molekül, PDF (1 Seite ~0,6 s), GoodNotes (2 Seiten, ~0,4 s), Löschen mit Rückfrage.
- [x] **Testrunde mit typischen KI-Antworten** (eigene Handschrift), behoben:
  - Griechische Buchstaben α β γ δ λ μ σ ω θ φ ρ Ω, dazu Σ, ∫, `[ ] # | _ §` werden als Stiftstriche gezeichnet, wenn sie in der Handschrift fehlen.
  - Hochzahlen und Indizes aus Buchstaben: `x^n` → xⁿ, `e^{2x}` → e²ˣ, `a_n` → aₙ (aus den eigenen Buchstaben, verkleinert). `snake_case` bleibt.
  - Chemie: `H2O(l)`, `NaCl(aq)`, `CO2(g)` bekommen ihre tiefgestellten Zahlen; `->[Kat]` wird „→ (Kat)“.
  - LaTeX: `\lim_{x\to 0}` → lim(x → 0), `\sum_{i=1}^{n}` → Σ(i=1 bis n), `\int_0^1` → ∫ von 0 bis 1, `\sqrt[3]{8}` → ³√8, `\vec{v}`, `\overline{AB}`, `\mathbb{R}` → nur der Inhalt.
  - Markdown-Tabellen werden zu Zeilen „Stoff – Formel“, Kopfzeile unterstrichen, Trennzeile weg.
  - Unterpunkte (2 Leerzeichen pro Stufe) werden eingerückt und mit „-“ geschrieben.
  - Fehlende `{ }` werden zu `( )`.
  - Die App selbst verliert keine Zeilenumbrüche; die fehlten schon im kopierten Text.
- [x] **Doppelpunkte zu hoch**: `:` wurde beim Optimieren nicht auf die Grundlinie gezogen (fehlte in der Liste). Jetzt sitzt der untere Punkt immer ganz auf der Linie, ebenso bei `. ! ?`, unabhängig von der Optimieren-Stärke.
- [x] **„Leeren“** über dem Textfeld: leert das Feld, der Text bleibt im Verlauf.
- [x] **Einkreisen und Einrahmen**: `((Wort))` wird von Hand eingekreist, `\boxed{x = 4}` aus KI-Antworten (Endergebnisse) eingerahmt. Steht auch in der KI-Vorgabe. `f((x))` bleibt unverändert.
- [x] **Natürlichere Ränder**: Der linke Zeilenanfang wandert leicht (etwa ±1 mm, langsam), rechts endet nicht jede Zeile am Rand, manche hören bis zu einige Millimeter früher auf. Umgebrochene Aufzählungspunkte (`- `, `• `, `1.`) laufen unter ihrem Text weiter statt unter dem Punkt.
- [x] **Zeilenabstand aus Notizen gegengeprüft**: Liegt der gelernte Abstand höchstens 0,35 mm neben einer Linien-Vorgabe (Eng/Mittel/Weit), wird genau diese Vorgabe eingestellt und das Ergebnis sagt „passt zu den Linien …“. Sonst wird der gemessene Abstand genommen und das steht auch so da. Beim Wechsel zu einer anderen Handschrift mit gelernten Notizen werden deren Größe und Abstand übernommen. **Damit lassen sich auch die GoodNotes-Linienwerte prüfen: Notizen hochladen und schauen, ob „passt zu …“ kommt.**
- [x] Schreiben-Seite ruhiger: nur noch eine kurze Hinweiszeile unter den Knöpfen.
- [x] **Farben** (Zahnrad): Überschriften in eigener Farbe (Blau, Rot, Grün, Lila oder wie die Tinte), auch in der GoodNotes-Datei. Marker Gelb, Grün, Pink, Blau oder Orange (nur Bild/PDF, die GoodNotes-Datei hat noch keinen Marker).
- [x] **KI-Vorgabe kopieren** (über dem Textfeld): ein Text für ChatGPT & Co. (`src/prompt.ts`), damit Antworten Brüche, Hochzahlen, `\ce{…}`, `[[Name]]`-Strukturformeln, Überschriften und Markierungen so schreiben, wie die App sie kann. Neue Funktionen dort nachtragen.
- [x] Negative Hochzahlen: `10^{-3}`, `s^-1` → 10⁻³, s⁻¹.
- [x] **Echte Brüche**: `\frac{a}{b}` aus KI-Antworten steht jetzt als Zähler über Nenner (etwas kleiner) mit einem Bruchstrich als Stiftstrich. Ein Bruch im Bruch oder unter einer Wurzel bleibt `a/b`. Getippte `3/4` ohne LaTeX bleiben wie geschrieben (sonst würden auch `km/h` oder Daten gestapelt).

- [x] **Schreibschrift** (für verbundenes Schreiben): Haken „Schreibschrift“ bei der aktiven Handschrift (Handschriften). Er wird automatisch gesetzt, wenn die Paare meist verbunden sind. Dann werden Buchstaben in einem Wort immer verbunden, notfalls an der Tinte nahe der Grundlinie. Zwei zusätzliche Vorlagenseiten („nur Schreibschrift“) mit 36 verbundenen Paaren und Wortteilen (ver, ten, lich, keit …). Getestet nur mit der Windows-Schrift Segoe Script. **Offen: echte Proben vom Freund ausprobieren.**
- [x] **Eigene Wortteile**: unter Zeichen → „Eigene Wortteile“ ein Wort oder Wortteil eintippen und mit dem Pencil schreiben (bis 5 Buchstaben mitten im Wort, länger nur als ganzes Wort).
- [x] **Mehr Varianten**: Zeichen zeigt häufige Buchstaben mit weniger als 3 Varianten zum direkten Ergänzen.
- [x] **Verlauf**: die letzten 15 verschickten Texte (GoodNotes, Bild, PDF) über „Verlauf“ oberhalb des Textfelds.
- [x] Wieder drei Reiter (Schreiben, Handschriften, Zeichen). Ein Zeichen antippen öffnet das Schreibfeld direkt.

- [x] **Echte GoodNotes-Tinte**: „In GoodNotes öffnen“ erzeugt eine `.goodnotes`-Datei. Die Schrift ist darin als Kugelschreiber-Striche gespeichert, also radierbar und per Lasso kopierbar. Dafür werden die Buchstaben-Bilder zu Mittellinien verdünnt (`src/export/goodnotes.ts`). Die Seite hat die Größe der Vorlage (16 × 21 cm, Punktraster); bei mehr Text entsteht pro Seite eine Datei. Vorlage und Feldaufbau stammen von InkLift (MIT), zusätzlich mit echten GoodNotes-Dateien aus parser-for-goodnotes verglichen. Der Textmarker kommt noch nicht mit.
- [x] **Reaktionsgleichungen**: Moleküle stehen in der Zeile, z. B. `[[Methan]] + 2 [[Sauerstoff]] → [[Kohlenstoffdioxid]] + 2 [[Wasser]]`. Hohe Moleküle schieben die Zeile nach unten.
- [x] **Ionen und Ladungen**: `Na^+`, `SO_4^{2-}`, `\ce{Ca2+}` → Na⁺, SO₄²⁻, Ca²⁺ (aus eigenem + und -). In Strukturformeln: `[[Ammonium]]`, `[[Hydroxid]]`, `[NH4+]`. Freie Elektronenpaare als Striche an O, N, S und den Halogenen (Valenzstrichformel). Etwa 40 weitere Namen (Sauerstoff, Schwefelsäure, Sulfat, Nitrat, Anilin …).
- [x] **Buchstaben austauschen**: in der Vorschau einen Buchstaben antippen → andere Variante wählen oder mit dem Pencil neu schreiben. Ein neu geschriebener Buchstabe wird gespeichert, nie aussortiert und kommt auch sonst vor. Das Austauschen gilt, bis man den Text ändert.
- [x] **Neues Design**: eine Seite. Oben Name, Handschrift-Auswahl, Zahnrad (Einstellungen) und Handschriften-Knopf. Darunter Textfeld, Hauptknopf „In GoodNotes öffnen“, „Als Bild kopieren“, „PDF“ und die Vorschau. Die Zeichen liegen jetzt im Bereich Handschriften, die untere Leiste ist weg.

## Erledigt am 5. November 2026

- [x] **Chemie-Strukturformeln**: `[[Ethanol]]` (Name aus einer Liste von gut 60 Schulmolekülen) oder `[[CCO]]` (SMILES) zeichnet das Molekül auf eigenen Zeilen. Die Bindungen sind Stiftstriche, die Atome stehen in der eigenen Handschrift. Kleine Ketten ohne Ring kommen als Valenzstrichformel mit allen H, Ringe und größere Moleküle als Skelettformel. `[[Essigsäure skelett]]` oder `[[Benzol voll]]` wählt die Form selbst. Unbekannte Namen werden einfach als Text geschrieben. Die Bibliothek smiles-drawer wird nur für die Lage der Atome genutzt.
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
2. [x] **Weitere Hervorhebungen**: Einkreisen, Einrahmen, Markerfarbe, Überschriften-Farbe – erledigt. (Unterstreichen, größere Überschriften, Textmarker `==Text==` und Aufzählungspunkte sind erledigt.)
3. [ ] **Eigene Schriftart erzeugen** (Idee aus dieser Runde): aus der Handschrift eine Schrift (TTF) bauen und per Profil auf dem iPad installieren. Dann ist Text in GoodNotes echter Text in eigener Handschrift-Optik (mit der Tastatur änderbar, aber nicht radierbar und ohne Varianten). Großer Aufwand.
4. [ ] **Kurzbefehl „In Handschrift“**: iOS-Kurzbefehl öffnet die App mit `?text=…` vorbefüllt. Achtung: Links öffnen Safari, nicht die Home-Bildschirm-App, und die beiden haben getrennten Speicher (Handschrift wäre in Safari nicht da). Erst klären, ob das trotzdem lohnt.
5. [ ] **Mathe**: Buchstaben als Hochzahl (xⁿ). (Minus in Hochzahlen, Ziffern hoch/tief, LaTeX aus KI-Antworten und echte Brüche sind erledigt.)
6. [x] **Chemie-Strukturformeln** – erledigt, mit Reaktionen und Ladungen. Offen: Keilstriche (Stereo), Mesomerie-Pfeile, GoodNotes-Datei mit mehreren Seiten in einer Datei.
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
- Strukturformeln: clean() schützt [[…]] zuerst (SMILES enthält = # ( ) / \) und stellt es als STRUCT-Zeile wieder her; src/renderer/structure.ts holt mit dem Preprocessor von smiles-drawer die 2-D-Lage (ohne DOM), layout() zeichnet in drawMolecule(). Neue Namen in NAMES (structure.ts) ergänzen.
- GoodNotes-Export (`src/export/goodnotes.ts`): ZIP mit gespeicherten Einträgen. `notes/<Seiten-UUID>` enthält pro Strich zwei Protobuf-Datensätze (Metadaten + Feld 7 mit TPL-Bild im Apple-LZ4-Rahmen `bv41…bv4$`). Einheiten: 132/25,4 GoodNotes-Einheiten pro mm. Die Vorlage in `goodnotes-template.ts` (Indizes, Ereignisprotokoll, Hintergrund-PDF) ist fest und hat genau eine Seite; mehr Seiten bräuchten neue Ereignisse. Vergleichsdateien: https://github.com/Kaih1825/parser-for-goodnotes (assets/*.goodnotes).
- Buchstaben austauschen: `overrides` in main.ts, Schlüssel = laufende Nummer des Buchstabens im ganzen Text (seitenunabhängig, damit es auch im GoodNotes-Export gilt). Neu geschriebene Varianten haben `src` = `pen:…`, `optimize()` sortiert sie nie aus.
