# P2 – Export Seite für Seite

**Was:** PDF, GoodNotes und „Kopieren“ zeichnen jetzt jede Seite einzeln, kodieren sie und geben das Canvas sofort frei (`width = 0`).
Vorher wurden alle Seiten zuerst gezeichnet und lagen gleichzeitig im Speicher.

- `src/export/pages.ts`: `forEachPage(count, draw, encode)` – nacheinander, Ergebnisse in Seitenreihenfolge, Canvas wird auch bei einem Fehler freigegeben. Test: `tests/pages.test.ts`.
- `renderAll` liefert statt fertiger Canvases `draw(i)` (Vorschau zeichnet weiterhin alle).
- PDF: `forEachPage(…, toPng)`, dann `toPdf` (die PNG-Blobs sind klein gegen die Canvases).
- GoodNotes: Vorschaubilder nacheinander statt `Promise.all`.
- Kopieren: zeichnet nur Seite 1 (vorher alle, benutzt wurde nur die erste).
- „Bitte noch einmal tippen“ (`shareAs`/`ready`) unverändert.

**Messung** (Vorschau-Browser, Muster-Handschrift, 11 Seiten PDF bzw. 30 GoodNotes-Dateien; Zähler auf `canvas.width/height`):

| | Spitze zusätzlicher Canvas-Speicher |
|---|---|
| PDF vorher (berechnet: 11 × 2520×3564 px × 4 B) | ≈ 395 MB |
| PDF jetzt (gemessen) | 72 MB (eine Seite + ihre Farbebene) |
| GoodNotes jetzt (30 Dateien, gemessen) | ≈ 1 MB |

Nicht geprüft: echtes iPad-Safari (Speichergrenze, Wartezeit bis zum Teilen).
