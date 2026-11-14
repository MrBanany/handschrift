# Integration (Branch `claude/integration`)

Zusammengeführt auf main e836d29: `claude/marker` (P4), `claude/ki-vorgabe-2a5f9f` (P6 Cache), `claude/gemini`, die uncommitteten Funktionsgraphen aus dem Worktree `graphen`, `claude/vorschau` (P3 + Auswahl exportieren).

Beim Zusammenführen geändert:
- `cards.ts` holt CARD, NOTE und CORNELL (U+F701–F706) aus `markers.ts`.
- Gemini schrieb `\{ \}` über U+001D/U+001E; die hat P4 abgeschafft. Neu: `LIT_BRACE` (U+F712/F713) in `markers.ts`.
- Graphen: die Zeichen lagen auf U+F700/F701 (F701 = Karteikarte). Neu: `PLOT` (U+F730/F731) in `markers.ts`.
- KI-Vorgabe: Gemini-Fassung, dazu die Cornell-Zeile und die Zeile für `[[plot: …]]`.
- Schnappschüsse: 8 neue Einträge für die Gemini-Texte, die alten sind unverändert.

**Funktionsgraphen:** `[[plot: x^2 - 1, -3..3]]`, mehrere mit `;`, zweiter Bereich = y-Bereich. Achsen mit Pfeilen, Skala in eigenen Ziffern, Kurve als Stiftstriche (auch in der GoodNotes-Datei). Eigener Formel-Auswerter (`src/renderer/plot.ts`, kein `eval`): + - * / ^, Klammern, |x|, sin cos tan exp ln lg sqrt abs, pi, e. Pole und Sprünge werden geschnitten. Unlesbare Formel → als Text geschrieben.

**Nicht drin:** mehrere Seiten in einer .goodnotes-Datei (`claude/gn-seiten` gibt es nicht, `record.goodnotes` liegt nicht im Projekt).
