# Einkaufshelden – öffentliche Web-App

Nachbarn gehen für Nachbarn einkaufen und bekommen dafür einen fairen Heldenlohn (ab 3 €).
Die App läuft im Browser und lässt sich auf dem Handy wie eine normale App installieren.
Sie nutzt **Firebase** von Google für Anmeldung, Datenbank und Hosting. Für den Start ist das kostenlos.

## Was die App kann

- Anmeldung mit Google oder mit E-Mail und Passwort (inkl. Passwort vergessen und E-Mail-Bestätigung)
- Einkauf anfragen mit automatisch berechnetem Heldenlohn
- Als Held anmelden (nur ab 18), Aufträge übernehmen, Artikel abhaken, „Geliefert“ melden, Auftrag abgeben
- **Privater Übergabe-Chat:** Nur Auftraggeber und Held sehen ihn, dort wird die Adresse ausgetauscht.
- Danke sagen mit optionalem Trinkgeld, Verdienstübersicht für Helden, Heldenwand
- Aufträge melden (Meldungen siehst nur du in der Firebase-Konsole)
- Konto selbst löschen (DSGVO)
- Impressum, Datenschutzerklärung und Nutzungsbedingungen als Vorlage
- Installierbar auf dem Handy (PWA), funktioniert auch bei schwachem Netz

Die Sicherheitsregeln in `firestore.rules` sorgen dafür, dass niemand fremde Aufträge ändern,
sich selbst mehr Lohn geben oder fremde Chats lesen kann. Das ist mit 9 automatischen Tests abgesichert (`npm test`).

## Heldenlohn ändern

Der Tarif steht ganz oben in `public/app.js`:

```js
export const FEE = { base: 3, perItem: 0.2, freeItems: 10, heavy: 2, express: 2 };
```

Wenn du den Grundlohn änderst, pass auch `MIN_FEE()` in `firestore.rules` an.

---

## Veröffentlichen: Schritt für Schritt

Du brauchst einen Computer mit [Node.js](https://nodejs.org) (Version 20 oder neuer) und ein Google-Konto.
Das Ganze dauert etwa 30 Minuten.

### 1. Firebase-Projekt anlegen

1. Öffne <https://console.firebase.google.com> und melde dich mit deinem Google-Konto an.
2. Klicke auf **Projekt erstellen**, nenne es z. B. `einkaufshelden`.
3. Google Analytics brauchst du nicht, schalte es aus.

### 2. Anmeldung einschalten

1. Links im Menü: **Build → Authentication → Jetzt starten**.
2. Unter **Sign-in method** aktivierst du **E-Mail/Passwort** und **Google**.
3. Unter **Templates** stellst du die Sprache der E-Mails auf **Deutsch**.

### 3. Datenbank anlegen

1. **Build → Firestore Database → Datenbank erstellen**.
2. Standort: **europe-west3 (Frankfurt)**. Das ist wichtig für den Datenschutz und lässt sich später nicht ändern.
3. Modus: **Produktionsmodus**. Die richtigen Regeln spielst du gleich in Schritt 6 ein.

### 4. Web-App registrieren und Zugangsdaten eintragen

1. Zahnrad oben links → **Projekteinstellungen** → unten bei **Meine Apps** auf das Symbol `</>` klicken.
2. Name z. B. `Einkaufshelden Web`, Haken bei **Firebase Hosting** setzen.
3. Firebase zeigt dir einen Block `const firebaseConfig = { ... }`.
   Kopiere die Werte in die Datei `public/firebase-config.js`.

Diese Werte sind nicht geheim und dürfen öffentlich sein. Geschützt werden die Daten durch die Sicherheitsregeln.

### 5. Firebase-Werkzeug installieren

Öffne ein Terminal im Ordner `einkaufshelden-web` und gib ein:

```bash
npm install
npx firebase login
cp .firebaserc.example .firebaserc
```

Trag in `.firebaserc` deine Projekt-ID ein (steht in den Projekteinstellungen, z. B. `einkaufshelden-1a2b3`).

### 6. Veröffentlichen

```bash
npm test          # prüft die Sicherheitsregeln (optional, braucht Java)
npx firebase deploy
```

Am Ende steht dort deine Adresse, z. B. `https://einkaufshelden-1a2b3.web.app`. **Die App ist jetzt online.**

### 7. Eigene Domain (optional)

1. Domain kaufen, z. B. `einkaufshelden.de`, bei IONOS, Strato o. Ä. (ca. 5–15 € im Jahr).
2. Firebase-Konsole → **Hosting → Benutzerdefinierte Domain hinzufügen** und den Anweisungen folgen
   (zwei DNS-Einträge beim Domain-Anbieter eintragen). Das HTTPS-Zertifikat kommt automatisch.
3. Danach unter **Authentication → Einstellungen → Autorisierte Domains** deine Domain hinzufügen,
   sonst funktioniert die Google-Anmeldung dort nicht.

### 8. Rechtstexte ausfüllen – vor dem Start!

In `public/impressum.html`, `public/datenschutz.html` und `public/agb.html` sind alle Stellen
**gelb markiert**, die du ausfüllen musst (Name, Anschrift, E-Mail, Datum).
Lass die Texte am besten noch einmal prüfen, z. B. mit dem Generator von e-recht24 oder durch einen Anwalt.
Danach erneut `npx firebase deploy`.

---

## Im Betrieb

- **Meldungen ansehen:** Firebase-Konsole → Firestore → Sammlung `reports`.
  Einen gemeldeten Auftrag löschst du unter `requests` → Dokument → Löschen.
- **Konto sperren:** Authentication → Nutzer → Menü → Konto deaktivieren.
- **Kosten:** Der kostenlose Spark-Tarif reicht für den Anfang (50.000 Lesezugriffe pro Tag).
  Wenn die App wächst, wechselst du auf Blaze (Abrechnung nach Nutzung, meist wenige Euro im Monat).
  Stell dort unbedingt ein **Budget-Limit mit Warnung** ein.
- **Updates:** Dateien ändern, `npx firebase deploy`. Die Nutzer bekommen die neue Version beim nächsten Öffnen.

## Auf dem Handy installieren

- **Android (Chrome):** Seite öffnen → Button „App installieren“ oben oder Menü → „App installieren“.
- **iPhone (Safari):** Seite öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.

Für einen Eintrag im Google Play Store oder Apple App Store kannst du die fertige Web-App später mit
[PWABuilder](https://www.pwabuilder.com) verpacken (Google: 25 $ einmalig, Apple: 99 $ pro Jahr).

## Lokal ausprobieren, ohne Firebase-Konto

```bash
npm install
npm start
```

Dann <http://127.0.0.1:5000> öffnen. Alles läuft in einer Testumgebung auf deinem Rechner (braucht Java).
Anmeldungen und Daten sind dort nur zum Testen und verschwinden beim Beenden.

## Dateien

| Datei | Inhalt |
|---|---|
| `public/index.html`, `public/app.js`, `public/style.css` | Die App |
| `public/firebase-config.js` | Deine Firebase-Zugangsdaten (Schritt 4) |
| `public/impressum.html`, `datenschutz.html`, `agb.html` | Rechtstexte (Schritt 8) |
| `public/manifest.webmanifest`, `public/sw.js`, `public/icons/` | Installation als Handy-App |
| `public/vendor/`, `public/fonts/` | Firebase-Bibliothek und Schriften, lokal gespeichert (keine Google-Fonts-Abfrage) |
| `firestore.rules` | Sicherheitsregeln der Datenbank |
| `tests/rules.test.js` | Automatische Tests der Sicherheitsregeln |
| `firebase.json` | Hosting-Einstellungen inkl. Sicherheits-Header |
