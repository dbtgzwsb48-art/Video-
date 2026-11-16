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
  area: "50823 Ehrenfeld", due: "2026-11-20", window: "egal", budget: 30, payment: "bar", note: "",
  fee: 3, feeParts: { base: 3, shops: 0, items: 0, heavy: 0, express: 0, extra: 0 },
  shops: ["Aldi", "dm"], serviceFee: 0.2,
  status: "offen", createdBy: ANNA, helperId: null, thanks: false, createdAt: serverTimestamp(), ...over,
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
  // Betreiber wird wie in der Anleitung von Hand angelegt (Regeln umgangen)
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "admins", CHEF), { since: "2026-11-16" }); });
});
after(async () => { await env.cleanup(); });

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

test("Auftrag anlegen: nur für sich selbst, offen, mit Mindest-Heldenlohn", async () => {
  await assertFails(setDoc(doc(db(CARO), "requests", "x1"), request({ createdBy: ANNA })));
  await assertFails(setDoc(doc(db(CARO), "requests", "x2"), request({ createdBy: CARO, fee: 1 })));
  await assertFails(setDoc(doc(db(CARO), "requests", "x3"), request({ createdBy: CARO, status: "erledigt" })));
  await assertFails(setDoc(doc(db(CARO), "requests", "x4"), request({ createdBy: CARO, helperId: BEN })));
  await assertFails(setDoc(doc(db(CARO), "requests", "x5"), request({ createdBy: CARO, items: [] })));
  await assertSucceeds(setDoc(doc(db(CARO), "requests", "x6"), request({ createdBy: CARO })));
});

test("Übernehmen: nur angemeldete Helden, nicht den eigenen Auftrag", async () => {
  await assertFails(updateDoc(doc(db(CARO), "requests", "r1"), { status: "uebernommen", helperId: CARO, takenAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(BEN), "requests", "r1"), { status: "uebernommen", helperId: CARO, takenAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db(BEN), "requests", "r1"), { status: "uebernommen", helperId: BEN, takenAt: serverTimestamp(), fee: 50 }));
  await assertSucceeds(updateDoc(doc(db(BEN), "requests", "r1"), { status: "uebernommen", helperId: BEN, takenAt: serverTimestamp() }));
  // schon vergeben
  await assertSucceeds(setDoc(doc(db(CARO), "helpers", CARO), hero()));
  await assertFails(updateDoc(doc(db(CARO), "requests", "r1"), { status: "uebernommen", helperId: CARO, takenAt: serverTimestamp() }));
});

test("Kompletter Ablauf mit Chat, Lieferung und Trinkgeld", async () => {
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
  // Anna darf nicht selbst „geliefert“ setzen, Ben schon
  await assertFails(updateDoc(doc(db(ANNA), "requests", "r1"), { status: "erledigt", doneAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db(BEN), "requests", "r1"), { status: "erledigt", doneAt: serverTimestamp() }));
  // Trinkgeld: nur Anna, nur einmal, max. 50 €
  await assertFails(updateDoc(doc(db(BEN), "requests", "r1"), { thanks: true, tip: 50 }));
  await assertFails(updateDoc(doc(db(ANNA), "requests", "r1"), { thanks: true, tip: 500 }));
  await assertSucceeds(updateDoc(doc(db(ANNA), "requests", "r1"), { thanks: true, tip: 2 }));
  await assertFails(updateDoc(doc(db(ANNA), "requests", "r1"), { tip: 5 }));
});

test("Abgeben setzt den Auftrag zurück, nur durch den Helden", async () => {
  await assertSucceeds(updateDoc(doc(db(BEN), "requests", "r1"), { status: "uebernommen", helperId: BEN, takenAt: serverTimestamp() }));
  const reset = { status: "offen", helperId: null, takenAt: null, items: [{ t: "Milch", done: false }, { t: "Brot", done: false }] };
  await assertFails(updateDoc(doc(db(CARO), "requests", "r1"), reset));
  await assertSucceeds(updateDoc(doc(db(BEN), "requests", "r1"), reset));
});

test("Löschen: nur eigene Aufträge und nicht während jemand einkauft", async () => {
  await assertFails(deleteDoc(doc(db(CARO), "requests", "r1")));
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

test("Zahlungseingänge: nur der Betreiber trägt ein, Helden sehen nur ihre eigenen", async () => {
  const pay = (by, helperId = BEN) => ({ helperId, amount: 0.4, by, at: serverTimestamp() });
  await assertFails(addDoc(collection(db(BEN), "payouts"), pay(BEN)));
  await assertFails(setDoc(doc(db(BEN), "admins", BEN), { since: "x" }));
  await assertSucceeds(setDoc(doc(db(CHEF), "payouts", "p1"), pay(CHEF)));
  await assertSucceeds(getDoc(doc(db(BEN), "payouts", "p1")));
  await assertFails(getDoc(doc(db(CARO), "payouts", "p1")));
  await assertSucceeds(getDoc(doc(db(CHEF), "admins", CHEF)));
  await assertFails(getDoc(doc(db(BEN), "admins", CHEF)));
});

test("Betreiber liest Meldungen und darf gemeldete Aufträge löschen", async () => {
  await assertSucceeds(setDoc(doc(db(CARO), "reports", "m1"), { by: CARO, requestId: "r1", reason: "Spam", at: serverTimestamp() }));
  await assertFails(getDoc(doc(db(BEN), "reports", "m1")));
  await assertSucceeds(getDoc(doc(db(CHEF), "reports", "m1")));
  await assertSucceeds(deleteDoc(doc(db(CHEF), "reports", "m1")));
  await assertSucceeds(deleteDoc(doc(db(CHEF), "requests", "r1")));
});
