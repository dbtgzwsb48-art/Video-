// Einkaufshelden – Web-App (Firebase Auth + Firestore)
import { initializeApp } from "./vendor/firebase-app.js";
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
  sendEmailVerification, signOut, deleteUser,
} from "./vendor/firebase-auth.js";
import {
  initializeFirestore, connectFirestoreEmulator, persistentLocalCache, collection, doc, onSnapshot, query, orderBy, limit,
  addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, where, runTransaction, serverTimestamp,
} from "./vendor/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { SITE } from "./site-config.js";

// ---------- Tarif ----------
// Heldenlohn: Grundlohn + Artikelzuschlag ab dem 11. Artikel + Zuschläge. Muss zu firestore.rules passen (MIN_FEE).
export const FEE = { base: 3, perItem: 0.2, freeItems: 10, heavy: 2, express: 2, extraShop: 1 };
// Servicegebühr je Einkauf für den Betreiber. Muss zu SERVICE_FEE() in firestore.rules passen.
export const SERVICE_FEE = 0.2;
const TIP_OPTIONS = [2, 5];
const SHOPS = ["Aldi", "Lidl", "Rewe", "Edeka", "Penny", "Netto", "Kaufland", "Norma", "dm", "Rossmann", "Apotheke", "Getränkemarkt", "Bäckerei", "Wochenmarkt", "Bio-Laden", "Drogerie egal", "Supermarkt egal"];
const MAX_SHOPS = 6;

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const VIEWS = ["auftraege", "hilfe", "meine", "held", "helden", "konto", "betreiber"];
const WINDOWS = { egal: "egal wann", vormittags: "vormittags", mittags: "mittags", nachmittags: "nachmittags", abends: "abends" };
const PAY = { bar: "Bar bei Übergabe", paypal: "PayPal", ueberweisung: "Überweisung", vorab: "Geld wird vorab übergeben" };
const STATUS = { offen: "Offen", uebernommen: "Übernommen", erledigt: "Geliefert" };
const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const euro = (n) => (typeof n === "number" && isFinite(n)) ? n.toLocaleString("de-DE", { style: "currency", currency: "EUR" }) : "–";
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const round2 = (n) => Math.round(n * 100) / 100;

export function calcFee(count, heavy, due, extra, shopCount = 1) {
  const parts = {
    base: FEE.base,
    shops: Math.max(0, Math.min(shopCount, MAX_SHOPS) - 1) * FEE.extraShop,
    items: round2(Math.max(0, count - FEE.freeItems) * FEE.perItem),
    heavy: heavy ? FEE.heavy : 0,
    express: due && due <= todayISO() ? FEE.express : 0,
    extra: extra > 0 ? round2(Math.min(extra, 50)) : 0,
  };
  parts.total = round2(parts.base + parts.shops + parts.items + parts.heavy + parts.express + parts.extra);
  return parts;
}
const svc = (r) => typeof r.serviceFee === "number" ? r.serviceFee : 0;
const todo = (v, label) => (!v || String(v).startsWith("HIER")) ? `<span class="todo">[${label}]</span>` : esc(v);
const earned = (r) => (typeof r.fee === "number" ? r.fee : 0) + (typeof r.tip === "number" ? r.tip : 0);
const toDate = (t) => t && typeof t.toDate === "function" ? t.toDate() : (t ? new Date(t) : null);

// ---------- Firebase ----------
// Lokal (npm start) läuft alles gegen die Firebase-Emulatoren, ganz ohne echtes Projekt.
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const filledIn = firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith("HIER");
const config = LOCAL && !filledIn ? { apiKey: "demo-key", authDomain: "demo-einkaufshelden.firebaseapp.com", projectId: "demo-einkaufshelden", appId: "demo" } : firebaseConfig;
const configured = LOCAL || filledIn;
let auth = null, db = null;
if (configured) {
  const app = initializeApp(config);
  auth = getAuth(app);
  auth.languageCode = "de";
  if (LOCAL) {
    db = initializeFirestore(app, {});
    connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, location.hostname, 8080);
  } else {
    try { db = initializeFirestore(app, { localCache: persistentLocalCache() }); }
    catch (e) { db = initializeFirestore(app, {}); }
  }
}

// ---------- State ----------
const S = {
  authReady: false, fbUser: null, myId: null, profile: null, profileLoaded: false,
  requests: [], helpers: {}, names: {},
  loaded: false, error: null,
  filter: "", show: "offen", sort: "neu", busy: new Set(), confirm: null, flash: null,
  authMode: "login", renderedView: null, formKey: null,
  chatId: null, chatMsgs: [], unsubChat: null,
  isAdmin: false, payouts: [], reports: [],
};
const unsubs = [];
let lastDraft = null;
try { lastDraft = JSON.parse(localStorage.getItem("eh-draft") || "null"); } catch (e) {}
try { const s = localStorage.getItem("eh-show"); if (s) S.show = s; } catch (e) {}

const view = () => { const h = (location.hash || "").slice(1); return VIEWS.includes(h) ? h : "auftraege"; };
const isHero = () => !!(S.myId && S.helpers[S.myId] && S.helpers[S.myId].active !== false);
const nameOf = (id) => (id && id === S.myId) ? "Du" : (S.names[id] || "Jemand");

// Namen aus users/{uid} nachladen (mit Cache)
const nameReq = new Set();
async function loadNames() {
  const ids = new Set();
  S.requests.forEach(r => { if (r.createdBy) ids.add(r.createdBy); if (r.helperId) ids.add(r.helperId); });
  Object.keys(S.helpers).forEach(id => ids.add(id));
  S.payouts.forEach(p => ids.add(p.helperId)); S.reports.forEach(r => ids.add(r.by));
  const missing = [...ids].filter(id => !(id in S.names) && !nameReq.has(id));
  if (!missing.length) return;
  missing.forEach(id => nameReq.add(id));
  await Promise.all(missing.map(async id => {
    try { const s = await getDoc(doc(db, "users", id)); S.names[id] = s.exists() ? (s.data().name || "Jemand") : "Ehemaliges Mitglied"; }
    catch (e) { S.names[id] = "Jemand"; }
  }));
  render();
}

const fmtDate = (d) => {
  if (!d) return "flexibel";
  const dt = new Date(d + "T12:00:00");
  if (isNaN(dt)) return esc(d);
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const diff = Math.round((dt - today) / 86400000);
  if (diff === 0) return "heute";
  if (diff === 1) return "morgen";
  return dt.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
};
const ago = (t) => {
  const d = toDate(t); if (!d || isNaN(d)) return "gerade eben";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "gerade eben"; if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60); if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.round(h / 24)} T.`;
};

// ---------- Rendering ----------
function renderHeader() {
  const me = $("#me");
  if (S.fbUser && S.profile) {
    me.innerHTML = `<span>${esc(S.profile.name)}</span>${isHero() ? '<span class="cape">Held</span>' : ""}<button class="linkbtn" id="logout" type="button">Abmelden</button>`;
  } else me.innerHTML = "";
  const inApp = !!(S.fbUser && S.profile);
  $("#tabsWrap").hidden = !inApp;
  if (inApp) {
    $("#c-open").textContent = S.loaded ? String(S.requests.filter(r => r.status === "offen").length) : "";
    $("#c-heroes").textContent = S.loaded ? String(Object.values(S.helpers).filter(h => h.active !== false).length) : "";
    $("#tab-admin").hidden = !S.isAdmin;
    document.querySelectorAll("#tabs a").forEach(a => a.setAttribute("aria-current", a.dataset.view === view() ? "page" : "false"));
  }
}

function renderBanner() {
  let html = "";
  if (!configured) html = `<div class="notice err">Firebase ist noch nicht eingerichtet. Trage deine Projektdaten in <code>firebase-config.js</code> ein (siehe README).</div>`;
  else if (S.error) html = `<div class="notice err">${esc(S.error)}</div>`;
  else if (S.fbUser && S.fbUser.providerData.some(p => p.providerId === "password") && !S.fbUser.emailVerified)
    html = `<div class="notice">Bitte bestätige deine E-Mail-Adresse über den Link, den wir dir geschickt haben. <button class="linkbtn" id="resendVerify" type="button">Link erneut senden</button></div>`;
  $("#banner").innerHTML = html;
}

function feeHint(r) {
  const p = r.feeParts || {};
  const bits = ["Grundlohn"];
  if (p.shops) bits.push("mehrere Läden");
  if (p.items) bits.push("viele Artikel");
  if (p.heavy) bits.push("schwer");
  if (p.express) bits.push("Express");
  if (p.extra) bits.push("Extra");
  if (typeof r.tip === "number" && r.tip > 0) bits.push(euro(r.tip) + " Trinkgeld");
  return bits.join(" · ");
}

function card(r) {
  const mineReq = r.createdBy === S.myId;
  const mineJob = r.helperId === S.myId;
  const items = Array.isArray(r.items) ? r.items : [];
  const canTick = mineJob && r.status === "uebernommen";
  const doneCount = items.filter(i => i.done).length;
  const busy = S.busy.has(r.id) ? " disabled" : "";
  const id = esc(r.id);
  let actions = "";
  if (r.status === "offen" && !mineReq) {
    actions += isHero()
      ? `<button class="btn primary" data-act="take" data-id="${id}"${busy}>Ich gehe einkaufen</button>`
      : `<a class="btn" href="#held">Als Held anmelden, um zu helfen</a>`;
  }
  if ((mineReq || mineJob) && r.helperId) actions += `<button class="btn" data-act="chat" data-id="${id}">Nachrichten</button>`;
  if (canTick) {
    actions += `<button class="btn primary" data-act="deliver" data-id="${id}"${busy}>Geliefert</button>`;
    actions += `<button class="btn" data-act="release" data-id="${id}"${busy}>Abgeben</button>`;
  }
  if (mineReq && r.status === "erledigt" && !r.thanks) {
    actions += `<div class="thanks-row">Danke sagen, gern mit Trinkgeld:
      <button class="btn" data-act="thanks" data-tip="0" data-id="${id}"${busy}>Nur Danke</button>
      ${TIP_OPTIONS.map(t => `<button class="btn primary" data-act="thanks" data-tip="${t}" data-id="${id}"${busy}>+ ${euro(t)}</button>`).join("")}</div>`;
  }
  if (mineReq && r.status !== "uebernommen") {
    actions += `<button class="btn ghost" data-act="cancel" data-id="${id}"${busy}>${S.confirm === r.id ? "Wirklich löschen?" : (r.status === "erledigt" ? "Entfernen" : "Zurückziehen")}</button>`;
  }
  if (!mineReq && !mineJob) actions += `<button class="btn ghost" data-act="report" data-id="${id}"${busy}>${S.confirm === "rep-" + r.id ? "Wirklich melden?" : "Melden"}</button>`;

  return `<article class="bon">
    <div class="head">
      <div class="where">${esc(r.area || "Ort offen")} · ${fmtDate(r.due)}${r.window && r.window !== "egal" ? ", " + esc(WINDOWS[r.window] || r.window) : ""}</div>
      <span class="pill ${esc(r.status)}">${STATUS[r.status] || esc(r.status)}</span>
    </div>
    <h3>${esc(r.title || "Einkauf")}</h3>
    ${Array.isArray(r.shops) && r.shops.length ? `<div class="shops">${r.shops.map(x => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
    ${typeof r.fee === "number" ? `<div class="lohn"><div><span class="k">Heldenlohn</span><small>${esc(feeHint(r))}</small></div><b>${euro(earned(r))}</b></div>` : ""}
    <ul class="items">${items.map((it, i) => `<li class="${it.done ? "done" : ""}">${canTick
      ? `<input type="checkbox" id="it-${id}-${i}" data-act="tick" data-id="${id}" data-i="${i}"${it.done ? " checked" : ""}${busy}><label for="it-${id}-${i}"><span>${esc(it.t)}</span></label>`
      : `<span class="dot">${it.done ? "✓" : "·"}</span><span>${esc(it.t)}</span>`}</li>`).join("")}</ul>
    <div class="meta">
      <div><span class="k">Artikel</span><span>${r.status === "offen" ? items.length : `${doneCount}/${items.length}`}</span></div>
      <div><span class="k">Budget</span><span>${typeof r.budget === "number" ? "max. " + euro(r.budget) : "nach Kassenbon"}</span></div>
      <div><span class="k">Bezahlung</span><span>${esc(PAY[r.payment] || r.payment || "–")}</span></div>
      ${svc(r) ? `<div><span class="k">Servicegebühr</span><span>${euro(svc(r))}</span></div>` : ""}
      ${typeof r.budget === "number" && typeof r.fee === "number" ? `<div><span class="k">Höchstens gesamt</span><span>${euro(r.budget + r.fee + svc(r))}</span></div>` : ""}
    </div>
    ${r.note ? `<p class="note">${esc(r.note)}</p>` : ""}
    <div class="people">
      <span>${esc(nameOf(r.createdBy))} · ${esc(ago(r.createdAt))}</span>
      ${r.helperId ? `<span>→ <b>${esc(nameOf(r.helperId))}</b> kauft ein</span>` : ""}
      ${r.thanks ? `<span class="cape">Danke${typeof r.tip === "number" && r.tip > 0 ? " + " + euro(r.tip) : ""}</span>` : ""}
    </div>
    ${actions ? `<div class="actions">${actions}</div>` : ""}
  </article>`;
}

const emptyBox = (title, text, link) => `<div class="empty"><strong>${title}</strong><span>${text}</span>${link || ""}</div>`;
const loadingOrEmpty = (title, text, link) => !S.loaded
  ? emptyBox("Wird geladen …", "Gleich siehst du, wer in deiner Nähe Hilfe beim Einkaufen braucht.")
  : emptyBox(title, text, link);

function tarifPanel() {
  return `<section class="panel">
    <h2>Heldenlohn</h2>
    <p class="small">Jeder Einkauf bringt dem Helden einen festen, fairen Lohn. Er wird bei der Übergabe zusammen mit dem Einkauf bezahlt.</p>
    <dl class="tarif">
      <div><dt>Grundlohn je Einkauf</dt><dd>${euro(FEE.base)}</dd></div>
      <div><dt>jeder weitere Laden</dt><dd>+ ${euro(FEE.extraShop)}</dd></div>
      <div><dt>ab dem ${FEE.freeItems + 1}. Artikel, je Stück</dt><dd>+ ${euro(FEE.perItem)}</dd></div>
      <div><dt>Schweres (Kisten, Säcke)</dt><dd>+ ${euro(FEE.heavy)}</dd></div>
      <div><dt>Express, noch heute</dt><dd>+ ${euro(FEE.express)}</dd></div>
      <div><dt>Extra und Trinkgeld</dt><dd>freiwillig</dd></div>
    </dl>
    <p class="small">Dazu kommt eine Servicegebühr von ${euro(SERVICE_FEE)} je Einkauf für den Betrieb von Einkaufshelden. Der Held nimmt sie bei der Übergabe mit und leitet sie weiter.</p>
  </section>`;
}

function sidebar() {
  const counts = {}, money = {};
  S.requests.forEach(r => { if (r.status === "erledigt" && r.helperId) { counts[r.helperId] = (counts[r.helperId] || 0) + 1; money[r.helperId] = (money[r.helperId] || 0) + earned(r); } });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1] || (money[b[0]] - money[a[0]])).slice(0, 8);
  return `<aside>
    <section class="panel">
      <h2>Heldenwand</h2>
      ${top.length ? `<ul class="wall">${top.map(([id, n]) => `<li><span class="name">${esc(nameOf(id))}</span><span class="n">${n}× · ${euro(money[id])}</span></li>`).join("")}</ul>`
        : `<p class="small">Hier erscheinen die Helden mit den meisten gelieferten Einkäufen.</p>`}
    </section>
    ${tarifPanel()}
    <section class="panel">
      <h2>So funktioniert's</h2>
      <ol class="steps">
        <li><b>Liste anlegen.</b> Wer Hilfe braucht, schreibt auf, was gebraucht wird, wo und bis wann. Der Heldenlohn wird automatisch berechnet.</li>
        <li><b>Held übernimmt.</b> Ein Einkaufsheld aus der Gegend sagt zu. Über „Nachrichten“ macht ihr Adresse und Uhrzeit privat aus.</li>
        <li><b>Übergabe.</b> Ware und Kassenbon gegen den Betrag vom Bon plus Heldenlohn. Danach ein Danke, gern mit Trinkgeld.</li>
      </ol>
      <p class="small">Aufträge sehen alle Mitglieder. Schreib deine Adresse oder Telefonnummer deshalb nur in die privaten Nachrichten.</p>
    </section>
  </aside>`;
}

function vLanding() {
  const reg = S.authMode === "register";
  return `<div class="landing">
    <section>
      <h1>Nachbarn kaufen für Nachbarn ein.</h1>
      <p class="lead">Du schaffst es gerade nicht in den Laden? Leg deine Einkaufsliste an. Ein Einkaufsheld aus deiner Gegend bringt dir alles vorbei und bekommt dafür einen fairen Heldenlohn.</p>
      <div class="points">
        <div><b>Für alle, die Hilfe brauchen</b><span>Ältere Menschen, Kranke, Eltern mit Baby, alle ohne Auto oder Zeit.</span></div>
        <div><b>Für alle, die helfen wollen</b><span>Du gehst sowieso einkaufen? Nimm etwas mit und verdiene ab ${euro(FEE.base)} pro Einkauf dazu.</span></div>
        <div><b>Privat und fair</b><span>Adressen tauscht ihr nur im privaten Chat aus. Bezahlt wird direkt bei der Übergabe.</span></div>
      </div>
      <div style="margin-top:24px;max-width:360px">${tarifPanel()}</div>
    </section>
    <section class="auth" aria-labelledby="authTitle">
      <h2 id="authTitle">${reg ? "Konto erstellen" : "Anmelden"}</h2>
      <button class="btn google" type="button" id="googleBtn">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Weiter mit Google</button>
      <div class="or">oder mit E-Mail</div>
      <form id="authForm" style="display:grid;gap:12px" autocomplete="on">
        <label class="f">E-Mail<input id="a-email" type="email" required autocomplete="email"></label>
        <label class="f">Passwort${reg ? " <small>mindestens 8 Zeichen</small>" : ""}<input id="a-pass" type="password" required minlength="${reg ? 8 : 6}" autocomplete="${reg ? "new-password" : "current-password"}"></label>
        <button class="btn primary wide" type="submit">${reg ? "Konto erstellen" : "Anmelden"}</button>
        <span class="msg" id="a-msg" role="status"></span>
      </form>
      <p class="small">${reg
        ? `Schon dabei? <button class="linkbtn" type="button" data-auth="login">Anmelden</button>`
        : `Neu hier? <button class="linkbtn" type="button" data-auth="register">Konto erstellen</button> · <button class="linkbtn" type="button" id="forgot">Passwort vergessen</button>`}</p>
    </section>
  </div>`;
}

function vOnboarding() {
  return `<section class="intro"><h1>Willkommen bei den Einkaufshelden</h1><p>Noch zwei Angaben, dann kann es losgehen.</p></section>
    <form class="card" id="onbForm" style="margin-block:16px 56px">
      <label class="f">Wie sollen andere dich nennen? <small>Vorname oder Spitzname, für alle Mitglieder sichtbar</small>
        <input id="o-name" required minlength="2" maxlength="40" value="${esc((S.fbUser && S.fbUser.displayName || "").split(" ")[0])}" autocomplete="given-name"></label>
      <label class="consent"><input type="checkbox" id="o-age" required> <span>Ich bin mindestens 10 Jahre alt. Wenn ich jünger als 18 bin, sind meine Eltern damit einverstanden, dass ich Einkaufshelden nutze.</span></label>
      <label class="consent"><input type="checkbox" id="o-terms" required> <span>Ich habe die <a href="agb.html" target="_blank">Nutzungsbedingungen</a> und die <a href="datenschutz.html" target="_blank">Datenschutzerklärung</a> gelesen und bin einverstanden.</span></label>
      <div class="form-foot"><button class="btn primary" type="submit">Los geht's</button><span class="msg" id="o-msg" role="status"></span></div>
    </form>`;
}

function vAuftraege() {
  const f = S.filter.trim().toLowerCase();
  let list = S.requests.filter(r => S.show === "alle" ? true : r.status === S.show);
  if (f) list = list.filter(r => [r.area, r.title, ...(r.shops || []), ...(r.items || []).map(i => i.t)].join(" ").toLowerCase().includes(f));
  if (S.sort === "lohn") list = [...list].sort((a, b) => earned(b) - earned(a));
  if (S.sort === "dringend") list = [...list].sort((a, b) => String(a.due || "9999").localeCompare(String(b.due || "9999")));
  const body = list.length ? `<div class="grid">${list.map(card).join("")}</div>`
    : loadingOrEmpty(f ? "Nichts gefunden" : (S.show === "offen" ? "Gerade braucht niemand Hilfe" : "Noch nichts hier"),
        f ? "Probier einen anderen Stadtteil oder Artikel." : "Sobald jemand eine Einkaufsliste anlegt, steht sie hier.",
        `<a class="btn primary" href="#hilfe">Eigenen Einkauf anfragen</a>`);
  return `<section class="intro">
      <h1>Wer braucht heute etwas aus dem Laden?</h1>
      <p>Einkaufshelden gehen für Nachbarn einkaufen, die es gerade nicht selbst schaffen, und bekommen dafür einen Heldenlohn. Such dir einen Auftrag in deiner Nähe aus.</p>
    </section>
    <div class="layout"><div>
      <div class="toolbar">
        <input id="flt" type="search" placeholder="Stadtteil, PLZ, Laden oder Artikel" value="${esc(S.filter)}" aria-label="Aufträge filtern">
        <select id="sort" aria-label="Sortierung">
          <option value="neu"${S.sort === "neu" ? " selected" : ""}>Neueste zuerst</option>
          <option value="lohn"${S.sort === "lohn" ? " selected" : ""}>Bester Heldenlohn</option>
          <option value="dringend"${S.sort === "dringend" ? " selected" : ""}>Dringendste zuerst</option>
        </select>
        <div class="seg" role="group" aria-label="Status">
          ${["offen", "uebernommen", "erledigt", "alle"].map(k => `<button type="button" data-show="${k}" aria-pressed="${S.show === k}">${k === "alle" ? "Alle" : STATUS[k]}</button>`).join("")}
        </div>
      </div>
      ${body}
    </div>${sidebar()}</div>`;
}

function formFee() {
  const el = (id) => document.getElementById(id);
  const d = lastDraft || {};
  const items = (el("r-items") ? el("r-items").value : (d.items || "")).split("\n").filter(l => l.trim()).length;
  const heavy = el("r-heavy") ? el("r-heavy").checked : !!d.heavy;
  const due = el("r-due") ? el("r-due").value : (d.due || "");
  const extra = parseFloat(String(el("r-extra") ? el("r-extra").value : (d.extra || "")).replace(",", ".")) || 0;
  const shops = el("reqForm") ? readShops() : (Array.isArray(d.shops) ? d.shops : []);
  return { items, shops: shops.length, p: calcFee(items, heavy, due, extra, Math.max(1, shops.length)) };
}
function readShops() {
  const picked = [...document.querySelectorAll("#reqForm input[name=shop]:checked")].map(i => i.value);
  const other = (($("#r-shop-other") || {}).value || "").split(",").map(x => x.trim().slice(0, 30)).filter(Boolean);
  return [...new Set([...picked, ...other])].slice(0, MAX_SHOPS);
}
function calcHtml() {
  const { items, shops, p } = formFee();
  const line = (k, v, show = true) => show ? `<div><span class="muted">${k}</span><span>${euro(v)}</span></div>` : "";
  return `<div><b>Heldenlohn für deinen Helden</b><span></span></div>
    ${line("Grundlohn", p.base)}
    ${line(`${shops - 1} weitere${shops - 1 === 1 ? "r Laden" : " Läden"} × ${euro(FEE.extraShop)}`, p.shops, p.shops > 0)}
    ${line(`${items - FEE.freeItems} Artikel über ${FEE.freeItems} × ${euro(FEE.perItem)}`, p.items, p.items > 0)}
    ${line("Schwere Sachen", p.heavy, p.heavy > 0)}
    ${line("Express, noch heute", p.express, p.express > 0)}
    ${line("Extra von dir", p.extra, p.extra > 0)}
    <div class="sum"><span>Heldenlohn</span><span>${euro(p.total)}</span></div>
    <div><span class="muted">Servicegebühr Einkaufshelden</span><span>${euro(SERVICE_FEE)}</span></div>
    <div class="sum"><span>Zusätzlich zum Kassenbon</span><span>${euro(p.total + SERVICE_FEE)}</span></div>
    <div class="muted" style="font-size:12px">Zahlst du bei der Übergabe an deinen Helden, zusammen mit dem Betrag auf dem Kassenbon.</div>`;
}

function vHilfe() {
  const d = lastDraft || {};
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return `<section class="intro">
      <h1>Einkauf anfragen</h1>
      <p>Schreib deine Liste so, wie du sie auf einen Zettel schreiben würdest: ein Artikel pro Zeile, gern mit Menge und Marke.</p>
    </section>
    <div class="layout"><div>
    <form class="card" id="reqForm" autocomplete="off">
      <label class="f">Worum geht's?<input id="r-title" required maxlength="80" placeholder="Wocheneinkauf, Apotheke, Getränke …" value="${esc(d.title || "")}"></label>
      <label class="f">Einkaufsliste <small>Ein Artikel pro Zeile</small>
        <textarea class="list" id="r-items" required placeholder="1 l Milch (3,5 %)&#10;6 Eier, Freiland&#10;Vollkornbrot&#10;2 kg Kartoffeln, festkochend">${esc(d.items || "")}</textarea></label>
      <label class="f">Stadtteil oder PLZ <small>Keine genaue Adresse</small><input id="r-area" required maxlength="60" placeholder="z. B. 50823 Ehrenfeld" value="${esc(d.area || "")}"></label>
      <div class="f" role="group" aria-labelledby="r-shops-l"><span id="r-shops-l" style="font-weight:600;font-size:14px">In welchen Läden? <small style="font-weight:400;color:var(--muted)">Mehrere möglich, bis zu ${MAX_SHOPS}. Jeder weitere Laden + ${euro(FEE.extraShop)} Heldenlohn.</small></span>
        <div class="checks">${SHOPS.map(x => `<label><input type="checkbox" name="shop" value="${esc(x)}"${(d.shops || []).includes(x) ? " checked" : ""}>${esc(x)}</label>`).join("")}</div>
        <input id="r-shop-other" maxlength="80" placeholder="Anderer Laden, z. B. Asia-Markt Venloer Str. (mehrere mit Komma)" value="${esc(d.shopOther || "")}" aria-label="Anderer Laden">
      </div>
      <div class="row">
        <label class="f">Bis wann?<input id="r-due" type="date" min="${todayISO()}" value="${esc(d.due || tomorrow)}"></label>
        <label class="f">Tageszeit<select id="r-window">${Object.entries(WINDOWS).map(([k, v]) => `<option value="${k}"${(d.window || "egal") === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
      </div>
      <div class="row">
        <label class="f">Budget in € <small>Optional, Obergrenze</small><input id="r-budget" type="number" min="0" max="1000" step="0.5" inputmode="decimal" placeholder="30" value="${esc(d.budget || "")}"></label>
        <label class="f">Bezahlung<select id="r-pay">${Object.entries(PAY).map(([k, v]) => `<option value="${k}"${(d.payment || "bar") === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
      </div>
      <div class="row">
        <label class="f" style="display:flex;gap:8px;align-items:center;font-weight:500"><input id="r-heavy" type="checkbox" style="width:auto"${d.heavy ? " checked" : ""}> Schwere Sachen dabei (Getränkekisten, Katzenstreu …)</label>
        <label class="f">Extra-Lohn drauflegen in € <small>Optional</small><input id="r-extra" type="number" min="0" max="50" step="0.5" inputmode="decimal" placeholder="0" value="${esc(d.extra || "")}"></label>
      </div>
      <div class="calc" id="calc" aria-live="polite">${calcHtml()}</div>
      <label class="f">Hinweise <small>Optional, für alle sichtbar. Keine Adresse!</small><textarea id="r-note" maxlength="400" placeholder="Bitte laktosefreie Milch, falls es keine gibt. Ich wohne im 3. OG ohne Aufzug.">${esc(d.note || "")}</textarea></label>
      <div class="form-foot">
        <button class="btn primary" type="submit">Auftrag veröffentlichen</button>
        <span class="msg" id="r-msg" role="status"></span>
      </div>
    </form></div>${sidebar()}</div>`;
}

function earnBox(jobs) {
  const done = jobs.filter(r => r.status === "erledigt");
  const month = todayISO().slice(0, 7);
  const sum = (l) => l.reduce((a, r) => a + earned(r), 0);
  const thisMonth = done.filter(r => { const d = toDate(r.doneAt); return d && d.toISOString().slice(0, 7) === month; });
  const pending = jobs.filter(r => r.status === "uebernommen");
  const tips = done.reduce((a, r) => a + (typeof r.tip === "number" ? r.tip : 0), 0);
  return `<section>
    <h2 class="section-title">Mein Heldenlohn</h2>
    <div class="earn">
      <div><b>${euro(sum(thisMonth))}</b><span>verdient diesen Monat</span></div>
      <div><b>${euro(sum(done))}</b><span>insgesamt, ${done.length} ${done.length === 1 ? "Lieferung" : "Lieferungen"}</span></div>
      <div><b>${euro(tips)}</b><span>davon Trinkgeld</span></div>
      <div><b>${euro(sum(pending))}</b><span>noch offen in ${pending.length} ${pending.length === 1 ? "Auftrag" : "Aufträgen"}</span></div>
    </div>
    <p class="small" style="margin-top:8px">Die App zählt nur mit. Das Geld bekommst du bei der Übergabe direkt von der Person, für die du einkaufst. Einnahmen musst du ggf. selbst versteuern.</p>
  </section>
  ${feeAccount(done)}`;
}

function feeAccount(done) {
  const owed = round2(done.reduce((a, r) => a + svc(r), 0));
  const paid = round2(S.payouts.filter(p => p.helperId === S.myId).reduce((a, p) => a + (p.amount || 0), 0));
  const open = round2(Math.max(0, owed - paid));
  if (!owed) return "";
  const ways = [SITE.paypal ? `PayPal: <b class="sel">${esc(SITE.paypal)}</b>` : "", SITE.iban ? `Überweisung an ${todo(SITE.operatorName, "Name")}, IBAN <b class="sel">${esc(SITE.iban)}</b>` : ""].filter(Boolean);
  return `<section>
    <h2 class="section-title">Servicegebühren</h2>
    <div class="earn">
      <div><b>${euro(open)}</b><span>an Einkaufshelden zu überweisen</span></div>
      <div><b>${euro(owed)}</b><span>eingesammelt bei ${(n => n + (n === 1 ? " Lieferung" : " Lieferungen"))(done.filter(r => svc(r)).length)}</span></div>
      <div><b>${euro(paid)}</b><span>schon überwiesen</span></div>
    </div>
    <p class="small" style="margin-top:8px">Bei jeder Übergabe bekommst du ${euro(SERVICE_FEE)} Servicegebühr mit. Bitte überweise den offenen Betrag ${esc(SITE.payRhythm || "einmal im Monat")}${ways.length ? " – " + ways.join(" oder ") : ` – ${todo("", "Zahlungsweg in site-config.js eintragen")}`}. Verwendungszweck: <b class="sel">Einkaufshelden ${esc(S.profile ? S.profile.name : "")} ${esc(S.myId ? S.myId.slice(0, 6) : "")}</b></p>
  </section>`;
}

function vBetreiber() {
  if (!S.isAdmin) return emptyBox("Kein Zugriff", "Dieser Bereich ist nur für den Betreiber.");
  const per = {};
  S.requests.forEach(r => {
    if (r.status !== "erledigt" || !r.helperId || !svc(r)) return;
    const x = per[r.helperId] || (per[r.helperId] = { n: 0, owed: 0, paid: 0 });
    x.n++; x.owed += svc(r);
  });
  S.payouts.forEach(p => { const x = per[p.helperId] || (per[p.helperId] = { n: 0, owed: 0, paid: 0 }); x.paid += p.amount || 0; });
  const rows = Object.entries(per).map(([id, x]) => ({ id, ...x, open: round2(Math.max(0, x.owed - x.paid)) })).sort((a, b) => b.open - a.open);
  const tot = rows.reduce((a, r) => ({ owed: a.owed + r.owed, paid: a.paid + r.paid, open: a.open + r.open }), { owed: 0, paid: 0, open: 0 });
  const month = todayISO().slice(0, 7);
  const monthFees = S.requests.filter(r => r.status === "erledigt" && svc(r) && (() => { const d = toDate(r.doneAt); return d && d.toISOString().slice(0, 7) === month; })()).reduce((a, r) => a + svc(r), 0);
  return `<section class="intro"><h1>Betreiber</h1><p>Deine Einnahmen aus der Servicegebühr von ${euro(SERVICE_FEE)} je Einkauf und gemeldete Aufträge.</p></section>
    <div class="stack" style="padding-block:16px 56px">
      <section><div class="earn">
        <div><b>${euro(monthFees)}</b><span>Servicegebühren diesen Monat</span></div>
        <div><b>${euro(tot.owed)}</b><span>insgesamt angefallen</span></div>
        <div><b>${euro(tot.paid)}</b><span>bei dir eingegangen</span></div>
        <div><b>${euro(tot.open)}</b><span>noch offen bei Helden</span></div>
      </div></section>
      <section>
        <h2 class="section-title">Offene Beträge je Held</h2>
        ${rows.length ? `<div class="tbl"><table>
          <thead><tr><th>Held</th><th>Lieferungen</th><th>Angefallen</th><th>Bezahlt</th><th>Offen</th><th></th></tr></thead>
          <tbody>${rows.map(r => `<tr><td>${esc(nameOf(r.id))}<br><small class="sel">${esc(r.id.slice(0, 6))}</small></td><td>${r.n}</td><td>${euro(r.owed)}</td><td>${euro(r.paid)}</td><td><b>${euro(r.open)}</b></td>
            <td>${r.open > 0 ? `<button class="btn" data-act="payout" data-id="${esc(r.id)}" data-amount="${r.open}">${S.confirm === "pay-" + r.id ? "Eingang bestätigen?" : euro(r.open) + " erhalten"}</button>` : "✓"}</td></tr>`).join("")}</tbody>
        </table></div>` : `<p class="small">Noch keine Servicegebühren angefallen.</p>`}
        <p class="small">Wenn eine Überweisung bei dir angekommen ist, klick auf „erhalten“. Der Held sieht dann sofort, dass nichts mehr offen ist.</p>
      </section>
      <section>
        <h2 class="section-title">Meldungen</h2>
        ${S.reports.length ? `<div class="tbl"><table><thead><tr><th>Wann</th><th>Auftrag</th><th>Von</th><th></th></tr></thead><tbody>
          ${S.reports.map(rep => { const r = S.requests.find(x => x.id === rep.requestId); return `<tr><td>${esc(ago(rep.at))}</td><td>${r ? esc(r.title) + " · " + esc(r.area) : "<small>schon gelöscht</small>"}</td><td>${esc(nameOf(rep.by))}</td>
            <td style="white-space:nowrap">${r ? `<button class="btn ghost" data-act="admindel" data-id="${esc(r.id)}">${S.confirm === "adel-" + r.id ? "Auftrag löschen?" : "Auftrag löschen"}</button>` : ""}<button class="btn ghost" data-act="repdone" data-id="${esc(rep.id)}">Erledigt</button></td></tr>`; }).join("")}
        </tbody></table></div>` : `<p class="small">Keine offenen Meldungen.</p>`}
      </section>
    </div>`;
}

function vMeine() {
  const mine = S.requests.filter(r => r.createdBy === S.myId);
  const jobs = S.requests.filter(r => r.helperId === S.myId);
  return `<section class="intro"><h1>Meine Einkäufe</h1><p>Was du angefragt hast und wofür du gerade einkaufen gehst.</p></section>
    <div class="stack" style="padding-block: 16px 56px">
      ${jobs.length || isHero() ? earnBox(jobs) : ""}
      <section>
        <h2 class="section-title">Ich kaufe ein für …</h2>
        ${jobs.length ? `<div class="grid">${jobs.map(card).join("")}</div>`
          : loadingOrEmpty("Noch kein Einsatz", isHero() ? "Such dir unter „Aufträge“ einen Einkauf in deiner Nähe aus." : "Melde dich als Einkaufsheld an, dann kannst du Aufträge übernehmen.", `<a class="btn primary" href="${isHero() ? "#auftraege" : "#held"}">${isHero() ? "Zu den Aufträgen" : "Held werden"}</a>`)}
      </section>
      <section>
        <h2 class="section-title">Meine Anfragen</h2>
        ${mine.length ? `<div class="grid">${mine.map(card).join("")}</div>`
          : loadingOrEmpty("Du hast noch nichts angefragt", "Leg eine Einkaufsliste an, und ein Held aus deiner Gegend kümmert sich darum.", `<a class="btn primary" href="#hilfe">Einkauf anfragen</a>`)}
      </section>
    </div>`;
}

function vHeld() {
  const h = S.helpers[S.myId] || {};
  const days = Array.isArray(h.days) ? h.days : [];
  const registered = !!S.helpers[S.myId];
  return `<section class="intro">
      <h1>${registered ? "Dein Heldenprofil" : "Werde Einkaufsheld"}</h1>
      <p>Sag kurz, wo und wann du unterwegs bist. Danach kannst du Einkaufslisten übernehmen und ab ${euro(FEE.base)} pro Einkauf verdienen.</p>
    </section>
    <div class="layout"><div>
    <form class="card" id="heroForm" autocomplete="off">
      <div class="row">
        <label class="f">Mein Gebiet <small>Stadtteil oder PLZ</small><input id="h-area" required maxlength="60" placeholder="z. B. Ehrenfeld, Neuehrenfeld" value="${esc(h.area || "")}"></label>
        <label class="f">Unterwegs mit<select id="h-transport">${["zu Fuß", "Fahrrad", "Lastenrad", "Auto", "ÖPNV"].map(t => `<option${h.transport === t ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      </div>
      <div class="f" role="group" aria-labelledby="h-days-l"><span id="h-days-l" style="font-weight:600;font-size:14px">Wann kann ich?</span>
        <div class="checks">${DAYS.map(dd => `<label><input type="checkbox" name="day" value="${dd}"${days.includes(dd) ? " checked" : ""}>${dd}</label>`).join("")}</div>
      </div>
      <label class="f">Über mich <small>Optional</small><textarea id="h-note" maxlength="300" placeholder="Ich kaufe sowieso samstags ein und nehme gern was mit. Schwere Getränkekisten sind kein Problem.">${esc(h.note || "")}</textarea></label>
      <label class="f" style="display:flex;gap:8px;align-items:center;font-weight:500"><input id="h-active" type="checkbox" style="width:auto"${h.active !== false ? " checked" : ""}> Ich bin gerade verfügbar</label>
      <label class="consent"><input type="checkbox" id="h-adult" required${h.adult ? " checked" : ""}> <span>Ich bin mindestens 18 Jahre alt. Mir ist klar, dass ich meinen Heldenlohn ggf. selbst versteuern muss.</span></label>
      <div class="form-foot">
        <button class="btn primary" type="submit">${registered ? "Profil speichern" : "Als Held anmelden"}</button>
        ${registered ? `<button class="btn ghost" type="button" id="h-leave">${S.confirm === "leave" ? "Wirklich abmelden?" : "Als Held abmelden"}</button>` : ""}
        <span class="msg" id="h-msg" role="status"></span>
      </div>
    </form></div>${sidebar()}</div>`;
}

function vHelden() {
  const list = Object.entries(S.helpers).filter(([, h]) => h.active !== false);
  const counts = {};
  S.requests.forEach(r => { if (r.status === "erledigt" && r.helperId) counts[r.helperId] = (counts[r.helperId] || 0) + 1; });
  return `<section class="intro"><h1>Alle Einkaufshelden</h1><p>Diese Leute gehen für andere einkaufen.</p></section>
    <div style="padding-block: 16px 56px">
    ${list.length ? `<div class="helpers">${list.map(([id, h]) => `<div class="hero-card">
        <div class="who"><span>${esc(nameOf(id))}</span></div>
        <div><span class="k">Gebiet:</span> ${esc(h.area || "–")}</div>
        <div><span class="k">Mit:</span> ${esc(h.transport || "–")} · <span class="k">Tage:</span> ${esc((h.days || []).join(", ") || "flexibel")}</div>
        <div><span class="k">Geliefert:</span> ${counts[id] || 0}</div>
        ${h.note ? `<p class="note">${esc(h.note)}</p>` : ""}
      </div>`).join("")}</div>`
      : loadingOrEmpty("Noch keine Helden angemeldet", "Sei die erste Person, die für Nachbarn einkaufen geht.", `<a class="btn primary" href="#held">Held werden</a>`)}
    </div>`;
}

function vKonto() {
  return `<section class="intro"><h1>Mein Konto</h1><p>Angemeldet als ${esc(S.fbUser.email || "Google-Konto")}.</p></section>
    <div class="stack" style="padding-block:16px 56px;max-width:680px">
      <form class="card" id="nameForm">
        <h2>Anzeigename</h2>
        <label class="f">Name <small>für alle Mitglieder sichtbar</small><input id="k-name" required minlength="2" maxlength="40" value="${esc(S.profile.name)}"></label>
        <div class="form-foot"><button class="btn primary" type="submit">Speichern</button><span class="msg" id="k-msg" role="status"></span></div>
      </form>
      <section class="card" style="display:grid;gap:12px">
        <h2>Konto löschen</h2>
        <p class="small">Löscht dein Profil, dein Heldenprofil, deine offenen und erledigten Anfragen und dein Login. Aufträge, die gerade jemand für dich einkauft, musst du vorher abschließen.</p>
        <div class="form-foot"><button class="btn" type="button" id="delAccount" style="border-color:var(--danger);color:var(--danger)">${S.confirm === "delacc" ? "Endgültig löschen?" : "Konto löschen"}</button><span class="msg" id="del-msg" role="status"></span></div>
      </section>
    </div>`;
}

function render() {
  renderHeader(); renderBanner();
  const v = $("#view");
  if (!configured) { v.innerHTML = vLanding(); return; }
  if (!S.authReady) return;
  if (!S.fbUser) { if (S.renderedView !== "landing:" + S.authMode) { v.innerHTML = vLanding(); S.renderedView = "landing:" + S.authMode; } return; }
  if (!S.profileLoaded) { v.innerHTML = `<p class="small" style="padding-block:40px">Profil wird geladen …</p>`; S.renderedView = null; return; }
  if (!S.profile) { if (S.renderedView !== "onb") { v.innerHTML = vOnboarding(); S.renderedView = "onb"; } return; }

  const active = document.activeElement;
  const focusId = active && active.id;
  const selStart = active && "selectionStart" in active ? active.selectionStart : null;
  const cur = view();
  const formKey = S.myId + "|" + ((S.helpers[S.myId] && "h") || "") + "|" + S.confirm;
  if ((cur === "hilfe" || cur === "held" || cur === "konto") && S.renderedView === cur && S.formKey === formKey && v.querySelector("form")) return;
  v.innerHTML = ({ auftraege: vAuftraege, hilfe: vHilfe, meine: vMeine, held: vHeld, helden: vHelden, konto: vKonto, betreiber: vBetreiber })[cur]();
  S.renderedView = cur; S.formKey = formKey;
  if (S.flash) { const m = $(S.flash.sel); if (m) { m.textContent = S.flash.text; m.className = "msg" + (S.flash.err ? " err" : ""); } S.flash = null; }
  if (focusId) { const el = document.getElementById(focusId); if (el && el !== document.activeElement) { el.focus(); try { if (selStart != null) el.setSelectionRange(selStart, selStart); } catch (e) {} } }
}

function toast(text) {
  $("#banner").innerHTML = `<div class="notice err">${esc(text)}</div>`;
  setTimeout(renderBanner, 6000);
}
const errText = (e) => {
  const c = e && e.code || "";
  if (c.includes("permission-denied")) return "Das ist hier nicht erlaubt. Lade die Seite neu und versuch es noch einmal.";
  if (c.includes("unavailable")) return "Keine Verbindung. Prüf dein Internet und versuch es noch einmal.";
  return "Das hat nicht geklappt. Versuch es gleich noch einmal.";
};
const authErr = (e) => ({
  "auth/invalid-credential": "E-Mail oder Passwort stimmt nicht.",
  "auth/wrong-password": "E-Mail oder Passwort stimmt nicht.",
  "auth/user-not-found": "Zu dieser E-Mail gibt es kein Konto.",
  "auth/email-already-in-use": "Mit dieser E-Mail gibt es schon ein Konto. Melde dich an.",
  "auth/weak-password": "Das Passwort ist zu kurz. Nimm mindestens 8 Zeichen.",
  "auth/invalid-email": "Diese E-Mail-Adresse sieht nicht richtig aus.",
  "auth/too-many-requests": "Zu viele Versuche. Warte ein paar Minuten.",
  "auth/popup-closed-by-user": "Anmeldung abgebrochen.",
  "auth/popup-blocked": "Dein Browser hat das Anmeldefenster blockiert. Erlaube Pop-ups für diese Seite.",
  "auth/requires-recent-login": "Bitte melde dich einmal ab und wieder an, dann klappt es.",
}[e && e.code] || "Das hat nicht geklappt. Versuch es noch einmal.");

// ---------- Aktionen ----------
const reqRef = (id) => doc(db, "requests", id);
async function withBusy(id, fn) {
  if (S.busy.has(id)) return;
  S.busy.add(id); S.renderedView = null; render();
  try { await fn(); }
  catch (e) { console.error(e); toast(e && e.userMsg ? e.userMsg : errText(e)); }
  finally { S.busy.delete(id); S.renderedView = null; render(); }
}

async function take(id) {
  await withBusy(id, async () => {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(reqRef(id));
      const d = snap.exists() ? snap.data() : null;
      if (!d || d.status !== "offen" || d.helperId) { const e = new Error("taken"); e.userMsg = "Dieser Einkauf wurde gerade schon übernommen."; throw e; }
      tx.update(reqRef(id), { status: "uebernommen", helperId: S.myId, takenAt: serverTimestamp() });
    });
    location.hash = "#meine";
  });
}

document.addEventListener("click", async (ev) => {
  const t = ev.target;
  if (t.closest("#logout")) { stopData(); await signOut(auth); return; }
  if (t.closest("#resendVerify")) { try { await sendEmailVerification(S.fbUser); toast("Wir haben dir einen neuen Link geschickt."); } catch (e) { toast(authErr(e)); } return; }
  const am = t.closest("[data-auth]"); if (am) { S.authMode = am.dataset.auth; render(); return; }
  if (t.closest("#googleBtn")) {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { const m = $("#a-msg"); if (m) { m.textContent = authErr(e); m.className = "msg err"; } }
    return;
  }
  if (t.closest("#forgot")) {
    const email = $("#a-email").value.trim(); const m = $("#a-msg");
    if (!email) { m.textContent = "Trag oben deine E-Mail ein, dann schicken wir dir einen Link."; m.className = "msg err"; return; }
    try { await sendPasswordResetEmail(auth, email); m.textContent = "Falls es ein Konto gibt, ist ein Link zum Zurücksetzen unterwegs."; m.className = "msg"; }
    catch (e) { m.textContent = authErr(e); m.className = "msg err"; }
    return;
  }
  const showBtn = t.closest("[data-show]");
  if (showBtn) { S.show = showBtn.dataset.show; try { localStorage.setItem("eh-show", S.show); } catch (e) {} S.renderedView = null; render(); return; }
  if (t.closest("#chatClose")) { closeChat(); return; }
  if (t.closest("#h-leave")) {
    if (S.confirm !== "leave") { S.confirm = "leave"; render(); return; }
    S.confirm = null;
    try { await deleteDoc(doc(db, "helpers", S.myId)); } catch (e) { toast(errText(e)); }
    S.renderedView = null; render(); return;
  }
  if (t.closest("#delAccount")) return deleteAccount();

  const b = t.closest("button[data-act]");
  if (!b) return;
  const id = b.dataset.id, act = b.dataset.act;
  const confirmOnce = (key) => {
    if (S.confirm === key) { S.confirm = null; return true; }
    S.confirm = key; S.renderedView = null; render();
    setTimeout(() => { if (S.confirm === key) { S.confirm = null; S.renderedView = null; render(); } }, 4000);
    return false;
  };
  if (act === "payout") {
    if (!confirmOnce("pay-" + id)) return;
    const amount = round2(Number(b.dataset.amount) || 0);
    return withBusy("pay-" + id, () => addDoc(collection(db, "payouts"), { helperId: id, amount, by: S.myId, at: serverTimestamp() }));
  }
  if (act === "repdone") return withBusy("rep-" + id, () => deleteDoc(doc(db, "reports", id)));
  if (act === "admindel") { if (!confirmOnce("adel-" + id)) return; return withBusy(id, () => deleteDoc(reqRef(id))); }
  const r = S.requests.find(x => x.id === id);
  if (!r) return;
  if (act === "take") return take(id);
  if (act === "chat") return openChat(r);
  if (act === "release") return withBusy(id, () => updateDoc(reqRef(id), { status: "offen", helperId: null, takenAt: null, items: (r.items || []).map(i => ({ t: i.t, done: false })) }));
  if (act === "deliver") return withBusy(id, () => updateDoc(reqRef(id), { status: "erledigt", doneAt: serverTimestamp() }));
  if (act === "thanks") { const tip = Math.max(0, Number(b.dataset.tip) || 0); return withBusy(id, () => updateDoc(reqRef(id), tip ? { thanks: true, tip } : { thanks: true })); }
  if (act === "cancel") {
    if (S.confirm !== id) { S.confirm = id; S.renderedView = null; render(); setTimeout(() => { if (S.confirm === id) { S.confirm = null; S.renderedView = null; render(); } }, 4000); return; }
    S.confirm = null;
    return withBusy(id, () => deleteDoc(reqRef(id)));
  }
  if (act === "report") {
    const key = "rep-" + id;
    if (S.confirm !== key) { S.confirm = key; S.renderedView = null; render(); setTimeout(() => { if (S.confirm === key) { S.confirm = null; S.renderedView = null; render(); } }, 4000); return; }
    S.confirm = null;
    return withBusy(id, async () => { await addDoc(collection(db, "reports"), { by: S.myId, requestId: id, reason: "Auftrag gemeldet", at: serverTimestamp() }); toast("Danke, der Auftrag wurde gemeldet. Wir schauen ihn uns an."); });
  }
});

document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.id === "sort") { S.sort = t.value; S.renderedView = null; render(); return; }
  if (t.id === "r-heavy" || t.id === "r-due") { const c = $("#calc"); if (c) c.innerHTML = calcHtml(); }
  if (t.matches("input[data-act=tick]")) {
    const r = S.requests.find(x => x.id === t.dataset.id); if (!r) return;
    const items = (r.items || []).map((it, i) => ({ t: it.t, done: i === Number(t.dataset.i) ? t.checked : !!it.done }));
    withBusy(r.id, () => updateDoc(reqRef(r.id), { items }));
  }
});

document.addEventListener("input", (ev) => {
  if (ev.target.id === "flt") {
    S.filter = ev.target.value; const pos = ev.target.selectionStart;
    $("#view").innerHTML = vAuftraege(); const el = $("#flt"); el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {}
    return;
  }
  if (ev.target.closest("#reqForm")) {
    const c = $("#calc"); if (c) c.innerHTML = calcHtml();
    lastDraft = { heavy: $("#r-heavy").checked, extra: $("#r-extra").value, title: $("#r-title").value, items: $("#r-items").value, area: $("#r-area").value, shops: [...document.querySelectorAll("#reqForm input[name=shop]:checked")].map(i => i.value), shopOther: $("#r-shop-other").value, due: $("#r-due").value, window: $("#r-window").value, budget: $("#r-budget").value, payment: $("#r-pay").value, note: $("#r-note").value };
    try { localStorage.setItem("eh-draft", JSON.stringify(lastDraft)); } catch (e) {}
  }
});

document.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const btn = form.querySelector("button[type=submit]");
  const setMsg = (sel, text, err) => { const m = $(sel); if (m) { m.textContent = text; m.className = "msg" + (err ? " err" : ""); } };

  if (form.id === "authForm") {
    const email = $("#a-email").value.trim(), pass = $("#a-pass").value;
    btn.disabled = true; setMsg("#a-msg", "Einen Moment …");
    try {
      if (S.authMode === "register") {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        try { await sendEmailVerification(cred.user); } catch (e) {}
      } else await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) { setMsg("#a-msg", authErr(e), true); btn.disabled = false; }
    return;
  }

  if (form.id === "onbForm" || form.id === "nameForm") {
    const sel = form.id === "onbForm" ? "#o-name" : "#k-name";
    const msg = form.id === "onbForm" ? "#o-msg" : "#k-msg";
    const name = $(sel).value.trim().slice(0, 40);
    if (name.length < 2) { setMsg(msg, "Bitte gib mindestens 2 Zeichen ein.", true); return; }
    btn.disabled = true;
    try {
      const data = form.id === "onbForm"
        ? { name, acceptedTerms: true, ageConfirmed: true, createdAt: serverTimestamp() }
        : { name, acceptedTerms: true, ageConfirmed: true, createdAt: S.profile.createdAt || serverTimestamp() };
      await setDoc(doc(db, "users", S.myId), data);
      S.names[S.myId] = name;
      if (form.id === "nameForm") { S.renderedView = null; S.flash = { sel: "#k-msg", text: "Gespeichert." }; }
    } catch (e) { console.error(e); setMsg(msg, errText(e), true); btn.disabled = false; }
    return;
  }

  if (form.id === "reqForm") {
    const items = $("#r-items").value.split("\n").map(s => s.trim().replace(/^[-*•·]\s*/, "")).filter(Boolean).slice(0, 60).map(t => ({ t: t.slice(0, 120), done: false }));
    if (!items.length) { setMsg("#r-msg", "Schreib mindestens einen Artikel auf die Liste.", true); return; }
    const b = parseFloat(String($("#r-budget").value).replace(",", "."));
    const shops = readShops();
    if (document.querySelectorAll("#reqForm input[name=shop]:checked").length + ($("#r-shop-other").value.split(",").filter(x => x.trim()).length) > MAX_SHOPS) {
      setMsg("#r-msg", `Bitte wähle höchstens ${MAX_SHOPS} Läden.`, true); return;
    }
    const fee = calcFee(items.length, $("#r-heavy").checked, $("#r-due").value, parseFloat(String($("#r-extra").value).replace(",", ".")) || 0, Math.max(1, shops.length));
    const note = $("#r-note").value.trim().slice(0, 500);
    const data = {
      title: $("#r-title").value.trim().slice(0, 80), items,
      area: $("#r-area").value.trim().slice(0, 60), due: $("#r-due").value || null,
      window: $("#r-window").value, budget: isFinite(b) && b > 0 ? Math.min(round2(b), 1000) : null,
      payment: $("#r-pay").value, note,
      shops, serviceFee: SERVICE_FEE,
      fee: fee.total, feeParts: { base: fee.base, shops: fee.shops, items: fee.items, heavy: fee.heavy, express: fee.express, extra: fee.extra },
      status: "offen", createdBy: S.myId, helperId: null, thanks: false,
      createdAt: serverTimestamp(),
    };
    btn.disabled = true; setMsg("#r-msg", "Wird veröffentlicht …");
    try {
      await addDoc(collection(db, "requests"), data);
      lastDraft = null; try { localStorage.removeItem("eh-draft"); } catch (e) {}
      S.renderedView = null;
      location.hash = "#meine";
    } catch (e) { console.error(e); setMsg("#r-msg", errText(e), true); btn.disabled = false; }
    return;
  }

  if (form.id === "heroForm") {
    const existing = S.helpers[S.myId];
    const data = {
      area: $("#h-area").value.trim().slice(0, 60), transport: $("#h-transport").value,
      days: [...form.querySelectorAll("input[name=day]:checked")].map(i => i.value),
      note: $("#h-note").value.trim().slice(0, 300), active: $("#h-active").checked,
      adult: $("#h-adult").checked,
      joinedAt: (existing && existing.joinedAt) || serverTimestamp(),
    };
    btn.disabled = true; setMsg("#h-msg", "Wird gespeichert …");
    try {
      await setDoc(doc(db, "helpers", S.myId), data);
      S.renderedView = null;
      S.flash = { sel: "#h-msg", text: existing ? "Gespeichert." : "Willkommen bei den Einkaufshelden! Unter „Aufträge“ kannst du jetzt helfen." };
      render();
    } catch (e) { console.error(e); setMsg("#h-msg", errText(e), true); btn.disabled = false; }
    return;
  }

  if (form.id === "chatForm") {
    const text = $("#chatText").value.trim().slice(0, 1000);
    if (!text || !S.chatId) return;
    btn.disabled = true;
    try { await addDoc(collection(db, "requests", S.chatId, "messages"), { from: S.myId, text, at: serverTimestamp() }); $("#chatText").value = ""; }
    catch (e) { console.error(e); toast(errText(e)); }
    btn.disabled = false; $("#chatText").focus();
  }
});

$("#chatText").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); $("#chatForm").requestSubmit(); }
});

// ---------- Chat ----------
function openChat(r) {
  closeChat();
  S.chatId = r.id; S.chatMsgs = [];
  const other = r.createdBy === S.myId ? r.helperId : r.createdBy;
  $("#chatTitle").textContent = `${r.title || "Einkauf"} · mit ${nameOf(other)}`;
  renderChat();
  const dlg = $("#chat");
  if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  S.unsubChat = onSnapshot(query(collection(db, "requests", r.id, "messages"), orderBy("at", "asc"), limit(300)), (snap) => {
    S.chatMsgs = snap.docs.map(d => Object.assign({ id: d.id }, d.data({ serverTimestamps: "estimate" })));
    renderChat();
  }, (e) => { console.error(e); $("#chatLog").innerHTML = `<p class="small">Die Nachrichten konnten nicht geladen werden.</p>`; });
  setTimeout(() => $("#chatText").focus(), 50);
}
function renderChat() {
  const log = $("#chatLog");
  log.innerHTML = S.chatMsgs.length ? S.chatMsgs.map(m => {
    const d = toDate(m.at);
    return `<div class="bubble${m.from === S.myId ? " me" : ""}">${esc(m.text)}<time>${m.from === S.myId ? "Du" : esc(nameOf(m.from))}${d ? " · " + d.toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : ""}</time></div>`;
  }).join("") : `<p class="small">Noch keine Nachrichten. Schreib zum Beispiel, wann und wo die Übergabe sein soll.</p>`;
  log.scrollTop = log.scrollHeight;
}
function closeChat() {
  if (S.unsubChat) { S.unsubChat(); S.unsubChat = null; }
  S.chatId = null;
  const dlg = $("#chat"); if (dlg.open) dlg.close();
}
$("#chat").addEventListener("close", () => { if (S.unsubChat) { S.unsubChat(); S.unsubChat = null; } S.chatId = null; });

// ---------- Konto löschen ----------
async function deleteAccount() {
  if (S.confirm !== "delacc") { S.confirm = "delacc"; render(); return; }
  S.confirm = null;
  const msg = $("#del-msg");
  if (S.requests.some(r => r.createdBy === S.myId && r.status === "uebernommen")) {
    msg.textContent = "Du hast noch Aufträge, für die gerade jemand einkauft. Schließt diese zuerst ab."; msg.className = "msg err"; return;
  }
  if (S.requests.some(r => r.helperId === S.myId && r.status === "uebernommen")) {
    msg.textContent = "Du kaufst gerade noch für jemanden ein. Liefere oder gib den Auftrag zuerst ab."; msg.className = "msg err"; return;
  }
  msg.textContent = "Konto wird gelöscht …"; msg.className = "msg";
  try {
    const own = await getDocs(query(collection(db, "requests"), where("createdBy", "==", S.myId)));
    for (const d of own.docs) { if (d.data().status !== "uebernommen") await deleteDoc(d.ref); }
    await deleteDoc(doc(db, "helpers", S.myId)).catch(() => {});
    await deleteDoc(doc(db, "users", S.myId));
    stopData();
    await deleteUser(S.fbUser);
  } catch (e) { console.error(e); msg.textContent = authErr(e); msg.className = "msg err"; }
}

// ---------- Daten-Abos ----------
function stopData() { while (unsubs.length) { try { unsubs.pop()(); } catch (e) {} } closeChat(); S.isAdmin = false; S.payouts = []; S.reports = []; }

function startData() {
  stopData();
  S.loaded = false; S.error = null;
  unsubs.push(onSnapshot(doc(db, "users", S.myId), (snap) => {
    const before = S.profileLoaded ? !!S.profile : null;
    S.profile = snap.exists() ? snap.data() : null; S.profileLoaded = true;
    if (S.profile) S.names[S.myId] = S.profile.name;
    // Nur neu aufbauen, wenn sich wirklich etwas ändert – sonst würden offene Formulare geleert.
    if (before !== !!S.profile) S.renderedView = null;
    render();
  }, (e) => { console.error(e); S.profileLoaded = true; S.error = "Dein Profil konnte nicht geladen werden."; render(); }));

  unsubs.push(onSnapshot(query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(400)), (snap) => {
    S.requests = snap.docs.map(d => Object.assign({ id: d.id }, d.data({ serverTimestamps: "estimate" })));
    S.loaded = true;
    render(); loadNames();
  }, (e) => { console.error(e); if (String(e.code).includes("permission")) return; S.error = "Die Aufträge konnten nicht geladen werden. Lade die Seite neu."; S.loaded = true; render(); }));

  // Betreiber-Rechte: Dokument admins/{uid} wird von Hand in der Firebase-Konsole angelegt.
  getDoc(doc(db, "admins", S.myId)).then(snap => {
    S.isAdmin = snap.exists();
    const payQ = S.isAdmin ? collection(db, "payouts") : query(collection(db, "payouts"), where("helperId", "==", S.myId));
    unsubs.push(onSnapshot(payQ, (s) => {
      S.payouts = s.docs.map(d => Object.assign({ id: d.id }, d.data()));
      // Nur Ansichten ohne Formular neu aufbauen, damit nichts Eingetipptes verloren geht.
      if (S.profile && ["meine", "betreiber"].includes(view())) S.renderedView = null;
      render();
    }, (e) => console.error(e)));
    if (S.isAdmin) unsubs.push(onSnapshot(query(collection(db, "reports"), orderBy("at", "desc"), limit(200)), (s) => {
      S.reports = s.docs.map(d => Object.assign({ id: d.id }, d.data({ serverTimestamps: "estimate" }))); render();
    }, (e) => console.error(e)));
    render();
  }).catch(() => {});

  unsubs.push(onSnapshot(collection(db, "helpers"), (snap) => {
    const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); });
    S.helpers = m; render(); loadNames();
  }, (e) => { console.error(e); }));
}

window.addEventListener("hashchange", () => { S.renderedView = null; S.confirm = null; render(); window.scrollTo(0, 0); });

if (configured) {
  onAuthStateChanged(auth, (u) => {
    S.authReady = true; S.fbUser = u; S.myId = u ? u.uid : null;
    S.profile = null; S.profileLoaded = false; S.renderedView = null;
    if (u) startData(); else { stopData(); S.requests = []; S.helpers = {}; }
    render();
  });
}
render();

// ---------- PWA ----------
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; $("#installBtn").classList.add("show"); });
$("#installBtn").addEventListener("click", async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => {});
  deferredInstall = null; $("#installBtn").classList.remove("show");
});
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
