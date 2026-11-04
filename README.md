# Handschrift

Persönlicher Handschrift-Generator als Web-App. Läuft komplett auf dem Gerät, ohne Server und ohne Cloud.
Deine Handschrift-Proben liegen nur im Browser-Speicher deines Geräts und kommen nie ins Repository.

## Benutzen (iPad)

1. App-Adresse in **Safari** öffnen → Teilen → **Zum Home-Bildschirm**.
2. Reiter **Vorlage & Import** → *Vorlage herunterladen* → in GoodNotes öffnen und ausfüllen
   (schwarzer oder dunkelblauer Stift, auf der durchgezogenen Grundlinie; leere Kästchen sind ok).
3. In GoodNotes: Teilen → Exportieren → PDF → in der App unter *Ausgefüllte Vorlage importieren* auswählen.
4. Reiter **Zeichen**: Kontrolle. Schlechte Varianten antippen und löschen.
5. Reiter **Schreiben**: Text einfügen → *PNG teilen / sichern* oder *In Zwischenablage* → in GoodNotes einfügen.
6. Ab und zu **Handschrift-Satz sichern** (Backup-Datei), z. B. für ein neues Gerät.

## Entwickeln

```bash
npm install
npm run dev      # lokaler Server, auch im WLAN erreichbar (iPad: http://<PC-IP>:5173)
npm test         # Unit-Tests mit synthetischer Vorlage
npm run build
```

Jeder Push auf `main` baut und veröffentlicht die App automatisch auf GitHub Pages (`.github/workflows/deploy.yml`).

Module: `template/` (Vorlage), `import/` (PDF/Bild laden), `segmentation/` (Passermarken, Ausschneiden, Skelett, Ein-/Austritt),
`glyphstore/` (IndexedDB, Backup), `connectors/` (Verbindungswahrscheinlichkeit, Bézier-Verbindungen),
`renderer/` (Layout mit Variation, Zeichnen), `export/` (PNG, Teilen, Zwischenablage).
