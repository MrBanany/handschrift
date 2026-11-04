# Handschrift

Persönlicher Handschrift-Generator als Web-App. Läuft komplett auf dem Gerät, ohne Server und ohne Cloud.
Deine Handschrift-Proben liegen nur im Browser-Speicher deines Geräts und kommen nie ins Repository.

## Benutzen (iPad)

1. App-Adresse in **Safari** öffnen → Teilen → **Zum Home-Bildschirm**. Danach immer über das Home-Bildschirm-Symbol öffnen –
   es hat einen eigenen Speicher, getrennt von Safari.
2. Zum Ausprobieren unter **Schreiben** die Handschrift *Muster* wählen (wird aus einer Systemschrift erzeugt).
3. Eigene Handschrift: Reiter **Handschriften** → *Vorlage herunterladen* → in GoodNotes ausfüllen
   (schwarzer oder dunkelblauer Stift, auf der durchgezogenen Linie) → als PDF exportieren → mit Namen importieren.
   Mehrere Handschriften sind möglich; unter **Schreiben** umschalten.
4. Reiter **Zeichen**: Kontrolle. Schlechte Varianten antippen und löschen.
5. **Schreiben**: Text einfügen → *Teilen* oder *Kopieren* → in GoodNotes einfügen.
   *Optimieren* (unter „Weitere Einstellungen“, standardmäßig an) richtet Buchstaben auf der Grundlinie aus,
   lässt Größen-Ausreißer weg und nutzt deine eigenen Buchstabenabstände.
6. Ab und zu **Sichern** (Backup-Datei), z. B. für ein neues Gerät.

## Entwickeln

```bash
npm install
npm run dev      # lokaler Server, auch im WLAN erreichbar (iPad: http://<PC-IP>:5173)
npm test         # Unit-Tests mit synthetischer Vorlage
npm run build
```

Jeder Push auf `main` baut und veröffentlicht die App automatisch auf GitHub Pages (`.github/workflows/deploy.yml`).

Module: `template/` (Vorlage), `import/` (PDF/Bild laden), `segmentation/` (Passermarken, Ausschneiden, Skelett, Ein-/Austritt),
`glyphstore/` (IndexedDB mit mehreren Handschriften, Backup, Optimieren, Muster), `connectors/` (Verbindungswahrscheinlichkeit, Bézier-Verbindungen),
`renderer/` (Layout mit Variation, Zeichnen), `export/` (PNG, Teilen, Zwischenablage).
