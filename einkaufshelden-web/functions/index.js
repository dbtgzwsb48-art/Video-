// Server-Funktionen für die Bezahlung in der App (Stripe Connect).
//
// Ablauf:
//  1. Kunde bestellt (status "zahlung_offen") und autorisiert per Stripe Checkout den Höchstbetrag:
//     Einkaufsbudget + Heldenlohn + Trinkgeld + Servicegebühr (0,45 € + 2 %). Es wird nur reserviert.
//  2. Webhook bestätigt die Reservierung → status "offen", Auftrag erscheint bei den Helden.
//  3. Held kauft ein, trägt den Kassenbon-Betrag ein und meldet „Geliefert“ → genau
//     Kassenbon + Heldenlohn + Trinkgeld + Servicegebühr werden abgebucht, der Rest verfällt.
//  4. Kunde klickt „Erhalten“ (oder 72 h vergehen) → Kassenbon + Heldenlohn + Trinkgeld gehen an den Helden.
//     Die Servicegebühr bleibt auf dem Stripe-Konto des Betreibers.
//     Meldet der Kunde ein Problem, wartet die Auszahlung, bis der Betreiber entschieden hat.
//  Bei jedem Schritt bekommen die Beteiligten eine Benachrichtigung (in der App und als Push).
//  5. Zieht der Kunde zurück, bevor jemand übernommen hat → Reservierung wird aufgehoben.
//
// Im Firebase-Emulator (npm start) wird Stripe nur simuliert, es fließt kein Geld.

import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated, onDocumentDeleted, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import Stripe from "stripe";
import { checkoutAmounts, captureAmounts, readyForCapture, readyForRelease, authExpired, cancelDecision, disputeDecision, safeOrigin, orderNumber, heroMatchesZip } from "./lib.js";

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

// ---------- Benachrichtigungen ----------
// Jede Benachrichtigung landet im Postfach in der App (notifications) und, wenn erlaubt, als Push aufs Handy.
async function notify(uids, title, body, link = "#meine") {
  const to = [...new Set(uids.filter(Boolean))];
  if (!to.length) return;
  const batch = db.batch();
  to.forEach(uid => batch.set(db.collection("notifications").doc(), { to: uid, title, body, link, read: false, at: FieldValue.serverTimestamp() }));
  await batch.commit();
  if (SIMULATE) { logger.info("Benachrichtigung", to, title, body); return; }
  const docs = await Promise.all(to.map(uid => db.doc(`pushTokens/${uid}`).get()));
  for (const d of docs) {
    const tokens = (d.exists && d.data().tokens) || [];
    if (!tokens.length) continue;
    try {
      const res = await getMessaging().sendEachForMulticast({
        tokens, notification: { title, body },
        webpush: { fcmOptions: { link: `/${link}` }, notification: { icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", lang: "de" } },
        data: { link },
      });
      const dead = tokens.filter((t, i) => !res.responses[i].success && /registration-token-not-registered|invalid-argument/.test(String(res.responses[i].error && res.responses[i].error.code)));
      if (dead.length) await d.ref.update({ tokens: FieldValue.arrayRemove(...dead) });
    } catch (e) { logger.warn("Push fehlgeschlagen", d.id, e.message); }
  }
}
const firstZip = (area) => (String(area || "").match(/[0-9]{5}/) || [""])[0];
async function heroesNear(zip, exclude) {
  const [helpers, ready] = await Promise.all([db.collection("helpers").where("active", "==", true).get(), db.collection("payoutStatus").where("ready", "==", true).get()]);
  const ok = new Set(ready.docs.map(d => d.id));
  return helpers.docs.filter(d => d.id !== exclude && ok.has(d.id) && heroMatchesZip(d.data().area, zip)).map(d => d.id);
}
const admins = async () => (await db.collection("admins").get()).docs.map(d => d.id);
const userName = async (uid) => { const d = await db.doc(`users/${uid}`).get(); return (d.exists && d.data().name) || "Dein Held"; };
const euroText = (c) => (c / 100).toFixed(2).replace(".", ",") + " €";

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
    if (a.transfer <= 0) { await ref.update({ transferId: "keine", transferredAmount: 0, transferredAt: FieldValue.serverTimestamp(), transferring: false }); return; }
    const transfer = SIMULATE
      ? { id: `tr_sim_${requestId}` }
      : await stripe().transfers.create({
          amount: a.transfer, currency: "eur", destination: acct.accountId,
          source_transaction: r.chargeId, transfer_group: requestId,
          description: `${orderNumber(requestId)}: Einkauf ${euroText(a.einkauf)} + Heldenlohn ${euroText(a.heldenlohn)}${a.tip ? " + Trinkgeld " + euroText(a.tip) : ""}${a.refund ? " − Erstattung " + euroText(a.refund) : ""}`,
          metadata: { requestId },
        }, { idempotencyKey: `transfer-${requestId}` });
    await ref.update({ transferId: transfer.id, transferredAmount: a.transfer / 100, transferredAt: FieldValue.serverTimestamp(), transferring: false, transferError: FieldValue.delete() });
    logger.info("An Helden ausgezahlt", requestId, transfer.id);
    await notify([r.helperId], "Geld ist unterwegs", `${euroText(a.transfer)} für ${orderNumber(requestId)} werden auf dein Bankkonto überwiesen.`, "#meine");
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
      ...(a.tip ? [item("Trinkgeld für deinen Helden", a.tip, "Geht zu 100 % an deinen Helden.")] : []),
      item("Servicegebühr Einkaufshelden (höchstens)", a.service, "0,45 € + 2 %. Abgerechnet wird mit dem echten Kassenbon-Betrag."),
    ],
    client_reference_id: requestId,
    metadata: { requestId, uid, bestellnummer: orderNumber(requestId) },
    payment_intent_data: {
      capture_method: "manual", transfer_group: requestId,
      description: `Einkaufshelden Bestellung ${orderNumber(requestId)}`,
      metadata: { requestId, bestellnummer: orderNumber(requestId) },
    },
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
  const nr = orderNumber(id);
  // Bezahlt → Helden in der Nähe informieren
  if (after.status === "offen" && before.status === "zahlung_offen") {
    const near = await heroesNear(firstZip(after.area), after.createdBy);
    await notify(near, "Neuer Einkauf in deiner Nähe", `${after.title} · ${after.area} · ${euroText(Math.round(after.fee * 100))} Heldenlohn${after.tip ? " + " + euroText(Math.round(after.tip * 100)) + " Trinkgeld" : ""}`, "#auftraege");
  }
  if (after.status === "uebernommen" && before.status === "offen") await notify([after.createdBy], "Held gefunden", `${await userName(after.helperId)} kauft für dich ein (${nr}).`);
  if (after.status === "offen" && before.status === "uebernommen") await notify([after.createdBy], "Wir suchen einen neuen Helden", `Dein Held konnte ${nr} leider nicht erledigen. Dein Auftrag ist wieder für alle Helden sichtbar.`);
  if (after.onTheWay && !before.onTheWay) await notify([after.createdBy], "Dein Einkauf ist unterwegs", `${await userName(after.helperId)} ist auf dem Weg zu dir.`);
  if (after.status === "abgelaufen" && before.status !== "abgelaufen") await notify([after.createdBy], "Bestellung abgelaufen", `Für ${nr} hat sich leider niemand gefunden. Es wurde nichts abgebucht.`);
  if (after.dispute && !before.dispute) {
    const d = await db.doc(`requests/${id}/private/dispute`).get();
    await notify(await admins(), "Neue Reklamation", `${nr}: ${String((d.exists && d.data().text) || "").slice(0, 80)}`, "#betreiber");
    await notify([after.helperId], "Kunde meldet ein Problem", `Bei ${nr} gibt es eine Rückfrage. Die Auszahlung wartet, bis sie geklärt ist.`);
  }
  // Held hat „Geliefert“ gemeldet → abbuchen
  if (after.status === "erledigt" && before.status !== "erledigt") {
    await notify([after.createdBy], "Geliefert!", `Bitte bestätige den Erhalt von ${nr} und bewerte deinen Helden.`);
    await capturePayment(id);
  }
  // Abbuchung fertig und Kunde hat schon bestätigt, oder Kunde bestätigt jetzt → an Helden auszahlen
  if ((after.captured && !before.captured) || (after.thanks && !before.thanks)) await releasePayment(id);
});

// Neue Chat-Nachricht → die andere Person benachrichtigen
export const onChatMessage = onDocumentCreated("requests/{id}/messages/{msg}", async (event) => {
  const m = event.data.data();
  const r = (await db.doc(`requests/${event.params.id}`).get()).data();
  if (!r) return;
  const other = m.from === r.createdBy ? r.helperId : r.createdBy;
  await notify([other], `Nachricht von ${await userName(m.from)}`, String(m.text).slice(0, 120));
});

// ---------- Reklamationen ----------
// Nur der Betreiber entscheidet: Teil- oder Vollerstattung, oder ablehnen. Danach wird ausgezahlt.
export const resolveDispute = onCall({ secrets }, async (req) => {
  const uid = requireUser(req);
  if (!(await isAdmin(uid))) throw new HttpsError("permission-denied", "Nur für den Betreiber.");
  const requestId = String((req.data && req.data.requestId) || "");
  const refundEuro = Number((req.data && req.data.refund) || 0);
  const ref = db.doc(`requests/${requestId}`);
  const r = (await ref.get()).data();
  const d = disputeDecision(r, refundEuro);
  if (!d.ok) throw new HttpsError("failed-precondition", d.reason);
  if (d.refund > 0 && !SIMULATE) {
    await stripe().refunds.create({ payment_intent: r.paymentIntent, amount: d.refund, metadata: { requestId, grund: "Reklamation" } }, { idempotencyKey: `dispute-${requestId}` });
  }
  await ref.update({ "dispute.status": d.refund > 0 ? "erstattet" : "abgelehnt", "dispute.refund": d.refund / 100, "dispute.resolvedAt": FieldValue.serverTimestamp() });
  const nr = orderNumber(requestId);
  await notify([r.createdBy], "Reklamation geklärt", d.refund > 0 ? `Du bekommst ${euroText(d.refund)} für ${nr} zurück.` : `Wir haben deine Reklamation zu ${nr} geprüft und keine Erstattung veranlasst.`);
  await releasePayment(requestId);
  return { refund: d.refund / 100 };
});

// Stündlich: Auszahlung nach 72 h, Wiederholung nach Fehlern, abgelaufene Reservierungen aufräumen.
export const hourlyJobs = onSchedule({ schedule: "every 60 minutes", timeZone: "Europe/Berlin", secrets }, async () => {
  const done = await db.collection("requests").where("status", "==", "erledigt").where("transferId", "==", null).limit(200).get();
  for (const doc of done.docs) {
    if (readyForCapture(doc.data())) await capturePayment(doc.id);
    if (readyForRelease((await doc.ref.get()).data())) await releasePayment(doc.id);
  }
  // Nie bezahlte Bestellungen nach 2 Tagen aufräumen
  const unpaid = await db.collection("requests").where("status", "==", "zahlung_offen").limit(200).get();
  for (const doc of unpaid.docs) {
    const c = doc.data().createdAt;
    if (c && Date.now() - c.toMillis() > 2 * 86400 * 1000) await doc.ref.delete();
  }
  // Gelesene Benachrichtigungen nach 30 Tagen löschen
  const old = await db.collection("notifications").where("read", "==", true).where("at", "<", new Date(Date.now() - 30 * 86400 * 1000)).limit(400).get();
  if (!old.empty) { const b = db.batch(); old.docs.forEach(d => b.delete(d.ref)); await b.commit(); }

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
