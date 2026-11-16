#!/usr/bin/env bash
# Einkaufshelden veröffentlichen – gedacht für die Google Cloud Shell (Terminal im Browser, auch auf dem iPad).
#
#   ./deploy.sh            alles veröffentlichen (fragt beim ersten Mal nach dem Stripe-Schlüssel)
#   ./deploy.sh --stripe   Stripe-Schlüssel neu eingeben (z. B. beim Wechsel von Test auf Live)
#   ./deploy.sh --webhook  Stripe-Webhook-Signaturschlüssel (whsec_…) eingeben
#   ./deploy.sh --vorschau nur Webseite und Datenbank-Regeln (geht auch ohne Blaze-Tarif, Bestellen gesperrt)
set -euo pipefail
cd "$(dirname "$0")"
PROJECT=einkaufshelden
FB="npx --yes firebase"

echo "== 1/4 Pakete installieren (dauert beim ersten Mal 1–2 Minuten)"
npm install --no-audit --no-fund --loglevel=error

echo "== 2/4 Bei Firebase anmelden"
if ! $FB projects:list >/dev/null 2>&1; then
  echo "Es erscheint gleich ein Link. Öffne ihn, melde dich mit deinem Google-Konto an,"
  echo "kopiere den angezeigten Code und füge ihn hier ein."
  $FB login --no-localhost
fi
$FB use "$PROJECT" >/dev/null

if [[ "${1:-}" == "--vorschau" ]]; then
  echo "== Vorschau hochladen (Webseite und Datenbank-Regeln)"
  $FB deploy --project "$PROJECT" --only hosting,firestore --force
  echo
  echo "Fertig! Vorschau online:  https://$PROJECT.web.app"
  echo "Bestellen ist gesperrt, bis Blaze aktiv ist und ./deploy.sh ohne --vorschau gelaufen ist."
  exit 0
fi

secret_exists() { gcloud secrets describe "$1" --project "$PROJECT" >/dev/null 2>&1; }
set_secret_from_text() {   # Name, Wert
  local f; f="$(mktemp)"; printf '%s' "$2" > "$f"
  $FB functions:secrets:set "$1" --data-file "$f" --force >/dev/null; rm -f "$f"
}

echo "== 3/4 Stripe-Schlüssel"
if [[ "${1:-}" == "--stripe" ]] || ! secret_exists STRIPE_SECRET_KEY; then
  echo "Füge deinen geheimen Stripe-Schlüssel ein (beginnt mit sk_test_ oder sk_live_)."
  echo "Er wird beim Tippen nicht angezeigt und nur bei Google gespeichert, nicht in der App."
  read -r -s -p "Stripe-Schlüssel: " KEY; echo
  [[ "$KEY" == sk_* ]] || { echo "Das sieht nicht wie ein Stripe-Schlüssel aus (sk_…). Abbruch."; exit 1; }
  set_secret_from_text STRIPE_SECRET_KEY "$KEY"; unset KEY
  echo "Gespeichert."
else
  echo "Schon hinterlegt. (Neu eingeben mit: ./deploy.sh --stripe)"
fi
if [[ "${1:-}" == "--webhook" ]]; then
  read -r -s -p "Webhook-Signaturschlüssel (whsec_…): " WH; echo
  [[ "$WH" == whsec_* ]] || { echo "Das sieht nicht wie ein Webhook-Schlüssel aus (whsec_…). Abbruch."; exit 1; }
  set_secret_from_text STRIPE_WEBHOOK_SECRET "$WH"; unset WH
  echo "Gespeichert."
elif ! secret_exists STRIPE_WEBHOOK_SECRET; then
  # Platzhalter, damit der erste Upload klappt. Den echten Schlüssel gibt es erst, wenn der Webhook in Stripe angelegt ist.
  set_secret_from_text STRIPE_WEBHOOK_SECRET "whsec_platzhalter"
  WEBHOOK_TODO=1
fi

echo "== 4/4 Hochladen (Webseite, Datenbank-Regeln, Server-Funktionen – dauert 3–6 Minuten)"
$FB deploy --project "$PROJECT" --force

echo
echo "Fertig! Die App ist online:  https://$PROJECT.web.app"
if [[ "${WEBHOOK_TODO:-}" == 1 ]]; then
  echo
  echo "Noch ein Schritt für die Bezahlung: In Stripe einen Webhook anlegen mit der Adresse"
  echo "  https://europe-west3-$PROJECT.cloudfunctions.net/stripeWebhook"
  echo "und dem Ereignis checkout.session.completed. Danach hier ausführen:  ./deploy.sh --webhook"
fi
