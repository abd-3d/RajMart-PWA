// ============================================================
//  RajMart – Amul Milk Manager  |  app.js
//  v3 – Multi-Supplier (Ajaybhai, Gaffarbhai, Mukeshbhai)
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
  version: 3,
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
let orderSupplier = 'ajay'; // default supplier for new order
let pendingDelete = null;
let currentLedgerFilter = 'all';
let currentLedgerSupplier = 'all'; // 'all' | supplier id
let orderItems = {};
let editingOrderId = null;
let editOrderItems = {};
let editOrderType = 'morning';
let editOrderSupplier = 'ajay';
let editingPaymentId = null;

// ==========================================================
//  LOCAL STORAGE  (key: "amul_daily")
// ==========================================================
const STORAGE_KEY = 'amul_daily';

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // First ever launch — nothing saved yet, start fresh silently
      return;
    }
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
  } catch(e) {
    // Storage quota exceeded (very rare — ~5MB limit)
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

// Alias kept for backward compatibility (called after every data mutation)
function saveToServer() { saveToLocalStorage(); }

function updateServerIndicator() {
  // No server in PWA mode – keep element hidden
  const el = document.getElementById('serverIndicator');
  if (el) el.style.display = 'none';
}

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveToServer();
  }
});

// ==========================================================
//  FILE OPERATIONS (fallback for non-server mode)
// ==========================================================
function triggerLoadFile() {
  document.getElementById('jsonFileInput').click();
}

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
      persistDB(); // immediately save the imported data to localStorage
      toast('✅ Data imported from: ' + file.name, 'success');
      showPage(activePage);
    } catch(err) {
      toast('Error reading file: ' + err.message, 'error');
    }
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

// Effective price for a product: suppliers Ajaybhai+Gaffarbhai use morning price; Mukeshbhai uses evening price
function getEffectivePriceForSupplier(p, supplierId) {
  const sup = getSupplier(supplierId);
  if (sup && sup.priceType === 'evening' && p.eveningPrice != null) return p.eveningPrice;
  return p.price;
}

// Legacy compatibility (used for display/edit when supplier not yet known)
function getEffectivePrice(p, type) {
  if (type === 'evening' && p.eveningPrice != null) return p.eveningPrice;
  return p.price;
}

function calcOrderTotal(order) { return order.items.reduce((s, it) => s + it.amount, 0); }

function calcBalance(supplierId) {
  const orders = supplierId
    ? DB.orders.filter(o => o.supplier === supplierId)
    : DB.orders;
  const payments = supplierId
    ? DB.payments.filter(p => p.supplier === supplierId)
    : DB.payments;
  const totalOrders = orders.reduce((s, o) => s + calcOrderTotal(o), 0);
  const totalPayments = payments.reduce((s, p) => s + p.amount, 0);
  return totalOrders - totalPayments;
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

// ==========================================================
//  SUPPLIER BADGE HELPER
// ==========================================================
function supplierBadge(supplierId) {
  const sup = getSupplier(supplierId);
  if (!sup) return '';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${sup.bg};color:${sup.color};margin-left:5px;">👤 ${sup.name}</span>`;
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
      <div><div class="stat-label">Outstanding Balance</div><div class="stat-value orange">₹${fmt(balance)}</div><div class="stat-sub">All suppliers</div></div>
    </div>`;

  // Supplier balances
  let supBalHtml = SUPPLIERS.map(sup => {
    const bal = calcBalance(sup.id);
    return `<div style="flex:1;min-width:120px;padding:10px 14px;border-radius:8px;background:${sup.bg};text-align:center;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${sup.color};">${sup.name}</div>
      <div style="font-size:17px;font-weight:700;font-family:'IBM Plex Mono',monospace;color:${sup.color};margin-top:3px;">₹${fmt(bal)}</div>
    </div>`;
  }).join('');
  document.getElementById('dashSupplierBalances').innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;">${supBalHtml}</div>`;

  const recent = [...DB.orders].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 10);
  if (recent.length === 0) {
    document.getElementById('dashRecentOrders').innerHTML = '<div class="empty-state"><div class="icon">📋</div><div class="text">No orders yet. Click New Order to start.</div></div>';
  } else {
    document.getElementById('dashRecentOrders').innerHTML = `
      <table class="data-table">
        <thead><tr><th>Date</th><th>Slot</th><th>Supplier</th><th>Items</th><th class="right">Total (₹)</th></tr></thead>
        <tbody>${recent.map(o => {
          const sup = getSupplier(o.supplier);
          return `<tr style="cursor:pointer;" onclick="showOrderDetail('${o.id}')">
            <td>${fmtDate(o.date)}</td>
            <td><span class="type-badge badge-${o.type}">${o.type==='morning'?'🌅 Morning':o.type==='evening'?'🌆 Evening':'⭐ Special'}</span></td>
            <td style="font-size:11px;font-weight:600;color:${sup?sup.color:'var(--text-muted)'};">${sup?sup.name:'—'}</td>
            <td style="font-size:11px;color:var(--text-muted);">${o.items.length} item(s)</td>
            <td class="right mono" style="font-weight:700;">₹${fmt(calcOrderTotal(o))}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  }

  const pct = totalOrders > 0 ? Math.round((totalPayments/totalOrders)*100) : 0;
  document.getElementById('dashBalance').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center;margin-bottom:14px;">
      <div style="padding:12px;background:var(--red-bg);border-radius:8px;">
        <div style="font-size:10px;color:var(--red);font-weight:700;text-transform:uppercase;letter-spacing:0.7px;">Total Orders</div>
        <div style="font-size:18px;font-weight:700;font-family:'IBM Plex Mono',monospace;color:var(--red);margin-top:4px;">₹${fmt(totalOrders)}</div>
      </div>
      <div style="padding:12px;background:var(--green-bg);border-radius:8px;">
        <div style="font-size:10px;color:var(--green);font-weight:700;text-transform:uppercase;letter-spacing:0.7px;">Total Paid</div>
        <div style="font-size:18px;font-weight:700;font-family:'IBM Plex Mono',monospace;color:var(--green);margin-top:4px;">₹${fmt(totalPayments)}</div>
      </div>
      <div style="padding:12px;background:var(--orange-bg);border-radius:8px;">
        <div style="font-size:10px;color:var(--orange);font-weight:700;text-transform:uppercase;letter-spacing:0.7px;">Remaining</div>
        <div style="font-size:18px;font-weight:700;font-family:'IBM Plex Mono',monospace;color:var(--orange);margin-top:4px;">₹${fmt(balance)}</div>
      </div>
    </div>
    <div style="background:var(--light-gray);border-radius:6px;overflow:hidden;height:10px;margin-bottom:6px;">
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
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:8px;">
      <div><div style="font-size:11px;color:var(--text-muted);">Active days</div><div style="font-size:18px;font-weight:700;">${days.length}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">Daily avg</div><div style="font-size:18px;font-weight:700;color:var(--red);">₹${fmt(days.length ? monthTotal/days.length : 0)}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">Payments</div><div style="font-size:18px;font-weight:700;color:var(--green);">₹${fmt(monthPayTotal)}</div></div>
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
  const titles = { morning:'Products – Morning Delivery', evening:'Products – Evening Delivery', special:'Products – Special Order' };
  document.getElementById('productSectionTitle').textContent = titles[type];
  // Update supplier options based on type
  renderSupplierSelector();
  orderItems = {};
  renderProductList();
  renderOrderPreview();
}

function renderSupplierSelector() {
  const el = document.getElementById('orderSupplierWrap');
  if (!el) return;
  // All suppliers available for every order type (morning, evening, special)
  const available = SUPPLIERS;
  el.innerHTML = available.map(s => `
    <button onclick="setOrderSupplier('${s.id}')" id="supbtn-${s.id}"
      class="${orderSupplier === s.id ? 'active' : ''}"
      style="flex:1;padding:8px 12px;border:1.5px solid ${s.color};border-radius:7px;cursor:pointer;font-family:'IBM Plex Sans',sans-serif;font-size:13px;font-weight:700;background:${orderSupplier===s.id?s.color:'white'};color:${orderSupplier===s.id?'white':s.color};transition:all 0.15s;">
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
    html += `<div class="prod-section-label">⭐ Special Products (Crate Only)</div>`;
    html += specials.map(p => productRowHTML(p, true)).join('');
    html += `<div class="prod-section-label" style="margin-top:10px;">📦 Regular Products (Optional)</div>`;
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
  let priceInfo = `₹${effectivePrice.toFixed(3).replace(/\.?0+$/, '')}/pc`;
  if (p.crateQty && p.packType) priceInfo += ` · ${p.packType}:${p.crateQty}pcs`;
  const priceBadge = isEveningDiff
    ? `<span style="font-size:9px;background:var(--green-bg);color:var(--green);padding:1px 5px;border-radius:8px;font-weight:700;margin-left:4px;">EVE RATE</span>`
    : '';
  return `<div class="product-row ${hasVal ? 'has-value' : ''}" id="prodrow-${p.id}">
    <div>
      <div class="prod-name">${p.name}${priceBadge}</div>
      <div class="prod-price">${priceInfo}</div>
    </div>
    <div class="prod-price" style="text-align:right;">
      ₹${effectivePrice.toFixed(3).replace(/\.?0+$/, '')}/pc
      ${p.crateQty ? `<br>₹${fmt(effectivePrice * p.crateQty)}/${packName.toLowerCase()}` : ''}
      ${isEveningDiff ? `<br><span style="font-size:9px;color:var(--text-muted);text-decoration:line-through;">₹${p.price.toFixed(3).replace(/\.?0+$/,'')}</span>` : ''}
    </div>
    <div class="unit-toggle">
      ${isSpecialCategory
        ? `<button class="active" style="background:var(--red);color:white;" disabled>${packName}</button>`
        : `<button class="${item.unit==='pc'?'active':''}" onclick="setUnit('${p.id}','pc')">PCs</button>
           <button class="${item.unit==='pack'?'active':''}" onclick="setUnit('${p.id}','pack')" ${!p.crateQty?'disabled title="No bulk qty"':''}>${packName}</button>`
      }
    </div>
    <input class="qty-input" type="number" min="0" step="1"
      placeholder="${isSpecialCategory||(item.unit==='pack')?packName+'s':'Pcs'}"
      value="${item.qty}"
      oninput="updateQty('${p.id}', this.value)"
      id="qty-${p.id}">
    <div class="row-total ${rowTotal>0?'active':''}" id="rowtotal-${p.id}">
      ${rowTotal>0 ? '₹'+fmt(rowTotal) : '—'}
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
    previewEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;font-size:12px;">Enter quantities above to see order preview</div>';
    summaryEl.style.display = 'none'; return;
  }
  previewEl.innerHTML = `
    <table class="data-table" style="margin-bottom:0;">
      <thead><tr><th>Product</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead>
      <tbody>${items.map(it => {
        const p = getProduct(it.productId);
        const qtyDisplay = it.inputUnit === 'crate'
          ? `${it.inputQty} crate${it.inputQty>1?'s':''} (${it.piecesQty}pc)`
          : `${it.piecesQty}pc`;
        return `<tr>
          <td>${p ? p.name : it.productId}</td>
          <td class="right mono" style="font-size:11px;">${qtyDisplay}</td>
          <td class="right mono" style="font-size:11px;">₹${it.priceAtTime.toFixed(3).replace(/\.?0+$/,'')}</td>
          <td class="right mono" style="font-weight:700;">₹${fmt(it.amount)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  summaryEl.style.display = 'block';
  summaryEl.innerHTML = `
    <div class="summary-row"><span>Items</span><span>${items.length}</span></div>
    <div class="summary-row"><span>Supplier</span><span style="font-weight:700;color:${sup?sup.color:'inherit'};">${sup?sup.name:'—'}</span></div>
    <div class="summary-row total"><span>Order Total</span><span>₹${fmt(total)}</span></div>`;
}

function submitOrder() {
  const date = document.getElementById('orderDate').value;
  if (!date) { toast('Please select a date', 'error'); return; }
  const items = getOrderItemsList();
  if (items.length === 0) { toast('Please enter at least one product quantity', 'error'); return; }
  const note = document.getElementById('orderNote').value.trim();
  const order = { id: uid(), date, type: orderType, supplier: orderSupplier, items, note, createdAt: new Date().toISOString() };
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
    const tOrder = { morning:0, evening:1, special:2 };
    return (tOrder[a.type]||0) - (tOrder[b.type]||0);
  });
  const el = document.getElementById('todaysOrders');
  if (orders.length === 0) {
    el.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:14px;">No orders for this date.</div>'; return;
  }
  el.innerHTML = orders.map(o => {
    const total = calcOrderTotal(o);
    const icon = o.type==='morning'?'🌅':o.type==='evening'?'🌆':'⭐';
    const sup = getSupplier(o.supplier);
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:13px;font-weight:700;">${icon} ${o.type.charAt(0).toUpperCase()+o.type.slice(1)} ${o.type!=='special'?'Bill':'Order'} ${sup?supplierBadge(o.supplier):''}</div>
        <div style="font-size:11px;color:var(--text-muted);">${o.items.length} item(s)${o.note?' · '+o.note:''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:7px;">
        <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--red);">₹${fmt(total)}</span>
        <button class="btn btn-secondary btn-sm" onclick="showOrderDetail('${o.id}')">View</button>
        <button class="btn btn-info btn-sm" onclick="openEditOrder('${o.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteOrder('${o.id}')">Del</button>
      </div>
    </div>`;
  }).join('');
}

function showOrderDetail(orderId) {
  const o = DB.orders.find(x => x.id === orderId);
  if (!o) return;
  const icon = o.type==='morning'?'🌅':o.type==='evening'?'🌆':'⭐';
  const total = calcOrderTotal(o);
  const sup = getSupplier(o.supplier);
  document.getElementById('orderDetailTitle').textContent = `${icon} ${o.type.charAt(0).toUpperCase()+o.type.slice(1)} Order – ${fmtDateLong(o.date)}`;
  document.getElementById('orderDetailContent').innerHTML = `
    ${sup?`<div style="margin-bottom:10px;font-size:12px;">Supplier: ${supplierBadge(o.supplier)}</div>`:''}
    ${o.note?`<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Note: ${o.note}</div>`:''}
    <table class="data-table">
      <thead><tr><th>Product</th><th class="right">Qty (pcs)</th><th class="right">Crates</th><th class="right">Rate (₹)</th><th class="right">Amount (₹)</th></tr></thead>
      <tbody>${o.items.map(it => {
        const p = DB.products.find(x => x.id === it.productId) || { name: it.productId };
        const crates = it.crateQtyAtTime ? (it.piecesQty / it.crateQtyAtTime).toFixed(2).replace(/\.?0+$/,'') : '—';
        return `<tr>
          <td><strong>${p.name}</strong></td>
          <td class="right mono">${it.piecesQty}</td>
          <td class="right mono" style="color:var(--text-muted);">${crates}</td>
          <td class="right mono">₹${it.priceAtTime.toFixed(3).replace(/\.?0+$/,'')}</td>
          <td class="right mono" style="font-weight:700;">₹${fmt(it.amount)}</td>
        </tr>`;
      }).join('')}</tbody>
      <tfoot>
        <tr><td colspan="4" style="font-weight:700;text-align:right;padding:9px 11px;border-top:2px solid var(--border);">TOTAL</td>
        <td class="right mono" style="font-weight:700;color:var(--red);font-size:14px;padding:9px 11px;border-top:2px solid var(--border);">₹${fmt(total)}</td></tr>
      </tfoot>
    </table>`;
  document.getElementById('orderDetailPrintBtn').onclick = () => printSingleOrder(orderId);
  document.getElementById('orderDetailEditBtn').onclick = () => { closeModal('orderDetailModal'); openEditOrder(orderId); };
  document.getElementById('orderDetailWhatsappBtn').onclick = () => toggleWhatsappMsg(orderId);
  document.getElementById('whatsappCopyArea').style.display = 'none';
  openModal('orderDetailModal');
}

function toggleWhatsappMsg(orderId) {
  const area = document.getElementById('whatsappCopyArea');
  const btn = document.getElementById('orderDetailWhatsappBtn');
  if (area.style.display !== 'none') {
    area.style.display = 'none';
    btn.textContent = 'Share via WhatsApp';
    return;
  }
  const o = DB.orders.find(x => x.id === orderId);
  if (!o) return;
  const sup = getSupplier(o.supplier);
  const slotLabel = o.type === 'morning' ? 'Morning' : o.type === 'evening' ? 'Evening' : 'Special';
  const total = calcOrderTotal(o);

  const pad = (str, len) => String(str).padEnd(len, ' ');
  const rpad = (str, len) => String(str).padStart(len, ' ');

  // Build item lines
  const itemLines = o.items.map(it => {
    const p = DB.products.find(x => x.id === it.productId) || { name: it.productId };
    const name = p.name.length > 20 ? p.name.substring(0, 19) + '.' : p.name;
    let qtyStr;
    if (it.inputUnit === 'pack' || it.inputUnit === 'crate') {
      const packLabel = it.packTypeAtTime || 'Pack';
      qtyStr = `${it.inputQty} ${packLabel} (${it.piecesQty} pcs)`;
    } else if (it.crateQtyAtTime && it.crateQtyAtTime > 0) {
      const packs = it.piecesQty / it.crateQtyAtTime;
      const packsDisplay = Number.isInteger(packs) ? packs : packs.toFixed(2).replace(/\.?0+$/, '');
      const packLabel = it.packTypeAtTime || 'Crate';
      qtyStr = `${it.piecesQty} pcs (${packsDisplay} ${packLabel})`;
    } else {
      qtyStr = `${it.piecesQty} pcs`;
    }
    const rate = `Rs.${it.priceAtTime.toFixed(2)}/pc`;
    const amt = `Rs.${fmt(it.amount)}`;
    return `  ${pad(name, 22)} ${pad(qtyStr, 20)} ${rpad(rate, 12)} ${rpad(amt, 10)}`;
  }).join('\n');

  const divider = '-'.repeat(68);

  const lines = [
    `Raj Mart`,
    `Order Details`,
    divider,
    `Date     : ${fmtDateLong(o.date)}`,
    `Slot     : ${slotLabel}`,
    sup ? `Supplier : ${sup.name}` : '',
    o.note ? `Note     : ${o.note}` : '',
    divider,
    `  ${'Product'.padEnd(22)} ${'Quantity'.padEnd(20)} ${'Rate'.padStart(12)} ${'Amount'.padStart(10)}`,
    divider,
    itemLines,
    divider,
    `${'TOTAL'.padEnd(57)} ${rpad('Rs.' + fmt(total), 10)}`,
    divider,
    ``,
    `Please confirm receipt of this order.`,
    `Thank you.`
  ].filter(l => l !== null && l !== undefined && !(l === '' && false));

  // Remove blank lines that come from empty note/supplier
  const msg = lines.filter((l, i) => l !== '' || i === lines.length - 3).join('\n');

  document.getElementById('whatsappMsgBox').value = msg;
  area.style.display = 'block';
  btn.textContent = 'Hide Message';
}

function copyWhatsappMsg() {
  const box = document.getElementById('whatsappMsgBox');
  if (!box) return;
  box.select();
  box.setSelectionRange(0, 99999);
  try {
    navigator.clipboard.writeText(box.value).then(() => {
      toast('Message copied! Paste it in WhatsApp.', 'success');
    }).catch(() => {
      document.execCommand('copy');
      toast('Message copied! Paste it in WhatsApp.', 'success');
    });
  } catch(e) {
    document.execCommand('copy');
    toast('Message copied! Paste it in WhatsApp.', 'success');
  }
}

function sendLedgerWhatsapp(orderId) {
  const o = DB.orders.find(x => x.id === orderId);
  if (!o) return;
  const sup = getSupplier(o.supplier);
  const slotIcon = o.type === 'morning' ? '🌅' : o.type === 'evening' ? '🌆' : '⭐';
  const slotLabel = o.type === 'morning' ? 'Morning' : o.type === 'evening' ? 'Evening' : 'Special';
  const total = calcOrderTotal(o);

  // Column widths for monospace table
  const C = { name: 18, qty: 18, rate: 13 };
  const pad  = (s, n) => String(s).padEnd(n, ' ');
  const rpad = (s, n) => String(s).padStart(n, ' ');
  const divider = '-'.repeat(C.name + C.qty + C.rate + 12);

  const itemLines = o.items.map(it => {
    const p = DB.products.find(x => x.id === it.productId) || { name: it.productId };
    const name = p.name.length > C.name ? p.name.substring(0, C.name - 1) + '.' : p.name;
    let qtyStr;
    if (it.inputUnit === 'pack' || it.inputUnit === 'crate') {
      qtyStr = `${it.inputQty} ${it.packTypeAtTime||'Pack'} (${it.piecesQty} pcs)`;
    } else if (it.crateQtyAtTime && it.crateQtyAtTime > 0) {
      const packs = it.piecesQty / it.crateQtyAtTime;
      const pd = Number.isInteger(packs) ? packs : packs.toFixed(2).replace(/\.?0+$/,'');
      qtyStr = `${it.piecesQty} pcs (${pd} ${it.packTypeAtTime||'Crate'})`;
    } else {
      qtyStr = `${it.piecesQty} pcs`;
    }
    const rate = `Rs.${it.priceAtTime.toFixed(2)}/pc`;
    const amt  = `Rs.${fmt(it.amount)}`;
    return `${pad(name, C.name)} ${pad(qtyStr, C.qty)} ${pad(rate, C.rate)} ${amt}`;
  }).join('\n');

  const headerRow  = `${pad('Product', C.name)} ${pad('Qty', C.qty)} ${pad('Rate', C.rate)} Amount`;
  const totalLabel = pad('TOTAL', C.name + 1 + C.qty + 1 + C.rate + 1);
  const totalRow   = `${totalLabel}Rs.${fmt(total)}`;

  // Triple backticks = monospace block in WhatsApp (columns align perfectly)
  const table = '```\n' + [headerRow, divider, itemLines, divider, totalRow].join('\n') + '\n```';

  const infoLine = [
    `${fmtDateLong(o.date)}`,
    `${slotIcon} ${slotLabel}`,
    sup ? `${sup.name}` : ''
  ].filter(Boolean).join('  |  ');

  const msg = [
    `*Raj Mart – Order Details*`,
    ``,
    infoLine,
    o.note ? `📝 ${o.note}` : null,
    ``,
    table,
    `*Total: Rs.${fmt(total)}*`,
    ``
  ].filter(l => l !== null).join('\n');

  navigator.clipboard.writeText(msg).then(() => {
    toast('📋 Message copied! Paste it in WhatsApp.', 'success');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = msg; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, 99999);
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('📋 Message copied! Paste it in WhatsApp.', 'success');
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
  editOrderItems = {};
  o.items.forEach(it => {
    editOrderItems[it.productId] = { qty: String(it.inputQty), unit: it.inputUnit };
  });
  document.getElementById('editOrderDate').value = o.date;
  document.getElementById('editOrderNote').value = o.note || '';
  setEditOrderType(o.type);
  openModal('editOrderModal');
}

function setEditOrderType(type) {
  editOrderType = type;
  ['morning','evening','special'].forEach(t => {
    const btn = document.getElementById('editbtn-' + t);
    btn.className = t === type ? 'active ' + t : '';
  });
  const titles = { morning:'Products – Morning Delivery', evening:'Products – Evening Delivery', special:'Products – Special Order' };
  document.getElementById('editProductSectionTitle').textContent = titles[type];
  renderEditSupplierSelector();
  renderEditProductList();
  renderEditOrderPreview();
}

function renderEditSupplierSelector() {
  const el = document.getElementById('editOrderSupplierWrap');
  if (!el) return;
  // All suppliers available for every order type (morning, evening, special)
  const available = SUPPLIERS;
  if (!available.find(s => s.id === editOrderSupplier)) {
    editOrderSupplier = available[0]?.id || 'ajay';
  }
  el.innerHTML = available.map(s => `
    <button onclick="setEditOrderSupplier('${s.id}')"
      style="flex:1;padding:7px 10px;border:1.5px solid ${s.color};border-radius:7px;cursor:pointer;font-family:'IBM Plex Sans',sans-serif;font-size:12px;font-weight:700;background:${editOrderSupplier===s.id?s.color:'white'};color:${editOrderSupplier===s.id?'white':s.color};transition:all 0.15s;">
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
    html += `<div class="prod-section-label">⭐ Special Products (Crate Only)</div>`;
    html += specials.map(p => editProductRowHTML(p, true)).join('');
    html += `<div class="prod-section-label" style="margin-top:10px;">📦 Regular Products (Optional)</div>`;
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
  let priceInfo = `₹${effectivePrice.toFixed(3).replace(/\.?0+$/, '')}/pc`;
  if (p.crateQty && p.packType) priceInfo += ` · ${p.packType}:${p.crateQty}pcs`;
  const priceBadge = isEveningDiff
    ? `<span style="font-size:9px;background:var(--green-bg);color:var(--green);padding:1px 5px;border-radius:8px;font-weight:700;margin-left:4px;">EVE RATE</span>`
    : '';
  return `<div class="product-row ${hasVal ? 'has-value' : ''}" id="editprodrow-${p.id}">
    <div>
      <div class="prod-name">${p.name}${priceBadge}</div>
      <div class="prod-price">${priceInfo}</div>
    </div>
    <div class="prod-price" style="text-align:right;">
      ₹${effectivePrice.toFixed(3).replace(/\.?0+$/, '')}/pc
      ${p.crateQty ? `<br>₹${fmt(effectivePrice * p.crateQty)}/${packName.toLowerCase()}` : ''}
      ${isEveningDiff ? `<br><span style="font-size:9px;color:var(--text-muted);text-decoration:line-through;">₹${p.price.toFixed(3).replace(/\.?0+$/,'')}</span>` : ''}
    </div>
    <div class="unit-toggle">
      ${isSpecialCategory
        ? `<button class="active" style="background:var(--red);color:white;" disabled>${packName}</button>`
        : `<button class="${item.unit==='pc'?'active':''}" onclick="setEditUnit('${p.id}','pc')">PCs</button>
           <button class="${item.unit==='pack'?'active':''}" onclick="setEditUnit('${p.id}','pack')" ${!p.crateQty?'disabled title="No bulk qty"':''}>${packName}</button>`
      }
    </div>
    <input class="qty-input" type="number" min="0" step="1"
      placeholder="${isSpecialCategory||(item.unit==='pack')?packName+'s':'Pcs'}"
      value="${item.qty}"
      oninput="updateEditQty('${p.id}', this.value)"
      id="editqty-${p.id}">
    <div class="row-total ${rowTotal>0?'active':''}" id="editrowtotal-${p.id}">
      ${rowTotal>0 ? '₹'+fmt(rowTotal) : '—'}
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
  DB.orders[idx] = { ...DB.orders[idx], date, type: editOrderType, supplier: editOrderSupplier, items, note };
  persistDB();
  toast('✅ Order updated!', 'success');
  closeModal('editOrderModal');
  editingOrderId = null;
  editOrderItems = {};
  if (activePage === 'order') renderTodaysOrders();
  if (activePage === 'dashboard') renderDashboard();
  if (activePage === 'ledger') renderLedger();
}

function confirmDelete() {
  if (!pendingDelete) return;
  const { type, id } = pendingDelete;
  if (type === 'order') {
    DB.orders = DB.orders.filter(o => o.id !== id);
    persistDB();
    toast('Order deleted.', 'info');
    if (activePage === 'order') renderTodaysOrders();
    if (activePage === 'dashboard') renderDashboard();
    if (activePage === 'ledger') renderLedger();
  } else if (type === 'payment') {
    DB.payments = DB.payments.filter(p => p.id !== id);
    persistDB();
    toast('Payment deleted.', 'info');
    renderPaymentsPage();
    if (activePage === 'dashboard') renderDashboard();
    if (activePage === 'ledger') renderLedger();
  } else if (type === 'product') {
    DB.products = DB.products.filter(p => p.id !== id);
    persistDB();
    toast('Product deleted.', 'info');
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
  // update supplier tab UI
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
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
    return { from: m + '-01', to: lastDay };
  } else if (currentLedgerFilter === 'custom') {
    return { from: document.getElementById('ledgerFrom').value || '2000-01-01', to: document.getElementById('ledgerTo').value || today };
  }
  return { from: '2000-01-01', to: '2099-12-31' };
}

function buildAllLedgerRows(supplierId) {
  const rows = [];
  const orders = supplierId && supplierId !== 'all'
    ? DB.orders.filter(o => o.supplier === supplierId)
    : DB.orders;
  const payments = supplierId && supplierId !== 'all'
    ? DB.payments.filter(p => p.supplier === supplierId)
    : DB.payments;

  orders.forEach(o => {
    const total = calcOrderTotal(o);
    const sup = getSupplier(o.supplier);
    rows.push({
      id: o.id, date: o.date, type: o.type, debit: total, credit: 0,
      amount: total, items: o.items, note: o.note,
      supplier: o.supplier,
      description: (sup ? sup.name + ' – ' : '') + (o.type === 'morning' ? 'Morning Bill' : o.type === 'evening' ? 'Evening Bill' : 'Special Order')
    });
  });
  payments.forEach(p => {
    const sup = getSupplier(p.supplier);
    rows.push({
      id: p.id, date: p.date, type: 'payment', debit: 0, credit: p.amount, amount: p.amount,
      supplier: p.supplier,
      description: (sup ? sup.name + ' – ' : '') + (p.note || 'Payment Received')
    });
  });
  const typeOrder = { morning:0, evening:1, special:2, payment:3 };
  rows.sort((a, b) => a.date.localeCompare(b.date) || (typeOrder[a.type]??2) - (typeOrder[b.type]??2));
  return rows;
}

function renderLedger() {
  // Render supplier tabs
  const tabContainer = document.getElementById('ledgerSupplierTabs');
  if (tabContainer) {
    tabContainer.innerHTML = `
      <button class="supplier-tab ${currentLedgerSupplier==='all'?'active':''}" id="supTab-all" onclick="setLedgerSupplier('all')">🌐 All Suppliers</button>
      ${SUPPLIERS.map(s => `
        <button class="supplier-tab ${currentLedgerSupplier===s.id?'active':''}" id="supTab-${s.id}"
          onclick="setLedgerSupplier('${s.id}')"
          style="${currentLedgerSupplier===s.id?'background:'+s.color+';color:white;border-color:'+s.color+';':'color:'+s.color+';border-color:'+s.color+';'}">
          👤 ${s.name}
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
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="icon">📒</div><div class="text">No transactions in this period.</div></div></td></tr>`;
  } else {
    tbody.innerHTML = rows.map(r => {
      bal += r.debit - r.credit;
      totalDebit += r.debit;
      totalCredit += r.credit;
      const isPay = r.type === 'payment';
      const detailId = 'det-' + r.id;
      const sup = getSupplier(r.supplier);
      let detailHTML = '';
      if (!isPay && r.items) {
        detailHTML = `<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
          <button class="ledger-expand-btn" title="View order details" onclick="toggleDetail('${detailId}')">👁️</button>
          <button class="btn btn-info btn-sm" style="padding:2px 7px;font-size:10px;" onclick="openEditOrder('${r.id}')">✏️</button>
          <button class="btn btn-secondary btn-sm" style="padding:2px 7px;font-size:10px;" onclick="printSingleOrder('${r.id}')" title="Print this order">🖨️</button>
          <button class="btn btn-success btn-sm" style="padding:2px 7px;font-size:10px;" onclick="sendLedgerWhatsapp('${r.id}')" title="Share via WhatsApp">📲</button>
          <button class="btn btn-danger btn-sm" style="padding:2px 7px;font-size:10px;" onclick="confirmDeleteOrder('${r.id}')">🗑️</button>
        </div>
          <div class="ledger-detail" id="${detailId}">
            ${r.items.map(it => {
              const p = DB.products.find(x => x.id === it.productId) || { name: it.productId };
              let qtyDisplay;
              if (it.inputUnit === 'pack' || it.inputUnit === 'crate') {
                const packLabel = it.packTypeAtTime || 'Pack';
                qtyDisplay = `${it.inputQty} ${packLabel.toLowerCase()}${it.inputQty>1?'s':''} (${it.piecesQty} pcs)`;
              } else if (it.crateQtyAtTime && it.crateQtyAtTime > 0) {
                const packs = (it.piecesQty / it.crateQtyAtTime);
                const packsDisplay = Number.isInteger(packs) ? packs : packs.toFixed(2).replace(/\.?0+$/,'');
                const packLabel = it.packTypeAtTime || 'crate';
                qtyDisplay = `${it.piecesQty} pcs (${packsDisplay} ${packLabel.toLowerCase()}${packs!==1?'s':''})`;
              } else {
                qtyDisplay = `${it.piecesQty} pcs`;
              }
              return `<div class="detail-row"><span>${p.name} × ${qtyDisplay}</span><span>₹${fmt(it.amount)}</span></div>`;
            }).join('')}
          </div>`;
      }
      return `<tr class="${isPay?'payment-row':''}">
        <td class="date-cell">${fmtDate(r.date)}</td>
        <td><span class="type-badge badge-${r.type}">${r.type==='morning'?'🌅 Morning':r.type==='evening'?'🌆 Evening':r.type==='special'?'⭐ Special':'💳 Payment'}</span></td>
        <td>${sup?`<span style="font-size:11px;font-weight:700;color:${sup.color};">👤 ${sup.name}</span>`:'<span style="color:var(--text-muted);font-size:11px;">—</span>'}</td>
        <td style="font-size:12px;">${r.description}${r.note&&!isPay?'<br><span style="color:var(--text-muted);font-size:10px;">'+r.note+'</span>':''}</td>
        <td class="right mono" style="color:var(--red);">${r.debit>0?'₹'+fmt(r.debit):'—'}</td>
        <td class="right mono credit-cell">${r.credit>0?'₹'+fmt(r.credit):'—'}</td>
        <td class="right balance-cell">₹${fmt(bal)}</td>
        <td>${detailHTML}${isPay?`<div style="display:flex;gap:4px;align-items:center;"><button class="btn btn-info btn-sm" style="padding:2px 7px;font-size:10px;" onclick="openEditPayment('${r.id}')">✏️</button><button class="btn btn-danger btn-sm" style="padding:2px 7px;font-size:10px;" onclick="confirmDeletePayment('${r.id}')">🗑️</button></div>`:''}</td>
      </tr>`;
    }).join('');
  }

  const outstanding = bal;
  const currentSup = currentLedgerSupplier !== 'all' ? getSupplier(currentLedgerSupplier) : null;
  document.getElementById('ledgerSummaryBar').innerHTML = `
    <div style="padding:8px 14px;background:var(--red-bg);border-radius:7px;font-size:12px;">
      <span style="font-weight:700;color:var(--red);">Total Orders: ₹${fmt(totalDebit)}</span>
    </div>
    <div style="padding:8px 14px;background:var(--green-bg);border-radius:7px;font-size:12px;">
      <span style="font-weight:700;color:var(--green);">Total Paid: ₹${fmt(totalCredit)}</span>
    </div>
    <div style="padding:8px 14px;background:var(--orange-bg);border-radius:7px;font-size:12px;">
      <span style="font-weight:700;color:var(--orange);">Balance: ₹${fmt(outstanding)}</span>
    </div>
    ${openingBal > 0 ? `<div style="padding:8px 14px;background:var(--light-gray);border-radius:7px;font-size:12px;color:var(--text-muted);">Opening: ₹${fmt(openingBal)}</div>` : ''}
    ${currentSup ? `<div style="padding:8px 14px;border-radius:7px;font-size:12px;background:${currentSup.bg};"><span style="font-weight:700;color:${currentSup.color};">Viewing: ${currentSup.name}</span></div>` : ''}`;
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
  openModal('paymentModal');
}

function recordPaymentFromModal() {
  const date = document.getElementById('payModalDate').value;
  const amount = parseFloat(document.getElementById('payModalAmount').value);
  const note = document.getElementById('payModalNote').value.trim();
  const supplier = document.getElementById('payModalSupplier').value;
  if (!date || isNaN(amount) || amount <= 0) { toast('Enter valid date and amount', 'error'); return; }
  if (!supplier) { toast('Please select a supplier', 'error'); return; }
  if (editingPaymentId) {
    const idx = DB.payments.findIndex(p => p.id === editingPaymentId);
    if (idx === -1) { toast('Payment not found', 'error'); return; }
    DB.payments[idx] = { ...DB.payments[idx], date, amount, note, supplier };
    persistDB();
    toast('✅ Payment updated!', 'success');
    editingPaymentId = null;
  } else {
    DB.payments.push({ id: uid(), date, amount, note, supplier, createdAt: new Date().toISOString() });
    persistDB();
    const sup = getSupplier(supplier);
    toast(`✅ Payment recorded for ${sup?sup.name:'supplier'}!`, 'success');
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
    currentLedgerFilter === 'last-month' ? 'Last Month Ledger' : `Ledger ${fmtDate(from)} – ${fmtDate(to)}`) + ` – ${supName}`;
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
    return `<tr>
      <td>${fmtDate(p.date)}</td>
      <td>${sup?`<span style="font-size:11px;font-weight:700;color:${sup.color};">👤 ${sup.name}</span>`:'<span style="color:var(--text-muted);">—</span>'}</td>
      <td style="color:var(--text-muted);font-size:12px;">${p.note || '—'}</td>
      <td class="right mono" style="font-weight:700;color:var(--green);">₹${fmt(p.amount)}</td>
      <td>
        <button class="btn btn-info btn-sm" onclick="openEditPayment('${p.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeletePayment('${p.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

function recordPayment() {
  const date = document.getElementById('payDate').value;
  const amount = parseFloat(document.getElementById('payAmount').value);
  const note = document.getElementById('payNote').value.trim();
  const supplier = document.getElementById('paySupplier').value;
  if (!date || isNaN(amount) || amount <= 0) { toast('Enter valid date and amount', 'error'); return; }
  if (!supplier) { toast('Please select a supplier', 'error'); return; }
  DB.payments.push({ id: uid(), date, amount, note, supplier, createdAt: new Date().toISOString() });
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
      <td class="right mono">₹${p.price.toFixed(3).replace(/\.?0+$/, '')}${p.eveningPrice != null ? '<br><span style="font-size:10px;color:var(--green);">₹' + p.eveningPrice.toFixed(3).replace(/\.?0+$/,'') + ' eve</span>' : ''}</td>
      <td class="crate-info">${p.crateQty ? p.crateQty + ' pcs' + (p.packType ? ' / '+p.packType : '') : '—'}</td>
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
    let text = `₹${price.toFixed(3).replace(/\.?0+$/,'')} per piece (morning/Ajaybhai/Gaffarbhai)`;
    if (!isNaN(eveningVal) && eveningVal > 0) {
      text += ` · ₹${eveningVal.toFixed(3).replace(/\.?0+$/,'')} per piece (Mukeshbhai)`;
    }
    if (!isNaN(crateQty) && crateQty > 0 && packType) {
      text += ` · ${packType} (${crateQty} pcs) = ₹${fmt(price * crateQty)}`;
    } else if (!isNaN(crateQty) && crateQty > 0) {
      text += ` · Pack (${crateQty} pcs) = ₹${fmt(price * crateQty)}`;
    }
    el.textContent = text;
  } else {
    el.textContent = '';
  }
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
    const newProd = { id: 'c' + uid(), name, price, eveningPrice, crateQty, category, packType, defaultUnit };
    DB.products.push(newProd);
    persistDB();
    toast('✅ Product added!', 'success');
  } else {
    const id = document.getElementById('editPriceId').value;
    const p = getProduct(id);
    if (!p) return;
    p.name = name; p.price = price; p.eveningPrice = eveningPrice; p.crateQty = crateQty;
    p.category = category; p.packType = packType; p.defaultUnit = defaultUnit;
    persistDB();
    toast('✅ Product updated!', 'success');
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
  document.getElementById('editPriceTitle').textContent = 'Edit Product – ' + p.name;
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
  document.getElementById('deleteConfirmMsg').textContent = `Delete product "${p.name}"? This cannot be undone. Existing orders referencing this product will still show by ID.`;
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

  // Supplier breakdown
  const supBreakdownHtml = SUPPLIERS.map(sup => {
    const supOrders = DB.orders.filter(o => o.supplier === sup.id).reduce((s,o) => s+calcOrderTotal(o), 0);
    const supPaid = DB.payments.filter(p => p.supplier === sup.id).reduce((s,p) => s+p.amount, 0);
    const supBal = supOrders - supPaid;
    return `<div style="margin-bottom:12px;padding:12px;border-radius:8px;background:${sup.bg};border-left:3px solid ${sup.color};">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-weight:700;color:${sup.color};">👤 ${sup.name}</span>
        <span style="font-size:11px;color:${sup.color};font-weight:700;">Balance: ₹${fmt(supBal)}</span>
      </div>
      <div style="display:flex;gap:10px;font-size:11px;">
        <span>Orders: <strong>₹${fmt(supOrders)}</strong></span>
        <span>Paid: <strong style="color:var(--green);">₹${fmt(supPaid)}</strong></span>
      </div>
    </div>`;
  }).join('');
  document.getElementById('analyticsSupplierBreakdown').innerHTML = supBreakdownHtml;

  // Monthly chart (last 6 months)
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
    <div style="display:flex;align-items:flex-end;gap:8px;height:140px;padding:0 4px;">
      ${months.map(m => `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
          <div style="font-size:10px;font-weight:700;color:var(--red);font-family:'IBM Plex Mono',monospace;">₹${m.total>0?(m.total/1000).toFixed(1)+'K':'0'}</div>
          <div style="background:var(--red);border-radius:4px 4px 0 0;width:100%;height:${Math.max((m.total/maxMonth)*110,2)}px;opacity:0.85;"></div>
          <div style="font-size:10px;color:var(--text-muted);font-weight:600;">${m.label}</div>
        </div>`).join('')}
    </div>`;

  // Top products
  const prodTotals = {};
  DB.orders.forEach(o => o.items.forEach(it => {
    prodTotals[it.productId] = (prodTotals[it.productId] || 0) + it.amount;
  }));
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
            <div style="background:var(--red);height:100%;width:${pct}%;border-radius:4px;opacity:0.8;transition:width 0.4s;"></div>
          </div>
        </div>`;
      }).join('');

  // Daily this month
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
    <div style="display:flex;align-items:flex-end;gap:3px;height:100px;padding:0 2px;overflow-x:auto;">
      ${dailyData.map(d => `
        <div title="${fmtDate(d.ds)}: ₹${fmt(d.total)}" style="flex:0 0 auto;width:20px;display:flex;flex-direction:column;align-items:center;gap:2px;">
          <div style="background:${d.total>0?'var(--red)':'var(--light-gray)'};border-radius:3px 3px 0 0;width:100%;height:${Math.max((d.total/maxDay)*80,2)}px;"></div>
          <div style="font-size:9px;color:var(--text-muted);">${d.d}</div>
        </div>`).join('')}
    </div>`;

  // Slot breakdown
  const morning = DB.orders.filter(o => o.type==='morning').reduce((s,o) => s+calcOrderTotal(o), 0);
  const evening = DB.orders.filter(o => o.type==='evening').reduce((s,o) => s+calcOrderTotal(o), 0);
  const special = DB.orders.filter(o => o.type==='special').reduce((s,o) => s+calcOrderTotal(o), 0);
  const slotTotal = morning + evening + special || 1;
  document.getElementById('slotBreakdown').innerHTML = `
    ${[['🌅 Morning', morning, '#b7950b', '#fff8e1'], ['🌆 Evening', evening, 'var(--blue)', 'var(--blue-bg)'], ['⭐ Special', special, 'var(--red)', 'var(--red-bg)']].map(([label,val,color,bg]) => `
    <div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
        <span style="font-weight:700;">${label}</span>
        <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:${color};">₹${fmt(val)} (${Math.round(val/slotTotal*100)}%)</span>
      </div>
      <div style="background:var(--light-gray);border-radius:4px;height:9px;overflow:hidden;">
        <div style="background:${color};height:100%;width:${Math.round(val/slotTotal*100)}%;border-radius:4px;"></div>
      </div>
    </div>`).join('')}`;

  // Payment trend
  const last6 = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const m = d.toISOString().substr(0, 7);
    const label = d.toLocaleDateString('en-IN', { month: 'short' });
    const orders = DB.orders.filter(o => o.date && o.date.startsWith(m)).reduce((s,o) => s+calcOrderTotal(o), 0);
    const paid = DB.payments.filter(p => p.date && p.date.startsWith(m)).reduce((s,p) => s+p.amount, 0);
    last6.push({ label, orders, paid });
  }
  document.getElementById('paymentTrend').innerHTML = `
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      <thead><tr>
        <th style="text-align:left;padding:5px 8px;font-size:10px;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border);">Month</th>
        <th style="text-align:right;padding:5px 8px;font-size:10px;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border);">Orders</th>
        <th style="text-align:right;padding:5px 8px;font-size:10px;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border);">Paid</th>
        <th style="text-align:right;padding:5px 8px;font-size:10px;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border);">Balance</th>
      </tr></thead>
      <tbody>${last6.map(r => `<tr>
        <td style="padding:5px 8px;font-weight:600;">${r.label}</td>
        <td style="padding:5px 8px;text-align:right;font-family:'IBM Plex Mono',monospace;color:var(--red);">₹${fmt(r.orders)}</td>
        <td style="padding:5px 8px;text-align:right;font-family:'IBM Plex Mono',monospace;color:var(--green);">₹${fmt(r.paid)}</td>
        <td style="padding:5px 8px;text-align:right;font-family:'IBM Plex Mono',monospace;color:var(--orange);font-weight:700;">₹${fmt(r.orders-r.paid)}</td>
      </tr>`).join('')}</tbody>
    </table>`;
}

// ==========================================================
//  EXPORT PAGE
// ==========================================================
function initExportPage() {
  document.getElementById('exportDayDate').value = todayStr();
  document.getElementById('exportMonth').value = todayStr().substr(0, 7);
  // Show storage info
  updateStorageInfo();
}

function updateStorageInfo() {
  const el = document.getElementById('storageInfoBar');
  if (!el) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { el.innerHTML = '📦 No data saved yet.'; return; }
    const sizeKB = (new Blob([raw]).size / 1024).toFixed(1);
    el.innerHTML = `💾 <strong>amul_daily</strong> &nbsp;·&nbsp; ${DB.orders.length} orders &nbsp;·&nbsp; ${DB.payments.length} payments &nbsp;·&nbsp; <span style="font-family:'IBM Plex Mono',monospace;">${sizeKB} KB</span> stored on this device`;
  } catch(e) {
    el.innerHTML = 'Storage info unavailable.';
  }
}

function exportDailyPDF() { printDayReport(todayStr()); }
function exportSpecificDayPDF() { const d = document.getElementById('exportDayDate').value; if (d) printDayReport(d); else toast('Pick a date', 'error'); }
function exportWeeklyPDF() {
  const d = new Date();
  const day = d.getDay() || 7;
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
  const orders = DB.orders.filter(o => o.date === date).sort((a,b) => {
    const t = { morning:0, evening:1, special:2 };
    return (t[a.type]||0)-(t[b.type]||0);
  });
  const payments = DB.payments.filter(p => p.date === date);
  const totalOrders = orders.reduce((s, o) => s + calcOrderTotal(o), 0);
  const totalPay = payments.reduce((s, p) => s + p.amount, 0);
  let html = `<div class="print-header"><h1>Raj Mart</h1><p style="font-weight:700;">Daily Report – ${fmtDateLong(date)}</p><p>Printed: ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})}</p></div>`;
  if (orders.length === 0) {
    html += '<p style="text-align:center;color:#666;padding:20px;">No orders on this date.</p>';
  } else {
    orders.forEach(o => {
      const icon = o.type==='morning'?'🌅':o.type==='evening'?'🌆':'⭐';
      const sup = getSupplier(o.supplier);
      html += `<h3>${icon} ${o.type.charAt(0).toUpperCase()+o.type.slice(1)} Order${sup?' – '+sup.name:''}</h3>
        <table class="print-table"><thead><tr><th>Product</th><th class="right">Qty (pcs)</th><th class="right">Crates</th><th class="right">Rate (₹)</th><th class="right">Amount (₹)</th></tr></thead>
        <tbody>${o.items.map(it => {
          const p = DB.products.find(x => x.id===it.productId)||{name:it.productId};
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
  const icon = o.type==='morning'?'🌅':o.type==='evening'?'🌆':'⭐';
  const total = calcOrderTotal(o);
  const sup = getSupplier(o.supplier);
  const html = `<div class="print-header"><h1>Raj Mart</h1><p style="font-weight:700;">${icon} ${o.type.charAt(0).toUpperCase()+o.type.slice(1)} Order – ${fmtDateLong(o.date)}</p>${sup?`<p>Supplier: ${sup.name}</p>`:''}</div>
    <table class="print-table"><thead><tr><th>Product</th><th class="right">Qty (pcs)</th><th class="right">Crates</th><th class="right">Rate (₹)</th><th class="right">Amount (₹)</th></tr></thead>
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
  const rowsWithBal = rows.map(r => {
    bal += r.debit - r.credit;
    totalDebit += r.debit;
    totalCredit += r.credit;
    return { ...r, balance: bal };
  });
  const html = `
    <div class="print-header">
      <h1>Raj Mart</h1>
      <p style="font-size:14px;font-weight:700;">${title}</p>
      <p>Printed: ${new Date().toLocaleDateString('en-IN', {day:'2-digit',month:'long',year:'numeric'})}</p>
      ${openingBal ? `<p>Opening Balance: ₹${fmt(openingBal)}</p>` : ''}
    </div>
    <table class="print-table">
      <thead>
        <tr>
          <th>Date</th><th>Type</th><th>Supplier</th><th>Description</th>
          <th class="right">Debit (₹)</th><th class="right">Credit (₹)</th><th class="right balance-cell">Balance (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${rowsWithBal.map(r => {
          const sup = getSupplier(r.supplier);
          return `<tr class="${r.type==='payment'?'payment-row':''}">
            <td>${fmtDate(r.date)}</td>
            <td>${r.type==='payment'?'PAYMENT':r.type==='special'?'Special':'Regular'}</td>
            <td>${sup?sup.name:'—'}</td>
            <td>${r.description}</td>
            <td class="right">${r.debit>0?'₹'+fmt(r.debit):'—'}</td>
            <td class="right">${r.credit>0?'₹'+fmt(r.credit):'—'}</td>
            <td class="right balance-cell">₹${fmt(r.balance)}</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr style="font-weight:700;background:#f8f8f8;">
          <td colspan="4" style="text-align:right;padding:8px;">TOTALS</td>
          <td class="right" style="color:#c0392b;">₹${fmt(totalDebit)}</td>
          <td class="right" style="color:#1e8449;">₹${fmt(totalCredit)}</td>
          <td class="right balance-cell">₹${fmt(rowsWithBal.length?rowsWithBal[rowsWithBal.length-1].balance:0)}</td>
        </tr>
      </tfoot>
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
      <button onclick="window.print()" style="padding:9px 22px;background:#c0392b;color:white;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;font-family:'IBM Plex Sans',sans-serif;">🖨️ Print / Save as PDF</button>
      <button onclick="window.close()" style="padding:9px 22px;background:#f2f2f2;border:1px solid #ddd;border-radius:6px;font-size:13px;cursor:pointer;margin-left:8px;font-family:'IBM Plex Sans',sans-serif;">Close</button>
    </div>
  </body></html>`);
  win.document.close();
}

// ==========================================================
//  MODAL CLOSE ON OVERLAY CLICK
// ==========================================================
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
});

// Edit price form listeners
document.getElementById('editPriceVal').addEventListener('input', updateEditPreview);
document.getElementById('editEveningPriceVal').addEventListener('input', updateEditPreview);
document.getElementById('editCrateQty').addEventListener('input', updateEditPreview);
document.getElementById('editPackType').addEventListener('change', updateEditPreview);

// ==========================================================
//  INIT
// ==========================================================
showPage('dashboard');
loadFromLocalStorage();