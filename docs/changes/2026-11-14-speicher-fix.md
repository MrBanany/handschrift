# 2026-11-14 – Speicher-Fixes: Löschen, Backup unter gleichem Namen, Umbenennen

Dateien: `src/glyphstore/db.ts`, `src/main.ts` (Löschen-Knopf, ein Satz im Namens-Dialog), `tests/backup.test.ts`.

- **Löschen (5):** Ist die Handschrift ungesichert (`isDirty`), fragt die App zuerst „Erst Backup speichern?“ (OK = Backup über den vorhandenen Teilen-Weg, Abbrechen = ohne Backup weiter). Wird das Backup abgebrochen oder schlägt fehl, bleibt die Handschrift stehen. Danach die bekannte Löschen-Rückfrage. Die Muster-Handschrift ist ausgenommen. Grenze: Handschriften, die vor der Einführung der Sicherungs-Markierung angelegt wurden, gelten als gesichert (die App weiß es nicht).
- **Backup laden unter gleichem Namen (6):** Eine Datei ergänzt die vorhandene Handschrift nur. Proben mit gleicher ID bleiben unverändert (sie sind neuer als das Backup, z. B. nach erneutem Einlesen einer Seite), nur fehlende kommen dazu. Schreibstil, Schreibschrift-Haken und Prüf-Entscheidungen, die es schon gibt, bleiben ebenfalls. Der Dialogtext sagt das. Wer den alten Stand ganz zurückholen will, löscht die Handschrift vorher (mit Backup-Angebot) oder lädt unter neuem Namen („Name (2)“).
- **Umbenennen (7):** Der Gesichert-Status zieht mit um: war die Handschrift gesichert, ist es die umbenannte auch; war sie ungesichert, behält sie den alten Zeitpunkt der Erinnerung.
- Tests (fake-indexeddb): `isDirty`/`markSaved`, Umbenennen mit beiden Zuständen, Import unter gleichem Namen ergänzt nur und lässt Vorhandenes und Einstellungen unverändert.
