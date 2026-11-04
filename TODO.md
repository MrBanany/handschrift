# To-do – Handschrift-App

Stand: 4. November 2026. Live: https://mrbanany.github.io/handschrift/ (jeder Push auf `main` geht automatisch online).

## Als Nächstes

- [ ] **iPad-Test** (bewusst ans Ende gelegt)
  - Safari → Teilen → „Zum Home-Bildschirm“, dort die Vorlage neu importieren (eigener Speicher)
  - „Schrift kopieren“ → in GoodNotes einsetzen; Schrift in der Vorschau lange drücken → Kopieren; in Split View hinüberziehen
  - „Teilen“ als PDF → in GoodNotes importieren, Text über die GoodNotes-Suche finden?
  - Hell/Dunkel, Linien Eng/Mittel/Weit, Kariert, Prüf-Ansicht mit „Alle übernehmen“
- [ ] **„Alle übernehmen“ beobachten**: logisch funktionierte der Knopf beim Test; behoben wurden Verstecktheit und Durchtippen nach dem Schließen. Falls noch etwas hakt: genau beschreiben, was passiert.
- [ ] **Fehlende Zeichen**: `→ > < + = * ° ² ³ ✓` fehlen in der Vorlage. Pfeile werden darum zu „-“, `+` wird rot markiert.
  - entweder in die Vorlage aufnehmen (neue `TEMPLATE_VERSION`, alte Version muss weiter lesbar bleiben)
  - oder Pfeile/Plus/Häkchen als handgezeichnete Striche erzeugen (kein Nachschreiben nötig)
- [ ] **GoodNotes-Linien abgleichen**: Linien auf einer GoodNotes-Seite (liniert schmal/breit) zählen und die Werte in `RULES` (src/main.ts) anpassen. Aktuell 6,4 / 7,1 / 8,7 mm – nicht bestätigt.

## Ideen (aus der Recherche)

**Konkurrenz kurz:**
- **Apple Notizen „Smart Script“** (iPadOS 18+): fügt Text in eigener Handschrift ein, aber nur in Apple Notizen, nur in bestehende handschriftliche Notizen, wirkt laut Tests „zu perfekt“. Nicht in GoodNotes.
- **Conwrite** (iPadOS 26+): jeden Buchstaben einmal mit dem Pencil schreiben, dann Text in eigener Handschrift; In-App-Käufe.
- **CursiveAI, Text To Handwriting (7,99 $/Monat), texxio, Text2Handwriting**: nur fertige Schriftarten, nicht die eigene Handschrift.

**Wo wir besser sind:** eigene Handschrift mit mehreren Varianten pro Zeichen plus Paaren und Wörtern, kostenlos, ohne Konto, offline, Daten bleiben auf dem Gerät, direkt für GoodNotes (PDF-Seiten mit Linien, durchsuchbar), KI-Antworten einfach einfügen.

**Feature-Ideen, grob nach Wirkung sortiert:**
1. [ ] **Vorlage direkt in der App ausfüllen** mit dem Apple Pencil (Zeichenfeld pro Kästchen) – kein Umweg über GoodNotes-Export. Größte Vereinfachung.
2. [ ] **Hervorhebungen aus KI-Antworten behalten** statt entfernen: `**fett**` → unterstrichen, Überschriften größer und unterstrichen, `==Text==` → Textmarker, Aufzählungspunkte handgezeichnet. Dazu der alte Punkt Unterstreichen/Einkreisen.
3. [ ] **Symbole als Striche**: → ⇒ ✓ + = ≈ in Handschrift-Optik ohne Vorlage (siehe oben).
4. [ ] **Kurzbefehl „In Handschrift“**: iOS-Kurzbefehl öffnet die App mit `?text=…` vorbefüllt (nur URL-Parameter lesen). Damit geht es direkt aus ChatGPT/Safari über das Teilen-Menü.
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
