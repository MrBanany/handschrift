# P3 – Schnelle Vorschau

**Was** (`src/main.ts`, `src/style.css`):
- Papier (liniert/kariert) wird einmal pro Format/Linienart gezeichnet (`paperUrl`, ein Bild als CSS-Hintergrund für alle Seiten) statt einmal pro Seite.
- Seite 1–2 werden sofort gezeichnet, ab Seite 3 erst kurz bevor sie ins Bild kommen (`IntersectionObserver`, 600 px Vorlauf). Der Platzhalter hat über `aspect-ratio` schon die richtige Höhe, die Scrollleiste springt nicht.
- Auflösung der Vorschau höchstens 6 px/mm (vorher 8).
- Der Satz (`layout`) wird nur neu berechnet, wenn sich Text, Einstellungen, Handschrift oder ein getauschter Buchstabe ändern (`laidOut`). Fenstergröße allein löst nichts mehr aus: `resize` zeichnet nur neu, wenn sich die Breite ändert (nicht bei der iPad-Adressleiste).
- Antippen eines Buchstabens (`shown`, Koordinaten) unverändert: `shown` enthält alle Seiten, auch die noch nicht gezeichneten.

**Messung** (Vorschau-Browser, Muster-Handschrift, 5 Seiten, 900 px breit, 1 Zeichen tippen → Vorschau fertig, ohne die 150 ms Entprellung):

| | Zeit pro Tastendruck |
|---|---|
| vorher | 327–365 ms |
| nachher | 57–80 ms (einmal 189 ms; erster Lauf nach dem Laden 852 ms: Papier und Strichlinien noch nicht zwischengespeichert) |

Vorschau-Speicher bei 11 Seiten: vorher 40 Mpx lebende Canvas-Fläche, jetzt nur die zwei ersten Seiten (und das Papier einmal).

**Geprüft:** Seiten 3–5 werden beim Auslösen des Observers gezeichnet, Antippen auf Seite 3 öffnet „ei austauschen“, Austausch einer Variante zeichnet neu, Papier sichtbar (Screenshot).
**Nicht geprüft:** Der Observer feuert im ausgeblendeten Vorschau-Pane nicht, er wurde deshalb mit einem Ersatz ausgelöst; im echten Scrollen auf PC/iPad nicht gesehen.

Nachmessung auf `origin/main` (e836d29, mit Lernzettel-Änderungen): 8 Tastendrücke, 46–56 ms, kein Ausreißer.
