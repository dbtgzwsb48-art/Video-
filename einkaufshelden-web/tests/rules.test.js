// Tests der Firestore-Sicherheitsregeln. Start: npm test (startet den Emulator automatisch).
import { test, before, beforeEach, after } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, getDoc, addDoc, collection, serverTimestamp, setLogLevel } from "firebase/firestore";

setLogLevel("error");
let env;
const ANNA = "anna", BEN = "ben", CARO = "caro", CHEF = "chef";
const db = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const request = (over = {}) => ({
  title: "Wocheneinkauf", items: [{ t: "Milch", done: false }, { t: "Brot", done: false }],
  area: "50823 Ehrenfeld", due: "2026-11-20", window: "egal", budget: 30, payment: "online", note: "",
  fee: 3, feeParts: { base: 3, shops: 0, items: 0, heavy: 0, express: 0, extra: 0 },
  shops: ["Aldi", "dm"], serviceFee: 0.2,
  status: "zahlung_offen", createdBy: ANNA, helperId: null, thanks: false, createdAt: serverTimestamp(), ...over,
});
const profile = (name) => ({ name, acceptedTerms: true, ageConfirmed: true, createdAt: serverTimestamp() });
const hero = () => ({ area: "Ehrenfeld", transport: "Fahrrad", days: ["Sa"], note: "", active: true, adult: true, joinedAt: serverTimestamp() });

before(async () => {
  env = await initializeTestEnvironment({ projectId: "einkaufshelden-test", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
});
beforeEach(async () => {
  await env.clearFirestore();
  // Anna fragt an, Ben ist Held, Caro ist normales Mitglied
  await assertSucceeds(setDoc(doc(db(ANNA), "users", ANNA), profile("Anna")));
  await assertSucceeds(setDoc(doc(db(BEN), "users", BEN), profile("Ben")));
  await assertSucceeds(setDoc(doc(db(CARO), "users", CARO), profile("Caro")));
  await assertSucceeds(setDoc(doc(db(BEN), "helpers", BEN), hero()));
  await assertSucceeds(setDoc(doc(db(ANNA), "requests", "r1"), request()));
  await asServer(async (fs) => {
    // Was sonst die Server-Funktionen tun: Zahlung bestätigt, Ben hat ein Auszahlungskonto
    await updateDoc(doc(fs, "requests", "r1"), { status: "offen", paid: true, captured: false, transferId: null, paymentIntent: "pi_1" });
    await setDoc(doc(fs, "payoutStatus", BEN), { ready: true });
    // Betreiber wird wie in der Anleitung von Hand angelegt
    await setDoc(doc(fs, "admins", CHEF), { since: "2026-11-16" });
  });
});
after(async () => { await env.cleanup(); });
const asServer = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const deliver = (receiptTotal = 24.5) => ({ status: "erledigt", doneAt: serverTimestamp(), receiptTotal });

test("Nicht angemeldete Besucher sehen nichts", async () => {
  await assertFails(getDoc(doc(anon(), "requests", "r1")));
  await assertFails(getDoc(doc(anon(), "users", ANNA)));
});

test("Profile: nur das eigene schreiben, Name 2–40 Zeichen, AGB und Mindestalter 10 nötig", async () => {
  await assertFails(setDoc(doc(db(CARO), "users", ANNA), profile("Hacker")));
  await assertFails(setDoc(doc(db(CARO), "users", CARO), profile("X")));
  await assertFails(setDoc(doc(db(CARO), "users", CARO), { name: "Caro", acceptedTerms: false }));
  await assertFails(setDoc(doc(db(CARO), "users", CARO), { ...profile("Caro"), admin: true }));
  // Mindestalter 10 muss bestätigt sein
  await assertFails(setDoc(doc(db(CARO), "users", CARO), { ...profile("Caro"), ageConfirmed: false }));
  const { ageConfirmed, ...ohneAlter } = profile("Caro");
  await assertFails(setDoc(doc(db(CARO), "users", CARO), ohneAlter));
});

test("Heldenprofil: nur ab 18 und nur das eigene", async () => {
  await assertFails(setDoc(doc(db(CARO), "helpers", CARO), { ...hero(), adult: false }));
  await assertFails(setDoc(doc(db(CARO), "helpers", BEN), hero()));
  await assertSucceeds(setDoc(doc(db(CARO), "helpers", CARO), hero()));
});

test("Auftrag anlegen: nur für sich selbst, unbezahlt, mit Mindest-Heldenlohn und Budget", async () => {
  await assertFails(setDoc(doc(db(CARO), "requests", "x1"), request({ createdBy: ANNA })));
  // Zahlung überspringen geht nicht
  await assertFails(setDoc(doc(db(CARO), "requests", "x0"), request({ createdBy: CARO, status: "offen" })));
  await assertFails(setDoc(doc(db(CARO), "requests", "x7"), request({ createdBy: CARO, paid: true })));
  await assertFails(setDoc(doc(db(CARO), "requests", "x8"), request({ createdBy: CARO, budget: null })));
  await assertFails(setDoc(doc(db(CARO), "requests", "x9"), request({ createdBy: CARO, budget: 500 })));
  await assertFails(setDoc(doc(db(CARO), "requests", "x2"), request({ createdBy: CARO, fee: 1 })));
  await assertFails(setDoc(doc(db(CARO), "requests", "x3"), request({ createdBy: CARO, status: "erledigt" })));
  await assertFails(setDoc(doc(db(CARO), "requests", "x4"), request({ createdBy: CARO, helperId: BEN })));
  await assertFails(setDoc(doc(db(CARO), "requests", "x5"), request({ createdBy: CARO, items: [] })));
  await assertSucceeds(setDoc(doc(db(CARO), "requests", "x6"), request({ createdBy: CARO })));
});

test("Unbezahlte Aufträge und Helden ohne Auszahlungskonto: kein Übernehmen", async () => {
  await assertSucceeds(setDoc(doc(db(ANNA), "requests", "u1"), request()));
  await assertFails(updateDoc(doc(db(BEN), "requests", "u1"), { status: "uebernommen", helperId: BEN, takenAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db(CARO), "helpers", CARO), hero()));
  await assertFails(updateDoc(doc(db(CARO), "requests", "r1"), { status: "uebernommen", helperId: CARO, takenAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db(CARO), "payoutStatus", CARO), { ready: true }));
  await assertFails(getDoc(doc(db(BEN), "stripeAccounts", BEN)));
});

test("Übernehmen: nur angemeldete Helden, nicht den eigenen Auftrag", async () => {
  await assertFails(updateDoc(doc(db(CARO), "requests", "r1"), { status: "uebernommen", helperId: CARO, takenAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(BEN), "requests", "r1"), { status: "uebernommen", helperId: CARO, takenAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(BEN), "requests", "r1"), { status: "uebernommen", helperId: BEN, takenAt: serverTimestamp(), fee: 50 }));
  await assertSucceeds(updateDoc(doc(db(BEN), "requests", "r1"), { status: "uebernommen", helperId: BEN, takenAt: serverTimestamp() }));
  // schon vergeben
  await assertSucceeds(setDoc(doc(db(CARO), "helpers", CARO), hero()));
  await asServer((fs) => setDoc(doc(fs, "payoutStatus", CARO), { ready: true }));
  await assertFails(updateDoc(doc(db(CARO), "requests", "r1"), { status: "uebernommen", helperId: CARO, takenAt: serverTimestamp() }));
});

test("Kompletter Ablauf mit Chat, unterwegs, Kassenbon und Bestätigung", async () => {
  await assertSucceeds(updateDoc(doc(db(BEN), "requests", "r1"), { status: "uebernommen", helperId: BEN, takenAt: serverTimestamp() }));
  // Abhaken nur durch den Helden
  const ticked = [{ t: "Milch", done: true }, { t: "Brot", done: false }];
  await assertFails(updateDoc(doc(db(ANNA), "requests", "r1"), { items: ticked }));
  await assertSucceeds(updateDoc(doc(db(BEN), "requests", "r1"), { items: ticked }));
  // Privater Chat nur für die beiden
  await assertSucceeds(addDoc(collection(db(ANNA), "requests", "r1", "messages"), { from: ANNA, text: "Musterstr. 1, 3. OG", at: serverTimestamp() }));
  await assertSucceeds(addDoc(collection(db(BEN), "requests", "r1", "messages"), { from: BEN, text: "Bin um 17 Uhr da", at: serverTimestamp() }));
  await assertFails(addDoc(collection(db(BEN), "requests", "r1", "messages"), { from: ANNA, text: "gefälscht", at: serverTimestamp() }));
  await assertFails(addDoc(collection(db(CARO), "requests", "r1", "messages"), { from: CARO, text: "hallo", at: serverTimestamp() }));
  await assertFails(getDoc(doc(db(CARO), "requests", "r1", "messages", "egal")));
  await assertSucceeds(updateDoc(doc(db(BEN), "requests", "r1"), { onTheWay: true }));
  // Anna darf nicht selbst „geliefert“ setzen; Kassenbon muss da sein und darf das Budget (30 €) nicht übersteigen
  await assertFails(updateDoc(doc(db(ANNA), "requests", "r1"), deliver()));
  await assertFails(updateDoc(doc(db(BEN), "requests", "r1"), { status: "erledigt", doneAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(BEN), "requests", "r1"), deliver(30.01)));
  await assertFails(updateDoc(doc(db(BEN), "requests", "r1"), { ...deliver(), captured: true }));
  await assertSucceeds(updateDoc(doc(db(BEN), "requests", "r1"), deliver(24.5)));
  // Zahlungsfelder kann niemand selbst setzen
  await assertFails(updateDoc(doc(db(BEN), "requests", "r1"), { transferId: "tr_fake" }));
  await assertFails(updateDoc(doc(db(ANNA), "requests", "r1"), { receiptTotal: 1 }));
  // Trinkgeld: nur Anna, nur einmal, max. 50 €
  await assertFails(updateDoc(doc(db(BEN), "requests", "r1"), { thanks: true, tip: 50 }));
  await assertFails(updateDoc(doc(db(ANNA), "requests", "r1"), { thanks: true, tip: 500 }));
  await assertSucceeds(updateDoc(doc(db(ANNA), "requests", "r1"), { thanks: true, tip: 2 }));
  await assertFails(updateDoc(doc(db(ANNA), "requests", "r1"), { tip: 5 }));
});

test("Abgeben setzt den Auftrag zurück, nur durch den Helden", async () => {
  await assertSucceeds(updateDoc(doc(db(BEN), "requests", "r1"), { status: "uebernommen", helperId: BEN, takenAt: serverTimestamp() }));
  const reset = { status: "offen", helperId: null, takenAt: null, onTheWay: false, items: [{ t: "Milch", done: false }, { t: "Brot", done: false }] };
  await assertFails(updateDoc(doc(db(CARO), "requests", "r1"), reset));
  await assertSucceeds(updateDoc(doc(db(BEN), "requests", "r1"), reset));
});

test("Löschen: Unbezahlte selbst, bezahlte nur über die Server-Funktion", async () => {
  await assertFails(deleteDoc(doc(db(CARO), "requests", "r1")));
  await assertFails(deleteDoc(doc(db(ANNA), "requests", "r1")));   // bezahlt → Reservierung muss aufgehoben werden
  await assertSucceeds(setDoc(doc(db(ANNA), "requests", "u2"), request()));
  await assertSucceeds(deleteDoc(doc(db(ANNA), "requests", "u2")));
  await assertSucceeds(updateDoc(doc(db(BEN), "requests", "r1"), { status: "uebernommen", helperId: BEN, takenAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(db(ANNA), "requests", "r1")));
});

test("Meldungen: anlegen ja, lesen nein", async () => {
  await assertSucceeds(addDoc(collection(db(CARO), "reports"), { by: CARO, requestId: "r1", reason: "Spam", at: serverTimestamp() }));
  await assertFails(addDoc(collection(db(CARO), "reports"), { by: ANNA, requestId: "r1", reason: "Spam", at: serverTimestamp() }));
  await assertFails(getDoc(doc(db(CARO), "reports", "x")));
});

test("Servicegebühr und Läden: Pflicht, nicht manipulierbar", async () => {
  await assertFails(setDoc(doc(db(CARO), "requests", "s1"), request({ createdBy: CARO, serviceFee: 0 })));
  await assertFails(setDoc(doc(db(CARO), "requests", "s2"), request({ createdBy: CARO, serviceFee: 0.1 })));
  const { serviceFee, ...ohneGebuehr } = request({ createdBy: CARO });
  await assertFails(setDoc(doc(db(CARO), "requests", "s3"), ohneGebuehr));
  await assertFails(setDoc(doc(db(CARO), "requests", "s4"), request({ createdBy: CARO, shops: ["a", "b", "c", "d", "e", "f", "g"] })));
  await assertSucceeds(setDoc(doc(db(CARO), "requests", "s5"), request({ createdBy: CARO, shops: ["Aldi", "Lidl", "Rewe"] })));
});

test("Betreiber-Rechte kann man sich nicht selbst geben", async () => {
  await assertFails(setDoc(doc(db(BEN), "admins", BEN), { since: "x" }));
  await assertSucceeds(getDoc(doc(db(CHEF), "admins", CHEF)));
  await assertFails(getDoc(doc(db(BEN), "admins", CHEF)));
});

test("Betreiber liest und erledigt Meldungen", async () => {
  await assertSucceeds(setDoc(doc(db(CARO), "reports", "m1"), { by: CARO, requestId: "r1", reason: "Spam", at: serverTimestamp() }));
  await assertFails(getDoc(doc(db(BEN), "reports", "m1")));
  await assertSucceeds(getDoc(doc(db(CHEF), "reports", "m1")));
  await assertSucceeds(deleteDoc(doc(db(CHEF), "reports", "m1")));
});
