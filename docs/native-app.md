# Die Handschrift-App als „richtige App“ verpacken?

Stand: 14. November 2026. Entwurf, kein Code. Quellen stehen am Ende; was ich nicht belegen konnte, ist als **unbelegt** markiert.

## Kurzfassung

- Eine **APK** ist das Android-Format. Auf dem iPad heißt das Paket IPA, und es lässt sich nur mit Apples Signatur installieren. Ohne Apple-Entwicklerkonto (99 USD im Jahr) kommt praktisch nichts dauerhaft aufs iPad.
- Empfehlung: **Capacitor**. Unser Code läuft darin unverändert, und die Hülle bekommt genau die zwei Dinge, die der Web-App fehlen: ein Eintrag im Teilen-Menü („ChatGPT-Antwort → Teilen → Handschrift“) und eine Kurzbefehl-Aktion.
- Kleinster erster Schritt: Capacitor-Hülle + Share Extension, gebaut in der Cloud (kein Mac nötig), verteilt über TestFlight an das eigene iPad. Das braucht noch keine App-Store-Prüfung.
- Größtes Risiko: Apple lehnt eine Hülle, die nur die Webseite zeigt, nach Richtlinie 4.2 ab. Mit Teilen-Menü, Kurzbefehl und Offline-Betrieb ist die App mehr als das, eine Garantie gibt es nicht. Für TestFlight auf den eigenen Geräten spielt das keine Rolle.

## 1. Die Wege im Vergleich

| Weg | Was es ist | Aufwand bis „läuft auf dem iPad“ | Unser Code | Share Extension / Kurzbefehl | Android nebenbei | Urteil |
|---|---|---|---|---|---|---|
| **Capacitor** (aktuell 8.x) | Web-App im WKWebView, dazu ein normales Xcode-Projekt, in das man Swift-Teile legt | 1–2 Tage Hülle und Cloud-Build, dann 1–2 Tage je native Funktion | läuft 1:1 (`dist/` wird eingepackt) | ja: fertige Plugins oder eigenes Swift im Projekt | ja, dasselbe Projekt ergibt eine APK | **empfohlen** |
| **Tauri 2 Mobile** | wie Capacitor, aber mit Rust-Kern | höher: Rust-Werkzeuge zusätzlich | läuft, wir nutzen den Rust-Teil aber nicht | nur Community-Plugins; das für Share Extensions verlangt laut README einen eigenen Fork | ja | kein Vorteil für uns |
| **PWABuilder** | erzeugt ein Xcode-Projekt, das die Webseite lädt | gering, braucht aber genauso Konto und Mac-Build | unverändert, lädt die Live-Seite | nein, nur von Hand nachrüstbar | ja (Android-Paket) | am nächsten an „nur Webseite“, höchstes 4.2-Risiko |
| **Reine Swift-App** | alles neu in Swift | Wochen bis Monate: Layout, Formeln, Import, Export neu schreiben | wird weggeworfen | ja, alles | nein | nur sinnvoll, wenn PencilKit das Hauptziel wäre |

### Laufende Kosten und Hürden (Apple)

- **Apple Developer Program: 99 USD pro Jahr**, beliebig viele Apps, keine Gebühr pro Einreichung.
- **Kostenloses Konto**: Die App läuft dann nur 7 Tage, danach muss man sie neu bauen und installieren, und es geht nur von einem Mac mit Xcode aus. Kein TestFlight, kein App Store. Für uns unbrauchbar.
- **Mac nötig zum Bauen.** Xcode gibt es nur für macOS. Vom Windows-Rechner aus geht es über einen Mac in der Cloud: GitHub Actions (macOS-Runner), Xcode Cloud oder Bezahldienste wie Capgo Build oder Capawesome Cloud. Signatur und Zertifikate einzurichten ist der fummeligste Teil.
- **TestFlight**: Builds laufen nach 90 Tagen ab, also etwa alle drei Monate neu hochladen. Externe Tester (bis 10 000) brauchen eine Beta-Prüfung beim ersten Build, interne Tester (bis 100) nach meinem Wissen nicht (**unbelegt** in dieser Recherche).
- **App Store**: jede Version geht durch die Prüfung.
- **EU-Sonderweg** (alternative Marktplätze, Download von der eigenen Webseite, auf dem iPad ab iPadOS 18): braucht ebenfalls das Entwicklerkonto und Apples Notarisierung. Spart also weder Geld noch den Mac-Build.

### Android nebenbei

- Mit Capacitor: `npx cap add android`, bauen mit Android Studio unter Windows, die APK lässt sich ohne Store direkt installieren. Kosten: keine (Play Store einmalig 25 USD, **unbelegt** in dieser Recherche).
- Auf Android kann schon die heutige Web-App mehr als auf dem iPad: Ein `share_target` im Manifest macht eine installierte PWA zum Ziel im Teilen-Menü, ganz ohne Hülle (**unbelegt** in dieser Recherche, Stand meines Wissens). Für Android lohnt eine APK deshalb kaum.

## 2. Was eine native Hülle auf dem iPad konkret freischaltet

| Funktion | Geht mit Hülle? | Wie | Aufwand | Nutzen für uns |
|---|---|---|---|---|
| **Share Extension** (Antwort in ChatGPT, Gemini, Claude → Teilen → Handschrift) | ja | Eigenes Ziel im Xcode-Projekt, das den Text über eine App Group an die Haupt-App gibt. Plugins: `@capgo/capacitor-share-target` (Version 8 für Capacitor 8), Capawesome Share Target (nur für Sponsoren) | 1–2 Tage | **sehr hoch**: genau der Weg, den `docs/ki-weg.md` als unmöglich für Web-Apps beschreibt |
| **App Intents / Kurzbefehl-Aktion** „In Handschrift schreiben“ | ja | Swift-Datei im App-Ziel (ab iOS 16), reicht den Text an die Web-Schicht. Plugin: `@capgo/capacitor-app-intents`, oder 30 Zeilen eigenes Swift | 1 Tag | hoch: Kurzbefehl „diktieren → KI → Handschrift“ endet in der App statt in der Zwischenablage |
| **Universal Links** (Link öffnet die App statt Safari) | ja, mit Einschränkung | Datei `apple-app-site-association` muss im Wurzelverzeichnis der Domain liegen. Bei `mrbanany.github.io/handschrift/` heißt das: im Repository `mrbanany.github.io`, oder eine eigene Domain | 0,5 Tage plus Domain-Frage | mittel. Ein eigenes Schema `handschrift://` geht sofort und reicht für Kurzbefehle |
| **Datei direkt an GoodNotes** | teilweise | „Öffnen in …“-Menü (`UIDocumentInteractionController`) statt Teilen-Menü. Stumm an GoodNotes übergeben geht nicht, der Nutzer wählt weiter aus | 0,5 Tage | gering: spart höchstens einen Tipp. Das Teilen-Menü haben wir schon |
| **Speicher, den Safari nicht räumt** | ja | Daten liegen im App-Ordner und kommen ins Geräte-Backup. Safaris 7-Tage-Löschung gilt für Webseiten in Safari; für WKWebView-Apps nennt nur eine ältere Sekundärquelle „nicht betroffen“ (**von WebKit nicht bestätigt**) | 0 (kommt mit der Hülle) | mittel: Die Home-Bildschirm-App ist heute schon ausgenommen, die Handschrift geht aber beim Löschen der Web-App verloren |
| **PencilKit** | ja, aber teuer | `PKCanvasView` ist eine native Ansicht. Sie kann nicht im Web-Canvas liegen, das Ausfüllen der Vorlage bräuchte einen eigenen nativen Bildschirm und eine Brücke für die Striche | 3–5 Tage | gering bis mittel: weniger Verzögerung beim Schreiben. Druck und Neigung liefert der Pencil auch im WebView |

Zwei Punkte, die man vorher wissen muss:
- Eine Share Extension darf die Haupt-App nicht offiziell selbst öffnen; die Plugins nutzen dafür einen Umweg. Sicher ist nur: Text ablegen, der Nutzer öffnet die App (**unbelegt** in dieser Recherche, Stand meines Wissens).
- Eine Kurzbefehl-Aktion, die ohne Öffnen der App direkt eine GoodNotes-Datei zurückgibt, bräuchte unser Layout ohne Oberfläche. Erster Schritt ist deshalb: Aktion öffnet die App mit dem Text.

## 3. Läuft unser Code 1:1 weiter?

Ja. Capacitor packt den Inhalt von `dist/` ein und zeigt ihn im WKWebView, also in derselben Engine wie Safari. `base: './'` in `vite.config.ts` passt schon.

Was angepasst oder geprüft werden muss:

| Stelle | Heute | In der Hülle |
|---|---|---|
| Text von außen | `takeText()` in `src/handover.ts` liest `#text=` | bleibt; Share Extension und Kurzbefehl rufen dieselbe Stelle auf (ein Ereignis vom Plugin statt der Adresse) |
| Service Worker (`sw.js`) | Offline-Cache | überflüssig, die Dateien liegen in der App. Die Registrierung ist schon an `'serviceWorker' in navigator` gebunden |
| „Als App installieren“ (`beforeinstallprompt`) | Hinweis | ausblenden |
| Teilen (`navigator.share` mit Dateien, `png.ts`, `main.ts`) | Web Share | im WKWebView prüfen; sonst Capacitor-Plugins Share + Filesystem (**ungeprüft**) |
| Zwischenablage (`navigator.clipboard`) | „Kopierten Text einfügen“, Bild kopieren | im WKWebView prüfen (**ungeprüft**) |
| PDF-Import (pdf.js-Worker) | Modul-Worker | unter `capacitor://localhost` prüfen (**ungeprüft**) |
| Speicher (IndexedDB, `localStorage`) | getrennt je Safari / Home-Bildschirm | wieder ein eigener, dritter Speicher: Die Handschrift muss einmal über „Alle sichern“ und „Backup laden“ umziehen |
| Updates | jeder Push ist sofort live | die App enthält eine Kopie; jede Änderung braucht einen neuen Build (TestFlight) oder eine neue Prüfung (App Store). Die Web-Version läuft daneben weiter |

Neu im Repository: `capacitor.config.ts`, der Ordner `ios/` (Xcode-Projekt mit Share Extension) und ein Build-Ablauf für den Cloud-Mac. `src/` bleibt bis auf die Stelle für eingehenden Text unverändert.

## 4. Empfehlung

**Capacitor, in drei Stufen. Nach jeder Stufe kann man aufhören.**

1. **Entscheidung: 99 USD im Jahr, ja oder nein.** Ohne das Konto gibt es vom Windows-Rechner aus keinen Weg aufs iPad. Die Web-App bleibt in jedem Fall bestehen.
2. **Kleinster Schritt (etwa 3–4 Tage Arbeit): Hülle + Share Extension, per TestFlight aufs eigene iPad.**
   - Capacitor einrichten, `ios/` anlegen, Build über einen Cloud-Mac, Upload zu TestFlight (interne Tester).
   - Share Extension „Handschrift“, die Text annimmt und an `takeText()` weitergibt.
   - Danach am iPad prüfen: ChatGPT-Antwort teilen → Handschrift → „In GoodNotes öffnen“. Dazu die drei ungeprüften Stellen aus Abschnitt 3.
   - Kosten: das Entwicklerkonto. Der Cloud-Build auf GitHub Actions ist für öffentliche Repositories nach meinem Wissen kostenlos (**unbelegt** in dieser Recherche).
3. **Danach, wenn es sich bewährt:** Kurzbefehl-Aktion (1 Tag), dann erst die Frage „App Store ja oder nein“.

**Risiken**

- **Richtlinie 4.2 (nur App Store):** „Your app should include features, content, and UI that elevate it beyond a repackaged website.“ Eine Hülle ohne native Funktion wird nach Entwicklerberichten regelmäßig abgelehnt. Mit Teilen-Menü, Kurzbefehl-Aktion und Offline-Betrieb haben wir Argumente, sicher ist es nicht. Für TestFlight mit internen Testern gilt die Prüfung nicht.
- **Dauerpflege:** jährliche Gebühr, TestFlight-Builds alle 90 Tage, neue Xcode-Pflichtversionen, zwei Verteilwege (Web und App) mit getrenntem Speicher.
- **Signatur und Cloud-Build** sind erfahrungsgemäß der Teil, der am längsten dauert und nichts mit unserem Code zu tun hat.
- **Plugins von Dritten** (Capgo, Capawesome): teils kostenpflichtig, teils jung. Die Share Extension lässt sich notfalls in etwa 100 Zeilen Swift selbst schreiben.

**Was ich nicht empfehle:** PWABuilder (löst kein einziges unserer Probleme und hat das höchste Ablehnungsrisiko), Tauri (mehr Werkzeug ohne Gegenwert), eine Swift-Neufassung (wirft das funktionierende Layout weg), PencilKit als ersten Schritt (teuer, kleiner Nutzen).

## Quellen

- Apple, App Review Guidelines 4.2 und 4.2.2: https://developer.apple.com/app-store/review/guidelines/
- Apple, Mitgliedschaften im Vergleich (7 Tage beim kostenlosen Konto): https://developer.apple.com/support/compare-memberships
- Apple, Änderungen für Apps in der EU: https://developer.apple.com/support/dma-and-apps-in-the-EU
- TechCrunch, alternative App-Stores auf dem iPad in der EU: https://techcrunch.com/2024/09/13/alternative-app-stores-allowed-on-the-ipad-in-the-eu-starting-september-16
- Expo, Apple Developer Program kostenlos gegen bezahlt: https://expo.dev/blog/apple-developer-program-explained-free-vs-paid
- Adalo, Apple Developer Program 2026 (Kosten): https://studio.adalo.com/blog/apple-developer-program-guide
- TestFlight (90 Tage, Testerzahlen, Beta-Prüfung): https://techconcepts.org/blog/testflight-guide
- Apple-Entwicklerforum, PWA im WebView und App-Prüfung: https://developer.apple.com/forums/thread/829592
- Apple-Entwicklerforum, Ablehnung nach 4.2: https://developer.apple.com/forums/thread/835422
- MobiLoud, PWA in den App Store bringen: https://www.mobiloud.com/blog/publishing-pwa-app-store
- Capgo Share Target (Share Extension, App Group): https://cdn.jsdelivr.net/npm/@capgo/capacitor-share-target@8.0.44/README.md
- Capawesome Share Target: https://capawesome.io/plugins/share-target/
- Capgo App Intents: https://capgo.app/docs/plugins/app-intents/getting-started/
- Ionic-Forum, App Intent ruft JavaScript auf: https://forum.ionicframework.com/t/how-to-create-an-ios-app-intent-that-can-execute-a-js-function-be-triggered-by-a-shortcuts-automation/239969
- Tauri-Plugin für Share Extensions: https://docs.rs/crate/tauri-plugin-mobile-sharetarget/latest
- Tauri, Plugin-Versionen: https://tauri.app/release/tauri-plugin/all-versions/
- Capawesome, iOS ohne Mac bauen: https://capawesome.io/blog/how-to-build-and-deploy-ios-apps-without-a-mac/
- Capgo, CI-Plattformen für iOS im Vergleich: https://capgo.app/blog/comparing-ci-cd-platforms-for-ios-apps/
- WebKit-Fehler 211775 (7-Tage-Grenze für Speicher): https://bugs.webkit.org/show_bug.cgi?id=211775
- Ionic-Blog zur 7-Tage-Grenze (Capacitor-Apps nicht betroffen, Sekundärquelle von 2020): https://ionic.io/blog/is-apple-trying-to-kill-pwas
