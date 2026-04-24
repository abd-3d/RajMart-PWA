// ============================================================
//  RajMart – Amul Milk Manager  |  app.js
//  v4 – Time-aware ledger, Payment slots, Special morning/evening
// ============================================================

// ==========================================================
//  SUPPLIERS
// ==========================================================
const SUPPLIERS = [
  { id: 'ajay',    name: 'Ajaybhai',   priceType: 'morning', color: '#b7950b', bg: '#fff8e1' },
  { id: 'gaffar',  name: 'Gaffarbhai', priceType: 'morning', color: '#2471a3', bg: '#eaf2f8' },
  { id: 'mukesh',  name: 'Mukeshbhai', priceType: 'evening', color: '#1e8449', bg: '#eafaf1' },
];

function getSupplier(id) { return SUPPLIERS.find(s => s.id === id); }

// ==========================================================
//  DEFAULT PRODUCTS
// ==========================================================
const DEFAULT_PRODUCTS = [
  { id:'r1',  name:'Gold 500ml',         price:33.25,  eveningPrice:33.375, crateQty:24,  category:'regular', packType:'Crate', defaultUnit:'pack' },
  { id:'r2',  name:'Nani Taaza 500ml',   price:27.25,  eveningPrice:27.375, crateQty:24,  category:'regular', packType:'Crate', defaultUnit:'pack' },
  { id:'r3',  name:'Moti Taaza 1L',      price:53.5,   eveningPrice:53.75,  crateQty:12,  category:'regular', packType:'Crate', defaultUnit:'pack' },
  { id:'r4',  name:'Tea Special',        price:61.5,   eveningPrice:61.75,  crateQty:12,  category:'regular', packType:'Crate', defaultUnit:'pack' },
  { id:'r5',  name:'Moti Chaas',         price:19,     eveningPrice:19.375, crateQty:16,  category:'regular', packType:'Crate', defaultUnit:'pack' },
  { id:'r6',  name:'Nani Chaas',         price:14.3,   eveningPrice:null,   crateQty:30,  category:'regular', packType:'Crate', defaultUnit:'pack' },
  { id:'r7',  name:'10rs Dahi Cup',      price:9,      eveningPrice:null,   crateQty:48,  category:'regular', packType:'Box',   defaultUnit:'pack' },
  { id:'r8',  name:'24rs Dahi Cup',      price:21.667, eveningPrice:null,   crateQty:24,  category:'regular', packType:'Box',   defaultUnit:'pack' },
  { id:'r9',  name:'400gm Dahi',         price:32.5,   eveningPrice:33,     crateQty:null,category:'regular', packType:null,    defaultUnit:'pc' },
  { id:'r10', name:'800gm Dahi',         price:47,     eveningPrice:48,     crateQty:null,category:'regular', packType:null,    defaultUnit:'pc' },
  { id:'r11', name:'1kg Dahi',           price:73,     eveningPrice:74,     crateQty:null,category:'regular', packType:null,    defaultUnit:'pc' },
  { id:'s1',  name:'Amul Masti Dahi 5kg',price:685,    eveningPrice:null,   crateQty:2,   category:'special', packType:'Crate', defaultUnit:'pack' },
  { id:'s2',  name:'Amul Gold 6L',       price:745,    eveningPrice:null,   crateQty:2,   category:'special', packType:'Crate', defaultUnit:'pack' },
];

const INITIAL_DB = {
  version: 4,
  products: JSON.parse(JSON.stringify(DEFAULT_PRODUCTS)),
  orders: [],
  payments: []
};

// ==========================================================
//  STATE
// ==========================================================
let DB = JSON.parse(JSON.stringify(INITIAL_DB));
let activePage = 'dashboard';
let orderType = 'morning';
let orderSupplier = 'ajay';
let specialSlot = 'morning'; // for new special orders
let pendingDelete = null;
let currentLedgerFilter = 'all';
let currentLedgerSupplier = 'all';
let orderItems = {};
let editingOrderId = null;
let editOrderItems = {};
let editOrderType = 'morning';
let editOrderSupplier = 'ajay';
let editSpecialSlot = 'morning';
let editingPaymentId = null;

// ==========================================================
//  LOCAL STORAGE
// ==========================================================
const STORAGE_KEY = 'amul_daily';

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { return; }
    const loaded = JSON.parse(raw);
    if (!loaded.products) loaded.products = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
    if (!loaded.orders)   loaded.orders   = [];
    if (!loaded.payments) loaded.payments = [];
    DB = loaded;
    showPage(activePage);
    toast('✅ Data loaded from device.', 'success');
  } catch(e) {
    toast('Error loading saved data: ' + e.message, 'error');
  }
}

function saveToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
    flashSaveIndicator();
    scheduleDriveUpload();
  } catch(e) {
    toast('❌ Save failed: ' + e.message, 'error');
  }
}

function flashSaveIndicator() {
  const el = document.getElementById('saveIndicator');
  if (!el) return;
  el.textContent = '✅ Saved';
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

function saveToServer() { saveToLocalStorage(); }
function updateServerIndicator() {
  const el = document.getElementById('serverIndicator');
  if (el) el.style.display = 'none';
}

// ==========================================================
//  GOOGLE DRIVE SYNC
// ==========================================================
const DRIVE_FILE_NAME   = 'amul_daily.json';
const DRIVE_FOLDER_NAME = 'RajMart';
const DRIVE_SCOPE       = 'https://www.googleapis.com/auth/drive.file';

let DRIVE_CLIENT_ID = localStorage.getItem('rajmart_drive_client_id') || '';
let _driveToken      = null;
let _driveFolderId   = null;
let _driveFileId     = null;
let _driveSaveTimer  = null;
let _gapiReady       = false;

function onGapiLoad() {
  gapi.load('client', async () => {
    try {
      await gapi.client.init({});
      await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
      _gapiReady = true;
    } catch(e) { console.warn('[Drive] gapi init failed:', e); }
  });
}

function driveSignIn() {
  if (!DRIVE_CLIENT_ID) { toast('⚠️ Paste your Google Client ID first — see Export page.', 'error'); showPage('export'); return; }
  if (!window.google || !window.google.accounts) { toast('⚠️ Google script not loaded. Check internet connection.', 'error'); return; }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE_CLIENT_ID, scope: DRIVE_SCOPE,
    callback: async (resp) => {
      if (resp.error) { toast('❌ Drive sign-in failed: ' + resp.error, 'error'); return; }
      _driveToken = resp.access_token;
      gapi.client.setToken({ access_token: _driveToken });
      updateDriveUI(true);
      toast('✅ Connected to Google Drive!', 'success');
      await driveFindOrCreateFolder();
      await driveFindFile();
      updateDriveStatus(_driveFileId ? 'File found in Drive. Ready to sync.' : 'No backup in Drive yet — will create on first save.');
    }
  });
  client.requestAccessToken();
}

function driveSignOut() {
  if (_driveToken && window.google) { google.accounts.oauth2.revoke(_driveToken, () => {}); }
  _driveToken = null; _driveFolderId = null; _driveFileId = null;
  clearTimeout(_driveSaveTimer);
  updateDriveUI(false);
  toast('Disconnected from Google Drive.', 'info');
}

function saveDriveClientId() {
  const val = (document.getElementById('driveClientIdInput').value || '').trim();
  if (!val) { toast('Paste a Client ID first.', 'error'); return; }
  DRIVE_CLIENT_ID = val;
  localStorage.setItem('rajmart_drive_client_id', val);
  toast('✅ Client ID saved!', 'success');
  updateDriveUI(false);
}

function updateDriveUI(connected) {
  const topBtn = document.getElementById('driveTopBtn');
  if (topBtn) {
    topBtn.textContent = connected ? '☁️✅' : '☁️';
    topBtn.style.background  = connected ? 'rgba(30,132,73,0.3)' : 'rgba(255,255,255,0.15)';
    topBtn.style.borderColor = connected ? 'rgba(30,132,73,0.7)' : 'rgba(255,255,255,0.3)';
  }
  ['driveUploadBtn','driveDownloadBtn'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !connected; });
  const signInBtn  = document.getElementById('driveSignInBtn');
  const signOutBtn = document.getElementById('driveSignOutBtn');
  if (signInBtn)  signInBtn.style.display  = connected ? 'none' : 'inline-flex';
  if (signOutBtn) signOutBtn.style.display = connected ? 'inline-flex' : 'none';
  const inp = document.getElementById('driveClientIdInput');
  if (inp && DRIVE_CLIENT_ID && !inp.value) inp.value = DRIVE_CLIENT_ID;
}

function updateDriveStatus(msg) { const el = document.getElementById('driveStatusText'); if (el) el.textContent = msg; }
function updateDriveLastSync() {
  const el = document.getElementById('driveLastSync');
  if (el) el.textContent = 'Last synced: ' + new Date().toLocaleTimeString('en-IN');
  updateDriveStatus('Synced ✅');
}

async function driveFindOrCreateFolder() {
  if (!_driveToken) return;
  try {
    const res = await gapi.client.drive.files.list({ q: `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id,name)', spaces: 'drive' });
    if (res.result.files.length > 0) { _driveFolderId = res.result.files[0].id; }
    else {
      const folder = await gapi.client.drive.files.create({ resource: { name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
      _driveFolderId = folder.result.id;
      toast('📁 Created "RajMart" folder in Google Drive.', 'info');
    }
  } catch(e) { console.error('[Drive] Folder error:', e); updateDriveStatus('Folder error: ' + e.message); }
}

async function driveFindFile() {
  if (!_driveToken || !_driveFolderId) return;
  try {
    const res = await gapi.client.drive.files.list({ q: `name='${DRIVE_FILE_NAME}' and '${_driveFolderId}' in parents and trashed=false`, fields: 'files(id,name,modifiedTime)', spaces: 'drive' });
    if (res.result.files.length > 0) { _driveFileId = res.result.files[0].id; }
  } catch(e) { console.error('[Drive] File search error:', e); }
}

async function driveUpload(silent = false) {
  if (!_driveToken) { if (!silent) toast('⚠️ Connect to Google Drive first.', 'error'); return; }
  if (!_driveFolderId) await driveFindOrCreateFolder();
  const content  = JSON.stringify(DB, null, 2);
  const metadata = { name: DRIVE_FILE_NAME, mimeType: 'application/json' };
  if (!_driveFileId) metadata.parents = [_driveFolderId];
  const boundary = 'rajmart_multipart';
  const body = [`--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(metadata), `--${boundary}`, 'Content-Type: application/json', '', content, `--${boundary}--`].join('\r\n');
  const method = _driveFileId ? 'PATCH' : 'POST';
  const url = _driveFileId ? `https://www.googleapis.com/upload/drive/v3/files/${_driveFileId}?uploadType=multipart` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  try {
    if (!silent) updateDriveStatus('Uploading…');
    const res = await fetch(url, { method, headers: { 'Authorization': 'Bearer ' + _driveToken, 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || 'Upload failed'); }
    const data = await res.json();
    _driveFileId = data.id;
    if (!silent) toast('☁️ Saved to Google Drive!', 'success');
    updateDriveLastSync();
  } catch(e) {
    if (!silent) toast('❌ Drive upload failed: ' + e.message, 'error');
    updateDriveStatus('Upload failed: ' + e.message);
  }
}

async function driveDownload() {
  if (!_driveToken) { toast('⚠️ Connect to Google Drive first.', 'error'); return; }
  if (!_driveFolderId) await driveFindOrCreateFolder();
  if (!_driveFileId)   await driveFindFile();
  if (!_driveFileId)   { toast('No backup found in Drive yet.', 'info'); return; }
  try {
    updateDriveStatus('Downloading…');
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${_driveFileId}?alt=media`, { headers: { 'Authorization': 'Bearer ' + _driveToken } });
    if (!res.ok) throw new Error('Download request failed');
    const loaded = await res.json();
    if (!loaded.products) loaded.products = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
    if (!loaded.orders)   loaded.orders   = [];
    if (!loaded.payments) loaded.payments = [];
    DB = loaded;
    persistDB();
    showPage(activePage);
    toast('✅ Data restored from Google Drive!', 'success');
    updateDriveLastSync();
  } catch(e) { toast('❌ Drive download failed: ' + e.message, 'error'); updateDriveStatus('Download failed: ' + e.message); }
}

function scheduleDriveUpload() {
  if (!_driveToken) return;
  clearTimeout(_driveSaveTimer);
  _driveSaveTimer = setTimeout(() => driveUpload(true), 8000);
}

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveToServer(); }
});

// ==========================================================
//  FILE OPERATIONS
// ==========================================================
function triggerLoadFile() { document.getElementById('jsonFileInput').click(); }

function handleFileLoad(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const loaded = JSON.parse(e.target.result);
      if (!loaded.products) loaded.products = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
      if (!loaded.orders)   loaded.orders   = [];
      if (!loaded.payments) loaded.payments = [];
      DB = loaded;
      persistDB();
      toast('✅ Data imported from: ' + file.name, 'success');
      showPage(activePage);
    } catch(err) { toast('Error reading file: ' + err.message, 'error'); }
  };
  reader.readAsText(file);
  input.value = '';
}

function saveDataFile() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'amul_daily_backup_' + todayStr() + '.json';
  a.click();
  toast('📤 Backup JSON downloaded!', 'success');
}

function persistDB() { saveToLocalStorage(); }

// ==========================================================
//  NAVIGATION
// ==========================================================
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.topbar-nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  const nb = document.getElementById('nav-' + page);
  if (nb) nb.classList.add('active');
  activePage = page;
  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileMenu) mobileMenu.classList.remove('open');
  if (page === 'dashboard') renderDashboard();
  else if (page === 'order') initOrderPage();
  else if (page === 'ledger') renderLedger();
  else if (page === 'payments') renderPaymentsPage();
  else if (page === 'products') renderProductsPage();
  else if (page === 'analytics') renderAnalytics();
  else if (page === 'export') initExportPage();
}

// ==========================================================
//  UTILITIES
// ==========================================================
function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2,5); }
function todayStr() { return new Date().toISOString().split('T')[0]; }
function fmt(n) { return (Math.round(n*100)/100).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' });
}
function fmtDateLong(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });
}
function getProduct(id) { return DB.products.find(p => p.id === id); }

function getEffectivePriceForSupplier(p, supplierId) {
  const sup = getSupplier(supplierId);
  if (sup && sup.priceType === 'evening' && p.eveningPrice != null) return p.eveningPrice;
  return p.price;
}
function getEffectivePrice(p, type) {
  if (type === 'evening' && p.eveningPrice != null) return p.eveningPrice;
  return p.price;
}
function calcOrderTotal(order) { return order.items.reduce((s, it) => s + it.amount, 0); }
function calcBalance(supplierId) {
  const orders = supplierId ? DB.orders.filter(o => o.supplier === supplierId) : DB.orders;
  const payments = supplierId ? DB.payments.filter(p => p.supplier === supplierId) : DB.payments;
  return orders.reduce((s, o) => s + calcOrderTotal(o), 0) - payments.reduce((s, p) => s + p.amount, 0);
}
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  t.innerHTML = `<span>${icons[type]||''}</span> ${msg}`;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function supplierBadge(supplierId) {
  const sup = getSupplier(supplierId);
  if (!sup) return '';
  return `<span class="sup-badge" style="background:${sup.bg};color:${sup.color};">👤 ${sup.name}</span>`;
}

// ==========================================================
//  TIME-AWARE LEDGER SORT KEY
//  Order within same date:
//  0 = morning order
//  1 = payment (morning slot)
//  2 = evening order
//  3 = payment (evening slot)
//  4 = special-morning order
//  5 = special-evening order
// ==========================================================
function rowSortKey(r) {
  if (r.type === 'morning') return 0;
  if (r.type === 'payment' && (r.timeSlot === 'morning' || !r.timeSlot)) return 1;
  if (r.type === 'evening') return 2;
  if (r.type === 'payment' && r.timeSlot === 'evening') return 3;
  if (r.type === 'special' && (r.specialSlot === 'morning' || !r.specialSlot)) return 4;
  if (r.type === 'special' && r.specialSlot === 'evening') return 5;
  return 6;
}

// Helper: icon for a row in ledger
function rowIcon(r) {
  if (r.type === 'morning') return '🌅';
  if (r.type === 'evening') return '🌆';
  if (r.type === 'payment') return r.timeSlot === 'evening' ? '💳🌆' : '💳🌅';
  if (r.type === 'special') return r.specialSlot === 'evening' ? '🌆⭐' : '🌅⭐';
  return '📋';
}

// Helper: badge css class for a row
function rowBadgeClass(r) {
  if (r.type === 'morning') return 'badge-morning';
  if (r.type === 'evening') return 'badge-evening';
  if (r.type === 'payment') return 'badge-payment';
  if (r.type === 'special') return r.specialSlot === 'evening' ? 'badge-special-eve' : 'badge-special';
  return '';
}

// ==========================================================
//  SLOT TOGGLE HELPERS
// ==========================================================
function setSpecialSlot(slot) {
  specialSlot = slot;
  const mBtn = document.getElementById('specialSlotMorning');
  const eBtn = document.getElementById('specialSlotEvening');
  if (mBtn) mBtn.className = slot === 'morning' ? 'active morning' : '';
  if (eBtn) eBtn.className = slot === 'evening' ? 'active evening' : '';
  const sel = document.getElementById('specialSlotSelect');
  if (sel) sel.value = slot;
}

function setEditSpecialSlot(slot) {
  editSpecialSlot = slot;
  const mBtn = document.getElementById('editSpecialSlotMorning');
  const eBtn = document.getElementById('editSpecialSlotEvening');
  if (mBtn) mBtn.className = slot === 'morning' ? 'active morning' : '';
  if (eBtn) eBtn.className = slot === 'evening' ? 'active evening' : '';
  const sel = document.getElementById('editSpecialSlotSelect');
  if (sel) sel.value = slot;
}

function setPayModalSlot(slot) {
  const inp = document.getElementById('payModalSlot');
  if (inp) inp.value = slot;
  const mBtn = document.getElementById('payModalSlotMorning');
  const eBtn = document.getElementById('payModalSlotEvening');
  if (mBtn) mBtn.className = slot === 'morning' ? 'active morning' : '';
  if (eBtn) eBtn.className = slot === 'evening' ? 'active evening' : '';
}

// ==========================================================
//  DASHBOARD
// ==========================================================
function renderDashboard() {
  const today = todayStr();
  document.getElementById('dashDate').textContent = fmtDateLong(today);
  const todayOrders = DB.orders.filter(o => o.date === today);
  const todayTotal = todayOrders.reduce((s, o) => s + calcOrderTotal(o), 0);
  const thisMonth = today.substr(0, 7);
  const monthOrders = DB.orders.filter(o => o.date && o.date.startsWith(thisMonth));
  const monthTotal = monthOrders.reduce((s, o) => s + calcOrderTotal(o), 0);
  const totalOrders = DB.orders.reduce((s, o) => s + calcOrderTotal(o), 0);
  const totalPayments = DB.payments.reduce((s, p) => s + p.amount, 0);
  const balance = totalOrders - totalPayments;
  const thisMonthPayments = DB.payments.filter(p => p.date && p.date.startsWith(thisMonth));
  const monthPayTotal = thisMonthPayments.reduce((s, p) => s + p.amount, 0);

  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon red">📋</div>
      <div><div class="stat-label">Today's Orders</div><div class="stat-value red">₹${fmt(todayTotal)}</div><div class="stat-sub">${todayOrders.length} order(s)</div></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon blue">📅</div>
      <div><div class="stat-label">This Month</div><div class="stat-value blue">₹${fmt(monthTotal)}</div><div class="stat-sub">${monthOrders.length} order(s)</div></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green">💳</div>
      <div><div class="stat-label">Month Payments</div><div class="stat-value green">₹${fmt(monthPayTotal)}</div><div class="stat-sub">${thisMonthPayments.length} payment(s)</div></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon orange">⚖️</div>
      <div><div class="stat-label">Outstanding</div><div class="stat-value orange">₹${fmt(balance)}</div><div class="stat-sub">All suppliers</div></div>
    </div>`;

  let supBalHtml = SUPPLIERS.map(sup => {
    const bal = calcBalance(sup.id);
    return `<div class="sup-bal-card" style="background:${sup.bg};">
      <div class="sup-bal-name" style="color:${sup.color};">${sup.name}</div>
      <div class="sup-bal-amount" style="color:${sup.color};">₹${fmt(bal)}</div>
    </div>`;
  }).join('');
  document.getElementById('dashSupplierBalances').innerHTML = `<div class="sup-bal-row">${supBalHtml}</div>`;

  const recent = [...DB.orders].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 10);
  if (recent.length === 0) {
    document.getElementById('dashRecentOrders').innerHTML = '<div class="empty-state"><div class="icon">📋</div><div class="text">No orders yet. Click New Order to start.</div></div>';
  } else {
    document.getElementById('dashRecentOrders').innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Slot</th><th>Supplier</th><th class="right">Total (₹)</th></tr></thead>
          <tbody>${recent.map(o => {
            const sup = getSupplier(o.supplier);
            const slotLabel = o.type==='morning'?'🌅 Morn':o.type==='evening'?'🌆 Eve':(o.specialSlot==='evening'?'🌆⭐ Spl':'🌅⭐ Spl');
            return `<tr style="cursor:pointer;" onclick="showOrderDetail('${o.id}')">
              <td>${fmtDate(o.date)}</td>
              <td><span class="type-badge badge-${o.type}">${slotLabel}</span></td>
              <td style="font-size:11px;font-weight:600;color:${sup?sup.color:'var(--text-muted)'};">${sup?sup.name:'—'}</td>
              <td class="right mono" style="font-weight:700;">₹${fmt(calcOrderTotal(o))}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }

  const pct = totalOrders > 0 ? Math.round((totalPayments/totalOrders)*100) : 0;
  document.getElementById('dashBalance').innerHTML = `
    <div class="balance-grid">
      <div class="balance-box red-box"><div class="balance-label">Total Orders</div><div class="balance-amount" style="color:var(--red);">₹${fmt(totalOrders)}</div></div>
      <div class="balance-box green-box"><div class="balance-label">Total Paid</div><div class="balance-amount" style="color:var(--green);">₹${fmt(totalPayments)}</div></div>
      <div class="balance-box orange-box"><div class="balance-label">Remaining</div><div class="balance-amount" style="color:var(--orange);">₹${fmt(balance)}</div></div>
    </div>
    <div style="background:var(--light-gray);border-radius:6px;overflow:hidden;height:10px;margin:12px 0 6px;">
      <div style="height:100%;background:var(--green);border-radius:6px;width:${pct}%;transition:width 0.5s;"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);">
      <span>Paid (${pct}%)</span><span>Remaining (${100-pct}%)</span>
    </div>
    <div style="margin-top:12px;">
      <button class="btn btn-success btn-sm" onclick="openPaymentFromLedger()">+ Record Payment</button>
    </div>`;

  const monthDays = {};
  monthOrders.forEach(o => { monthDays[o.date] = (monthDays[o.date] || 0) + calcOrderTotal(o); });
  const days = Object.keys(monthDays).sort();
  document.getElementById('dashMonthlySummary').innerHTML = `
    <div class="month-summary-row">
      <div><div class="month-label">Active days</div><div class="month-val">${days.length}</div></div>
      <div><div class="month-label">Daily avg</div><div class="month-val" style="color:var(--red);">₹${fmt(days.length ? monthTotal/days.length : 0)}</div></div>
      <div><div class="month-label">Payments</div><div class="month-val" style="color:var(--green);">₹${fmt(monthPayTotal)}</div></div>
    </div>
    ${days.length===0?'<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:8px;">No orders this month.</div>':''}`;
}

// ==========================================================
//  ORDER PAGE
// ==========================================================
function initOrderPage() {
  const dateEl = document.getElementById('orderDate');
  if (!dateEl.value) dateEl.value = todayStr();
  document.getElementById('todayDate').textContent = fmtDateLong(todayStr());
  setOrderType(orderType);
  renderTodaysOrders();
}

function setOrderType(type) {
  orderType = type;
  ['morning','evening','special'].forEach(t => {
    const btn = document.getElementById('btn-' + t);
    btn.className = t === type ? 'active ' + t : '';
  });
  const titles = { morning:'Products – Morning', evening:'Products – Evening', special:'Products – Special' };
  document.getElementById('productSectionTitle').textContent = titles[type];

  // Show/hide special slot toggle
  const wrap = document.getElementById('specialSlotWrap');
  if (wrap) wrap.style.display = type === 'special' ? 'block' : 'none';

  renderSupplierSelector();
  orderItems = {};
  renderProductList();
  renderOrderPreview();
}

function renderSupplierSelector() {
  const el = document.getElementById('orderSupplierWrap');
  if (!el) return;
  el.innerHTML = SUPPLIERS.map(s => `
    <button onclick="setOrderSupplier('${s.id}')" id="supbtn-${s.id}"
      class="sup-btn ${orderSupplier === s.id ? 'active' : ''}"
      style="border-color:${s.color};background:${orderSupplier===s.id?s.color:'white'};color:${orderSupplier===s.id?'white':s.color};">
      👤 ${s.name}
    </button>`).join('');
}

function setOrderSupplier(supplierId) {
  orderSupplier = supplierId;
  renderSupplierSelector();
  renderProductList();
  renderOrderPreview();
}

function renderProductList() {
  const specials = DB.products.filter(p => p.category === 'special');
  const regulars = DB.products.filter(p => p.category === 'regular');
  let html = '';
  if (orderType === 'special') {
    html += `<div class="prod-section-label">⭐ Special Products</div>`;
    html += specials.map(p => productRowHTML(p, true)).join('');
    html += `<div class="prod-section-label" style="margin-top:10px;">📦 Regular Products</div>`;
    html += regulars.map(p => productRowHTML(p, false)).join('');
  } else {
    html += regulars.map(p => productRowHTML(p, false)).join('');
  }
  document.getElementById('productList').innerHTML = html;
}

function productRowHTML(p, isSpecialCategory) {
  const item = orderItems[p.id] || { qty: '', unit: isSpecialCategory ? 'pack' : (p.defaultUnit || 'pc') };
  const hasVal = item.qty && parseFloat(item.qty) > 0;
  const rowTotal = calcRowTotal(p.id);
  const packName = p.packType || 'Pack';
  const effectivePrice = getEffectivePriceForSupplier(p, orderSupplier);
  const sup = getSupplier(orderSupplier);
  const isEveningDiff = sup && sup.priceType === 'evening' && p.eveningPrice != null;
  const priceBadge = isEveningDiff ? `<span class="eve-badge">EVE</span>` : '';
  return `<div class="product-row ${hasVal ? 'has-value' : ''}" id="prodrow-${p.id}">
    <div class="prod-info">
      <div class="prod-name">${p.name}${priceBadge}</div>
      <div class="prod-price">₹${effectivePrice.toFixed(3).replace(/\.?0+$/, '')}/pc${p.crateQty ? ` · ${p.crateQty}pc/${packName}` : ''}</div>
    </div>
    <div class="prod-controls">
      <div class="unit-toggle">
        ${isSpecialCategory
          ? `<button class="active" style="background:var(--red);color:white;" disabled>${packName}</button>`
          : `<button class="${item.unit==='pc'?'active':''}" onclick="setUnit('${p.id}','pc')">PC</button>
             <button class="${item.unit==='pack'?'active':''}" onclick="setUnit('${p.id}','pack')" ${!p.crateQty?'disabled':''}>${packName}</button>`
        }
      </div>
      <input class="qty-input" type="number" min="0" step="1" placeholder="Qty" value="${item.qty}"
        oninput="updateQty('${p.id}', this.value)" id="qty-${p.id}">
      <div class="row-total ${rowTotal>0?'active':''}" id="rowtotal-${p.id}">
        ${rowTotal>0 ? '₹'+fmt(rowTotal) : '—'}
      </div>
    </div>
  </div>`;
}

function setUnit(productId, unit) {
  if (!orderItems[productId]) orderItems[productId] = { qty: '', unit };
  else orderItems[productId].unit = unit;
  renderProductList();
  renderOrderPreview();
}

function updateQty(productId, val) {
  if (!orderItems[productId]) {
    const p = getProduct(productId);
    const isSpecial = p && p.category === 'special';
    orderItems[productId] = { qty: val, unit: isSpecial ? 'pack' : (p.defaultUnit || 'pc') };
  } else {
    orderItems[productId].qty = val;
  }
  const rowTotal = calcRowTotal(productId);
  const el = document.getElementById('rowtotal-' + productId);
  if (el) { el.textContent = rowTotal > 0 ? '₹'+fmt(rowTotal) : '—'; el.className = 'row-total '+(rowTotal>0?'active':''); }
  const row = document.getElementById('prodrow-' + productId);
  if (row) row.className = 'product-row '+(rowTotal>0?'has-value':'');
  renderOrderPreview();
}

function calcRowTotal(productId) {
  const item = orderItems[productId];
  if (!item || !item.qty || parseFloat(item.qty) <= 0) return 0;
  const p = getProduct(productId);
  if (!p) return 0;
  const qty = parseFloat(item.qty);
  const ep = getEffectivePriceForSupplier(p, orderSupplier);
  return item.unit === 'pack' ? ep * (p.crateQty || 1) * qty : ep * qty;
}

function getOrderItemsList() {
  const list = [];
  for (const [productId, item] of Object.entries(orderItems)) {
    const qty = parseFloat(item.qty);
    if (!qty || qty <= 0) continue;
    const p = getProduct(productId);
    if (!p) continue;
    const piecesQty = item.unit === 'pack' ? qty * (p.crateQty || 1) : qty;
    const ep = getEffectivePriceForSupplier(p, orderSupplier);
    const amount = ep * piecesQty;
    list.push({ productId, inputQty: qty, inputUnit: item.unit, packTypeAtTime: p.packType || 'Crate', piecesQty, priceAtTime: ep, crateQtyAtTime: p.crateQty, amount });
  }
  return list;
}

function renderOrderPreview() {
  const items = getOrderItemsList();
  const total = items.reduce((s, it) => s + it.amount, 0);
  const previewEl = document.getElementById('orderPreview');
  const summaryEl = document.getElementById('orderSummary');
  const sup = getSupplier(orderSupplier);
  if (items.length === 0) {
    previewEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;font-size:12px;">Enter quantities above to see preview</div>';
    summaryEl.style.display = 'none'; return;
  }
  previewEl.innerHTML = `
    <div class="table-scroll">
      <table class="data-table" style="margin-bottom:0;">
        <thead><tr><th>Product</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amt</th></tr></thead>
        <tbody>${items.map(it => {
          const p = getProduct(it.productId);
          const qtyDisplay = it.inputUnit === 'pack' ? `${it.inputQty}×${it.crateQtyAtTime||1}` : `${it.piecesQty}pc`;
          return `<tr>
            <td style="font-size:12px;">${p ? p.name : it.productId}</td>
            <td class="right mono" style="font-size:11px;">${qtyDisplay}</td>
            <td class="right mono" style="font-size:11px;">₹${it.priceAtTime.toFixed(2)}</td>
            <td class="right mono" style="font-weight:700;font-size:12px;">₹${fmt(it.amount)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  summaryEl.style.display = 'block';
  const slotLabel = orderType === 'special'
    ? (specialSlot === 'evening' ? '🌆 Evening Special' : '🌅 Morning Special')
    : (orderType === 'morning' ? '🌅 Morning' : '🌆 Evening');
  summaryEl.innerHTML = `
    <div class="summary-row"><span>Items</span><span>${items.length}</span></div>
    <div class="summary-row"><span>Slot</span><span>${slotLabel}</span></div>
    <div class="summary-row"><span>Supplier</span><span style="font-weight:700;color:${sup?sup.color:'inherit'};">${sup?sup.name:'—'}</span></div>
    <div class="summary-row total"><span>Order Total</span><span>₹${fmt(total)}</span></div>`;
}

function submitOrder() {
  const date = document.getElementById('orderDate').value;
  if (!date) { toast('Please select a date', 'error'); return; }
  const items = getOrderItemsList();
  if (items.length === 0) { toast('Please enter at least one product quantity', 'error'); return; }
  const note = document.getElementById('orderNote').value.trim();
  const slotVal = orderType === 'special' ? specialSlot : null;
  const order = { id: uid(), date, type: orderType, supplier: orderSupplier, items, note, specialSlot: slotVal, createdAt: new Date().toISOString() };
  DB.orders.push(order);
  persistDB();
  const sup = getSupplier(orderSupplier);
  toast(`✅ Order saved for ${sup?sup.name:'supplier'}!`, 'success');
  clearOrderForm();
  renderTodaysOrders();
}

function clearOrderForm() {
  orderItems = {};
  document.getElementById('orderNote').value = '';
  renderProductList();
  renderOrderPreview();
}

function renderTodaysOrders() {
  const date = document.getElementById('orderDate').value || todayStr();
  const orders = DB.orders.filter(o => o.date === date).sort((a,b) => {
    const key = { morning:0, evening:1, special:2 };
    const aKey = a.type === 'special' ? (a.specialSlot === 'evening' ? 2.5 : 1.5) : (key[a.type]||0);
    const bKey = b.type === 'special' ? (b.specialSlot === 'evening' ? 2.5 : 1.5) : (key[b.type]||0);
    return aKey - bKey;
  });
  const el = document.getElementById('todaysOrders');
  if (orders.length === 0) {
    el.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:14px;">No orders for this date.</div>'; return;
  }
  el.innerHTML = orders.map(o => {
    const total = calcOrderTotal(o);
    const icon = o.type==='morning'?'🌅':o.type==='evening'?'🌆':(o.specialSlot==='evening'?'🌆⭐':'🌅⭐');
    const typeLabel = o.type==='morning'?'Morning':o.type==='evening'?'Evening':(o.specialSlot==='evening'?'Evening Special':'Morning Special');
    const sup = getSupplier(o.supplier);
    return `<div class="order-card">
      <div class="order-card-header">
        <div>
          <div class="order-card-title">${icon} ${typeLabel}${sup?' – '+sup.name:''}</div>
          <div class="order-card-sub">${o.items.length} item(s)${o.note?' · '+o.note:''}</div>
        </div>
        <div class="order-card-total">₹${fmt(total)}</div>
      </div>
      <div class="order-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="showOrderDetail('${o.id}')">👁️ View</button>
        <button class="btn btn-info btn-sm" onclick="openEditOrder('${o.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteOrder('${o.id}')">🗑️ Del</button>
      </div>
    </div>`;
  }).join('');
}

function showOrderDetail(orderId) {
  const o = DB.orders.find(x => x.id === orderId);
  if (!o) return;
  const icon = o.type==='morning'?'🌅':o.type==='evening'?'🌆':(o.specialSlot==='evening'?'🌆⭐':'🌅⭐');
  const typeLabel = o.type==='morning'?'Morning':o.type==='evening'?'Evening':(o.specialSlot==='evening'?'Evening Special':'Morning Special');
  const total = calcOrderTotal(o);
  const sup = getSupplier(o.supplier);
  document.getElementById('orderDetailTitle').textContent = `${icon} ${typeLabel} – ${fmtDate(o.date)}`;
  document.getElementById('orderDetailContent').innerHTML = `
    ${sup?`<div style="margin-bottom:10px;font-size:12px;">Supplier: ${supplierBadge(o.supplier)}</div>`:''}
    ${o.note?`<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Note: ${o.note}</div>`:''}
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>Product</th><th class="right">Pcs</th><th class="right">Crates</th><th class="right">Rate</th><th class="right">Amt</th></tr></thead>
        <tbody>${o.items.map(it => {
          const p = DB.products.find(x => x.id === it.productId) || { name: it.productId };
          const crates = it.crateQtyAtTime ? (it.piecesQty / it.crateQtyAtTime).toFixed(2).replace(/\.?0+$/,'') : '—';
          return `<tr>
            <td style="font-size:12px;"><strong>${p.name}</strong></td>
            <td class="right mono">${it.piecesQty}</td>
            <td class="right mono" style="color:var(--text-muted);">${crates}</td>
            <td class="right mono" style="font-size:11px;">₹${it.priceAtTime.toFixed(2)}</td>
            <td class="right mono" style="font-weight:700;">₹${fmt(it.amount)}</td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot>
          <tr><td colspan="4" style="font-weight:700;text-align:right;padding:9px 11px;border-top:2px solid var(--border);">TOTAL</td>
          <td class="right mono" style="font-weight:700;color:var(--red);font-size:14px;padding:9px 11px;border-top:2px solid var(--border);">₹${fmt(total)}</td></tr>
        </tfoot>
      </table>
    </div>`;
  document.getElementById('orderDetailPrintBtn').onclick = () => printSingleOrder(orderId);
  document.getElementById('orderDetailEditBtn').onclick = () => { closeModal('orderDetailModal'); openEditOrder(orderId); };
  document.getElementById('orderDetailWhatsappBtn').onclick = () => toggleWhatsappMsg(orderId);
  document.getElementById('whatsappCopyArea').style.display = 'none';
  openModal('orderDetailModal');
}

function toggleWhatsappMsg(orderId) {
  const area = document.getElementById('whatsappCopyArea');
  const btn = document.getElementById('orderDetailWhatsappBtn');
  if (area.style.display !== 'none') { area.style.display = 'none'; btn.textContent = '📲 WhatsApp'; return; }
  const o = DB.orders.find(x => x.id === orderId);
  if (!o) return;
  const sup = getSupplier(o.supplier);
  const slotLabel = o.type==='morning'?'Morning':o.type==='evening'?'Evening':(o.specialSlot==='evening'?'Evening Special':'Morning Special');
  const total = calcOrderTotal(o);
  const pad = (str, len) => String(str).padEnd(len, ' ');
  const rpad = (str, len) => String(str).padStart(len, ' ');
  const itemLines = o.items.map(it => {
    const p = DB.products.find(x => x.id === it.productId) || { name: it.productId };
    const name = p.name.length > 20 ? p.name.substring(0, 19) + '.' : p.name;
    let qtyStr;
    if (it.inputUnit === 'pack' || it.inputUnit === 'crate') { qtyStr = `${it.inputQty} ${it.packTypeAtTime||'Pack'} (${it.piecesQty}pcs)`; }
    else if (it.crateQtyAtTime && it.crateQtyAtTime > 0) { const packs = it.piecesQty / it.crateQtyAtTime; const pd = Number.isInteger(packs) ? packs : packs.toFixed(2).replace(/\.?0+$/,''); qtyStr = `${it.piecesQty}pcs (${pd} ${it.packTypeAtTime||'Crate'})`; }
    else { qtyStr = `${it.piecesQty}pcs`; }
    const rate = `Rs.${it.priceAtTime.toFixed(2)}/pc`;
    const amt = `Rs.${fmt(it.amount)}`;
    return `  ${pad(name, 22)} ${pad(qtyStr, 20)} ${rpad(rate, 12)} ${rpad(amt, 10)}`;
  }).join('\n');
  const divider = '-'.repeat(68);
  const lines = [`Raj Mart`, `Order Details`, divider, `Date     : ${fmtDateLong(o.date)}`, `Slot     : ${slotLabel}`,
    sup ? `Supplier : ${sup.name}` : '', o.note ? `Note     : ${o.note}` : '',
    divider, `  ${'Product'.padEnd(22)} ${'Quantity'.padEnd(20)} ${'Rate'.padStart(12)} ${'Amount'.padStart(10)}`,
    divider, itemLines, divider, `${'TOTAL'.padEnd(57)} ${rpad('Rs.'+fmt(total), 10)}`, divider, ``,
    `Please confirm receipt of this order.`, `Thank you.`].filter(l => l !== null && l !== undefined);
  document.getElementById('whatsappMsgBox').value = lines.filter((l, i) => l !== '' || i === lines.length - 3).join('\n');
  area.style.display = 'block';
  btn.textContent = 'Hide Message';
}

function copyWhatsappMsg() {
  const box = document.getElementById('whatsappMsgBox');
  if (!box) return;
  box.select(); box.setSelectionRange(0, 99999);
  try {
    navigator.clipboard.writeText(box.value).then(() => { toast('Message copied! Paste it in WhatsApp.', 'success'); }).catch(() => { document.execCommand('copy'); toast('Message copied!', 'success'); });
  } catch(e) { document.execCommand('copy'); toast('Message copied!', 'success'); }
}

function sendLedgerWhatsapp(orderId) {
  const o = DB.orders.find(x => x.id === orderId);
  if (!o) return;
  const sup = getSupplier(o.supplier);
  const slotIcon = o.type==='morning'?'🌅':o.type==='evening'?'🌆':(o.specialSlot==='evening'?'🌆⭐':'🌅⭐');
  const slotLabel = o.type==='morning'?'Morning':o.type==='evening'?'Evening':(o.specialSlot==='evening'?'Evening Special':'Morning Special');
  const total = calcOrderTotal(o);
  const C = { name: 18, qty: 18, rate: 13 };
  const pad  = (s, n) => String(s).padEnd(n, ' ');
  const rpad = (s, n) => String(s).padStart(n, ' ');
  const divider = '-'.repeat(C.name + C.qty + C.rate + 12);
  const itemLines = o.items.map(it => {
    const p = DB.products.find(x => x.id === it.productId) || { name: it.productId };
    const name = p.name.length > C.name ? p.name.substring(0, C.name-1)+'.' : p.name;
    let qtyStr;
    if (it.inputUnit === 'pack' || it.inputUnit === 'crate') { qtyStr = `${it.inputQty} ${it.packTypeAtTime||'Pack'} (${it.piecesQty}pcs)`; }
    else if (it.crateQtyAtTime && it.crateQtyAtTime > 0) { const packs = it.piecesQty / it.crateQtyAtTime; const pd = Number.isInteger(packs) ? packs : packs.toFixed(2).replace(/\.?0+$/,''); qtyStr = `${it.piecesQty}pcs (${pd} ${it.packTypeAtTime||'Crate'})`; }
    else { qtyStr = `${it.piecesQty}pcs`; }
    return `${pad(name, C.name)} ${pad(qtyStr, C.qty)} ${pad(`Rs.${it.priceAtTime.toFixed(2)}/pc`, C.rate)} Rs.${fmt(it.amount)}`;
  }).join('\n');
  const headerRow  = `${pad('Product', C.name)} ${pad('Qty', C.qty)} ${pad('Rate', C.rate)} Amount`;
  const totalLabel = pad('TOTAL', C.name+1+C.qty+1+C.rate+1);
  const table = '```\n' + [headerRow, divider, itemLines, divider, `${totalLabel}Rs.${fmt(total)}`].join('\n') + '\n```';
  const infoLine = [fmtDateLong(o.date), `${slotIcon} ${slotLabel}`, sup?sup.name:''].filter(Boolean).join('  |  ');
  const msg = [`*Raj Mart – Order Details*`, ``, infoLine, o.note?`📝 ${o.note}`:null, ``, table, `*Total: Rs.${fmt(total)}*`, ``].filter(l=>l!==null).join('\n');
  navigator.clipboard.writeText(msg).then(() => { toast('📋 Copied! Paste in WhatsApp.', 'success'); }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = msg; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 99999);
    document.execCommand('copy'); document.body.removeChild(ta);
    toast('📋 Copied! Paste in WhatsApp.', 'success');
  });
}

function confirmDeleteOrder(orderId) {
  pendingDelete = { type: 'order', id: orderId };
  document.getElementById('deleteConfirmMsg').textContent = 'Delete this order? This cannot be undone.';
  openModal('deleteConfirmModal');
}
function confirmDeletePayment(paymentId) {
  pendingDelete = { type: 'payment', id: paymentId };
  document.getElementById('deleteConfirmMsg').textContent = 'Delete this payment record? This cannot be undone.';
  openModal('deleteConfirmModal');
}

// ==========================================================
//  EDIT ORDER
// ==========================================================
function openEditOrder(orderId) {
  const o = DB.orders.find(x => x.id === orderId);
  if (!o) return;
  editingOrderId = orderId;
  editOrderType = o.type;
  editOrderSupplier = o.supplier || 'ajay';
  editSpecialSlot = o.specialSlot || 'morning';
  editOrderItems = {};
  o.items.forEach(it => { editOrderItems[it.productId] = { qty: String(it.inputQty), unit: it.inputUnit }; });
  document.getElementById('editOrderDate').value = o.date;
  document.getElementById('editOrderNote').value = o.note || '';
  setEditOrderType(o.type);
  // Restore special slot if applicable
  if (o.type === 'special') { setTimeout(() => setEditSpecialSlot(o.specialSlot || 'morning'), 50); }
  openModal('editOrderModal');
}

function setEditOrderType(type) {
  editOrderType = type;
  ['morning','evening','special'].forEach(t => {
    const btn = document.getElementById('editbtn-' + t);
    btn.className = t === type ? 'active ' + t : '';
  });
  const titles = { morning:'Products – Morning', evening:'Products – Evening', special:'Products – Special' };
  document.getElementById('editProductSectionTitle').textContent = titles[type];
  const wrap = document.getElementById('editSpecialSlotWrap');
  if (wrap) wrap.style.display = type === 'special' ? 'block' : 'none';
  renderEditSupplierSelector();
  renderEditProductList();
  renderEditOrderPreview();
}

function renderEditSupplierSelector() {
  const el = document.getElementById('editOrderSupplierWrap');
  if (!el) return;
  if (!SUPPLIERS.find(s => s.id === editOrderSupplier)) { editOrderSupplier = SUPPLIERS[0]?.id || 'ajay'; }
  el.innerHTML = SUPPLIERS.map(s => `
    <button onclick="setEditOrderSupplier('${s.id}')"
      class="sup-btn ${editOrderSupplier===s.id?'active':''}"
      style="border-color:${s.color};background:${editOrderSupplier===s.id?s.color:'white'};color:${editOrderSupplier===s.id?'white':s.color};">
      👤 ${s.name}
    </button>`).join('');
}

function setEditOrderSupplier(supplierId) {
  editOrderSupplier = supplierId;
  renderEditSupplierSelector();
  renderEditProductList();
  renderEditOrderPreview();
}

function renderEditProductList() {
  const specials = DB.products.filter(p => p.category === 'special');
  const regulars = DB.products.filter(p => p.category === 'regular');
  let html = '';
  if (editOrderType === 'special') {
    html += `<div class="prod-section-label">⭐ Special Products</div>`;
    html += specials.map(p => editProductRowHTML(p, true)).join('');
    html += `<div class="prod-section-label" style="margin-top:10px;">📦 Regular Products</div>`;
    html += regulars.map(p => editProductRowHTML(p, false)).join('');
  } else {
    html += regulars.map(p => editProductRowHTML(p, false)).join('');
  }
  document.getElementById('editProductList').innerHTML = html;
}

function editProductRowHTML(p, isSpecialCategory) {
  const item = editOrderItems[p.id] || { qty: '', unit: isSpecialCategory ? 'pack' : (p.defaultUnit || 'pc') };
  const hasVal = item.qty && parseFloat(item.qty) > 0;
  const rowTotal = calcEditRowTotal(p.id);
  const packName = p.packType || 'Pack';
  const effectivePrice = getEffectivePriceForSupplier(p, editOrderSupplier);
  const sup = getSupplier(editOrderSupplier);
  const isEveningDiff = sup && sup.priceType === 'evening' && p.eveningPrice != null;
  const priceBadge = isEveningDiff ? `<span class="eve-badge">EVE</span>` : '';
  return `<div class="product-row ${hasVal ? 'has-value' : ''}" id="editprodrow-${p.id}">
    <div class="prod-info">
      <div class="prod-name">${p.name}${priceBadge}</div>
      <div class="prod-price">₹${effectivePrice.toFixed(3).replace(/\.?0+$/, '')}/pc${p.crateQty?` · ${p.crateQty}pc/${packName}`:''}</div>
    </div>
    <div class="prod-controls">
      <div class="unit-toggle">
        ${isSpecialCategory
          ? `<button class="active" style="background:var(--red);color:white;" disabled>${packName}</button>`
          : `<button class="${item.unit==='pc'?'active':''}" onclick="setEditUnit('${p.id}','pc')">PC</button>
             <button class="${item.unit==='pack'?'active':''}" onclick="setEditUnit('${p.id}','pack')" ${!p.crateQty?'disabled':''}>${packName}</button>`
        }
      </div>
      <input class="qty-input" type="number" min="0" step="1" placeholder="Qty" value="${item.qty}"
        oninput="updateEditQty('${p.id}', this.value)" id="editqty-${p.id}">
      <div class="row-total ${rowTotal>0?'active':''}" id="editrowtotal-${p.id}">
        ${rowTotal>0 ? '₹'+fmt(rowTotal) : '—'}
      </div>
    </div>
  </div>`;
}

function setEditUnit(productId, unit) {
  if (!editOrderItems[productId]) editOrderItems[productId] = { qty: '', unit };
  else editOrderItems[productId].unit = unit;
  renderEditProductList();
  renderEditOrderPreview();
}

function updateEditQty(productId, val) {
  if (!editOrderItems[productId]) {
    const p = getProduct(productId);
    const isSpecial = p && p.category === 'special';
    editOrderItems[productId] = { qty: val, unit: isSpecial ? 'pack' : (p.defaultUnit || 'pc') };
  } else {
    editOrderItems[productId].qty = val;
  }
  const rowTotal = calcEditRowTotal(productId);
  const el = document.getElementById('editrowtotal-' + productId);
  if (el) { el.textContent = rowTotal > 0 ? '₹'+fmt(rowTotal) : '—'; el.className = 'row-total '+(rowTotal>0?'active':''); }
  const row = document.getElementById('editprodrow-' + productId);
  if (row) row.className = 'product-row '+(rowTotal>0?'has-value':'');
  renderEditOrderPreview();
}

function calcEditRowTotal(productId) {
  const item = editOrderItems[productId];
  if (!item || !item.qty || parseFloat(item.qty) <= 0) return 0;
  const p = getProduct(productId);
  if (!p) return 0;
  const qty = parseFloat(item.qty);
  const ep = getEffectivePriceForSupplier(p, editOrderSupplier);
  return item.unit === 'pack' ? ep * (p.crateQty || 1) * qty : ep * qty;
}

function getEditOrderItemsList() {
  const list = [];
  for (const [productId, item] of Object.entries(editOrderItems)) {
    const qty = parseFloat(item.qty);
    if (!qty || qty <= 0) continue;
    const p = getProduct(productId);
    if (!p) continue;
    const piecesQty = item.unit === 'pack' ? qty * (p.crateQty || 1) : qty;
    const ep = getEffectivePriceForSupplier(p, editOrderSupplier);
    const amount = ep * piecesQty;
    list.push({ productId, inputQty: qty, inputUnit: item.unit, packTypeAtTime: p.packType || 'Crate', piecesQty, priceAtTime: ep, crateQtyAtTime: p.crateQty, amount });
  }
  return list;
}

function renderEditOrderPreview() {
  const items = getEditOrderItemsList();
  const total = items.reduce((s, it) => s + it.amount, 0);
  const summaryEl = document.getElementById('editOrderSummary');
  const sup = getSupplier(editOrderSupplier);
  if (items.length === 0) {
    summaryEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:10px;font-size:12px;">Enter quantities above</div>';
    return;
  }
  summaryEl.innerHTML = `<div class="order-summary">
    <div class="summary-row"><span>${items.length} item(s)</span></div>
    <div class="summary-row"><span>Supplier</span><span style="font-weight:700;color:${sup?sup.color:'inherit'};">${sup?sup.name:'—'}</span></div>
    <div class="summary-row total"><span>Order Total</span><span>₹${fmt(total)}</span></div>
  </div>`;
}

function saveEditedOrder() {
  const date = document.getElementById('editOrderDate').value;
  if (!date) { toast('Please select a date', 'error'); return; }
  const items = getEditOrderItemsList();
  if (items.length === 0) { toast('Please enter at least one product quantity', 'error'); return; }
  const note = document.getElementById('editOrderNote').value.trim();
  const idx = DB.orders.findIndex(o => o.id === editingOrderId);
  if (idx === -1) { toast('Order not found', 'error'); return; }
  const slotVal = editOrderType === 'special' ? editSpecialSlot : null;
  DB.orders[idx] = { ...DB.orders[idx], date, type: editOrderType, supplier: editOrderSupplier, items, note, specialSlot: slotVal };
  persistDB();
  toast('✅ Order updated!', 'success');
  closeModal('editOrderModal');
  editingOrderId = null; editOrderItems = {};
  if (activePage === 'order') renderTodaysOrders();
  if (activePage === 'dashboard') renderDashboard();
  if (activePage === 'ledger') renderLedger();
}

function confirmDelete() {
  if (!pendingDelete) return;
  const { type, id } = pendingDelete;
  if (type === 'order') {
    DB.orders = DB.orders.filter(o => o.id !== id);
    persistDB(); toast('Order deleted.', 'info');
    if (activePage === 'order') renderTodaysOrders();
    if (activePage === 'dashboard') renderDashboard();
    if (activePage === 'ledger') renderLedger();
  } else if (type === 'payment') {
    DB.payments = DB.payments.filter(p => p.id !== id);
    persistDB(); toast('Payment deleted.', 'info');
    renderPaymentsPage();
    if (activePage === 'dashboard') renderDashboard();
    if (activePage === 'ledger') renderLedger();
  } else if (type === 'product') {
    DB.products = DB.products.filter(p => p.id !== id);
    persistDB(); toast('Product deleted.', 'info');
    if (activePage === 'products') renderProductsPage();
  }
  pendingDelete = null;
  closeModal('deleteConfirmModal');
}

// ==========================================================
//  LEDGER
// ==========================================================
function setLedgerFilter(filter, btn) {
  currentLedgerFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('customDateRange').style.display = filter === 'custom' ? 'flex' : 'none';
  renderLedger();
}

function setLedgerSupplier(supplierId) {
  currentLedgerSupplier = supplierId;
  document.querySelectorAll('.supplier-tab').forEach(b => b.classList.remove('active'));
  const activeTab = document.getElementById('supTab-' + supplierId);
  if (activeTab) activeTab.classList.add('active');
  renderLedger();
}

function getLedgerDateRange() {
  const today = todayStr();
  if (currentLedgerFilter === 'this-month') {
    const m = today.substr(0, 7);
    return { from: m + '-01', to: today };
  } else if (currentLedgerFilter === 'last-month') {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    const m = d.toISOString().substr(0, 7);
    const lastDay = new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().split('T')[0];
    return { from: m + '-01', to: lastDay };
  } else if (currentLedgerFilter === 'custom') {
    return { from: document.getElementById('ledgerFrom').value || '2000-01-01', to: document.getElementById('ledgerTo').value || today };
  }
  return { from: '2000-01-01', to: '2099-12-31' };
}

function buildAllLedgerRows(supplierId) {
  const rows = [];
  const orders   = supplierId && supplierId !== 'all' ? DB.orders.filter(o => o.supplier === supplierId)   : DB.orders;
  const payments = supplierId && supplierId !== 'all' ? DB.payments.filter(p => p.supplier === supplierId) : DB.payments;

  orders.forEach(o => {
    const total = calcOrderTotal(o);
    const sup = getSupplier(o.supplier);
    const slotLabel = o.type === 'morning' ? 'Morning Bill' : o.type === 'evening' ? 'Evening Bill'
      : (o.specialSlot === 'evening' ? 'Evening Special' : 'Morning Special');
    rows.push({
      id: o.id, date: o.date, type: o.type, specialSlot: o.specialSlot || 'morning',
      timeSlot: null,
      debit: total, credit: 0, amount: total, items: o.items, note: o.note, supplier: o.supplier,
      description: (sup ? sup.name + ' – ' : '') + slotLabel
    });
  });

  payments.forEach(p => {
    const sup = getSupplier(p.supplier);
    rows.push({
      id: p.id, date: p.date, type: 'payment', timeSlot: p.timeSlot || 'morning', specialSlot: null,
      debit: 0, credit: p.amount, amount: p.amount, supplier: p.supplier,
      description: (sup ? sup.name + ' – ' : '') + (p.note || 'Payment')
    });
  });

  // TIME-AWARE SORT: by date first, then by slot position within the day
  rows.sort((a, b) => a.date.localeCompare(b.date) || rowSortKey(a) - rowSortKey(b));
  return rows;
}

function renderLedger() {
  const tabContainer = document.getElementById('ledgerSupplierTabs');
  if (tabContainer) {
    tabContainer.innerHTML = `
      <button class="supplier-tab ${currentLedgerSupplier==='all'?'active':''}" id="supTab-all" onclick="setLedgerSupplier('all')">All</button>
      ${SUPPLIERS.map(s => `
        <button class="supplier-tab ${currentLedgerSupplier===s.id?'active':''}" id="supTab-${s.id}"
          onclick="setLedgerSupplier('${s.id}')"
          style="${currentLedgerSupplier===s.id?'background:'+s.color+';color:white;border-color:'+s.color+';':'color:'+s.color+';border-color:'+s.color+';'}">
          ${s.name}
        </button>`).join('')}`;
  }

  const { from, to } = getLedgerDateRange();
  const allRows = buildAllLedgerRows(currentLedgerSupplier);
  const rows = allRows.filter(r => r.date >= from && r.date <= to);
  const beforeRows = allRows.filter(r => r.date < from);
  let openingBal = beforeRows.reduce((s, r) => s + r.debit - r.credit, 0);
  let bal = openingBal;
  let totalDebit = 0, totalCredit = 0;
  const tbody = document.getElementById('ledgerBody');

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">📒</div><div class="text">No transactions in this period.</div></div></td></tr>`;
  } else {
    tbody.innerHTML = rows.map(r => {
      bal += r.debit - r.credit;
      totalDebit += r.debit;
      totalCredit += r.credit;
      const isPay = r.type === 'payment';
      const detailId = 'det-' + r.id;
      const sup = getSupplier(r.supplier);
      const icon = rowIcon(r);

      let detailHTML = '';
      if (!isPay && r.items) {
        detailHTML = `
          <div class="ledger-row-actions">
            <button class="btn btn-secondary btn-sm" onclick="toggleDetail('${detailId}')">👁️</button>
            <button class="btn btn-info btn-sm" onclick="openEditOrder('${r.id}')">✏️</button>
            <button class="btn btn-success btn-sm" onclick="sendLedgerWhatsapp('${r.id}')">📲</button>
            <button class="btn btn-danger btn-sm" onclick="confirmDeleteOrder('${r.id}')">🗑️</button>
          </div>
          <div class="ledger-detail" id="${detailId}">
            ${r.items.map(it => {
              const p = DB.products.find(x => x.id === it.productId) || { name: it.productId };
              let qtyDisplay;
              if (it.inputUnit === 'pack' || it.inputUnit === 'crate') { qtyDisplay = `${it.inputQty} ${it.packTypeAtTime||'Pack'} (${it.piecesQty}pcs)`; }
              else if (it.crateQtyAtTime && it.crateQtyAtTime > 0) { const packs = (it.piecesQty / it.crateQtyAtTime); const pd = Number.isInteger(packs) ? packs : packs.toFixed(2).replace(/\.?0+$/,''); qtyDisplay = `${it.piecesQty}pcs (${pd} ${it.packTypeAtTime||'crate'})`; }
              else { qtyDisplay = `${it.piecesQty}pcs`; }
              return `<div class="detail-row"><span>${p.name} × ${qtyDisplay}</span><span>₹${fmt(it.amount)}</span></div>`;
            }).join('')}
          </div>`;
      }

      return `<tr class="${isPay?'payment-row':''}">
        <td class="date-cell">${fmtDate(r.date)}<br>
          <span style="font-size:13px;">${icon}</span>
        </td>
        <td class="ledger-desc-cell">
          <div style="font-size:12px;font-weight:600;">${sup?`<span style="color:${sup.color};">${sup.name}</span>`:'—'}</div>
          <div style="font-size:11px;color:var(--text-muted);">${r.description.split(' – ').pop()}${r.note&&!isPay&&r.note?' · '+r.note:''}</div>
        </td>
        <td class="right mono ledger-debit">${r.debit>0?'₹'+fmt(r.debit):'—'}</td>
        <td class="right mono credit-cell">${r.credit>0?'₹'+fmt(r.credit):'—'}</td>
        <td class="right balance-cell">₹${fmt(bal)}</td>
        <td class="ledger-action-cell">
          ${detailHTML}
          ${isPay?`<div class="ledger-row-actions"><button class="btn btn-info btn-sm" onclick="openEditPayment('${r.id}')">✏️</button><button class="btn btn-danger btn-sm" onclick="confirmDeletePayment('${r.id}')">🗑️</button></div>`:''}
        </td>
      </tr>`;
    }).join('');
  }

  const outstanding = bal;
  const currentSup = currentLedgerSupplier !== 'all' ? getSupplier(currentLedgerSupplier) : null;
  document.getElementById('ledgerSummaryBar').innerHTML = `
    <div class="ledger-summary-chip red-chip">Orders: ₹${fmt(totalDebit)}</div>
    <div class="ledger-summary-chip green-chip">Paid: ₹${fmt(totalCredit)}</div>
    <div class="ledger-summary-chip orange-chip">Balance: ₹${fmt(outstanding)}</div>
    ${openingBal > 0 ? `<div class="ledger-summary-chip gray-chip">Opening: ₹${fmt(openingBal)}</div>` : ''}
    ${currentSup ? `<div class="ledger-summary-chip" style="background:${currentSup.bg};color:${currentSup.color};">${currentSup.name}</div>` : ''}`;
}

function toggleDetail(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}

// ==========================================================
//  PAYMENTS
// ==========================================================
function populateSupplierSelect(selectId, selectedValue) {
  const el = document.getElementById(selectId);
  if (!el) return;
  el.innerHTML = `<option value="">— Select Supplier —</option>` +
    SUPPLIERS.map(s => `<option value="${s.id}" ${selectedValue===s.id?'selected':''}>👤 ${s.name}</option>`).join('');
}

function openEditPayment(paymentId) {
  const p = DB.payments.find(x => x.id === paymentId);
  if (!p) return;
  editingPaymentId = paymentId;
  document.getElementById('payModalTitle').textContent = '✏️ Edit Payment';
  document.getElementById('payModalSaveBtn').textContent = '✅ Update Payment';
  document.getElementById('payModalDate').value = p.date;
  document.getElementById('payModalAmount').value = p.amount;
  document.getElementById('payModalNote').value = p.note || '';
  populateSupplierSelect('payModalSupplier', p.supplier || '');
  setPayModalSlot(p.timeSlot || 'morning');
  openModal('paymentModal');
}

function openPaymentFromLedger() {
  editingPaymentId = null;
  document.getElementById('payModalTitle').textContent = 'Record Payment';
  document.getElementById('payModalSaveBtn').textContent = '✅ Record Payment';
  document.getElementById('payModalDate').value = todayStr();
  document.getElementById('payModalAmount').value = '';
  document.getElementById('payModalNote').value = '';
  populateSupplierSelect('payModalSupplier', currentLedgerSupplier !== 'all' ? currentLedgerSupplier : '');
  setPayModalSlot('morning');
  openModal('paymentModal');
}

function recordPaymentFromModal() {
  const date     = document.getElementById('payModalDate').value;
  const amount   = parseFloat(document.getElementById('payModalAmount').value);
  const note     = document.getElementById('payModalNote').value.trim();
  const supplier = document.getElementById('payModalSupplier').value;
  const timeSlot = document.getElementById('payModalSlot').value || 'morning';
  if (!date || isNaN(amount) || amount <= 0) { toast('Enter valid date and amount', 'error'); return; }
  if (!supplier) { toast('Please select a supplier', 'error'); return; }
  if (editingPaymentId) {
    const idx = DB.payments.findIndex(p => p.id === editingPaymentId);
    if (idx === -1) { toast('Payment not found', 'error'); return; }
    DB.payments[idx] = { ...DB.payments[idx], date, amount, note, supplier, timeSlot };
    persistDB(); toast('✅ Payment updated!', 'success'); editingPaymentId = null;
  } else {
    DB.payments.push({ id: uid(), date, amount, note, supplier, timeSlot, createdAt: new Date().toISOString() });
    persistDB();
    const sup = getSupplier(supplier);
    toast(`✅ Payment for ${sup?sup.name:'supplier'}!`, 'success');
  }
  closeModal('paymentModal');
  if (activePage === 'ledger') renderLedger();
  if (activePage === 'dashboard') renderDashboard();
  if (activePage === 'payments') renderPaymentsPage();
}

function printCurrentLedger() {
  const { from, to } = getLedgerDateRange();
  const supName = currentLedgerSupplier !== 'all' ? (getSupplier(currentLedgerSupplier)?.name || '') : 'All Suppliers';
  const title = (currentLedgerFilter === 'all' ? 'Full Ledger' :
    currentLedgerFilter === 'this-month' ? 'This Month Ledger' :
    currentLedgerFilter === 'last-month' ? 'Last Month Ledger' :
    `Ledger ${fmtDate(from)} – ${fmtDate(to)}`) + ` – ${supName}`;
  printLedgerPeriod(title, from, to, currentLedgerSupplier !== 'all' ? currentLedgerSupplier : null);
}

function renderPaymentsPage() {
  document.getElementById('payDate').value = todayStr();
  populateSupplierSelect('paySupplier', '');
  const payments = [...DB.payments].sort((a,b) => b.date.localeCompare(a.date));
  const tbody = document.getElementById('paymentBody');
  if (payments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="icon">💳</div><div class="text">No payments recorded yet.</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = payments.map(p => {
    const sup = getSupplier(p.supplier);
    const slotIcon = p.timeSlot === 'evening' ? '🌆' : '🌅';
    return `<tr>
      <td>${fmtDate(p.date)} <span style="font-size:12px;">${slotIcon}</span></td>
      <td>${sup?`<span style="font-size:11px;font-weight:700;color:${sup.color};">👤 ${sup.name}</span>`:'<span style="color:var(--text-muted);">—</span>'}</td>
      <td style="color:var(--text-muted);font-size:12px;">${p.note || '—'}</td>
      <td class="right mono" style="font-weight:700;color:var(--green);">₹${fmt(p.amount)}</td>
      <td>
        <button class="btn btn-info btn-sm" onclick="openEditPayment('${p.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeletePayment('${p.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function recordPayment() {
  const date     = document.getElementById('payDate').value;
  const amount   = parseFloat(document.getElementById('payAmount').value);
  const note     = document.getElementById('payNote').value.trim();
  const supplier = document.getElementById('paySupplier').value;
  const timeSlot = document.getElementById('paySlot').value || 'morning';
  if (!date || isNaN(amount) || amount <= 0) { toast('Enter valid date and amount', 'error'); return; }
  if (!supplier) { toast('Please select a supplier', 'error'); return; }
  DB.payments.push({ id: uid(), date, amount, note, supplier, timeSlot, createdAt: new Date().toISOString() });
  persistDB();
  document.getElementById('payAmount').value = '';
  document.getElementById('payNote').value = '';
  const sup = getSupplier(supplier);
  toast(`✅ Payment for ${sup?sup.name:'supplier'} recorded!`, 'success');
  renderPaymentsPage();
  if (activePage === 'dashboard') renderDashboard();
}

// ==========================================================
//  PRODUCTS
// ==========================================================
function renderProductsPage() {
  const tbody = document.getElementById('productsBody');
  tbody.innerHTML = DB.products.map((p, i) => {
    const cratePrice = p.crateQty ? p.price * p.crateQty : null;
    const isCustom = !DEFAULT_PRODUCTS.find(d => d.id === p.id);
    return `<tr>
      <td style="color:var(--text-muted);font-size:11px;">${i+1}</td>
      <td><strong>${p.name}</strong>${isCustom ? ' <span class="badge badge-blue" style="font-size:9px;padding:1px 5px;">Custom</span>' : ''}</td>
      <td><span class="badge ${p.category==='special'?'badge-red':'badge-gray'}">${p.category}</span></td>
      <td class="right mono">₹${p.price.toFixed(3).replace(/\.?0+$/, '')}${p.eveningPrice != null ? '<br><span style="font-size:10px;color:var(--green);">₹'+p.eveningPrice.toFixed(3).replace(/\.?0+$/,'')+'</span>' : ''}</td>
      <td class="crate-info">${p.crateQty ? p.crateQty+'pcs'+(p.packType?'/'+p.packType:'') : '—'}</td>
      <td class="right mono">${cratePrice ? '₹'+fmt(cratePrice) : '—'}</td>
      <td><button class="btn btn-info btn-sm" onclick="openEditPrice('${p.id}')">✏️ Edit</button></td>
    </tr>`;
  }).join('');
}

function updateEditPreview() {
  const price = parseFloat(document.getElementById('editPriceVal').value);
  const crateQty = parseInt(document.getElementById('editCrateQty').value);
  const packType = document.getElementById('editPackType').value;
  const el = document.getElementById('editPricePreview');
  if (!isNaN(price) && price > 0) {
    const eveningVal = parseFloat(document.getElementById('editEveningPriceVal').value);
    let text = `₹${price.toFixed(3).replace(/\.?0+$/,'')} per piece`;
    if (!isNaN(eveningVal) && eveningVal > 0) { text += ` · Eve: ₹${eveningVal.toFixed(3).replace(/\.?0+$/,'')}`; }
    if (!isNaN(crateQty) && crateQty > 0) { text += ` · ${packType||'Pack'} (${crateQty}pcs) = ₹${fmt(price*crateQty)}`; }
    el.textContent = text;
  } else { el.textContent = ''; }
}

function saveProductPrice() {
  const mode = document.getElementById('editPriceMode').value;
  const name = document.getElementById('editProdName').value.trim();
  const price = parseFloat(document.getElementById('editPriceVal').value);
  const crateQty = document.getElementById('editCrateQty').value ? parseInt(document.getElementById('editCrateQty').value) : null;
  const category = document.getElementById('editCategory').value;
  const packType = document.getElementById('editPackType').value || null;
  const defaultUnit = document.getElementById('editDefaultUnit').value;
  if (!name) { toast('Enter a product name', 'error'); return; }
  if (isNaN(price) || price <= 0) { toast('Enter a valid price', 'error'); return; }
  const eveningPriceVal = document.getElementById('editEveningPriceVal').value;
  const eveningPrice = eveningPriceVal !== '' ? parseFloat(eveningPriceVal) : null;
  if (mode === 'add') {
    DB.products.push({ id: 'c'+uid(), name, price, eveningPrice, crateQty, category, packType, defaultUnit });
    persistDB(); toast('✅ Product added!', 'success');
  } else {
    const id = document.getElementById('editPriceId').value;
    const p = getProduct(id);
    if (!p) return;
    p.name = name; p.price = price; p.eveningPrice = eveningPrice; p.crateQty = crateQty;
    p.category = category; p.packType = packType; p.defaultUnit = defaultUnit;
    persistDB(); toast('✅ Product updated!', 'success');
  }
  closeModal('editPriceModal');
  renderProductsPage();
}

function openAddProduct() {
  document.getElementById('editPriceMode').value = 'add';
  document.getElementById('editPriceId').value = '';
  document.getElementById('editPriceTitle').textContent = '+ Add New Product';
  document.getElementById('editProdName').value = '';
  document.getElementById('editPriceVal').value = '';
  document.getElementById('editEveningPriceVal').value = '';
  document.getElementById('editCrateQty').value = '';
  document.getElementById('editCategory').value = 'regular';
  document.getElementById('editPackType').value = 'Crate';
  document.getElementById('editDefaultUnit').value = 'pack';
  document.getElementById('editDeleteBtn').style.display = 'none';
  document.getElementById('editSaveBtn').textContent = 'Add Product';
  updateEditPreview();
  openModal('editPriceModal');
}

function openEditPrice(id) {
  const p = getProduct(id);
  if (!p) return;
  document.getElementById('editPriceMode').value = 'edit';
  document.getElementById('editPriceId').value = id;
  document.getElementById('editPriceTitle').textContent = 'Edit: ' + p.name;
  document.getElementById('editProdName').value = p.name;
  document.getElementById('editPriceVal').value = p.price;
  document.getElementById('editEveningPriceVal').value = p.eveningPrice != null ? p.eveningPrice : '';
  document.getElementById('editCrateQty').value = p.crateQty || '';
  document.getElementById('editCategory').value = p.category || 'regular';
  document.getElementById('editPackType').value = p.packType || '';
  document.getElementById('editDefaultUnit').value = p.defaultUnit || 'pc';
  const isCustom = !DEFAULT_PRODUCTS.find(d => d.id === p.id);
  const delBtn = document.getElementById('editDeleteBtn');
  delBtn.style.display = isCustom ? 'inline-flex' : 'none';
  delBtn.onclick = () => { closeModal('editPriceModal'); confirmDeleteProduct(id); };
  document.getElementById('editSaveBtn').textContent = 'Save Changes';
  updateEditPreview();
  openModal('editPriceModal');
}

function confirmDeleteProduct(id) {
  const p = getProduct(id);
  if (!p) return;
  pendingDelete = { type: 'product', id };
  document.getElementById('deleteConfirmMsg').textContent = `Delete "${p.name}"? Existing orders will still show by ID.`;
  openModal('deleteConfirmModal');
}

// ==========================================================
//  ANALYTICS
// ==========================================================
function renderAnalytics() {
  const today = todayStr();
  const thisMonth = today.substr(0, 7);
  const totalOrders = DB.orders.reduce((s, o) => s + calcOrderTotal(o), 0);
  const totalPayments = DB.payments.reduce((s, p) => s + p.amount, 0);
  const balance = totalOrders - totalPayments;
  const monthOrders = DB.orders.filter(o => o.date && o.date.startsWith(thisMonth));
  const monthTotal = monthOrders.reduce((s, o) => s + calcOrderTotal(o), 0);

  document.getElementById('analyticsTopStats').innerHTML = `
    <div class="stat-card"><div class="stat-icon red">📦</div>
      <div><div class="stat-label">Total Orders</div><div class="stat-value red">₹${fmt(totalOrders)}</div><div class="stat-sub">${DB.orders.length} transactions</div></div></div>
    <div class="stat-card"><div class="stat-icon green">💳</div>
      <div><div class="stat-label">Total Paid</div><div class="stat-value green">₹${fmt(totalPayments)}</div><div class="stat-sub">${DB.payments.length} payments</div></div></div>
    <div class="stat-card"><div class="stat-icon orange">⚖️</div>
      <div><div class="stat-label">Outstanding</div><div class="stat-value orange">₹${fmt(balance)}</div><div class="stat-sub">Remaining</div></div></div>
    <div class="stat-card"><div class="stat-icon blue">📅</div>
      <div><div class="stat-label">This Month</div><div class="stat-value blue">₹${fmt(monthTotal)}</div><div class="stat-sub">${monthOrders.length} orders</div></div></div>`;

  document.getElementById('analyticsSupplierBreakdown').innerHTML = SUPPLIERS.map(sup => {
    const supOrders = DB.orders.filter(o => o.supplier === sup.id).reduce((s,o) => s+calcOrderTotal(o), 0);
    const supPaid = DB.payments.filter(p => p.supplier === sup.id).reduce((s,p) => s+p.amount, 0);
    const supBal = supOrders - supPaid;
    return `<div style="margin-bottom:12px;padding:12px;border-radius:8px;background:${sup.bg};border-left:3px solid ${sup.color};">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-weight:700;color:${sup.color};">👤 ${sup.name}</span>
        <span style="font-size:11px;color:${sup.color};font-weight:700;">₹${fmt(supBal)}</span>
      </div>
      <div style="display:flex;gap:10px;font-size:11px;">
        <span>Orders: <strong>₹${fmt(supOrders)}</strong></span>
        <span>Paid: <strong style="color:var(--green);">₹${fmt(supPaid)}</strong></span>
      </div>
    </div>`;
  }).join('');

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const m = d.toISOString().substr(0, 7);
    const label = d.toLocaleDateString('en-IN', { month: 'short' });
    const total = DB.orders.filter(o => o.date && o.date.startsWith(m)).reduce((s, o) => s + calcOrderTotal(o), 0);
    months.push({ m, label, total });
  }
  const maxMonth = Math.max(...months.map(x => x.total), 1);
  document.getElementById('monthlyChart').innerHTML = `
    <div style="display:flex;align-items:flex-end;gap:8px;height:120px;padding:0 4px;">
      ${months.map(m => `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
          <div style="font-size:9px;font-weight:700;color:var(--red);font-family:'IBM Plex Mono',monospace;">${m.total>0?(m.total/1000).toFixed(1)+'K':'0'}</div>
          <div style="background:var(--red);border-radius:4px 4px 0 0;width:100%;height:${Math.max((m.total/maxMonth)*90,2)}px;opacity:0.85;"></div>
          <div style="font-size:10px;color:var(--text-muted);font-weight:600;">${m.label}</div>
        </div>`).join('')}
    </div>`;

  const prodTotals = {};
  DB.orders.forEach(o => o.items.forEach(it => { prodTotals[it.productId] = (prodTotals[it.productId] || 0) + it.amount; }));
  const sorted = Object.entries(prodTotals).sort((a,b) => b[1]-a[1]).slice(0, 6);
  const maxProd = Math.max(...sorted.map(x => x[1]), 1);
  document.getElementById('topProductsChart').innerHTML = sorted.length === 0
    ? '<div class="empty-state"><div class="icon">📊</div><div class="text">No data yet.</div></div>'
    : sorted.map(([pid, total]) => {
        const p = DB.products.find(x => x.id === pid);
        const name = p ? p.name : pid;
        const pct = Math.round((total/maxProd)*100);
        return `<div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
            <span style="font-weight:600;">${name}</span>
            <span style="font-family:'IBM Plex Mono',monospace;color:var(--red);">₹${fmt(total)}</span>
          </div>
          <div style="background:var(--light-gray);border-radius:4px;height:8px;overflow:hidden;">
            <div style="background:var(--red);height:100%;width:${pct}%;border-radius:4px;opacity:0.8;"></div>
          </div>
        </div>`;
      }).join('');

  const today2 = new Date();
  const daysInMonth = new Date(today2.getFullYear(), today2.getMonth()+1, 0).getDate();
  const dailyData = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = thisMonth + '-' + String(d).padStart(2,'0');
    const total = DB.orders.filter(o => o.date === ds).reduce((s,o) => s + calcOrderTotal(o), 0);
    dailyData.push({ d, ds, total });
  }
  const maxDay = Math.max(...dailyData.map(x => x.total), 1);
  document.getElementById('dailyChart').innerHTML = `
    <div style="display:flex;align-items:flex-end;gap:3px;height:100px;padding:0 2px;overflow-x:auto;-webkit-overflow-scrolling:touch;">
      ${dailyData.map(d => `
        <div title="${fmtDate(d.ds)}: ₹${fmt(d.total)}" style="flex:0 0 auto;width:22px;display:flex;flex-direction:column;align-items:center;gap:2px;">
          <div style="background:${d.total>0?'var(--red)':'var(--light-gray)'};border-radius:3px 3px 0 0;width:100%;height:${Math.max((d.total/maxDay)*80,2)}px;"></div>
          <div style="font-size:9px;color:var(--text-muted);">${d.d}</div>
        </div>`).join('')}
    </div>`;

  const morning = DB.orders.filter(o=>o.type==='morning').reduce((s,o)=>s+calcOrderTotal(o),0);
  const evening = DB.orders.filter(o=>o.type==='evening').reduce((s,o)=>s+calcOrderTotal(o),0);
  const special = DB.orders.filter(o=>o.type==='special').reduce((s,o)=>s+calcOrderTotal(o),0);
  const slotTotal = morning + evening + special || 1;
  document.getElementById('slotBreakdown').innerHTML =
    [['🌅 Morning', morning, '#b7950b', '#fff8e1'], ['🌆 Evening', evening, 'var(--blue)', 'var(--blue-bg)'], ['⭐ Special', special, 'var(--red)', 'var(--red-bg)']].map(([label,val,color,bg]) => `
    <div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
        <span style="font-weight:700;">${label}</span>
        <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:${color};">₹${fmt(val)} (${Math.round(val/slotTotal*100)}%)</span>
      </div>
      <div style="background:var(--light-gray);border-radius:4px;height:9px;overflow:hidden;">
        <div style="background:${color};height:100%;width:${Math.round(val/slotTotal*100)}%;border-radius:4px;"></div>
      </div>
    </div>`).join('');

  const last6 = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const m = d.toISOString().substr(0, 7);
    const label = d.toLocaleDateString('en-IN', { month: 'short' });
    const orders = DB.orders.filter(o => o.date && o.date.startsWith(m)).reduce((s,o)=>s+calcOrderTotal(o),0);
    const paid = DB.payments.filter(p => p.date && p.date.startsWith(m)).reduce((s,p)=>s+p.amount,0);
    last6.push({ label, orders, paid });
  }
  document.getElementById('paymentTrend').innerHTML = `
    <div class="table-scroll">
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <thead><tr>
          <th style="text-align:left;padding:5px 8px;font-size:10px;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border);">Month</th>
          <th style="text-align:right;padding:5px 8px;font-size:10px;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border);">Orders</th>
          <th style="text-align:right;padding:5px 8px;font-size:10px;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border);">Paid</th>
          <th style="text-align:right;padding:5px 8px;font-size:10px;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border);">Bal</th>
        </tr></thead>
        <tbody>${last6.map(r => `<tr>
          <td style="padding:5px 8px;font-weight:600;">${r.label}</td>
          <td style="padding:5px 8px;text-align:right;font-family:'IBM Plex Mono',monospace;color:var(--red);">₹${fmt(r.orders)}</td>
          <td style="padding:5px 8px;text-align:right;font-family:'IBM Plex Mono',monospace;color:var(--green);">₹${fmt(r.paid)}</td>
          <td style="padding:5px 8px;text-align:right;font-family:'IBM Plex Mono',monospace;color:var(--orange);font-weight:700;">₹${fmt(r.orders-r.paid)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

// ==========================================================
//  EXPORT PAGE
// ==========================================================
function initExportPage() {
  document.getElementById('exportDayDate').value = todayStr();
  document.getElementById('exportMonth').value = todayStr().substr(0, 7);
  updateStorageInfo();
  updateDriveUI(!!_driveToken);
}

function updateStorageInfo() {
  const el = document.getElementById('storageInfoBar');
  if (!el) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { el.innerHTML = '📦 No data saved yet.'; return; }
    const sizeKB = (new Blob([raw]).size / 1024).toFixed(1);
    el.innerHTML = `💾 ${DB.orders.length} orders · ${DB.payments.length} payments · ${sizeKB} KB`;
  } catch(e) { el.innerHTML = 'Storage info unavailable.'; }
}

function exportDailyPDF() { printDayReport(todayStr()); }
function exportSpecificDayPDF() { const d = document.getElementById('exportDayDate').value; if (d) printDayReport(d); else toast('Pick a date', 'error'); }
function exportWeeklyPDF() {
  const d = new Date(); const day = d.getDay() || 7;
  const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
  printLedgerPeriod('Weekly Ledger', mon.toISOString().split('T')[0], todayStr(), null);
}
function exportMonthlyPDF() {
  const m = todayStr().substr(0, 7);
  printLedgerPeriod('Monthly Ledger – ' + new Date().toLocaleDateString('en-IN',{month:'long',year:'numeric'}), m+'-01', todayStr(), null);
}
function exportSpecificMonthPDF() {
  const m = document.getElementById('exportMonth').value;
  if (!m) { toast('Pick a month', 'error'); return; }
  const d = new Date(m+'-01');
  const lastDay = new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().split('T')[0];
  printLedgerPeriod('Ledger – ' + d.toLocaleDateString('en-IN',{month:'long',year:'numeric'}), m+'-01', lastDay, null);
}
function exportYearlyPDF() {
  const y = new Date().getFullYear();
  printLedgerPeriod('Yearly Ledger – '+y, y+'-01-01', y+'-12-31', null);
}

function printDayReport(date) {
  const orders = DB.orders.filter(o => o.date === date).sort((a,b) => rowSortKey({type:a.type,specialSlot:a.specialSlot,timeSlot:null}) - rowSortKey({type:b.type,specialSlot:b.specialSlot,timeSlot:null}));
  const payments = DB.payments.filter(p => p.date === date);
  const totalOrders = orders.reduce((s, o) => s + calcOrderTotal(o), 0);
  const totalPay = payments.reduce((s, p) => s + p.amount, 0);
  let html = `<div class="print-header"><h1>Raj Mart</h1><p style="font-weight:700;">Daily Report – ${fmtDateLong(date)}</p></div>`;
  if (orders.length === 0) {
    html += '<p style="text-align:center;color:#666;padding:20px;">No orders on this date.</p>';
  } else {
    orders.forEach(o => {
      const icon = o.type==='morning'?'🌅':o.type==='evening'?'🌆':(o.specialSlot==='evening'?'🌆⭐':'🌅⭐');
      const typeLabel = o.type==='morning'?'Morning':o.type==='evening'?'Evening':(o.specialSlot==='evening'?'Evening Special':'Morning Special');
      const sup = getSupplier(o.supplier);
      html += `<h3>${icon} ${typeLabel} Order${sup?' – '+sup.name:''}</h3>
        <table class="print-table"><thead><tr><th>Product</th><th class="right">Pcs</th><th class="right">Crates</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead>
        <tbody>${o.items.map(it => {
          const p = DB.products.find(x=>x.id===it.productId)||{name:it.productId};
          const crates = it.crateQtyAtTime ? (it.piecesQty/it.crateQtyAtTime).toFixed(2).replace(/\.?0+$/,'') : '—';
          return `<tr><td>${p.name}</td><td class="right">${it.piecesQty}</td><td class="right">${crates}</td><td class="right">₹${it.priceAtTime.toFixed(3).replace(/\.?0+$/,'')}</td><td class="right">₹${fmt(it.amount)}</td></tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td colspan="4" style="text-align:right;font-weight:700;padding:6px 8px;border-top:2px solid #ddd;">TOTAL</td><td class="right" style="font-weight:700;font-size:14px;border-top:2px solid #ddd;">₹${fmt(calcOrderTotal(o))}</td></tr></tfoot>
        </table>`;
    });
  }
  html += `<div class="print-summary">
    <div class="print-summary-box"><div class="label">Orders</div><div class="value">₹${fmt(totalOrders)}</div></div>
    <div class="print-summary-box"><div class="label">Payments</div><div class="value" style="color:#1e8449;">₹${fmt(totalPay)}</div></div>
    <div class="print-summary-box"><div class="label">Day Balance</div><div class="value" style="color:#d35400;">₹${fmt(totalOrders-totalPay)}</div></div>
  </div>`;
  openPrintWindow(html);
}

function printSingleOrder(orderId) {
  const o = DB.orders.find(x => x.id === orderId);
  if (!o) return;
  const icon = o.type==='morning'?'🌅':o.type==='evening'?'🌆':(o.specialSlot==='evening'?'🌆⭐':'🌅⭐');
  const typeLabel = o.type==='morning'?'Morning':o.type==='evening'?'Evening':(o.specialSlot==='evening'?'Evening Special':'Morning Special');
  const total = calcOrderTotal(o);
  const sup = getSupplier(o.supplier);
  const html = `<div class="print-header"><h1>Raj Mart</h1><p style="font-weight:700;">${icon} ${typeLabel} Order – ${fmtDateLong(o.date)}</p>${sup?`<p>Supplier: ${sup.name}</p>`:''}</div>
    <table class="print-table"><thead><tr><th>Product</th><th class="right">Pcs</th><th class="right">Crates</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead>
    <tbody>${o.items.map(it=>{const p=DB.products.find(x=>x.id===it.productId)||{name:it.productId};const crates=it.crateQtyAtTime?(it.piecesQty/it.crateQtyAtTime).toFixed(2).replace(/\.?0+$/,''):'—';return`<tr><td>${p.name}</td><td class="right">${it.piecesQty}</td><td class="right">${crates}</td><td class="right">₹${it.priceAtTime.toFixed(3).replace(/\.?0+$/,'')}</td><td class="right">₹${fmt(it.amount)}</td></tr>`;}).join('')}</tbody>
    <tfoot><tr><td colspan="4" style="text-align:right;font-weight:700;padding:7px 8px;border-top:2px solid #ddd;">TOTAL</td><td class="right" style="font-weight:700;font-size:14px;border-top:2px solid #ddd;">₹${fmt(total)}</td></tr></tfoot>
    </table>
    ${o.note?`<p style="margin-top:12px;color:#666;font-size:12px;">Note: ${o.note}</p>`:''}
    <div class="print-summary"><div class="print-summary-box"><div class="label">Order Total</div><div class="value">₹${fmt(total)}</div></div></div>`;
  openPrintWindow(html);
}

function printLedgerPeriod(title, from, to, supplierId) {
  const allRows = buildAllLedgerRows(supplierId);
  const rows = allRows.filter(r => r.date >= from && r.date <= to);
  const beforeRows = allRows.filter(r => r.date < from);
  let openingBal = beforeRows.reduce((s, r) => s + r.debit - r.credit, 0);
  let bal = openingBal;
  let totalDebit = 0, totalCredit = 0;
  const rowsWithBal = rows.map(r => { bal += r.debit - r.credit; totalDebit += r.debit; totalCredit += r.credit; return { ...r, balance: bal }; });
  const html = `
    <div class="print-header"><h1>Raj Mart</h1><p style="font-size:14px;font-weight:700;">${title}</p><p>Printed: ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})}</p>${openingBal?`<p>Opening: ₹${fmt(openingBal)}</p>`:''}</div>
    <table class="print-table">
      <thead><tr><th>Date</th><th>Slot</th><th>Supplier</th><th>Description</th><th class="right">Debit</th><th class="right">Credit</th><th class="right">Balance</th></tr></thead>
      <tbody>${rowsWithBal.map(r=>{const sup=getSupplier(r.supplier);const icon=rowIcon(r);return`<tr class="${r.type==='payment'?'payment-row':''}"><td>${fmtDate(r.date)}</td><td>${icon}</td><td>${sup?sup.name:'—'}</td><td>${r.description}</td><td class="right">${r.debit>0?'₹'+fmt(r.debit):'—'}</td><td class="right">${r.credit>0?'₹'+fmt(r.credit):'—'}</td><td class="right balance-cell">₹${fmt(r.balance)}</td></tr>`;}).join('')}</tbody>
      <tfoot><tr style="font-weight:700;background:#f8f8f8;"><td colspan="4" style="text-align:right;padding:8px;">TOTALS</td><td class="right" style="color:#c0392b;">₹${fmt(totalDebit)}</td><td class="right" style="color:#1e8449;">₹${fmt(totalCredit)}</td><td class="right balance-cell">₹${fmt(rowsWithBal.length?rowsWithBal[rowsWithBal.length-1].balance:0)}</td></tr></tfoot>
    </table>
    <div class="print-summary">
      <div class="print-summary-box"><div class="label">Total Orders</div><div class="value">₹${fmt(totalDebit)}</div></div>
      <div class="print-summary-box"><div class="label">Total Payments</div><div class="value" style="color:#1e8449;">₹${fmt(totalCredit)}</div></div>
      <div class="print-summary-box"><div class="label">Closing Balance</div><div class="value" style="color:#d35400;">₹${fmt(rowsWithBal.length?rowsWithBal[rowsWithBal.length-1].balance:openingBal)}</div></div>
    </div>`;
  openPrintWindow(html);
}

function openPrintWindow(content) {
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`<!DOCTYPE html><html><head>
    <title>RajMart – Print</title>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&family=Noto+Kufi+Arabic:wght@700&display=swap" rel="stylesheet">
    <style>
      body{font-family:'IBM Plex Sans',sans-serif;padding:22px;color:#1a1a1a;max-width:860px;margin:0 auto;}
      .print-header{text-align:center;margin-bottom:18px;border-bottom:2px solid #c0392b;padding-bottom:10px;}
      .print-header h1{font-family:'Noto Kufi Arabic',sans-serif;color:#c0392b;font-size:24px;margin-bottom:4px;}
      .print-header p{font-size:12px;color:#666;}
      .print-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:14px;}
      .print-table th{background:#f2f2f2;padding:6px 8px;font-weight:700;font-size:10px;text-transform:uppercase;border:1px solid #ddd;text-align:left;}
      .print-table td{padding:5px 8px;border:1px solid #eee;vertical-align:middle;}
      .print-table .right{text-align:right;}
      .print-table tr.payment-row td{background:#f0faf4;}
      .print-table tfoot td{font-weight:700;background:#f8f8f8;}
      .balance-cell{font-weight:700;color:#c0392b;font-family:'IBM Plex Mono',monospace;}
      .print-summary{margin-top:18px;display:flex;gap:14px;flex-wrap:wrap;}
      .print-summary-box{border:1px solid #ddd;border-radius:6px;padding:10px 14px;min-width:130px;}
      .print-summary-box .label{font-size:10px;text-transform:uppercase;font-weight:700;color:#666;letter-spacing:0.5px;}
      .print-summary-box .value{font-size:18px;font-weight:700;color:#c0392b;font-family:'IBM Plex Mono',monospace;margin-top:3px;}
      h3{color:#c0392b;font-size:12px;margin:14px 0 7px;}
      @media print{button{display:none;}}
    </style>
  </head><body>
    ${content}
    <div style="margin-top:28px;text-align:center;">
      <button onclick="window.print()" style="padding:9px 22px;background:#c0392b;color:white;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">🖨️ Print / Save as PDF</button>
      <button onclick="window.close()" style="padding:9px 22px;background:#f2f2f2;border:1px solid #ddd;border-radius:6px;font-size:13px;cursor:pointer;margin-left:8px;">Close</button>
    </div>
  </body></html>`);
  win.document.close();
}

// ==========================================================
//  MODAL CLOSE ON OVERLAY CLICK
// ==========================================================
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('open'); });
});

document.getElementById('editPriceVal').addEventListener('input', updateEditPreview);
document.getElementById('editEveningPriceVal').addEventListener('input', updateEditPreview);
document.getElementById('editCrateQty').addEventListener('input', updateEditPreview);
document.getElementById('editPackType').addEventListener('change', updateEditPreview);

// ==========================================================
//  INIT
// ==========================================================
showPage('dashboard');
loadFromLocalStorage();
