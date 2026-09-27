import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, updateProfile, getIdTokenResult } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, limit, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const ADMIN_EMAIL = "vivekdevmurari517@gmail.com";

const $ = id => document.getElementById(id);
const today = new Date();
const isoDate = d => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
$("reportDate").value = isoDate(today);
$("reportMonth").value = isoDate(today).slice(0,7);
$("loadDate").value = isoDate(today);
$("loadTime").value = new Date().toTimeString().slice(0,5);

let currentUser = null, isAdmin = false, photoItems = [], cachedRecords = [];

function show(id, on=true){$(id).classList.toggle("hidden", !on)}
function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

async function getRole(user){
  if(user.email?.toLowerCase()===ADMIN_EMAIL.toLowerCase()) return "admin";
  const snap = await getDoc(doc(db,"users",user.uid));
  return snap.exists() && snap.data().role==="admin" ? "admin" : "user";
}

$("loginForm").addEventListener("submit", async e=>{
  e.preventDefault(); $("loginError").textContent="";
  try{ await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value); }
  catch(err){ console.error(err); $("loginError").textContent = err.code ? `Login failed: ${err.code}` : "Login failed."; }
});
$("logoutBtn").onclick=()=>signOut(auth);
$("newBtn").onclick=()=>show("modal",true);
$("closeModal").onclick=()=>show("modal",false);
$("photos").addEventListener("change", async e=>{
  photoItems=[]; $("photoList").innerHTML="";
  for(const file of [...e.target.files]){
    const src=await fileToDataURL(file);
    photoItems.push({src,name:file.name,capturedAt:new Date().toISOString(),remark:""});
  }
  renderPhotos();
});
function fileToDataURL(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
function renderPhotos(){
  $("photoList").innerHTML=photoItems.map((p,i)=>`<div class="photoCard"><div class="photoMeta"><b>LINE ${i+1}</b><span>${new Date(p.capturedAt).toLocaleTimeString()}</span></div><img src="${p.src}"><div class="field"><label>Remark (optional)</label><textarea data-remark="${i}" rows="2">${esc(p.remark)}</textarea></div></div>`).join("");
  document.querySelectorAll("[data-remark]").forEach(el=>el.oninput=()=>photoItems[+el.dataset.remark].remark=el.value);
}

async function uploadPhotos(loadingId){
  const urls=[];
  for(let i=0;i<photoItems.length;i++){
    const blob = dataURLtoBlob(photoItems[i].src);
    const path=`loadingPhotos/${currentUser.uid}/${loadingId}/line-${String(i+1).padStart(3,"0")}.jpg`;
    const storageRef=ref(storage,path);
    await uploadBytes(storageRef,blob,{contentType:"image/jpeg"});
    urls.push({url:await getDownloadURL(storageRef),line:i+1,remark:photoItems[i].remark||"",capturedAt:photoItems[i].capturedAt});
  }
  return urls;
}
function dataURLtoBlob(data){const [meta,b64]=data.split(",");const mime=(meta.match(/:(.*?);/)||[])[1]||"image/jpeg";const bin=atob(b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime})}

async function saveLoading(e, alsoDrive=false){
  if(e) e.preventDefault();
  $("saveMsg").textContent="Saving to secure cloud storage…";
  try{
    if(!photoItems.length) throw new Error("Please add at least one photo.");
    const loadingId=crypto.randomUUID();
    const photos=await uploadPhotos(loadingId);
    const firstPhotoAt=photos[0]?.capturedAt||null, lastPhotoAt=photos.at(-1)?.capturedAt||null;
    const record={id:loadingId,userId:currentUser.uid,userEmail:currentUser.email,vehicleNumber:$("vehicle").value.trim(),brand:$("brand").value.trim(),date:$("loadDate").value,time:$("loadTime").value,overallRemarks:$("overallRemarks").value.trim(),photos,firstPhotoAt,lastPhotoAt,createdAt:serverTimestamp()};
    await setDoc(doc(db,"loadings",loadingId),record);
    $("saveMsg").textContent="Saved successfully.";
    await refresh();
    await createIndividualPdf(record);
    if(alsoDrive) alert("Record saved. The Drive upload can be connected to your existing Google Drive OAuth flow next.");
    setTimeout(()=>show("modal",false),700);
  }catch(err){console.error(err);$("saveMsg").textContent=err.message||"Could not save record."}
}
$("loadingForm").addEventListener("submit",e=>saveLoading(e,false));
$("saveDriveBtn").onclick=()=>saveLoading(null,true);

async function getRecords(){
  const col=collection(db,"loadings");
  let q;
  if(isAdmin) q=query(col,orderBy("createdAt","desc"),limit(500));
  else q=query(col,where("userId","==",currentUser.uid),orderBy("createdAt","desc"),limit(500));
  const snap=await getDocs(q); return snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function refresh(){
  cachedRecords=await getRecords();
  const ds=isoDate(new Date()), ms=ds.slice(0,7);
  $("todayCount").textContent=cachedRecords.filter(r=>r.date===ds).length;
  $("monthCount").textContent=cachedRecords.filter(r=>r.date?.startsWith(ms)).length;
  $("totalCount").textContent=cachedRecords.length;
  $("records").innerHTML=cachedRecords.length?cachedRecords.slice(0,15).map(r=>`<div class="record"><div><b>${esc(r.vehicleNumber)}</b> · ${esc(r.brand)}<br><small>${esc(r.date)} ${esc(r.time)} · ${esc(r.userEmail||"")}</small></div><button class="btn ghost" data-pdf="${r.id}">PDF</button></div>`).join(""):'<div class="empty">No loading records yet.</div>';
  document.querySelectorAll("[data-pdf]").forEach(b=>b.onclick=()=>createIndividualPdf(cachedRecords.find(r=>r.id===b.dataset.pdf)));
  if(isAdmin) await loadUsers();
}

function htmlEscapePdf(s){return esc(s).replace(/
/g,"<br>")}
function makePdfHtml(title,subtitle,body){
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#10253b}body:before{content:"";position:fixed;inset:0;background:url('${location.href.replace(/[^/]*$/,"")}rotech-watermark.png') center/420px no-repeat;opacity:.045;z-index:-1}.head{border-bottom:3px solid #1478e8;padding-bottom:12px}.head h1{margin:0;color:#0a3a66}.meta{color:#637487}.row{padding:9px 0;border-bottom:1px solid #dce6ef}.photo{page-break-before:always}.photo img{width:100%;max-height:245mm;object-fit:contain}.remark{background:#f2f7fc;padding:9px;border-radius:8px;margin-top:8px}</style></head><body><div class="head"><h1>${esc(title)}</h1><div class="meta">${esc(subtitle)}</div></div>${body}</body></html>`;
}
function printHtml(html,filename){
  const w=window.open("","_blank"); if(!w){alert("Please allow pop-ups to download the PDF.");return}
  w.document.write(html);w.document.close();w.focus();setTimeout(()=>{w.print();w.close()},700);
}
async function createIndividualPdf(r){
  if(!r)return;
  let body=`<div class="row"><b>Vehicle:</b> ${esc(r.vehicleNumber)}</div><div class="row"><b>Brand:</b> ${esc(r.brand)}</div><div class="row"><b>Date:</b> ${esc(r.date)} &nbsp; <b>Time:</b> ${esc(r.time)}</div><div class="row"><b>Loading Start:</b> ${esc(r.firstPhotoAt||"")}<br><b>Loading End:</b> ${esc(r.lastPhotoAt||"")}</div>${r.overallRemarks?`<div class="row"><b>Remarks:</b> ${htmlEscapePdf(r.overallRemarks)}</div>`:""}`;
  for(const p of (r.photos||[])) body+=`<div class="photo"><h2>LINE ${p.line} · ${new Date(p.capturedAt).toLocaleString()}</h2><img src="${esc(p.url)}">${p.remark?`<div class="remark"><b>Remark:</b> ${htmlEscapePdf(p.remark)}</div>`:""}</div>`;
  printHtml(makePdfHtml("VEHICLE LOADING",`${r.vehicleNumber} · ${r.date}`,body),`Vehicle-${r.vehicleNumber}.pdf`);
}
function filterByDate(date){return cachedRecords.filter(r=>r.date===date)}
function filterByMonth(month){return cachedRecords.filter(r=>r.date?.startsWith(month))}
$("dayPdf").onclick=()=>{const rs=filterByDate($("reportDate").value);if(!rs.length)return alert("No records for this date.");const rows=rs.map((r,i)=>`<div class="row"><b>${i+1}. ${esc(r.vehicleNumber)}</b> · ${esc(r.brand)} · ${esc(r.time)}<br>${esc(r.userEmail||"")}</div>`).join("");printHtml(makePdfHtml("VEHICLE LOADING — DAILY REPORT",$("reportDate").value,`<h2>Total Loadings: ${rs.length}</h2>${rows}`),`Daily-${$("reportDate").value}.pdf`)};
$("monthPdf").onclick=()=>{const rs=filterByMonth($("reportMonth").value);if(!rs.length)return alert("No records for this month.");const rows=rs.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).map((r,i)=>`<div class="row"><b>${i+1}. ${esc(r.date)} ${esc(r.time)}</b> · ${esc(r.vehicleNumber)} · ${esc(r.brand)}<br>${esc(r.userEmail||"")}</div>`).join("");printHtml(makePdfHtml("VEHICLE LOADING — MONTHLY REPORT",$("reportMonth").value,`<h2>Total Loadings: ${rs.length}</h2>${rows}`),`Monthly-${$("reportMonth").value}.pdf`)};

async function loadUsers(){
  const snap=await getDocs(query(collection(db,"users"),limit(200)));
  $("usersList").innerHTML=snap.docs.map(d=>{const u=d.data();return `<div class="record"><div><b>${esc(u.name||"Unnamed")}</b><br><small>${esc(u.email||d.id)}</small></div><span class="pill">${esc(u.role||"user")}</span></div>`}).join("")||'<div class="empty">No user profiles.</div>';
}
$("createUserBtn").onclick=async()=>{
  $("userMsg").textContent="Creating…";
  try{
    const name=$("newName").value.trim(),email=$("newEmail").value.trim(),pw=$("newPassword").value;
    if(!name||!email||pw.length<6)throw new Error("Name, email and a password of at least 6 characters are required.");
    const secondaryName="userCreator";
    const secondary=getApps().find(a=>a.name===secondaryName)||initializeApp(firebaseConfig,secondaryName);
    const secondaryAuth=getAuth(secondary);
    const cred=await createUserWithEmailAndPassword(secondaryAuth,email,pw);
    await updateProfile(cred.user,{displayName:name});
    await setDoc(doc(db,"users",cred.user.uid),{uid:cred.user.uid,name,email,role:"user",createdAt:serverTimestamp()});
    await signOut(secondaryAuth);
    $("userMsg").textContent="User created successfully."; $("newName").value=$("newEmail").value=$("newPassword").value="";
    await loadUsers();
  }catch(err){console.error(err);$("userMsg").textContent=err.message||"Could not create user."}
};

onAuthStateChanged(auth,async user=>{
  if(!user){currentUser=null;show("loginView",true);show("appView",false);return}
  currentUser=user; isAdmin=await getRole(user)==="admin";
  $("roleBadge").textContent=isAdmin?"ADMIN":"USER";$("userEmail").textContent=user.email;$("userRole").textContent=isAdmin?"Administrator — all company records":"User — own records only";
  show("loginView",false);show("appView",true);show("adminPanel",isAdmin);
  await refresh();
});
