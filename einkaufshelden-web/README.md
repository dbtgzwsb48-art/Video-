# Einkaufshelden – öffentliche Web-App

Nachbarn gehen für Nachbarn einkaufen und bekommen dafür einen fairen Heldenlohn (ab 3 €).
Bezahlt wird wie bei einem Lieferdienst komplett in der App: Einkauf + Heldenlohn + 0,20 € Servicegebühr für dich.
Die App läuft im Browser und lässt sich auf dem Handy wie eine normale App installieren.
Sie nutzt **Firebase** von Google (Anmeldung, Datenbank, Hosting, Server-Funktionen) und **Stripe** für die Bezahlung.

## Was die App kann

- Anmeldung mit Google oder mit E-Mail und Passwort (inkl. Passwort vergessen und E-Mail-Bestätigung)
- **Startseite mit Läden:** PLZ eingeben, Helden in der Nähe sehen, Laden wählen, Warenkorb aus Vorschlägen
  zusammentippen (mit Mengen), eigene Artikel ergänzen, zur Kasse
- **Lieferadresse beim Bestellen:** privat, nur der übernehmende Held sieht sie; auf Wunsch gemerkt
- Freie Einkaufsliste mit Höchstbetrag und mehreren Läden, Heldenlohn wird automatisch berechnet
- **Bewertungen:** 1–5 Sterne nach der Lieferung, Durchschnitt bei jedem Helden
- **Nochmal bestellen:** frühere Bestellungen mit einem Klick wiederholen
- **Bezahlen in der App** per Karte, Apple Pay, Google Pay u. a. über Stripe
- **Live-Status** für den Kunden: Bezahlt → Held gefunden → Kauft ein → Unterwegs → Geliefert
- Mitglied werden ab 10 Jahren (unter 18 mit Einverständnis der Eltern)
- Als Held anmelden (nur ab 18), Auszahlungskonto einrichten, Aufträge übernehmen, Artikel abhaken,
  „Bin unterwegs“ und „Geliefert“ mit Kassenbon-Betrag melden, Auftrag abgeben
- Automatische Auszahlung an den Helden (Kassenbon + Heldenlohn) nach Bestätigung oder spätestens 72 Stunden
- **Privater Übergabe-Chat:** Nur Auftraggeber und Held sehen ihn, dort wird die Adresse ausgetauscht.
- Verdienstübersicht für Helden, Heldenwand
- Betreiber-Ansicht mit deinen Einnahmen, Zahlungsproblemen und gemeldeten Aufträgen
- Konto selbst löschen (DSGVO)
- Impressum, Datenschutzerklärung und Nutzungsbedingungen als Vorlage
- Installierbar auf dem Handy (PWA), funktioniert auch bei schwachem Netz

Die Sicherheitsregeln in `firestore.rules` sorgen dafür, dass niemand fremde Aufträge ändern,
sich selbst mehr Lohn geben, die Bezahlung überspringen, einen zu hohen Kassenbon eintragen oder fremde Chats
lesen kann. Lieferadressen sieht nur der übernehmende Held. Zahlungsdaten schreibt nur der Server.
Das ist mit 23 automatischen Tests abgesichert (`npm test`).

## So läuft das Geld

Beispiel: Budget 30 €, ein Laden, Kassenbon 24,37 €.

| Schritt | Was passiert | Betrag |
|---|---|---|
| Bestellen | Auf der Karte des Kunden wird **reserviert** (noch nicht abgebucht) | 30,00 + 3,00 + 0,20 = **33,20 €** |
| Held liefert | Held trägt den Kassenbon ein, jetzt wird **abgebucht** | 24,37 + 3,00 + 0,20 = **27,57 €** |
| Kunde bestätigt (oder nach 72 h) | **Auszahlung** an den Helden | 24,37 + 3,00 = **27,37 €** |
| | Bleibt bei dir | **0,20 €** |

- Stripe nimmt pro Zahlung eine eigene Gebühr (in der EU etwa 1,5 % + 0,25 €, im Beispiel ca. 0,66 €).
  **Die trägst du** – von deinen 0,20 € geht sie ab, du legst pro Einkauf also etwas drauf.
  Wenn du das ändern willst, erhöhe `SERVICE_FEE` (siehe unten).
- Zieht der Kunde zurück, bevor ein Held übernimmt, wird die Reservierung aufgehoben: kein Geld fließt,
  keine Stripe-Gebühr. Übernimmt 6 Tage lang niemand, verfällt der Auftrag genauso.
- Der Held legt den Einkauf aus und bekommt ihn mit der Auszahlung zurück. Stripe überweist auf sein
  Bankkonto meist innerhalb von 2–7 Werktagen.
- Beim Bestellen wählt man **einen oder mehrere Läden** (bis zu 6). Jeder weitere Laden bringt dem Helden
  **+ 1 €** mehr Heldenlohn.

> **Wichtig:** Regelmäßige Gebühreneinnahmen über Stripe gelten in Deutschland als Gewerbe. Frag vor dem Start
> beim Gewerbeamt oder Finanzamt deiner Stadt nach. Stripe fragt bei der Einrichtung nach deinen Daten und
> meldet Einnahmen an das Finanzamt.

### Dich als Betreiber freischalten

1. Melde dich einmal ganz normal in der App an.
2. Firebase-Konsole → **Authentication → Nutzer** → kopiere deine **Nutzer-UID**.
3. **Firestore Database → Sammlung starten** → Sammlungs-ID `admins`, Dokument-ID = deine UID,
   ein Feld `seit` (Typ string) mit dem heutigen Datum → Speichern.
4. App neu laden. Oben erscheint der Reiter **Betreiber**.

## Läden und Vorschläge ändern

Die Läden auf der Startseite und die Artikel-Vorschläge stehen oben in `public/app.js` (`SHOP_KIND` und `SUGGEST`).
Es sind Ladenketten, keine echten Filialen: Der Held kauft in einer Filiale seiner Wahl in der Nähe.
Helden „in der Nähe“ sind die, deren Gebiet eine PLZ mit denselben ersten drei Ziffern enthält. Deshalb
sollten Helden in ihrem Profil ihre PLZ angeben.

## Heldenlohn ändern

Der Tarif steht ganz oben in `public/app.js`:

```js
export const FEE = { base: 3, perItem: 0.2, freeItems: 10, heavy: 2, express: 2, extraShop: 1 };
export const SERVICE_FEE = 0.2;
```

Wenn du den Grundlohn änderst, pass auch `MIN_FEE()` in `firestore.rules` und `MIN_FEE_CENTS` in `functions/lib.js` an.
Wenn du die Servicegebühr änderst, pass auch `SERVICE_FEE()` in `firestore.rules`, `SERVICE_FEE_CENTS` in
`functions/lib.js` und den Betrag in `public/agb.html` an.

---

## Veröffentlichen: Schritt für Schritt

Du brauchst einen Computer mit [Node.js](https://nodejs.org) (Version 22), ein Google-Konto und ein
Bankkonto. Das Ganze dauert etwa eine Stunde.

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

### 6. Firebase auf den Tarif „Blaze“ umstellen

Server-Funktionen (für die Bezahlung) gibt es nur im Blaze-Tarif. Firebase-Konsole → unten links
**Upgrade** → **Blaze**. Für eine kleine App bleibt das meist kostenlos oder kostet wenige Cent im Monat.
Stell unter **Nutzung und Abrechnung → Budgets** ein Budget von z. B. 5 € mit E-Mail-Warnung ein.

### 7. Stripe einrichten

1. Konto anlegen auf <https://dashboard.stripe.com/register>. Erst im **Testmodus** bleiben (Schalter oben rechts).
2. **Connect aktivieren:** Im Dashboard links **Connect** → **Loslegen** → „Plattform oder Marktplatz“ wählen.
   Als Kontotyp für deine Helden **Express** wählen. Name und Logo eintragen, die sehen die Helden.
3. **Geheimen Schlüssel holen:** **Entwickler → API-Schlüssel** → „Geheimer Schlüssel“ (`sk_test_…`) kopieren.
4. Im Terminal im Ordner `einkaufshelden-web`:

   ```bash
   npx firebase functions:secrets:set STRIPE_SECRET_KEY
   ```

   und den Schlüssel einfügen. **Nie in eine Datei schreiben oder auf GitHub hochladen.**
5. Jetzt veröffentlichen (Schritt 8). Danach in Stripe **Entwickler → Webhooks → Endpunkt hinzufügen**:
   - URL: `https://europe-west3-DEINE-PROJEKT-ID.cloudfunctions.net/stripeWebhook`
   - Ereignis: `checkout.session.completed`
   - Den **Signaturschlüssel** (`whsec_…`) kopieren und eintragen:

   ```bash
   npx firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   npx firebase deploy --only functions
   ```

6. **Testen:** In der App bestellen und mit der Testkarte `4242 4242 4242 4242`, beliebigem Datum in der
   Zukunft und beliebiger Prüfziffer bezahlen. Als Held das Auszahlungskonto mit Testdaten einrichten
   (Stripe zeigt dafür Knöpfe wie „Testdaten verwenden“).
7. **Live schalten:** Wenn alles klappt, im Stripe-Dashboard dein Konto aktivieren (Bankkonto, Ausweis),
   in den Live-Modus wechseln und Schritt 3–5 mit dem Live-Schlüssel (`sk_live_…`) wiederholen.

### 8. Veröffentlichen

```bash
npm test          # prüft Zahlungslogik und Sicherheitsregeln (optional, braucht Java)
npx firebase deploy
```

Am Ende steht dort deine Adresse, z. B. `https://einkaufshelden-1a2b3.web.app`. **Die App ist jetzt online.**

### 9. Eigene Domain (optional)

1. Domain kaufen, z. B. `einkaufshelden.de`, bei IONOS, Strato o. Ä. (ca. 5–15 € im Jahr).
2. Firebase-Konsole → **Hosting → Benutzerdefinierte Domain hinzufügen** und den Anweisungen folgen
   (zwei DNS-Einträge beim Domain-Anbieter eintragen). Das HTTPS-Zertifikat kommt automatisch.
3. Danach unter **Authentication → Einstellungen → Autorisierte Domains** deine Domain hinzufügen,
   sonst funktioniert die Google-Anmeldung dort nicht.
4. Trag die Domain in `functions/.env` bei `APP_DOMAINS=` ein (z. B. `einkaufshelden.de`) und veröffentliche
   erneut. Sonst lässt Stripe nach dem Bezahlen nicht auf deine Domain zurückleiten.

### 10. Rechtstexte ausfüllen – vor dem Start!

In `public/impressum.html`, `public/datenschutz.html` und `public/agb.html` sind alle Stellen
**gelb markiert**, die du ausfüllen musst (Name, Anschrift, E-Mail, Datum).
Lass die Texte am besten noch einmal prüfen, z. B. mit dem Generator von e-recht24 oder durch einen Anwalt.
Danach erneut `npx firebase deploy`.

---

## Im Betrieb

- **Einnahmen, Zahlungsprobleme, Meldungen:** im Reiter **Betreiber** in der App. Löschst du dort einen
  gemeldeten Auftrag, wird dem Kunden automatisch erstattet, solange noch nicht an den Helden ausgezahlt wurde.
- **Geld:** Deine Servicegebühren liegen auf deinem Stripe-Konto. Stripe überweist sie automatisch auf
  dein Bankkonto. Reklamationen kannst du im Stripe-Dashboard unter **Zahlungen** erstatten.
- **Konto sperren:** Authentication → Nutzer → Menü → Konto deaktivieren.
- **Kosten:** Firebase Blaze rechnet nach Nutzung ab, für den Anfang meist wenige Cent. Halte das Budget-Limit aktiv.
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
**Bezahlungen werden dort nur simuliert**, es fließt kein Geld. Anmeldungen und Daten verschwinden beim Beenden.

## Dateien

| Datei | Inhalt |
|---|---|
| `public/index.html`, `public/app.js`, `public/style.css` | Die App |
| `public/firebase-config.js` | Deine Firebase-Zugangsdaten (Schritt 4) |
| `public/impressum.html`, `datenschutz.html`, `agb.html` | Rechtstexte (Schritt 8) |
| `public/manifest.webmanifest`, `public/sw.js`, `public/icons/` | Installation als Handy-App |
| `public/vendor/`, `public/fonts/` | Firebase-Bibliothek und Schriften, lokal gespeichert (keine Google-Fonts-Abfrage) |
| `functions/index.js`, `functions/lib.js` | Server-Funktionen für Bezahlung, Abbuchung, Auszahlung, Erstattung |
| `functions/.env` | Eigene Domain für die Rückkehr nach der Bezahlung |
| `firestore.rules` | Sicherheitsregeln der Datenbank |
| `tests/` | Automatische Tests der Zahlungslogik und der Sicherheitsregeln |
| `firebase.json` | Hosting-Einstellungen inkl. Sicherheits-Header |
