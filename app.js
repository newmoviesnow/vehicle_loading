import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore-lite.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
// Firestore Lite uses REST directly and avoids the browser WebChannel.
// This is useful for company/proxy networks that make the full Firestore
// Web SDK report "client is offline" even when Authentication works.
const db = getFirestore(app);
const ADMIN_EMAIL = "vivekdevmurari517@gmail.com";
const BUILD = "cloud-v7-firestore-lite";

const $ = id => document.getElementById(id);
const today = new Date();
const isoDate = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

let currentUser = null;
let isAdmin = false;
let photoItems = [];
let cachedRecords = [];

function show(id, on = true) { $(id).classList.toggle("hidden", !on); }
function esc(s = "") { return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#039;"}[m])); }
function errorText(err, fallback = "Something went wrong.") {
  const code = err?.code ? ` (${err.code})` : "";
  return `${err?.message || fallback}${code}`;
}
function setMsg(id, msg, ok = false) {
  const el = $(id);
  el.textContent = msg;
  el.className = ok ? "successMsg" : "error";
}

// Set defaults only after DOM is ready.
$("reportDate").value = isoDate(today);
$("reportMonth").value = isoDate(today).slice(0, 7);
$("loadDate").value = isoDate(today);
$("loadTime").value = new Date().toTimeString().slice(0, 5);

async function ensureUserProfile(user) {
  if (!user) throw new Error("You are not signed in.");
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const email = (user.email || "").trim().toLowerCase();
  const isKnownAdmin = email === ADMIN_EMAIL.toLowerCase();
  const profile = {
    uid: user.uid,
    name: user.displayName || (user.email || "User").split("@")[0],
    email: user.email || "",
    role: isKnownAdmin ? "admin" : "user",
    createdAt: serverTimestamp()
  };
  await setDoc(ref, profile);
  return { ...profile, role: profile.role };
}

async function getRole(user) {
  if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return "admin";
  const profile = await ensureUserProfile(user);
  return profile.role === "admin" ? "admin" : "user";
}

// LOGIN — explicitly prevent normal HTML form submission/reload.
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  e.stopPropagation();
  setMsg("loginError", "Signing in…");
  try {
    const email = $("email").value.trim();
    const password = $("password").value;
    if (!email || !password) throw new Error("Enter your email and password.");
    await signInWithEmailAndPassword(auth, email, password);
    setMsg("loginError", "Login successful. Loading your dashboard…", true);
  } catch (err) {
    console.error("LOGIN ERROR", err);
    setMsg("loginError", errorText(err, "Login failed."));
  }
  return false;
});

$("logoutBtn").addEventListener("click", () => signOut(auth));
$("newBtn").addEventListener("click", () => show("modal", true));
$("closeModal").addEventListener("click", () => show("modal", false));

$("photos").addEventListener("change", async e => {
  photoItems = [];
  $("photoList").innerHTML = "";
  for (const file of [...e.target.files]) {
    const src = await fileToDataURL(file);
    photoItems.push({ src, name: file.name, capturedAt: new Date().toISOString(), remark: "" });
  }
  renderPhotos();
});
function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function renderPhotos() {
  $("photoList").innerHTML = photoItems.map((p, i) => `
    <div class="photoCard">
      <div class="photoMeta"><b>LINE ${i + 1}</b><span>${new Date(p.capturedAt).toLocaleTimeString()}</span></div>
      <img src="${p.src}" alt="Loading photo ${i + 1}">
      <div class="field"><label>Remark (optional)</label><textarea data-remark="${i}" rows="2">${esc(p.remark)}</textarea></div>
    </div>`).join("");
  document.querySelectorAll("[data-remark]").forEach(el => el.oninput = () => photoItems[+el.dataset.remark].remark = el.value);
}

async function saveLoading(e, alsoDrive = false) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  $("saveMsg").textContent = "Saving record…";
  try {
    if (!currentUser) throw new Error("You are not signed in.");
    if (!photoItems.length) throw new Error("Please add at least one photo.");

    const loadingId = crypto.randomUUID();
    // Spark-safe design: photos stay in the browser for PDF creation.
    // Firestore stores only metadata/remarks, avoiding Firebase Storage billing.
    const photos = photoItems.map((p, i) => ({
      line: i + 1,
      name: p.name || "",
      remark: p.remark || "",
      capturedAt: p.capturedAt
    }));
    const record = {
      id: loadingId,
      userId: currentUser.uid,
      userEmail: currentUser.email,
      vehicleNumber: $("vehicle").value.trim(),
      brand: $("brand").value.trim(),
      date: $("loadDate").value,
      time: $("loadTime").value,
      overallRemarks: $("overallRemarks").value.trim(),
      photos,
      firstPhotoAt: photos[0]?.capturedAt || null,
      lastPhotoAt: photos.at(-1)?.capturedAt || null,
      createdAt: serverTimestamp()
    };

    if (!record.vehicleNumber || !record.brand) throw new Error("Vehicle Number and Brand are required.");
    await setDoc(doc(db, "loadings", loadingId), record);

    // Build/download PDF from the local photo data before closing the modal.
    await createIndividualPdf(record, photoItems);
    $("saveMsg").textContent = "Saved successfully. PDF download started.";
    await refresh();
    if (alsoDrive) {
      alert("Record saved. Google Drive upload remains available through the existing Drive flow, but this Spark-safe version does not use Firebase Storage.");
    }
    setTimeout(() => {
      show("modal", false);
      resetLoadingForm();
    }, 900);
  } catch (err) {
    console.error("SAVE ERROR", err);
    $("saveMsg").textContent = errorText(err, "Could not save record.");
  }
}
$("loadingForm").addEventListener("submit", e => saveLoading(e, false));
$("saveDriveBtn").addEventListener("click", () => saveLoading(null, true));

function resetLoadingForm() {
  $("loadingForm").reset();
  $("loadDate").value = isoDate(new Date());
  $("loadTime").value = new Date().toTimeString().slice(0, 5);
  photoItems = [];
  $("photoList").innerHTML = "";
  $("saveMsg").textContent = "";
}

async function getRecords() {
  const col = collection(db, "loadings");
  let q;
  if (isAdmin) q = query(col, orderBy("createdAt", "desc"), limit(500));
  else q = query(col, where("userId", "==", currentUser.uid), orderBy("createdAt", "desc"), limit(500));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function refresh() {
  try {
    cachedRecords = await getRecords();
    const ds = isoDate(new Date()), ms = ds.slice(0, 7);
    $("todayCount").textContent = cachedRecords.filter(r => r.date === ds).length;
    $("monthCount").textContent = cachedRecords.filter(r => r.date?.startsWith(ms)).length;
    $("totalCount").textContent = cachedRecords.length;
    $("records").innerHTML = cachedRecords.length ? cachedRecords.slice(0, 15).map(r => `
      <div class="record"><div><b>${esc(r.vehicleNumber)}</b> · ${esc(r.brand)}<br><small>${esc(r.date)} ${esc(r.time)} · ${esc(r.userEmail || "")}</small></div>
      <button class="btn ghost" data-pdf="${r.id}">PDF</button></div>`).join("") : '<div class="empty">No loading records yet.</div>';
    document.querySelectorAll("[data-pdf]").forEach(b => b.onclick = () => createIndividualPdf(cachedRecords.find(r => r.id === b.dataset.pdf)));
    if (isAdmin) await loadUsers();
  } catch (err) {
    console.error("REFRESH ERROR", err);
    $("records").innerHTML = `<div class="error">Could not load records: ${esc(errorText(err))}</div>`;
  }
}

function htmlEscapePdf(s) { return esc(s).replace(/\n/g, "<br>"); }
function makePdfHtml(title, subtitle, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#10253b}body:before{content:"";position:fixed;inset:0;background:url('${location.href.replace(/[^/]*$/, "")}rotech-watermark.png') center/420px no-repeat;opacity:.045;z-index:-1}.head{border-bottom:3px solid #1478e8;padding-bottom:12px}.head h1{margin:0;color:#0a3a66}.meta{color:#637487}.row{padding:9px 0;border-bottom:1px solid #dce6ef}.photo{page-break-before:always}.photo img{width:100%;max-height:245mm;object-fit:contain}.remark{background:#f2f7fc;padding:9px;border-radius:8px;margin-top:8px}</style></head><body><div class="head"><h1>${esc(title)}</h1><div class="meta">${esc(subtitle)}</div></div>${body}</body></html>`;
}
function printHtml(html) {
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups to download the PDF."); return; }
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => { w.print(); w.close(); }, 700);
}
function createIndividualPdf(r, localPhotos = null) {
  if (!r) return;
  let body = `<div class="row"><b>Vehicle:</b> ${esc(r.vehicleNumber)}</div><div class="row"><b>Brand:</b> ${esc(r.brand)}</div><div class="row"><b>Date:</b> ${esc(r.date)} &nbsp; <b>Time:</b> ${esc(r.time)}</div><div class="row"><b>Loading Start:</b> ${esc(r.firstPhotoAt || "")}<br><b>Loading End:</b> ${esc(r.lastPhotoAt || "")}</div>${r.overallRemarks ? `<div class="row"><b>Remarks:</b> ${htmlEscapePdf(r.overallRemarks)}</div>` : ""}`;
  if (localPhotos?.length) {
    for (const p of localPhotos) body += `<div class="photo"><h2>LINE ${p.line} · ${new Date(p.capturedAt).toLocaleString()}</h2><img src="${p.src}">${p.remark ? `<div class="remark"><b>Remark:</b> ${htmlEscapePdf(p.remark)}</div>` : ""}</div>`;
  } else {
    body += `<div class="row">Photo images are available only in the local PDF generated during the loading session. This cloud record stores the photo metadata and remarks.</div>`;
  }
  printHtml(makePdfHtml("VEHICLE LOADING", `${r.vehicleNumber} · ${r.date}`, body));
}
function filterByDate(date) { return cachedRecords.filter(r => r.date === date); }
function filterByMonth(month) { return cachedRecords.filter(r => r.date?.startsWith(month)); }
$("dayPdf").onclick = () => {
  const rs = filterByDate($("reportDate").value);
  if (!rs.length) return alert("No records for this date.");
  const rows = rs.map((r, i) => `<div class="row"><b>${i + 1}. ${esc(r.vehicleNumber)}</b> · ${esc(r.brand)} · ${esc(r.time)}<br>${esc(r.userEmail || "")}</div>`).join("");
  printHtml(makePdfHtml("VEHICLE LOADING — DAILY REPORT", $("reportDate").value, `<h2>Total Loadings: ${rs.length}</h2>${rows}`));
};
$("monthPdf").onclick = () => {
  const rs = filterByMonth($("reportMonth").value);
  if (!rs.length) return alert("No records for this month.");
  const rows = [...rs].sort((a,b) => (a.date + a.time).localeCompare(b.date + b.time)).map((r, i) => `<div class="row"><b>${i + 1}. ${esc(r.date)} ${esc(r.time)}</b> · ${esc(r.vehicleNumber)} · ${esc(r.brand)}<br>${esc(r.userEmail || "")}</div>`).join("");
  printHtml(makePdfHtml("VEHICLE LOADING — MONTHLY REPORT", $("reportMonth").value, `<h2>Total Loadings: ${rs.length}</h2>${rows}`));
};

async function loadUsers() {
  const snap = await getDocs(query(collection(db, "users"), limit(200)));
  $("usersList").innerHTML = snap.docs.map(d => {
    const u = d.data();
    return `<div class="record"><div><b>${esc(u.name || "Unnamed")}</b><br><small>${esc(u.email || d.id)}</small></div><span class="pill">${esc(u.role || "user")}</span></div>`;
  }).join("") || '<div class="empty">No user profiles.</div>';
}

// USER CREATION — keep the admin session on the primary Auth instance.
// Every network operation has a timeout so the UI can never remain stuck on
// “Creating user…” forever.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)} seconds. Check your internet connection and Firestore rules.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

$("createUserForm").addEventListener("submit", async e => {
  e.preventDefault();
  e.stopPropagation();
  try {
    if (!currentUser || !isAdmin) throw new Error("Only an administrator can create users.");
    const name = $("newName").value.trim();
    const email = $("newEmail").value.trim().toLowerCase();
    const pw = $("newPassword").value;
    if (!name || !email || pw.length < 6) throw new Error("Name, email and a password of at least 6 characters are required.");

    setMsg("userMsg", "Step 1/3 — Creating authentication account…");
    const secondaryName = "userCreator";
    const secondary = getApps().find(a => a.name === secondaryName) || initializeApp(firebaseConfig, secondaryName);
    const secondaryAuth = getAuth(secondary);
    let cred = null;
    try {
      cred = await withTimeout(
        createUserWithEmailAndPassword(secondaryAuth, email, pw),
        15000,
        "Authentication account creation"
      );

      setMsg("userMsg", "Step 2/3 — Creating Firestore user profile…");
      // Use the PRIMARY admin session for Firestore. The secondary Auth app is
      // only for creating the account, so the administrator stays signed in.
      const profileRef = doc(db, "users", cred.user.uid);
      await withTimeout(
        setDoc(profileRef, {
          uid: cred.user.uid,
          name,
          email,
          role: "user",
          createdAt: serverTimestamp()
        }),
        15000,
        "Firestore user profile creation"
      );

      setMsg("userMsg", "Step 3/3 — Verifying user profile…");
      const verify = await withTimeout(getDoc(profileRef), 15000, "Firestore user profile verification");
      if (!verify.exists()) throw new Error("Authentication account was created, but the Firestore user profile could not be verified.");
    } finally {
      // Never let cleanup hide the real error.
      await signOut(secondaryAuth).catch(() => {});
    }

    $("createUserForm").reset();
    setMsg("userMsg", `User created successfully: ${email}`, true);
    await loadUsers();
  } catch (err) {
    console.error("CREATE USER ERROR", err);
    setMsg("userMsg", errorText(err, "Could not create user."));
  }
  return false;
});

onAuthStateChanged(auth, async user => {
  try {
    if (!user) {
      currentUser = null;
      isAdmin = false;
      show("loginView", true);
      show("appView", false);
      return;
    }
    currentUser = user;
    isAdmin = await getRole(user) === "admin";
    $("roleBadge").textContent = isAdmin ? "ADMIN" : "USER";
    $("userEmail").textContent = user.email || "";
    $("userRole").textContent = isAdmin ? "Administrator — all company records" : "User — own records only";
    show("loginView", false);
    show("appView", true);
    show("adminPanel", isAdmin);
    await refresh();
  } catch (err) {
    console.error("AUTH STATE ERROR", err);
    show("loginView", true);
    show("appView", false);
    setMsg("loginError", `Account loaded but dashboard setup failed: ${errorText(err)}`);
  }
});

// Remove older service workers once, then register the network-first V4 worker.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) await reg.unregister();
      await navigator.serviceWorker.register("./sw.js?v=6", { updateViaCache: "none" });
    } catch (err) { console.warn("Service worker update skipped", err); }
  });
}

console.info(`[Vehicle Loading ${BUILD}] Firebase project: ${firebaseConfig.projectId}`);
