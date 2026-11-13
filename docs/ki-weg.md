# Frage → KI → Handschrift, mit möglichst wenig App-Wechsel

Stand: 14. November 2026. Ziel: in GoodNotes bleiben, eine Frage stellen und die Antwort in eigener Handschrift auf der Seite haben.

## Empfehlung

**GoodNotes und die Handschrift-App nebeneinander, die Antwort kommt über die Zwischenablage.**

1. GoodNotes und die Handschrift-App nebeneinander öffnen (Split View, ab iPadOS 26 zwei Fenster).
2. Antwort in der KI-App kopieren (oder ein Kurzbefehl legt sie in die Zwischenablage, siehe unten).
3. In der Handschrift-App „Kopierten Text einfügen“ tippen.
4. „In GoodNotes öffnen“ tippen (oder die Schrift aus der Vorschau hinüberziehen).

Grund: Das ist der einzige Weg, der in der installierten App (Home-Bildschirm) sicher funktioniert, nichts kostet und keinen Schlüssel braucht. Alle Wege über einen Link landen in Safari, und dort liegt die Handschrift nicht.

## Die Grenze, die alles bestimmt

- Safari und die App vom Home-Bildschirm haben **getrennten Speicher**. Die Handschrift liegt nur dort, wo sie angelegt wurde.
- **Links öffnen Safari**, nicht die installierte App. iPadOS kennt kein „Link Capturing“ für Web-Apps, auch nicht in iPadOS 26 (firt.dev führt es als nicht unterstützt: „Only a push message can open an installed PWA“). Ein Nutzerbericht behauptet das Gegenteil für iOS 26; von Apple bestätigt ist es nicht.
- Kurzbefehle kennen das inoffizielle Schema `webapp://`. Es öffnet eine Web-App, kann aber laut Berichten nicht zwischen mehreren Web-Apps unterscheiden und übergibt weder Pfad noch Text. Für uns unbrauchbar.
- Eine Web-App kann auf iPadOS **kein Ziel im Teilen-Menü** sein (Web Share Target fehlt in Safari, WebKit-Fehler 194593 ist seit 2019 offen).

Folge: Text kommt nur auf zwei Wegen in die installierte App, nämlich über die Zwischenablage oder von Hand. Ein Link mit `#text=` hilft nur Leuten, die die App in Safari benutzen und dort auch ihre Handschrift angelegt haben.

## Die vier Wege

| Weg | Aufwand pro Frage | Kosten | Machbar auf iPadOS 18 / 26 | Urteil |
|---|---|---|---|---|
| (a) Split View + Zwischenablage | KI-App: kopieren. Handschrift-App: 2 Tipps | keine | ja / ja | **empfohlen** |
| (b) Kurzbefehl: diktieren → KI → App | 1 Auslöser, dann 2 Tipps | keine mit Apples „Modell verwenden“, sonst KI-Konto | nur mit KI-App / ja (Apple-Intelligence-iPad) | gute Ergänzung, endet in der Zwischenablage |
| (c) Teilen-Menü der KI-App | Teilen → Kurzbefehl → 2 Tipps | keine | ja / ja, aber nur über einen Kurzbefehl | Umweg zu (a) |
| (d) Zwischenablage-Automatik beim Öffnen | wie (a) | keine | nein, nur auf Tipp | als Knopf umgesetzt |

### (a) Split View GoodNotes + Handschrift-App

- Kein Wechsel weg von GoodNotes: Die Handschrift-App steht daneben.
- Ziehen der Schrift aus der Vorschau nach GoodNotes ist gebaut (die Vorschau ist ein Bild), aber am iPad noch nicht bestätigt (steht in `TODO.md`). Ein gezogenes Bild ist in GoodNotes nicht radierbar. Radierbare Tinte gibt nur „In GoodNotes öffnen“; das öffnet die Datei allerdings als neues Dokument, aus dem man mit dem Lasso kopiert.
- Die KI-App braucht ein drittes Fenster oder Slide Over.

### (b) Kurzbefehl

- Mit `#text=` am Ende eines Links öffnet sich **Safari**. Das funktioniert nur, wenn die Handschrift in Safari liegt.
- Für die installierte App endet der Kurzbefehl deshalb mit „In Zwischenablage kopieren“. Danach App öffnen und „Kopierten Text einfügen“.
- iPadOS 26: Aktion „Modell verwenden“ (Apple Intelligence auf dem Gerät, Private Cloud Compute oder ChatGPT), ohne Schlüssel. Braucht ein iPad mit Apple Intelligence.
- iPadOS 18: Diese Aktion gibt es nicht. Möglich ist nur eine Kurzbefehl-Aktion aus einer installierten KI-App. Welche Apps eine anbieten, habe ich nicht geprüft.

### (c) Teilen-Menü aus ChatGPT, Gemini, Claude

Die Handschrift-App erscheint dort nicht. Es geht nur über einen Kurzbefehl, der im Teilen-Menü steht und den Text in die Zwischenablage legt. Das spart gegenüber „Kopieren“ nichts.

### (d) Zwischenablage-Automatik

Safari lässt eine Seite die Zwischenablage nur nach einem Tipp lesen und zeigt dabei eine kleine „Einsetzen“-Blase. Automatisch beim Öffnen geht es nicht. Deshalb ein Knopf.

## Umgesetzt

- **„Kopierten Text einfügen“** über dem Textfeld: ersetzt den Text durch die Zwischenablage, der alte Text bleibt im Verlauf.
- **`#text=…` oder `?text=…`** in der Adresse füllt das Textfeld (höchstens 20 000 Zeichen) und verschwindet danach aus der Adresse. `#text=` ist besser: Der Teil hinter `#` verlässt das Gerät nicht.
- Schritt „Schneller mit KI“ in „So geht's“.

## Kurzbefehl „Frage in Handschrift“ (iPadOS 26)

1. Kurzbefehle öffnen, „+“ tippen.
2. Aktion **Text diktieren** hinzufügen (oder „Nach Eingabe fragen“, wenn du lieber tippst).
3. Aktion **Modell verwenden** hinzufügen. Modell wählen. Als Anfrage eintragen: zuerst den Text aus „KI-Vorgabe kopieren“, darunter die Variable „Diktierter Text“.
4. Aktion **In Zwischenablage kopieren** hinzufügen, Eingabe: die Antwort des Modells.
5. Kurzbefehl benennen, zum Beispiel „Frage in Handschrift“, und auf den Home-Bildschirm oder ins Kontrollzentrum legen.
6. Benutzen: Kurzbefehl starten, Frage sprechen, Handschrift-App öffnen, „Kopierten Text einfügen“, „In GoodNotes öffnen“.

Variante für Safari-Nutzer (Handschrift in Safari angelegt): statt Schritt 4 die Aktionen **URL-Codieren** (Eingabe: Antwort) und **URLs öffnen** mit `https://mrbanany.github.io/handschrift/#text=` gefolgt von der codierten Antwort.

## Offen

- Am iPad prüfen: der Kurzbefehl selbst, die „Einsetzen“-Blase, Ziehen aus der Vorschau, und ob iPadOS 26 Links doch in der installierten App öffnet.
- Ein eigener KI-Zugang in der App (Frage direkt in der Handschrift-App stellen) bräuchte einen API-Schlüssel des Nutzers oder einen Server. Bewusst nicht gebaut.

## Quellen

- https://firt.dev/notes/pwa-ios/ (Link Capturing, Speicher, share_target)
- https://bugs.webkit.org/show_bug.cgi?id=194593 (Web Share Target)
- https://support.apple.com/en-az/guide/shortcuts/tpg3vrvwmclv/ios („Modell verwenden“)
- https://tutorials.one-sec.app/en/articles/3312386 (`webapp://`)
- https://community.home-assistant.io/t/open-notification-click-url-in-webapp/981264 (Nutzerbericht iOS 26)
