// Tests der Zahlungslogik (ohne Stripe und ohne Emulator). Start: node --test tests/payments.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkoutAmounts, captureAmounts, readyForCapture, readyForRelease, authExpired, cancelDecision, disputeDecision,
  safeOrigin, orderNumber, serviceCents, heroMatchesZip, STRIPE_EU,
  MIN_BUDGET_CENTS, MAX_BUDGET_CENTS, MIN_FEE_CENTS, MAX_FEE_CENTS, MAX_TIP_CENTS,
} from "../functions/lib.js";

const base = { fee: 3, budget: 30, status: "offen", createdBy: "anna", helperId: "ben" };
const hours = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

test("Servicegebühr: 0,45 € + 2 %", () => {
  assert.equal(serviceCents(0), 45);
  assert.equal(serviceCents(2737), 45 + 55);
});

test("Betreiber verdient nach Stripe-Gebühr immer mindestens 20 Cent", () => {
  let worst = Infinity;
  for (let e = MIN_BUDGET_CENTS; e <= MAX_BUDGET_CENTS; e += 37)
    for (const l of [MIN_FEE_CENTS, 500, 2000, MAX_FEE_CENTS])
      for (const t of [0, 200, MAX_TIP_CENTS]) {
        const s = serviceCents(e + l + t);
        const total = e + l + t + s;
        const stripeFee = Math.round(total * STRIPE_EU.rate) + STRIPE_EU.fixed;
        worst = Math.min(worst, s - stripeFee);
      }
  assert.ok(worst >= 20, `schlechtester Fall: ${worst} Cent`);
});

test("Reservierung beim Bestellen: Budget + Heldenlohn + Trinkgeld + Gebühr", () => {
  const a = checkoutAmounts({ ...base, tip: 2 });
  assert.deepEqual(a, { budget: 3000, heldenlohn: 300, tip: 200, service: serviceCents(3500), total: 3500 + serviceCents(3500) });
  assert.throws(() => checkoutAmounts({ ...base, fee: 2 }));
  assert.throws(() => checkoutAmounts({ ...base, budget: 1000 }));
  assert.throws(() => checkoutAmounts({ ...base, tip: 25 }));
});

test("Abbuchung nach dem Einkauf: Held bekommt Kassenbon + Heldenlohn + Trinkgeld", () => {
  const a = captureAmounts({ ...base, tip: 2, receiptTotal: 24.37 });
  assert.equal(a.transfer, 2437 + 300 + 200);
  assert.equal(a.capture - a.transfer, a.service, "nur die Servicegebühr bleibt beim Betreiber");
  assert.ok(a.capture <= checkoutAmounts({ ...base, tip: 2 }).total, "nie mehr als reserviert");
  assert.throws(() => captureAmounts({ ...base, receiptTotal: 31 }), /Budget/);
});

test("Reklamation: Auszahlung wartet, Erstattung geht vom Helden-Anteil ab", () => {
  const r = { ...base, status: "erledigt", paid: true, captured: true, receiptTotal: 20, doneAt: hours(100), thanks: true };
  assert.equal(readyForRelease({ ...r, dispute: { status: "offen" } }), false);
  assert.equal(readyForRelease({ ...r, dispute: { status: "abgelehnt" } }), true);
  const a = captureAmounts({ ...r, dispute: { status: "erstattet", refund: 4.5 } });
  assert.equal(a.refund, 450);
  assert.equal(a.transfer, 2000 + 300 - 450);
  assert.deepEqual(disputeDecision({ ...r, dispute: { status: "offen" } }, 4.5), { ok: true, refund: 450 });
  assert.equal(disputeDecision({ ...r, dispute: { status: "offen" } }, 99).ok, false);
  assert.equal(disputeDecision(r, 1).ok, false);
});

test("Abbuchen erst nach Lieferung, nur einmal", () => {
  const delivered = { ...base, status: "erledigt", paid: true, receiptTotal: 20 };
  assert.equal(readyForCapture(delivered), true);
  assert.equal(readyForCapture({ ...delivered, captured: true }), false);
  assert.equal(readyForCapture({ ...delivered, capturing: true }), false);
});

test("Auszahlung: nach „Erhalten“ oder nach 72 Stunden, nur einmal", () => {
  const captured = { ...base, status: "erledigt", paid: true, captured: true, receiptTotal: 20, doneAt: hours(1) };
  assert.equal(readyForRelease(captured), false);
  assert.equal(readyForRelease({ ...captured, thanks: true }), true);
  assert.equal(readyForRelease({ ...captured, doneAt: hours(73) }), true);
  assert.equal(readyForRelease({ ...captured, thanks: true, transferId: "tr_1" }), false);
});

test("Nicht übernommene Aufträge verfallen nach 6 Tagen", () => {
  assert.equal(authExpired({ ...base, paid: true, paidAt: hours(24 * 6 + 1) }), true);
  assert.equal(authExpired({ ...base, paid: true, paidAt: hours(24) }), false);
});

test("Zurückziehen: Reservierung aufheben, nicht während jemand einkauft", () => {
  assert.deepEqual(cancelDecision({ ...base, paid: true }, "anna", false), { ok: true, action: "release" });
  assert.equal(cancelDecision({ ...base, status: "uebernommen", paid: true }, "anna", false).ok, false);
  assert.equal(cancelDecision({ ...base, paid: true }, "caro", false).ok, false);
});

test("Helden in der Nähe über die PLZ", () => {
  assert.equal(heroMatchesZip("50823 Ehrenfeld", "50825"), true);
  assert.equal(heroMatchesZip("50823 Ehrenfeld", "10115"), false);
  assert.equal(heroMatchesZip("Ehrenfeld", "50825"), false);
});

test("Rücksprung nach der Zahlung nur auf eigene Domains, Bestellnummer", () => {
  assert.equal(safeOrigin("https://einkaufshelden-123.web.app"), "https://einkaufshelden-123.web.app");
  assert.equal(safeOrigin("https://boese-seite.de"), null);
  assert.equal(orderNumber("7k3q9aXYZ"), "EH-7K3Q9A");
});
