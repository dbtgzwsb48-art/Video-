// Reine Rechen- und Prüffunktionen, ohne Firebase und Stripe – dadurch leicht testbar.
//
// Prinzip wie bei einem Lieferdienst: Der Kunde zahlt alles in der App.
// Beim Bestellen wird der Höchstbetrag reserviert (Budget + Heldenlohn + Trinkgeld + Servicegebühr).
// Abgebucht wird erst nach dem Einkauf – mit dem echten Betrag vom Kassenbon.

// Servicegebühr = 0,45 € + 2 % von (Einkauf + Heldenlohn + Trinkgeld).
// So bleibt dem Betreiber nach der Stripe-Gebühr (EU-Karten ca. 1,5 % + 0,25 €) immer etwas übrig,
// mindestens etwa 0,23 €. Muss zu SERVICE in public/app.js passen.
export const SERVICE_BASE_CENTS = 45;
export const SERVICE_RATE = 0.02;
export const STRIPE_EU = { rate: 0.015, fixed: 25 };   // nur zur Kontrolle in den Tests
export const MIN_FEE_CENTS = 300;      // Mindest-Heldenlohn 3,00 €
export const MAX_FEE_CENTS = 10000;
export const MIN_BUDGET_CENTS = 500;   // Einkaufsbudget 5–300 €
export const MAX_BUDGET_CENTS = 30000;
export const MAX_TIP_CENTS = 2000;     // Trinkgeld 0–20 €
export const RELEASE_AFTER_HOURS = 72; // so lange wartet die Auszahlung, wenn niemand „Erhalten“ klickt
export const AUTH_VALID_DAYS = 6;      // Kartenreservierungen verfallen nach 7 Tagen – wir bleiben darunter

export const cents = (euro) => Math.round(Number(euro) * 100);

/** Kurze Bestellnummer für Stripe-Quittung und Support, z. B. "EH-7K3Q9A". Muss zu orderNo() in public/app.js passen. */
export const orderNumber = (id) => "EH-" + String(id).slice(0, 6).toUpperCase();

/** Servicegebühr in Cent für einen Warenwert (Einkauf + Heldenlohn + Trinkgeld) in Cent. */
export const serviceCents = (baseCents) => SERVICE_BASE_CENTS + Math.round(baseCents * SERVICE_RATE);

function parts(r) {
  const heldenlohn = cents(r.fee);
  if (!Number.isFinite(heldenlohn) || heldenlohn < MIN_FEE_CENTS || heldenlohn > MAX_FEE_CENTS) throw new Error("Ungültiger Heldenlohn");
  const tip = cents(r.tip || 0);
  if (!Number.isFinite(tip) || tip < 0 || tip > MAX_TIP_CENTS) throw new Error("Ungültiges Trinkgeld");
  const budget = cents(r.budget);
  if (!Number.isFinite(budget) || budget < MIN_BUDGET_CENTS || budget > MAX_BUDGET_CENTS) throw new Error("Ungültiges Budget");
  return { heldenlohn, tip, budget };
}

/** Was beim Bestellen auf der Karte reserviert wird, in Cent. Die Gebühr ist hier der Höchstwert. */
export function checkoutAmounts(r) {
  const { heldenlohn, tip, budget } = parts(r);
  const service = serviceCents(budget + heldenlohn + tip);
  return { budget, heldenlohn, tip, service, total: budget + heldenlohn + tip + service };
}

/** Erstattung bei einer Reklamation, in Cent (0, wenn keine). */
export const refundCents = (r) => (r.dispute && r.dispute.status === "erstattet") ? cents(r.dispute.refund || 0) : 0;

/** Was nach dem Einkauf abgebucht und an den Helden ausgezahlt wird, in Cent. */
export function captureAmounts(r) {
  const { heldenlohn, tip, budget } = parts(r);
  const einkauf = cents(r.receiptTotal);
  if (!Number.isFinite(einkauf) || einkauf <= 0) throw new Error("Kassenbon-Betrag fehlt");
  if (einkauf > budget) throw new Error("Kassenbon über dem Budget");
  const service = serviceCents(einkauf + heldenlohn + tip);
  const refund = Math.min(refundCents(r), einkauf + heldenlohn + tip);
  return { einkauf, heldenlohn, tip, service, capture: einkauf + heldenlohn + tip + service, refund, transfer: einkauf + heldenlohn + tip - refund };
}

const millis = (t) => (t && typeof t.toMillis === "function") ? t.toMillis() : Date.parse(t);
const disputeOpen = (r) => !!(r.dispute && r.dispute.status === "offen");

/** Muss nach der Lieferung noch abgebucht werden? */
export function readyForCapture(r) {
  return !!(r && r.status === "erledigt" && r.paid && !r.captured && !r.capturing && r.receiptTotal);
}

/** Darf jetzt an den Helden ausgezahlt werden? Nicht, solange eine Reklamation offen ist. */
export function readyForRelease(r, now = Date.now()) {
  if (!r || r.status !== "erledigt" || !r.captured || r.transferId || r.transferring || !r.helperId) return false;
  if (disputeOpen(r)) return false;
  if (r.thanks || (r.dispute && r.dispute.status !== "offen")) return true;
  const done = millis(r.doneAt);
  return Number.isFinite(done) && now - done >= RELEASE_AFTER_HOURS * 3600 * 1000;
}

/** Ist die Reservierung eines nicht übernommenen Auftrags abgelaufen? */
export function authExpired(r, now = Date.now()) {
  if (!r || r.status !== "offen" || !r.paid) return false;
  const paid = millis(r.paidAt);
  return Number.isFinite(paid) && now - paid >= AUTH_VALID_DAYS * 86400 * 1000;
}

/** Darf der Betreiber eine Reklamation so entscheiden? */
export function disputeDecision(r, refundEuro) {
  if (!r || !disputeOpen(r)) return { ok: false, reason: "Es gibt keine offene Reklamation." };
  if (!r.captured) return { ok: false, reason: "Die Abbuchung ist noch nicht fertig. Versuch es gleich noch einmal." };
  const refund = cents(refundEuro);
  const a = captureAmounts(r);
  if (!Number.isFinite(refund) || refund < 0 || refund > a.einkauf + a.heldenlohn + a.tip) return { ok: false, reason: "Der Betrag ist zu hoch." };
  return { ok: true, refund };
}

/** Wer darf einen Auftrag zurückziehen? Vor dem Abbuchen wird nur die Reservierung aufgehoben. */
export function cancelDecision(r, uid, isAdmin) {
  if (!r) return { ok: false, reason: "Den Auftrag gibt es nicht mehr." };
  if (r.createdBy !== uid && !isAdmin) return { ok: false, reason: "Das ist nicht dein Auftrag." };
  if (!isAdmin && !["zahlung_offen", "offen"].includes(r.status)) {
    return { ok: false, reason: "Jemand kauft gerade dafür ein. Sprecht euch im Chat ab, der Held kann den Auftrag abgeben." };
  }
  if (r.transferId) return { ok: true, action: "none" };            // schon ausgezahlt: nur entfernen
  if (r.captured) return { ok: true, action: "refund" };             // abgebucht, aber noch nicht ausgezahlt
  if (r.paid) return { ok: true, action: "release" };                // nur reserviert: Reservierung aufheben
  return { ok: true, action: "none" };
}

/** Helden in der Nähe: gleiche ersten 3 Ziffern einer PLZ im Gebiet. */
export function heroMatchesZip(area, zip) {
  if (!/^[0-9]{5}$/.test(String(zip || ""))) return false;
  return (String(area || "").match(/[0-9]{5}/g) || []).some(z => z.slice(0, 3) === String(zip).slice(0, 3));
}

/** Nur eigene Domains als Rücksprung nach der Zahlung zulassen. */
export function safeOrigin(origin, extraDomains = [], allowLocal = false) {
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (allowLocal && (host === "localhost" || host === "127.0.0.1")) return u.origin;
    if (u.protocol !== "https:") return null;
    if (host.endsWith(".web.app") || host.endsWith(".firebaseapp.com") || extraDomains.includes(host)) return u.origin;
  } catch (e) { /* ungültig */ }
  return null;
}
