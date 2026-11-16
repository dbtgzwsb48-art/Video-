// Reine Rechen- und Prüffunktionen, ohne Firebase und Stripe – dadurch leicht testbar.
//
// Prinzip wie bei einem Lieferdienst: Der Kunde zahlt alles in der App.
// Beim Bestellen wird der Höchstbetrag auf der Karte reserviert (Budget + Heldenlohn + Servicegebühr).
// Abgebucht wird erst nach dem Einkauf – genau der Betrag vom Kassenbon + Heldenlohn + Servicegebühr.

export const SERVICE_FEE_CENTS = 20;   // 0,20 € für den Betreiber, muss zu SERVICE_FEE in public/app.js passen
export const MIN_FEE_CENTS = 300;      // Mindest-Heldenlohn 3,00 €
export const MAX_FEE_CENTS = 10000;
export const MIN_BUDGET_CENTS = 500;   // Einkaufsbudget 5–300 €
export const MAX_BUDGET_CENTS = 30000;
export const RELEASE_AFTER_HOURS = 72; // so lange wartet die Auszahlung, wenn niemand „Erhalten“ klickt
export const AUTH_VALID_DAYS = 6;      // Kartenreservierungen verfallen nach 7 Tagen – wir bleiben darunter

export const cents = (euro) => Math.round(Number(euro) * 100);

function feeCents(r) {
  const fee = cents(r.fee);
  if (!Number.isFinite(fee) || fee < MIN_FEE_CENTS || fee > MAX_FEE_CENTS) throw new Error("Ungültiger Heldenlohn");
  if (cents(r.serviceFee) !== SERVICE_FEE_CENTS) throw new Error("Ungültige Servicegebühr");
  return fee;
}

/** Was beim Bestellen auf der Karte reserviert wird, in Cent. */
export function checkoutAmounts(r) {
  const heldenlohn = feeCents(r);
  const budget = cents(r.budget);
  if (!Number.isFinite(budget) || budget < MIN_BUDGET_CENTS || budget > MAX_BUDGET_CENTS) throw new Error("Ungültiges Budget");
  return { budget, heldenlohn, service: SERVICE_FEE_CENTS, total: budget + heldenlohn + SERVICE_FEE_CENTS };
}

/** Was nach dem Einkauf abgebucht und an den Helden ausgezahlt wird, in Cent. */
export function captureAmounts(r) {
  const { budget, heldenlohn, service } = checkoutAmounts(r);
  const einkauf = cents(r.receiptTotal);
  if (!Number.isFinite(einkauf) || einkauf <= 0) throw new Error("Kassenbon-Betrag fehlt");
  if (einkauf > budget) throw new Error("Kassenbon über dem Budget");
  return { einkauf, heldenlohn, service, capture: einkauf + heldenlohn + service, transfer: einkauf + heldenlohn };
}

const millis = (t) => (t && typeof t.toMillis === "function") ? t.toMillis() : Date.parse(t);

/** Muss nach der Lieferung noch abgebucht werden? */
export function readyForCapture(r) {
  return !!(r && r.status === "erledigt" && r.paid && !r.captured && !r.capturing && r.receiptTotal);
}

/** Darf jetzt an den Helden ausgezahlt werden? */
export function readyForRelease(r, now = Date.now()) {
  if (!r || r.status !== "erledigt" || !r.captured || r.transferId || r.transferring || !r.helperId) return false;
  if (r.thanks) return true;
  const done = millis(r.doneAt);
  return Number.isFinite(done) && now - done >= RELEASE_AFTER_HOURS * 3600 * 1000;
}

/** Ist die Reservierung eines nicht übernommenen Auftrags abgelaufen? */
export function authExpired(r, now = Date.now()) {
  if (!r || r.status !== "offen" || !r.paid) return false;
  const paid = millis(r.paidAt);
  return Number.isFinite(paid) && now - paid >= AUTH_VALID_DAYS * 86400 * 1000;
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
