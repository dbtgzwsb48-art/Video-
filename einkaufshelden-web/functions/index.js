// Server-Funktionen für die Bezahlung in der App (Stripe Connect).
//
// Ablauf:
//  1. Kunde bestellt (status "zahlung_offen") und autorisiert per Stripe Checkout den Höchstbetrag:
//     Einkaufsbudget + Heldenlohn + 0,20 € Servicegebühr. Es wird nur reserviert.
//  2. Webhook bestätigt die Reservierung → status "offen", Auftrag erscheint bei den Helden.
//  3. Held kauft ein, trägt den Kassenbon-Betrag ein und meldet „Geliefert“ → genau
//     Kassenbon + Heldenlohn + 0,20 € werden abgebucht, der Rest der Reservierung verfällt.
//  4. Kunde klickt „Erhalten“ (oder 72 h vergehen) → Kassenbon + Heldenlohn gehen an den Helden.
//     Die 0,20 € bleiben auf dem Stripe-Konto des Betreibers.
//  5. Zieht der Kunde zurück, bevor jemand übernommen hat → Reservierung wird aufgehoben.
//
// Im Firebase-Emulator (npm start) wird Stripe nur simuliert, es fließt kein Geld.

import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";
import { checkoutAmounts, captureAmounts, readyForCapture, readyForRelease, authExpired, cancelDecision, safeOrigin } from "./lib.js";

setGlobalOptions({ region: "europe-west3", maxInstances: 10 });
initializeApp();
const db = getFirestore();

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
// Eigene Domain(s), z. B. "einkaufshelden.de,www.einkaufshelden.de" – in functions/.env eintragen.
const APP_DOMAINS = defineString("APP_DOMAINS", { default: "" });

const SIMULATE = process.env.FUNCTIONS_EMULATOR === "true";
const secrets = SIMULATE ? [] : [STRIPE_SECRET_KEY];
const stripe = () => new Stripe(STRIPE_SECRET_KEY.value());

// ---------- Hilfen ----------
const requireUser = (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Bitte melde dich an.");
  return uid;
};
const isAdmin = async (uid) => (await db.doc(`admins/${uid}`).get()).exists;
const originOf = (req) => {
  const o = safeOrigin(req.rawRequest.headers.origin || "", APP_DOMAINS.value().split(",").map(s => s.trim()).filter(Boolean), SIMULATE);
  if (!o) throw new HttpsError("permission-denied", "Unbekannte Webseite.");
  return o;
};

async function markAuthorized(requestId, info) {
  const ref = db.doc(`requests/${requestId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) { logger.warn("Zahlung für gelöschten Auftrag", requestId, info); return; }
    if (snap.data().status !== "zahlung_offen") return; // schon verarbeitet
    tx.update(ref, { status: "offen", paid: true, paidAt: FieldValue.serverTimestamp(), captured: false, transferId: null, ...info });
  });
}

async function setPayoutStatus(uid, ready) {
  await db.doc(`payoutStatus/${uid}`).set({ ready, updatedAt: FieldValue.serverTimestamp() });
}

/** Sperrt ein Feld per Transaktion, damit dieselbe Buchung nie doppelt läuft. */
async function claim(ref, check, flag) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists ? snap.data() : null;
    if (!check(d)) return null;
    tx.update(ref, { [flag]: true });
    return d;
  });
}

async function capturePayment(requestId) {
  const ref = db.doc(`requests/${requestId}`);
  const r = await claim(ref, readyForCapture, "capturing");
  if (!r) return;
  try {
    const a = captureAmounts(r);
    let chargeId = `ch_sim_${requestId}`;
    if (!SIMULATE) {
      const pi = await stripe().paymentIntents.capture(r.paymentIntent, { amount_to_capture: a.capture }, { idempotencyKey: `capture-${requestId}` });
      chargeId = pi.latest_charge;
    }
    await ref.update({ captured: true, capturing: false, capturedAmount: a.capture / 100, chargeId, capturedAt: FieldValue.serverTimestamp(), paymentError: FieldValue.delete() });
    logger.info("Abgebucht", requestId, a.capture);
  } catch (e) {
    logger.error("Abbuchung fehlgeschlagen", requestId, e);
    await ref.update({ capturing: false, paymentError: String(e.message || e).slice(0, 200) });
  }
}

async function releasePayment(requestId) {
  const ref = db.doc(`requests/${requestId}`);
  const r = await claim(ref, readyForRelease, "transferring");
  if (!r) return;
  try {
    const acct = (await db.doc(`stripeAccounts/${r.helperId}`).get()).data();
    if (!acct || !acct.accountId) throw new Error("Der Held hat noch kein Auszahlungskonto.");
    const a = captureAmounts(r);
    const transfer = SIMULATE
      ? { id: `tr_sim_${requestId}` }
      : await stripe().transfers.create({
          amount: a.transfer, currency: "eur", destination: acct.accountId,
          source_transaction: r.chargeId, transfer_group: requestId,
          description: `Einkauf ${(a.einkauf / 100).toFixed(2)} € + Heldenlohn ${(a.heldenlohn / 100).toFixed(2)} €`,
          metadata: { requestId },
        }, { idempotencyKey: `transfer-${requestId}` });
    await ref.update({ transferId: transfer.id, transferredAmount: a.transfer / 100, transferredAt: FieldValue.serverTimestamp(), transferring: false, transferError: FieldValue.delete() });
    logger.info("An Helden ausgezahlt", requestId, transfer.id);
  } catch (e) {
    logger.error("Auszahlung fehlgeschlagen", requestId, e);
    await ref.update({ transferring: false, transferError: String(e.message || e).slice(0, 200) });
  }
}

// ---------- 1. Bestellen und bezahlen ----------
export const createCheckout = onCall({ secrets }, async (req) => {
  const uid = requireUser(req);
  const requestId = String((req.data && req.data.requestId) || "");
  const snap = await db.doc(`requests/${requestId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Den Auftrag gibt es nicht.");
  const r = snap.data();
  if (r.createdBy !== uid) throw new HttpsError("permission-denied", "Das ist nicht dein Auftrag.");
  if (r.status !== "zahlung_offen") throw new HttpsError("failed-precondition", "Dieser Auftrag ist schon bezahlt.");
  if (!(await db.doc(`requests/${requestId}/private/address`).get()).exists) throw new HttpsError("failed-precondition", "Bitte gib zuerst deine Lieferadresse an.");
  let a;
  try { a = checkoutAmounts(r); } catch (e) { throw new HttpsError("invalid-argument", e.message); }
  const base = originOf(req);

  if (SIMULATE) {
    await markAuthorized(requestId, { paymentIntent: `pi_sim_${requestId}`, authorizedAmount: a.total / 100 });
    return { simulated: true };
  }
  const item = (name, amount, description) => ({ quantity: 1, price_data: { currency: "eur", unit_amount: amount, product_data: description ? { name, description } : { name } } });
  const session = await stripe().checkout.sessions.create({
    mode: "payment", locale: "de",
    line_items: [
      item("Einkauf (Höchstbetrag)", a.budget, "Reserviert. Abgebucht wird nur der Betrag auf dem Kassenbon."),
      item(`Heldenlohn: ${String(r.title).slice(0, 60)}`, a.heldenlohn, "Geht nach der Lieferung an deinen Einkaufshelden."),
      item("Servicegebühr Einkaufshelden", a.service),
    ],
    client_reference_id: requestId,
    metadata: { requestId, uid },
    payment_intent_data: { capture_method: "manual", transfer_group: requestId, metadata: { requestId } },
    success_url: `${base}/?bezahlt=1#meine`,
    cancel_url: `${base}/?bezahlt=0#meine`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
  });
  return { url: session.url };
});

// Stripe meldet bestätigte Zahlungen hierher (URL in Stripe → Entwickler → Webhooks eintragen).
export const stripeWebhook = onRequest({ secrets: SIMULATE ? [] : [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
  let event;
  try {
    event = stripe().webhooks.constructEvent(req.rawBody, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET.value());
  } catch (e) {
    logger.warn("Webhook mit ungültiger Signatur", e.message);
    res.status(400).send("Ungültige Signatur");
    return;
  }
  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      if (s.metadata && s.metadata.requestId && s.payment_intent) {
        const pi = await stripe().paymentIntents.retrieve(s.payment_intent);
        if (pi.status === "requires_capture") {
          await markAuthorized(s.metadata.requestId, { paymentIntent: pi.id, authorizedAmount: pi.amount / 100 });
        }
      }
    }
    res.json({ received: true });
  } catch (e) {
    logger.error("Webhook-Fehler", e);
    res.status(500).send("Fehler"); // Stripe versucht es später erneut
  }
});

// ---------- 2. Zurückziehen ----------
export const cancelRequest = onCall({ secrets }, async (req) => {
  const uid = requireUser(req);
  const requestId = String((req.data && req.data.requestId) || "");
  const ref = db.doc(`requests/${requestId}`);
  const snap = await ref.get();
  const r = snap.exists ? snap.data() : null;
  const d = cancelDecision(r, uid, await isAdmin(uid));
  if (!d.ok) throw new HttpsError("failed-precondition", d.reason);
  if (!SIMULATE && d.action === "release") await stripe().paymentIntents.cancel(r.paymentIntent, { cancellation_reason: "requested_by_customer" });
  if (!SIMULATE && d.action === "refund") await stripe().refunds.create({ payment_intent: r.paymentIntent, metadata: { requestId } }, { idempotencyKey: `refund-${requestId}` });
  await ref.delete();
  return { action: d.action };
});

// ---------- 3. Abbuchen nach dem Einkauf, Auszahlung an den Helden ----------
export const onRequestUpdated = onDocumentUpdated({ document: "requests/{id}", secrets }, async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data();
  if (!after) return;
  const id = event.params.id;
  // Held hat „Geliefert“ gemeldet → Kassenbon + Heldenlohn + Gebühr abbuchen
  if (after.status === "erledigt" && before.status !== "erledigt") await capturePayment(id);
  // Abbuchung fertig und Kunde hat schon bestätigt, oder Kunde bestätigt jetzt → an Helden auszahlen
  if ((after.captured && !before.captured) || (after.thanks && !before.thanks)) await releasePayment(id);
});

// Stündlich: Auszahlung nach 72 h, Wiederholung nach Fehlern, abgelaufene Reservierungen aufräumen.
export const hourlyJobs = onSchedule({ schedule: "every 60 minutes", timeZone: "Europe/Berlin", secrets }, async () => {
  const done = await db.collection("requests").where("status", "==", "erledigt").where("transferId", "==", null).limit(200).get();
  for (const doc of done.docs) {
    if (readyForCapture(doc.data())) await capturePayment(doc.id);
    if (readyForRelease((await doc.ref.get()).data())) await releasePayment(doc.id);
  }
  const open = await db.collection("requests").where("status", "==", "offen").limit(200).get();
  for (const doc of open.docs) {
    const r = doc.data();
    if (!authExpired(r)) continue;
    try {
      if (!SIMULATE) await stripe().paymentIntents.cancel(r.paymentIntent, { cancellation_reason: "abandoned" });
    } catch (e) { logger.warn("Reservierung schon aufgehoben", doc.id, e.message); }
    await doc.ref.update({ status: "abgelaufen", paid: false, expiredAt: FieldValue.serverTimestamp() });
  }
});

// Gelöschte Aufträge: Lieferadresse und Chat mit löschen (Unterdokumente bleiben sonst liegen).
export const onRequestDeleted = onDocumentDeleted("requests/{id}", async (event) => {
  await db.recursiveDelete(db.doc(`requests/${event.params.id}`));
});

// ---------- 4. Auszahlungskonto der Helden ----------
export const helperOnboarding = onCall({ secrets }, async (req) => {
  const uid = requireUser(req);
  if (!(await db.doc(`helpers/${uid}`).get()).exists) throw new HttpsError("failed-precondition", "Melde dich zuerst als Held an.");
  const base = originOf(req);
  if (SIMULATE) {
    await db.doc(`stripeAccounts/${uid}`).set({ accountId: `acct_sim_${uid}` });
    await setPayoutStatus(uid, true);
    return { simulated: true };
  }
  const privRef = db.doc(`stripeAccounts/${uid}`);
  let accountId = ((await privRef.get()).data() || {}).accountId;
  if (!accountId) {
    const acct = await stripe().accounts.create({
      type: "express", country: "DE", business_type: "individual",
      email: req.auth.token.email || undefined,
      capabilities: { transfers: { requested: true } },
      business_profile: { product_description: "Einkaufshilfe für Nachbarn über Einkaufshelden", mcc: "7299" },
      metadata: { uid },
    });
    accountId = acct.id;
    await privRef.set({ accountId, createdAt: FieldValue.serverTimestamp() });
  }
  const link = await stripe().accountLinks.create({
    account: accountId, type: "account_onboarding",
    refresh_url: `${base}/?stripe=neu#held`, return_url: `${base}/?stripe=fertig#held`,
  });
  return { url: link.url };
});

export const refreshPayoutStatus = onCall({ secrets }, async (req) => {
  const uid = requireUser(req);
  const acct = (await db.doc(`stripeAccounts/${uid}`).get()).data();
  if (!acct) { await setPayoutStatus(uid, false); return { ready: false }; }
  if (SIMULATE) { await setPayoutStatus(uid, true); return { ready: true }; }
  const a = await stripe().accounts.retrieve(acct.accountId);
  const ready = !!(a.payouts_enabled && a.capabilities && a.capabilities.transfers === "active");
  await setPayoutStatus(uid, ready);
  return { ready };
});

// Link zum Stripe-Dashboard des Helden (Auszahlungen ansehen, Bankkonto ändern).
export const helperDashboard = onCall({ secrets }, async (req) => {
  const uid = requireUser(req);
  const acct = (await db.doc(`stripeAccounts/${uid}`).get()).data();
  if (!acct) throw new HttpsError("failed-precondition", "Du hast noch kein Auszahlungskonto.");
  if (SIMULATE) return { url: null, simulated: true };
  const l = await stripe().accounts.createLoginLink(acct.accountId);
  return { url: l.url };
});
