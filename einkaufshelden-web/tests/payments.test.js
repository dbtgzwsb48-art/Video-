// Tests der Zahlungslogik (ohne Stripe und ohne Emulator). Start: node --test tests/payments.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutAmounts, captureAmounts, readyForCapture, readyForRelease, authExpired, cancelDecision, safeOrigin } from "../functions/lib.js";

const base = { fee: 3, serviceFee: 0.2, budget: 30, status: "offen", createdBy: "anna", helperId: "ben" };
const hours = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

test("Reservierung beim Bestellen: Budget + 3 € + 0,20 €", () => {
  assert.deepEqual(checkoutAmounts(base), { budget: 3000, heldenlohn: 300, service: 20, total: 3320 });
  assert.throws(() => checkoutAmounts({ ...base, fee: 2 }));
  assert.throws(() => checkoutAmounts({ ...base, serviceFee: 0 }));
  assert.throws(() => checkoutAmounts({ ...base, budget: 1000 }));
});

test("Abbuchung nach dem Einkauf: Kassenbon + 3 € + 0,20 €, Held bekommt Kassenbon + 3 €", () => {
  const a = captureAmounts({ ...base, receiptTotal: 27.45 });
  assert.equal(a.capture, 2745 + 300 + 20);
  assert.equal(a.transfer, 2745 + 300);
  assert.equal(a.capture - a.transfer, 20, "die 20 Cent bleiben beim Betreiber");
  assert.throws(() => captureAmounts({ ...base, receiptTotal: 31 }), /Budget/);
  assert.throws(() => captureAmounts({ ...base, receiptTotal: 0 }));
});

test("Abbuchen erst nach Lieferung, nur einmal", () => {
  const delivered = { ...base, status: "erledigt", paid: true, receiptTotal: 20 };
  assert.equal(readyForCapture(delivered), true);
  assert.equal(readyForCapture({ ...delivered, captured: true }), false);
  assert.equal(readyForCapture({ ...delivered, capturing: true }), false);
  assert.equal(readyForCapture({ ...delivered, status: "uebernommen" }), false);
});

test("Auszahlung an den Helden: nach „Erhalten“ oder nach 72 Stunden, nur einmal", () => {
  const captured = { ...base, status: "erledigt", paid: true, captured: true, receiptTotal: 20, doneAt: hours(1) };
  assert.equal(readyForRelease(captured), false);
  assert.equal(readyForRelease({ ...captured, thanks: true }), true);
  assert.equal(readyForRelease({ ...captured, doneAt: hours(73) }), true);
  assert.equal(readyForRelease({ ...captured, thanks: true, transferId: "tr_1" }), false);
  assert.equal(readyForRelease({ ...captured, thanks: true, captured: false }), false);
});

test("Nicht übernommene Aufträge verfallen nach 6 Tagen", () => {
  assert.equal(authExpired({ ...base, paid: true, paidAt: hours(24 * 6 + 1) }), true);
  assert.equal(authExpired({ ...base, paid: true, paidAt: hours(24) }), false);
  assert.equal(authExpired({ ...base, status: "uebernommen", paid: true, paidAt: hours(24 * 7) }), false);
});

test("Zurückziehen: Reservierung aufheben, nicht während jemand einkauft", () => {
  assert.deepEqual(cancelDecision({ ...base, paid: true }, "anna", false), { ok: true, action: "release" });
  assert.deepEqual(cancelDecision({ ...base, status: "zahlung_offen" }, "anna", false), { ok: true, action: "none" });
  assert.equal(cancelDecision({ ...base, status: "uebernommen", paid: true }, "anna", false).ok, false);
  assert.equal(cancelDecision({ ...base, paid: true }, "caro", false).ok, false);
  assert.deepEqual(cancelDecision({ ...base, status: "erledigt", paid: true, captured: true }, "chef", true), { ok: true, action: "refund" });
});

test("Rücksprung nach der Zahlung nur auf eigene Domains", () => {
  assert.equal(safeOrigin("https://einkaufshelden-123.web.app"), "https://einkaufshelden-123.web.app");
  assert.equal(safeOrigin("https://einkaufshelden.de", ["einkaufshelden.de"]), "https://einkaufshelden.de");
  assert.equal(safeOrigin("https://boese-seite.de"), null);
  assert.equal(safeOrigin("http://einkaufshelden-123.web.app"), null);
  assert.equal(safeOrigin("http://127.0.0.1:5000", [], true), "http://127.0.0.1:5000");
});
