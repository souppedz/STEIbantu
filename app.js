/**
 * STEI BANTU - APPLICATION CONTROLLER (V3)
 * 
 * Features:
 * - Activity tab auto-updates on new order
 * - Order Detail Page (like Gojek: track, chat, status)
 * - Dynamic price estimation via PriceEstimatorService
 * - BantuRide: distance-based + tier (Hemat/Normal/Luxe)
 * - BantuSend: size + speed tier
 * - BantuClean: sqm + cleaning type + room type
 * - BantuFix: full catalog (8 categories) + AI diagnosis
 * - BantuShop: cart system + AI search + catalog
 * - Chat: AI-generated dummy responses
 */

let currentSelectedService = '';
let globalLeafletMap = null;
let trackingLeafletMap = null;
let detailTrackingMap = null;   // Bug 1 fix: module-level so logout/back can clean up
let currentActiveOrderId = null;
let currentUser = null;
let shopCart = [];
let chatPollingInterval = null;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initTabNavigationSystem();
    initServiceClickDispatcher();
    animateDashboardLoad();
    loadUserSession();
    renderActivityTab();
    renderChatsTab();
    shopCart = window.db.getCart();
});

function animateDashboardLoad() {
    document.querySelectorAll('.animate-in').forEach((card, i) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(16px)';
        setTimeout(() => {
            card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, i * 80);
    });
}

function loadUserSession() {
    currentUser = window.db.getSession();
    if (currentUser) {
        updateSidebarUser(currentUser);
    }
}

function updateSidebarUser(user) {
    const nameEl = document.getElementById('sidebar-profile-name');
    const balEl = document.getElementById('sidebar-wallet-balance');
    const dashBalEl = document.getElementById('dashboard-wallet-balance-text');
    const pointsEl = document.getElementById('user-points-display');
    const xpEl = document.getElementById('current-xp');
    const sidebarWallet = document.querySelector('.sidebar-wallet-mini');

    if (nameEl) nameEl.innerText = user.name || 'User';
    if (balEl) balEl.innerText = `Rp ${user.balance.toLocaleString('id-ID')}`;
    if (dashBalEl) dashBalEl.innerText = `Rp ${user.balance.toLocaleString('id-ID')}`;
    if (pointsEl) pointsEl.innerText = user.points;
    if (xpEl) xpEl.innerText = user.xp;
    if (sidebarWallet) {
        sidebarWallet.style.display = 'block';
    }
}

function getCurrentSessionUser() {
    return currentUser || window.db.getSession();
}

function getVisibleOrders() {
    const user = getCurrentSessionUser();
    if (!user) return [];
    const orders = window.db.getOrders();
    if (user.role === 'worker') return orders.filter(o => o.workerId === user.workerId);
    return orders.filter(o => o.userId === user.id);
}

function getVisibleChatOrders() {
    const user = getCurrentSessionUser();
    if (!user) return [];
    const chats = window.db.getAllChats();
    return getVisibleOrders().filter(o => (chats[o.id] || []).length > 0);
}

// ============================================================
// AUTH
// ============================================================
function handleFakeAuth(event) {
    event.preventDefault();
    const phoneRaw = document.getElementById('auth-input-identifier')?.value || '';
    const nameText = document.getElementById('auth-input-name')?.value || '';
    const btn = document.querySelector('#core-auth-form button[type="submit"]');
    if (btn) { btn.innerText = 'Mengirim OTP...'; btn.disabled = true; }
    setTimeout(() => {
        const otp = prompt('[STEI BANTU OTP] Masukkan 4-Digit Kode Verifikasi (Ketik: 1234):');
        if (otp === '1234') {
            let normalizedPhone = phoneRaw.replace(/\D/g, '');
            if (normalizedPhone.startsWith('0')) normalizedPhone = normalizedPhone.slice(1);
            if (normalizedPhone.startsWith('62')) normalizedPhone = normalizedPhone.slice(2);
            const phone = '+62' + normalizedPhone;
            let loginResult = window.authService.login(phone, '123456');
            if (!loginResult.success) {
                if (nameText) {
                    loginResult = window.authService.signup(nameText, `${normalizedPhone}@stei.itb.ac.id`, phone, '123456');
                } else {
                    alert('Akun tidak ditemukan. Masukkan nama untuk daftar baru atau gunakan nomor terdaftar.');
                    if (btn) { btn.innerText = 'Kirim OTP'; btn.disabled = false; }
                    return;
                }
            }
            currentUser = loginResult.user;
            window.db.saveSession(currentUser);
            updateSidebarUser(currentUser);
            const sidebar = document.getElementById('main-sidebar');
            if (sidebar) { sidebar.style.filter = 'none'; sidebar.style.pointerEvents = 'auto'; }
            document.getElementById('auth-view').style.display = 'none';

            const role = currentUser.role || 'user';
            ['dashboard-view','service-workspace-view','live-tracking-view','order-detail-view','worker-view'].forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.style.display = 'none'; el.classList.remove('active'); }
            });
            if (role === 'worker') {
                _currentWorker = null;
                document.getElementById('worker-view').style.display = 'flex';
                renderWorkerDashboard(currentUser);
            } else {
                _currentWorker = null;
                document.getElementById('dashboard-view').style.display = 'block';
                setTimeout(() => { initLeafletMapCore(); animateDashboardLoad(); renderActivityTab(); renderChatsTab(); }, 100);
            }
            showToast('Login Berhasil', `Selamat Datang, ${currentUser.name}! (${role === 'worker' ? 'Mode Mitra' : 'Mode Pengguna'})`);
        } else if (otp !== null) {
            alert('Kode OTP salah! Gunakan: 1234');
            if (btn) { btn.innerText = 'Kirim OTP'; btn.disabled = false; }
        } else {
            if (btn) { btn.innerText = 'Kirim OTP'; btn.disabled = false; }
        }
    }, 600);
}

function switchAuthMode(mode) {
    const extra = document.getElementById('signup-extra-fields');
    const btns = document.querySelectorAll('.auth-toggle-header .toggle-btn');
    btns.forEach(b => b.classList.remove('active'));
    if (mode === 'signup') { if (extra) extra.style.display = 'block'; btns[1]?.classList.add('active'); }
    else { if (extra) extra.style.display = 'none'; btns[0]?.classList.add('active'); }
}

// ============================================================
// NAVIGATION
// ============================================================
function initTabNavigationSystem() {
    document.querySelectorAll('.tab-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (currentUser && currentUser.role === 'worker') {
                if (btn.dataset.tab === 'tab-home') switchWorkerTab('wtab-home');
                if (btn.dataset.tab === 'tab-orders') switchWorkerTab('wtab-activity');
                if (btn.dataset.tab === 'tab-chats') switchWorkerTab('wtab-chat');
                return;
            }

            document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
            const target = document.getElementById(btn.dataset.tab);
            if (target) target.style.display = 'block';
            if (btn.dataset.tab === 'tab-orders') renderActivityTab();
            if (btn.dataset.tab === 'tab-chats') renderChatsTab();
        });
    });
}

function initServiceClickDispatcher() {
    document.querySelectorAll('.service-item-btn').forEach(item => {
        if (item.classList.contains('worker-service-btn')) return;
        item.addEventListener('click', () => {
            if (currentUser?.role === 'worker') {
                showToast('Akses Dibatasi', 'Mitra tidak dapat membuat pesanan dari sisi pengguna.');
                return;
            }
            const key = item.dataset.service;
            currentSelectedService = key;
            const names = {
                BantuRide: { title: 'BantuRide', sub: 'Ojek & Taksi Kampus' },
                BantuSend: { title: 'BantuSend', sub: 'Kurir & Pengiriman' },
                BantuClean: { title: 'BantuClean', sub: 'Kebersihan Kosan' },
                BantuFix: { title: 'BantuFix', sub: 'Servis & Perbaikan' },
                BantuShop: { title: 'BantuShop', sub: 'Belanja Apa Saja' }
            };
            document.getElementById('workspace-service-title').innerText = names[key]?.title || key;
            document.getElementById('workspace-service-subtitle').innerText = names[key]?.sub || '';
            document.querySelectorAll('.service-specific-sheet').forEach(s => s.style.display = 'none');
            const sheet = document.getElementById(`sheet-${key}`);
            if (sheet) sheet.style.display = 'block';
            document.getElementById('dashboard-view').classList.remove('active');
            document.getElementById('service-workspace-view').style.display = 'flex';
            if (key === 'BantuFix') renderBantuFixCatalog();
            if (key === 'BantuShop') { renderShopCategories(); renderShopCatalog(); }
            if (key === 'BantuRide' || key === 'BantuSend') initGeoAutocompletes();
            updateLivePrices();
        });
    });

    document.querySelectorAll('.back-to-home-trigger').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('service-workspace-view').style.display = 'none';
            document.getElementById('live-tracking-view').style.display = 'none';
            document.getElementById('order-detail-view').style.display = 'none';
            document.getElementById('dashboard-view').classList.add('active');
            if (globalLeafletMap) globalLeafletMap.invalidateSize();
            stopChatPolling();
        });
    });
}

function setLoc(id, val) {
    const el = document.getElementById(id);
    if (el) { el.value = val; updateLivePrices(); }
}

// ============================================================
// GEOCODING — Nominatim (Bug 2 fix)
// ============================================================
// Per-field coord cache so we don't re-geocode on every keystroke
const _coordCache = {};

async function geocodeAddress(address) {
    const key = address.trim().toLowerCase();
    if (_coordCache[key]) return _coordCache[key];
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ', Bandung, Indonesia')}&format=json&limit=1`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'id' } });
        const data = await res.json();
        if (data && data[0]) {
            const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name };
            _coordCache[key] = result;
            return result;
        }
    } catch(e) { /* fallback below */ }
    return null;
}

// Autocomplete: debounced Nominatim suggest
const _autocompleteTimers = {};
async function attachGeoAutocomplete(inputId, dropdownId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;
    input.addEventListener('input', () => {
        clearTimeout(_autocompleteTimers[inputId]);
        const q = input.value.trim();
        if (q.length < 3) { dropdown.style.display = 'none'; return; }
        _autocompleteTimers[inputId] = setTimeout(async () => {
            try {
                const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Bandung, Indonesia')}&format=json&limit=5&addressdetails=1`;
                const res = await fetch(url, { headers: { 'Accept-Language': 'id' } });
                const data = await res.json();
                if (!data.length) { dropdown.style.display = 'none'; return; }
                dropdown.innerHTML = data.map(r => {
                    const short = r.display_name.split(',').slice(0, 3).join(', ');
                    return `<div class="geo-suggest-item" data-lat="${r.lat}" data-lng="${r.lon}" data-full="${r.display_name}">${short}</div>`;
                }).join('');
                dropdown.style.display = 'block';
                dropdown.querySelectorAll('.geo-suggest-item').forEach(item => {
                    item.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        input.value = item.dataset.full.split(',').slice(0,3).join(', ');
                        _coordCache[input.value.trim().toLowerCase()] = { lat: parseFloat(item.dataset.lat), lng: parseFloat(item.dataset.lng) };
                        dropdown.style.display = 'none';
                        updateLivePrices();
                    });
                });
            } catch(e) { dropdown.style.display = 'none'; }
        }, 400);
    });
    input.addEventListener('blur', () => setTimeout(() => { dropdown.style.display = 'none'; }, 150));
}

// Called once when BantuRide / BantuSend sheets open
function initGeoAutocompletes() {
    attachGeoAutocomplete('ride-pickup',       'ride-pickup-suggestions');
    attachGeoAutocomplete('ride-destination',  'ride-destination-suggestions');
    attachGeoAutocomplete('send-pickup',       'send-pickup-suggestions');
    attachGeoAutocomplete('send-destination',  'send-destination-suggestions');
}

// ============================================================
// PRICING ENGINE — now with real Nominatim distance (Bug 2 fix)
// ============================================================
// Fallback ITB → Gedung Sate coords for services that don't have address fields
const ITB_DEFAULT  = { lat: -6.8915, lng: 107.6107 };
const DEST_DEFAULT = { lat: -6.9025, lng: 107.6188 };

async function resolveCoords() {
    let pickup = null, dest = null;
    if (currentSelectedService === 'BantuRide') {
        const pVal = document.getElementById('ride-pickup')?.value?.trim();
        const dVal = document.getElementById('ride-destination')?.value?.trim();
        if (pVal) pickup = await geocodeAddress(pVal);
        if (dVal) dest   = await geocodeAddress(dVal);
    } else if (currentSelectedService === 'BantuSend') {
        const pVal = document.getElementById('send-pickup')?.value?.trim();
        const dVal = document.getElementById('send-destination')?.value?.trim();
        if (pVal) pickup = await geocodeAddress(pVal);
        if (dVal) dest   = await geocodeAddress(dVal);
    }
    pickup = pickup || ITB_DEFAULT;
    dest   = dest   || DEST_DEFAULT;
    return { pickup, dest };
}

async function updateLivePrices() {
    const user = currentUser || window.db.getSession();
    const userTier = user?.tier || 'Bronze';

    // Bug 2 fix: resolve real coordinates from address fields via Nominatim
    const { pickup, dest } = await resolveCoords();
    const dist = window.locationService.calculateDistance(pickup.lat, pickup.lng, dest.lat, dest.lng);
    const dur  = window.locationService.calculateDuration(dist);

    let params = {};
    if (currentSelectedService === 'BantuRide') {
        params.vehicleType = document.querySelector('input[name="ride-vehicle"]:checked')?.value || 'motorcycle';
        params.vehicleTier = document.querySelector('input[name="ride-tier"]:checked')?.value || 'Normal';
    } else if (currentSelectedService === 'BantuSend') {
        params.packageSize = document.getElementById('send-size')?.value || 'S';
        params.deliverySpeed = document.getElementById('send-speed')?.value || 'Same-Day';
    } else if (currentSelectedService === 'BantuClean') {
        params.roomArea = parseFloat(document.getElementById('clean-sqm')?.value) || 12;
        params.cleaningType = document.getElementById('clean-type')?.value || 'Sapu & Pel';
        params.roomType = document.getElementById('clean-room-type')?.value || 'Kamar Tidur';
    } else if (currentSelectedService === 'BantuShop') {
        const cartTotal = shopCart.reduce((sum, item) => sum + item.product.price * item.qty, 0);
        const aiTotal = parseFloat(document.getElementById('shop-ai-items-cost')?.value) || 0;
        params.estimatedItemsCost = cartTotal + aiTotal;
        params.shopCategory = 'custom';
    } else if (currentSelectedService === 'BantuFix') {
        // fall through — try external API first, then local estimator as fallback
    }
    if (!currentSelectedService) return;

    // Prefer external price API for BantuShop and BantuFix (proxy will forward or fallback)
    let fare = null;
    try {
        if (currentSelectedService === 'BantuShop' || currentSelectedService === 'BantuFix') {
            const payload = { serviceType: currentSelectedService, pickup, destination: dest, params, userTier };
            const apiRes = await window.priceApi.fetchEstimate(payload);
            if (apiRes && apiRes.fare) fare = apiRes.fare;
        }
    } catch (e) {
        // ignore and fallback to local estimator
        fare = null;
    }

    if (!fare) {
        // local fallback for all other services and when API fails
        fare = window.priceEstimatorService.estimateFare(currentSelectedService, dist, dur, userTier, params);
    }
    const baseEl = document.getElementById('calculated-base-fare');
    const modEl = document.getElementById('calculated-modifier-fare');
    const totalEl = document.getElementById('final-calculated-total');
    const distEl = document.getElementById('estimated-distance-label');
    const durEl = document.getElementById('estimated-duration-label');

    if (baseEl) baseEl.innerText = `Rp ${( (fare.baseFare||0) + (fare.distanceFare||0) ).toLocaleString('id-ID')}`;
    if (modEl) modEl.innerText = `Rp ${( (fare.timeFare||0) + (fare.platformFee||0) ).toLocaleString('id-ID')}`;
    if (totalEl) totalEl.innerText = `Rp ${(fare.total||0).toLocaleString('id-ID')}`;
    if (distEl) distEl.innerText = `~${dist} km`;
    if (durEl) durEl.innerText = `~${(fare.dynamicDuration||dur)} mnt`;

    if (fare.discount > 0) {
        const discEl = document.getElementById('discount-row');
        if (discEl) { discEl.style.display = 'flex'; discEl.querySelector('b').innerText = `-Rp ${fare.discount.toLocaleString('id-ID')}`; }
    }
}

function setFixPrice(base, mod, total) {
    document.getElementById('calculated-base-fare').innerText = `Rp ${base.toLocaleString('id-ID')}`;
    document.getElementById('calculated-modifier-fare').innerText = `Rp ${mod.toLocaleString('id-ID')}`;
    document.getElementById('final-calculated-total').innerText = `Rp ${total.toLocaleString('id-ID')}`;
}

// ============================================================
// BANTURIDE — Tier selector
// ============================================================
// (handled via updateLivePrices)

// ============================================================
// BANTUSEND — Speed tier
// ============================================================
// (handled via updateLivePrices)

// ============================================================
// BANTUCLEAN — Room type & cleaning type
// ============================================================
// (handled via updateLivePrices)

// ============================================================
// BANTUFIX — Full Catalog (V3)
// ============================================================
function renderBantuFixCatalog() {
    const container = document.getElementById('bantufix-catalog-grid');
    if (!container || container.dataset.rendered) return;
    container.dataset.rendered = '1';
    const cats = window.BANTUFIX_CATALOG.categories;
    container.innerHTML = cats.map(cat => `
        <div class="fix-cat-card" onclick="openFixCategory('${cat.id}')">
            <div class="fix-cat-icon" style="background:${cat.color}20; color:${cat.color}">
                <i class="fa ${cat.icon}"></i>
            </div>
            <span class="fix-cat-name">${cat.name}</span>
            <span class="fix-cat-count">${cat.items.length} layanan</span>
        </div>
    `).join('');
}

function openFixCategory(catId) {
    const cat = window.BANTUFIX_CATALOG.categories.find(c => c.id === catId);
    if (!cat) return;
    const drawer = document.getElementById('fix-category-drawer');
    const title = document.getElementById('fix-drawer-title');
    const list = document.getElementById('fix-drawer-items');
    if (!drawer) return;
    title.innerText = cat.name;
    title.style.color = cat.color;
    list.innerHTML = cat.items.map(item => `
        <div class="fix-item-row" onclick="selectFixItem('${item.n}', ${item.p})">
            <div class="fix-item-info">
                <span class="fix-item-name">${item.n}</span>
                <span class="fix-item-meta"><i class="fa fa-clock"></i> ${item.d}</span>
            </div>
            <div class="fix-item-price-col">
                <span class="fix-item-price">Rp ${item.p.toLocaleString('id-ID')}</span>
                <span class="fix-select-btn">Pilih</span>
            </div>
        </div>
    `).join('');
    drawer.style.display = 'block';
}

function closeFixDrawer() {
    document.getElementById('fix-category-drawer').style.display = 'none';
}

function selectFixItem(name, price) {
    document.getElementById('fix-selected-label').innerText = name;
    document.getElementById('fix-selected-label').style.display = 'block';
    setFixPrice(price, 5000, price + 5000);
    closeFixDrawer();
    showToast('Layanan Dipilih', name);
}

// ============================================================
// BANTUSHOP — Cart System + AI
// ============================================================
function renderShopCatalog(filterCat = 'all', searchQ = '') {
    const feed = document.getElementById('shop-product-feed');
    if (!feed) return;

    let products = window.SHOP_CATALOG.products;
    if (filterCat !== 'all') products = products.filter(p => p.cat === filterCat);
    if (searchQ) {
        const q = searchQ.toLowerCase();
        products = products.filter(p => p.name.toLowerCase().includes(q) || (p.tags||[]).some(t => t.includes(q)));
    }

    feed.innerHTML = products.map(p => {
        const inCart = shopCart.find(c => c.product.id === p.id);
        const qty = inCart ? inCart.qty : 0;
        return `
        <div class="shop-product-card">
            <div class="spc-emoji">${p.emoji}</div>
            <div class="spc-details">
                <span class="spc-name">${p.name}</span>
                <span class="spc-price">Rp ${p.price.toLocaleString('id-ID')}<small>/${p.unit}</small></span>
                <div class="spc-actions">
                    ${qty === 0 ? `<button class="spc-add-btn" onclick="addToCart('${p.id}')"><i class="fa fa-plus"></i> Tambah</button>`
                    : `<div class="spc-qty-row">
                        <button class="qty-control-btn" onclick="changeCartQty('${p.id}', -1)">−</button>
                        <span class="spc-qty">${qty}</span>
                        <button class="qty-control-btn" onclick="changeCartQty('${p.id}', 1)">+</button>
                       </div>`}
                </div>
            </div>
        </div>`;
    }).join('');

    renderCartBadge();
    updateLivePrices();
}

function renderShopCategories() {
    const pill = document.getElementById('shop-cat-pills');
    if (!pill || pill.dataset.rendered) return;
    pill.dataset.rendered = '1';
    const cats = [{ id: 'all', label: '✨ Semua' }, ...window.SHOP_CATALOG.categories];
    pill.innerHTML = cats.map((c, i) => `
        <button class="shop-cat-pill ${i===0?'active':''}" onclick="filterShop('${c.id}', this)">${c.label || c.name}</button>
    `).join('');
}

function filterShop(catId, btn) {
    document.querySelectorAll('.shop-cat-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderShopCatalog(catId, document.getElementById('shop-search')?.value || '');
}

function searchShop(q) {
    const activeCat = document.querySelector('.shop-cat-pill.active')?.dataset?.cat || 'all';
    renderShopCatalog(activeCat, q);
}

function addToCart(productId) {
    const product = window.SHOP_CATALOG.products.find(p => p.id === productId);
    if (!product) return;
    const existing = shopCart.find(c => c.product.id === productId);
    if (existing) existing.qty++;
    else shopCart.push({ product, qty: 1 });
    window.db.saveCart(shopCart);
    renderShopCatalog(getActiveShopCat(), document.getElementById('shop-search')?.value || '');
    showToast('Ditambahkan ke Cart', product.name);
}

function changeCartQty(productId, delta) {
    const idx = shopCart.findIndex(c => c.product.id === productId);
    if (idx === -1) return;
    shopCart[idx].qty += delta;
    if (shopCart[idx].qty <= 0) shopCart.splice(idx, 1);
    window.db.saveCart(shopCart);
    renderShopCatalog(getActiveShopCat(), document.getElementById('shop-search')?.value || '');
}

function getActiveShopCat() {
    return document.querySelector('.shop-cat-pill.active')?.dataset?.cat || 'all';
}

function renderCartBadge() {
    const total = shopCart.reduce((s, c) => s + c.qty, 0);
    const badge = document.getElementById('cart-badge');
    if (badge) badge.innerText = total > 0 ? total : '';
    const cartBtn = document.getElementById('cart-toggle-btn');
    if (cartBtn) cartBtn.style.display = 'flex';
}

function toggleCartPanel() {
    const panel = document.getElementById('cart-panel');
    if (!panel) return;
    const visible = panel.style.display === 'block';
    panel.style.display = visible ? 'none' : 'block';
    if (!visible) renderCartPanel();
}

function renderCartPanel() {
    const panel = document.getElementById('cart-panel');
    if (!panel) return;
    if (shopCart.length === 0) {
        panel.innerHTML = `<div class="cart-empty"><i class="fa fa-cart-shopping"></i><p>Cart kosong. Tambah produk dulu!</p></div>`;
        return;
    }
    const total = shopCart.reduce((s, c) => s + c.product.price * c.qty, 0);
    panel.innerHTML = `
        <div class="cart-header"><span>🛒 Cart Kamu (${shopCart.length} item)</span><button onclick="toggleCartPanel()" class="cart-close-btn">✕</button></div>
        <div class="cart-items-list">
            ${shopCart.map(c => `
            <div class="cart-item-row">
                <span class="cart-item-emoji">${c.product.emoji}</span>
                <div class="cart-item-info">
                    <span class="cart-item-name">${c.product.name}</span>
                    <span class="cart-item-price">Rp ${(c.product.price * c.qty).toLocaleString('id-ID')}</span>
                </div>
                <div class="cart-qty-ctrl">
                    <button onclick="changeCartQty('${c.product.id}', -1)">−</button>
                    <span>${c.qty}</span>
                    <button onclick="changeCartQty('${c.product.id}', 1)">+</button>
                </div>
            </div>`).join('')}
        </div>
        <div class="cart-footer">
            <div class="cart-total-row"><span>Total Barang:</span><b>Rp ${total.toLocaleString('id-ID')}</b></div>
            <small style="color:var(--text-secondary); font-size:0.75rem;">+ biaya runner akan dihitung</small>
        </div>`;
    renderCartBadge();
    updateLivePrices();
}

// ============================================================
// AI BANTUSHOP
// ============================================================
// Lightweight frontend fallback parsers (run when proxy/external AI unavailable)
function frontendParseFallbackCartFromQuery(rawQuery) {
    try {
        const q = (rawQuery || '').toString().toLowerCase();
        const parts = q.split(/,| dan |\+|;/).map(s => s.trim()).filter(Boolean);
        const map = [
            { keys: ['nasi kotak','nasi box'], price: 20000, unit: 'porsi' },
            { keys: ['air mineral','galon','air galon'], price: 22000, unit: 'galon' },
            { keys: ['paracetamol','parasetamol'], price: 6000, unit: 'strip' },
            { keys: ['kertas hvs','hvs'], price: 55000, unit: 'rim' },
            { keys: ['indomie','mie instan'], price: 2500, unit: 'pcs' }
        ];
        const fallbackCart = [];
        for (const p of parts) {
            let qty = 1;
            const m = p.match(/(\d+)\s*(porsi|pcs|strip|galon|botol|dos|pack|rim)?/i);
            if (m) qty = parseInt(m[1]);
            for (const entry of map) {
                if (entry.keys.some(k => p.includes(k))) {
                    fallbackCart.push({ name: p.slice(0,200), qty, unitPrice: entry.price, currency: 'IDR', sourceUrl: '' });
                    break;
                }
            }
        }
        return fallbackCart;
    } catch (e) { return []; }
}

function frontendParseFallbackFixDiagnosis(rawQuery) {
    try {
        const q = (rawQuery || '').toString().toLowerCase();
        const mappings = [
            { keys: ['lampu','mati','tidak menyala'], category: 'Kelistrikan', diagnosis: 'Lampu tidak menyala, kemungkinan bohlam putus', parts: [{ part: 'Bohlam LED', estimatedCost: 15000 }], labor: 20000, duration: '15-30 mnt' },
            { keys: ['stop kontak','konslet'], category: 'Kelistrikan', diagnosis: 'Stop kontak bermasalah/korslet', parts: [{ part: 'Stop Kontak', estimatedCost: 30000 }], labor: 35000, duration: '20-45 mnt' },
            { keys: ['ac','ac tidak dingin'], category: 'AC / Pendingin', diagnosis: 'AC kurang dingin, perlu pembersihan/cek freon', parts: [{ part: 'Servis AC (estimasi)', estimatedCost: 80000 }], labor: 80000, duration: '60-120 mnt' }
        ];
        for (const m of mappings) {
            if (m.keys.some(k => q.includes(k))) {
                const parts = m.parts || [];
                const partsCost = parts.reduce((s,p) => s + (p.estimatedCost||0), 0);
                const total = partsCost + (m.labor || 40000);
                return {
                    diagnosis: m.diagnosis,
                    severity: 'Sedang',
                    category: m.category,
                    partsNeeded: parts,
                    laborCost: m.labor || 40000,
                    totalEstimate: total,
                    estimatedDuration: m.duration || '30-90 mnt',
                    technicianNote: 'Perkiraan awal — teknisi akan verifikasi di lokasi.',
                    diyTip: ''
                };
            }
        }
        return null;
    } catch (e) { return null; }
}
async function runAiBantuShopSearch() {
    const query = document.getElementById('shop-ai-query')?.value?.trim();
    if (!query) { showToast('Masukkan Permintaan', 'Ketik dulu apa yang ingin kamu beli!'); return; }
    const panel = document.getElementById('shop-ai-result-panel');
    const btn = document.getElementById('shop-ai-btn');
    panel.style.display = 'block';
    panel.innerHTML = `<div class="ai-loading-state"><div class="ai-spinner"></div><p>Mencari harga terbaik untuk <strong>"${query}"</strong>...</p></div>`;
    btn.disabled = true; btn.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i> Mencari...';
    try {
        // Prefer using local proxy price API (supports Indonesian queries and avoids CORS/API key in browser)
        if (window.priceApi && typeof window.priceApi.fetchEstimate === 'function') {
            const payload = { serviceType: 'BantuShop', pickup: ITB_DEFAULT, destination: DEST_DEFAULT, params: { shopQuery: query }, userTier: (currentUser?.tier || 'Bronze') };
            const apiRes = await window.priceApi.fetchEstimate(payload);
            if (apiRes && apiRes.parsed && Array.isArray(apiRes.parsed.cart)) {
                const parsed = apiRes.parsed;
                const result = {
                    items: parsed.cart.map(i => ({ name: i.name, estimatedPrice: i.unitPrice, unit: 'pcs', where: i.sourceUrl || '', note: '' })),
                    totalEstimate: parsed.estimatedItemsCost || parsed.estimated_items_cost || 0,
                    serviceFee: 3000,
                    runnerNote: '',
                    suggestedStores: []
                };
                renderShopAiResult(result, query);
                const hidden = document.getElementById('shop-ai-items-cost');
                if (hidden) hidden.value = result.totalEstimate;
                updateLivePrices();
                return;
            }
            // If proxy returned nothing usable, try a lightweight frontend fallback parser
            const fbCart = frontendParseFallbackCartFromQuery(query);
            if (fbCart && fbCart.length) {
                const parsed = { cart: fbCart, estimatedItemsCost: fbCart.reduce((s,i)=>s+(i.unitPrice||0)*(i.qty||1),0) };
                const result = {
                    items: parsed.cart.map(i => ({ name: i.name, estimatedPrice: i.unitPrice, unit: 'pcs', where: i.sourceUrl || '', note: '' })),
                    totalEstimate: parsed.estimatedItemsCost || 0,
                    serviceFee: 3000,
                    runnerNote: '',
                    suggestedStores: []
                };
                renderShopAiResult(result, query);
                const hidden = document.getElementById('shop-ai-items-cost'); if (hidden) hidden.value = result.totalEstimate;
                updateLivePrices();
                return;
            }
        }

        // Fallback: attempt direct Claude/Anthropic call (may fail in browser due to missing key/CORS)
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514', max_tokens: 1000,
                system: `Kamu adalah asisten belanja untuk mahasiswa ITB Bandung. Respons HANYA JSON murni (tanpa markdown/backtick):
{"items":[{"name":"nama barang","estimatedPrice":25000,"unit":"pcs/lembar/dll","where":"Toko nyata di Bandung","note":"catatan"}],"totalEstimate":50000,"serviceFee":15000,"runnerNote":"catatan runner","suggestedStores":["nama toko 1","nama toko 2"]}
Harga realistis Bandung 2024 (integer Rupiah). Max 5 item. Toko spesifik nyata sekitar ITB/Bandung.`,
                messages: [{ role: 'user', content: `Saya mau beli: ${query}` }]
            })
        });
        const data = await res.json();
        const text = data.content?.map(b => b.text || '').join('') || '';
        const result = JSON.parse(text.replace(/```json|```/g, '').trim());
        renderShopAiResult(result, query);
        // Store AI cost so updateLivePrices can use it
        const hidden = document.getElementById('shop-ai-items-cost');
        if (hidden) hidden.value = result.totalEstimate;
        updateLivePrices();
    } catch (e) {
        panel.innerHTML = `<div class="ai-error-state"><i class="fa fa-triangle-exclamation"></i> Gagal mendapatkan estimasi. Coba lagi!</div>`;
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fa fa-sparkles"></i> Cari & Estimasi Harga';
    }
}

function renderShopAiResult(result, query) {
    const panel = document.getElementById('shop-ai-result-panel');
    const items = result.items.map(item => `
        <div class="ai-item-row">
            <div class="ai-item-left">
                <span class="ai-item-name">${item.name}</span>
                <span class="ai-item-where"><i class="fa fa-location-dot"></i> ${item.where}</span>
                ${item.note ? `<span class="ai-item-note">${item.note}</span>` : ''}
            </div>
            <div class="ai-item-price">Rp ${item.estimatedPrice.toLocaleString('id-ID')}<small>/${item.unit}</small></div>
        </div>`).join('');
    const stores = result.suggestedStores.map(s => `<span class="ai-store-tag"><i class="fa fa-store"></i> ${s}</span>`).join('');
    panel.innerHTML = `
        <div class="ai-result-header">
            <div class="ai-result-badge"><i class="fa fa-sparkles"></i> Hasil Estimasi AI</div>
            <span class="ai-query-label">"${query}"</span>
        </div>
        <div class="ai-items-list">${items}</div>
        <div class="ai-stores-section"><small>Rekomendasi Toko:</small><div class="ai-stores-row">${stores}</div></div>
        <div class="ai-runner-note"><i class="fa fa-circle-info"></i> <span>${result.runnerNote}</span></div>
        <button class="ai-add-to-cart-btn" onclick="addAiResultToCart(${JSON.stringify(result).replace(/"/g,'&quot;')})">
            <i class="fa fa-cart-plus"></i> Masukkan ke Order Cart
        </button>`;
}

function addAiResultToCart(result) {
    result.items.forEach(item => {
        const pseudo = { id: `ai_${Date.now()}_${Math.random().toString(36).slice(2)}`, name: item.name, price: item.estimatedPrice, unit: item.unit, emoji: '🛍️', cat: 'custom' };
        shopCart.push({ product: pseudo, qty: 1 });
    });
    window.db.saveCart(shopCart);
    renderCartBadge();
    updateLivePrices();
    showToast('Ditambahkan!', `${result.items.length} item AI masuk ke cart`);
}

// ============================================================
// AI BANTUFIX DIAGNOSIS
// ============================================================
async function runAiBantuFixDiagnosis() {
    const query = document.getElementById('fix-ai-query')?.value?.trim();
    if (!query) { showToast('Deskripsikan Masalah', 'Ceritakan dulu masalah yang kamu hadapi!'); return; }
    const panel = document.getElementById('fix-ai-result-panel');
    const btn = document.getElementById('fix-ai-btn');
    panel.style.display = 'block';
    panel.innerHTML = `<div class="ai-loading-state"><div class="ai-spinner"></div><p>Menganalisis masalah dan mengestimasi biaya...</p></div>`;
    btn.disabled = true; btn.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i> Menganalisis...';
    try {
        // Prefer server-side proxy for AI diagnosis to avoid exposing keys and CORS issues
        if (window.priceApi && typeof window.priceApi.fetchEstimate === 'function') {
            const payload = { serviceType: 'BantuFix', pickup: ITB_DEFAULT, destination: DEST_DEFAULT, params: { aiRequest: query }, userTier: (currentUser?.tier || 'Bronze') };
            const apiRes = await window.priceApi.fetchEstimate(payload);
            if (apiRes && apiRes.parsed) {
                // If proxy returned a parsed diagnosis (fallback-fix or external), render it
                renderFixAiResult(apiRes.parsed, query);
                return;
            }
            // Try a frontend fallback diagnosis before attempting direct external AI
            const fbDiag = frontendParseFallbackFixDiagnosis(query);
            if (fbDiag) { renderFixAiResult(fbDiag, query); return; }
        }
        // Fallback: attempt direct Claude/Anthropic call (may fail in browser due to missing key/CORS)
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514', max_tokens: 1000,
                system: `Kamu adalah teknisi handal untuk mahasiswa ITB Bandung. Respons HANYA JSON murni:
{"diagnosis":"diagnosa singkat","severity":"Ringan/Sedang/Darurat","category":"kategori","partsNeeded":[{"part":"nama part","estimatedCost":15000}],"laborCost":35000,"totalEstimate":50000,"estimatedDuration":"30-60 menit","technicianNote":"catatan teknisi","diyTip":"tips DIY (opsional)"}
Harga realistis Bandung 2024.`,
                messages: [{ role: 'user', content: `Masalah saya: ${query}` }]
            })
        });
        const data = await res.json();
        const text = data.content?.map(b => b.text || '').join('') || '';
        const result = JSON.parse(text.replace(/```json|```/g, '').trim());
        renderFixAiResult(result, query);
    } catch (e) {
        panel.innerHTML = `<div class="ai-error-state"><i class="fa fa-triangle-exclamation"></i> Gagal menganalisis. Coba lagi!</div>`;
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fa fa-sparkles"></i> Diagnosis & Estimasi Biaya';
    }
}

function renderFixAiResult(result, query) {
    const panel = document.getElementById('fix-ai-result-panel');
    const sevColor = { Ringan: '#22c55e', Sedang: '#f59e0b', Darurat: '#ef4444' };
    const col = sevColor[result.severity] || '#64748b';
    const partsCost = (result.partsNeeded||[]).reduce((s,p) => s + p.estimatedCost, 0);
    setFixPrice(result.laborCost, partsCost, result.totalEstimate);
    const partsHtml = (result.partsNeeded||[]).map(p => `
        <div class="ai-item-row">
            <span class="ai-item-name">${p.part}</span>
            <span class="ai-item-price">Rp ${p.estimatedCost.toLocaleString('id-ID')}</span>
        </div>`).join('');
    panel.innerHTML = `
        <div class="ai-result-header">
            <div class="ai-result-badge"><i class="fa fa-stethoscope"></i> Hasil Diagnosis AI</div>
            <span style="background:${col}20;color:${col};padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;">${result.severity}</span>
        </div>
        <div class="ai-diagnosis-card">
            <div class="ai-diag-label">Diagnosis</div>
            <div class="ai-diag-text">${result.diagnosis}</div>
            <div class="ai-diag-meta">
                <span><i class="fa fa-tag"></i> ${result.category}</span>
                <span><i class="fa fa-clock"></i> ${result.estimatedDuration}</span>
            </div>
        </div>
        ${partsHtml ? `<div class="ai-section-title">Estimasi Part & Bahan</div><div class="ai-items-list">${partsHtml}</div>` : ''}
        <div class="ai-runner-note"><i class="fa fa-user-wrench"></i> <span>${result.technicianNote}</span></div>
        ${result.diyTip ? `<div class="ai-diy-tip"><i class="fa fa-lightbulb"></i> <span><strong>Tips DIY:</strong> ${result.diyTip}</span></div>` : ''}`;
}

// ============================================================
// MAP
// ============================================================
function initLeafletMapCore() {
    if (!globalLeafletMap) {
        try {
            globalLeafletMap = L.map('leaflet-map').setView([-6.8915, 107.6107], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(globalLeafletMap);
            L.circle([-6.8915, 107.6107], { color: '#1e3a8a', fillColor: '#3b82f6', fillOpacity: 0.1, radius: 600 }).addTo(globalLeafletMap);
            L.marker([-6.8915, 107.6107]).addTo(globalLeafletMap).bindPopup('<b>ITB Ganesha</b>');
            // Plot workers
            window.db.getWorkers().forEach(w => {
                const icons = { BantuRide: '🏍️', BantuSend: '📦', BantuClean: '🧹', BantuFix: '🔧', BantuShop: '🛍️' };
                L.marker([w.lat, w.lng]).addTo(globalLeafletMap).bindPopup(`<b>${icons[w.serviceType]||''} ${w.name}</b><br>${w.serviceType} — ⭐ ${w.rating}`);
            });
        } catch (e) { console.warn('Map init failed:', e); }
    } else { globalLeafletMap.invalidateSize(); }
}

// ============================================================
// ORDER PLACEMENT
// ============================================================
async function triggerOrderPlacement() {
    const user = currentUser || window.db.getSession();
    if (!user) { showToast('Login Dulu', 'Silakan login terlebih dahulu.'); return; }

    const btn = document.querySelector('.order-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i> Memproses...'; }

    try {
        // Bug 2 fix: always re-resolve coords & re-compute fare inside placement, not from stale DOM
        const { pickup: pickupCoord, dest: destCoord } = await resolveCoords();
        const dist = window.locationService.calculateDistance(pickupCoord.lat, pickupCoord.lng, destCoord.lat, destCoord.lng);
        const dur  = window.locationService.calculateDuration(dist);

        let params = {};
        if (currentSelectedService === 'BantuRide') {
            params.vehicleType = document.querySelector('input[name="ride-vehicle"]:checked')?.value || 'motorcycle';
            params.vehicleTier = document.querySelector('input[name="ride-tier"]:checked')?.value || 'Normal';
        } else if (currentSelectedService === 'BantuSend') {
            params.packageSize   = document.getElementById('send-size')?.value || 'S';
            params.deliverySpeed = document.getElementById('send-speed')?.value || 'Same-Day';
            params.packageNotes  = document.getElementById('send-notes')?.value || '';
        } else if (currentSelectedService === 'BantuClean') {
            params.roomArea     = parseFloat(document.getElementById('clean-sqm')?.value) || 12;
            params.cleaningType = document.getElementById('clean-type')?.value || 'Sapu & Pel';
            params.roomType     = document.getElementById('clean-room-type')?.value || 'Kamar Tidur';
            const sd = document.getElementById('clean-schedule-date')?.value;
            const st = document.getElementById('clean-schedule-time')?.value;
            if (sd) { params.scheduledDate = sd; params.scheduledTime = st || '09:00'; params.isScheduled = true; }
        } else if (currentSelectedService === 'BantuShop') {
            params.cartItems = shopCart.map(c => ({ name: c.product.name, qty: c.qty, price: c.product.price }));
            params.aiRequest = document.getElementById('shop-ai-query')?.value || '';
        }

        let fare = null;
        if (currentSelectedService === 'BantuFix' || currentSelectedService === 'BantuShop') {
            // Prefer external API via proxy for shop/fix to keep pricing consistent with server
            try {
                const payload = { serviceType: currentSelectedService, pickup: pickupCoord, destination: destCoord, params, userTier: user?.tier || 'Bronze' };
                const apiRes = await window.priceApi.fetchEstimate(payload);
                if (apiRes && apiRes.fare) {
                    fare = apiRes.fare;
                }
            } catch (e) {
                fare = null;
            }
            // Fallbacks
            if (!fare && currentSelectedService === 'BantuFix') {
                const totalStr = document.getElementById('final-calculated-total')?.innerText.replace(/[^0-9]/g, '') || '0';
                const total = parseInt(totalStr) || 0;
                if (total === 0) { showToast('Pilih Layanan', 'Pilih layanan dari katalog atau gunakan AI Diagnosis terlebih dahulu.'); return; }
                fare = { total, pointsEarned: Math.floor(total / 100) };
            }
            if (!fare && currentSelectedService === 'BantuShop') {
                // fallback: compute local estimator using cart total
                const cartTotal = shopCart.reduce((sum, item) => sum + item.product.price * item.qty, 0);
                const userTier = user?.tier || 'Bronze';
                fare = window.priceEstimatorService.estimateFare('BantuShop', dist, dur, userTier, { estimatedItemsCost: cartTotal });
                fare.pointsEarned = Math.floor((fare.total||0) / 100);
            }
        } else {
            const userTier = user?.tier || 'Bronze';
            fare = window.priceEstimatorService.estimateFare(currentSelectedService, dist, dur, userTier, params);
            if (!fare || fare.total === 0) { showToast('Pilih Layanan', 'Tentukan detail pesanan terlebih dahulu.'); return; }
            fare.pointsEarned = Math.floor(fare.total / 100);
        }

        const pickup      = { name: getPickupName(),      lat: pickupCoord.lat, lng: pickupCoord.lng };
        const destination = { name: getDestinationName(), lat: destCoord.lat,   lng: destCoord.lng };

        const order = window.orderService.bookOrder(user, currentSelectedService, pickup, destination, fare, params);
        currentActiveOrderId = order.id;

        // Refresh session user (balance was deducted at booking)
        currentUser = window.db.getSession();
        updateSidebarUser(currentUser);

        if (currentSelectedService === 'BantuShop') { shopCart = []; window.db.clearCart(); }

        document.getElementById('service-workspace-view').style.display = 'none';
        showLiveTrackingView(order);
        renderActivityTab();
        showToast('Pesanan Dibuat!', `Mencari mitra ${currentSelectedService} terdekat...`);
        setTimeout(() => simulateOrderProgress(order), 3000);

    } catch (err) {
        showToast('Gagal Memesan', err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-circle-check"></i> Pesan Sekarang'; }
    }
}

function getPickupName() {
    const map = {
        BantuRide: document.getElementById('ride-pickup')?.value,
        BantuSend: document.getElementById('send-pickup')?.value,
        BantuClean: document.getElementById('clean-location')?.value,
        BantuFix: 'Lokasi Kamu',
        BantuShop: 'Lokasi Pengiriman'
    };
    return map[currentSelectedService] || 'ITB Ganesha';
}

function getDestinationName() {
    const map = {
        BantuRide: document.getElementById('ride-destination')?.value,
        BantuSend: document.getElementById('send-destination')?.value,
        BantuClean: document.getElementById('clean-location')?.value + ' (Setelah Bersih)',
        BantuFix: 'Lokasi Perbaikan',
        BantuShop: 'Toko / Market'
    };
    return map[currentSelectedService] || 'Destinasi';
}

function showLiveTrackingView(order) {
    document.getElementById('live-tracking-view').style.display = 'flex';
    document.getElementById('track-status-main').innerText = 'Mencari Mitra Terdekat...';
    document.getElementById('track-eta-text').innerText = 'Alokasi Sistem';
    document.getElementById('tracking-driver-name-label').innerText = 'Mencari...';
    document.getElementById('tracking-driver-plate').innerText = '...';
    document.getElementById('tracking-chat-btn').setAttribute('data-order-id', order.id);
    document.getElementById('tracking-detail-btn').setAttribute('data-order-id', order.id);

    if (!trackingLeafletMap) {
        setTimeout(() => {
            trackingLeafletMap = L.map('tracking-leaflet-map').setView([-6.8915, 107.6107], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(trackingLeafletMap);
            L.marker([-6.8915, 107.6107]).addTo(trackingLeafletMap).bindPopup('📍 Lokasi Kamu').openPopup();
        }, 300);
    } else { setTimeout(() => trackingLeafletMap.invalidateSize(), 350); }

    setTimeout(() => {
        const freshOrder = window.db.getOrderById(order.id);
        if (freshOrder && freshOrder.workerId) {
            document.getElementById('track-status-main').innerText = 'Mitra Ditemukan! Sedang Menuju Lokasimu';
            document.getElementById('track-eta-text').innerText = '±5 Menit';
            document.getElementById('tracking-driver-name-label').innerText = freshOrder.workerName || 'Mitra STEI Bantu';
            document.getElementById('tracking-driver-plate').innerText = freshOrder.vehicleNumber || '';
            showToast('Mitra Ditemukan', `${freshOrder.workerName} sedang menuju lokasi Anda.`);
        }
    }, 3000);
}

function simulateOrderProgress(order) {
    if (order.status === 'Pending') return;
    // After 8s show "arrived", after 15s complete
    setTimeout(() => {
        window.db.updateOrderStatus(order.id, 'Active');
        document.getElementById('track-status-main').innerText = 'Mitra Sudah Tiba!';
        document.getElementById('track-eta-text').innerText = 'Sedang Mengerjakan';
        renderActivityTab();
    }, 8000);
}

// ============================================================
// ACTIVITY TAB (auto-updates)
// ============================================================
function renderActivityTab() {
    const container = document.getElementById('orders-history-list');
    if (!container) return;
    const orders = getVisibleOrders();
    if (!orders.length) {
        container.innerHTML = `<div class="empty-state-banner"><i class="fa fa-receipt"></i><p>Belum ada transaksi berjalan.</p></div>`;
        return;
    }

    const statusConfig = {
        Active:    { label: 'Aktif',     color: '#2563eb', bg: '#eff6ff', icon: 'fa-circle-dot' },
        Scheduled: { label: 'Terjadwal', color: '#7c3aed', bg: '#f5f3ff', icon: 'fa-calendar' },
        Completed: { label: 'Selesai',   color: '#16a34a', bg: '#f0fdf4', icon: 'fa-circle-check' },
        Cancelled: { label: 'Dibatalkan',color: '#dc2626', bg: '#fef2f2', icon: 'fa-circle-xmark' },
        Pending:   { label: 'Menunggu',  color: '#d97706', bg: '#fffbeb', icon: 'fa-clock' }
    };

    const serviceIcons = { BantuRide: 'fa-motorcycle', BantuSend: 'fa-box', BantuClean: 'fa-broom', BantuFix: 'fa-wrench', BantuShop: 'fa-bag-shopping' };
    const serviceColors = { BantuRide: '#2563eb', BantuSend: '#16a34a', BantuClean: '#9333ea', BantuFix: '#ea580c', BantuShop: '#dc2626' };

    // Split into active/scheduled vs history
    const active = orders.filter(o => ['Active','Scheduled','Pending'].includes(o.status));
    const history = orders.filter(o => ['Completed','Cancelled'].includes(o.status));

    let html = '';

    if (active.length) {
        html += `<div class="activity-section-label">⚡ Aktif & Terjadwal</div>`;
        html += active.map(order => buildOrderCard(order, statusConfig, serviceIcons, serviceColors, true)).join('');
    }
    if (history.length) {
        html += `<div class="activity-section-label" style="margin-top:16px;">📋 Riwayat</div>`;
        html += history.map(order => buildOrderCard(order, statusConfig, serviceIcons, serviceColors, false)).join('');
    }

    container.innerHTML = html;
}

function buildOrderCard(order, statusConfig, serviceIcons, serviceColors, isActive) {
    const sc = statusConfig[order.status] || statusConfig.Pending;
    const svcIcon = serviceIcons[order.serviceType] || 'fa-circle';
    const svcColor = serviceColors[order.serviceType] || '#64748b';
    const dateStr = new Date(order.timestamp).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

    return `
    <div class="order-card ${isActive ? 'order-card-active' : ''}" onclick="openOrderDetail('${order.id}')">
        <div class="oc-top">
            <div class="oc-service-icon" style="background:${svcColor}20; color:${svcColor}">
                <i class="fa ${svcIcon}"></i>
            </div>
            <div class="oc-main">
                <div class="oc-title-row">
                    <span class="oc-service-name">${order.serviceType}</span>
                    <span class="oc-status-badge" style="background:${sc.bg};color:${sc.color}">
                        <i class="fa ${sc.icon}"></i> ${sc.label}
                    </span>
                </div>
                <div class="oc-route">
                    <span class="oc-pickup"><i class="fa fa-location-dot" style="color:#dc2626"></i> ${order.pickupName}</span>
                    ${order.destinationName !== order.pickupName ? `<span class="oc-dest-arrow">→ ${order.destinationName}</span>` : ''}
                </div>
                <div class="oc-meta-row">
                    <span><i class="fa fa-user"></i> ${order.workerName || '—'}</span>
                    <span><i class="fa fa-coins" style="color:var(--gold)"></i> Rp ${order.price.toLocaleString('id-ID')}</span>
                    <span class="oc-date">${dateStr}</span>
                </div>
            </div>
        </div>
        ${isActive ? `<div class="oc-action-row">
            <button class="oc-btn oc-btn-primary" onclick="event.stopPropagation(); openOrderDetail('${order.id}')"><i class="fa fa-map-location-dot"></i> Pantau</button>
            <button class="oc-btn oc-btn-chat" onclick="event.stopPropagation(); openChatFromOrder('${order.id}')"><i class="fa fa-comment-dots"></i> Chat</button>
        </div>` : ''}
    </div>`;
}

// ============================================================
// LOGOUT (Bug 3 fix)
// ============================================================
function handleLogout() {
    window.authService.logout();
    currentUser = null;
    shopCart = [];
    stopChatPolling();
    // Destroy maps
    if (globalLeafletMap)   { try { globalLeafletMap.remove();   } catch(e) {} globalLeafletMap = null; }
    if (trackingLeafletMap) { try { trackingLeafletMap.remove(); } catch(e) {} trackingLeafletMap = null; }
    if (detailTrackingMap)  { try { detailTrackingMap.remove();  } catch(e) {} detailTrackingMap = null; }
    // Clean leftover _leaflet_id flags
    ['leaflet-map','tracking-leaflet-map','detail-tracking-map','worker-map'].forEach(id => {
        const el = document.getElementById(id);
        if (el) delete el._leaflet_id;
    });
    _currentWorker = null;
    // Hide all panels
    ['dashboard-view','service-workspace-view','live-tracking-view',
     'order-detail-view','worker-view'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.style.display = 'none'; el.classList.remove('active'); }
    });
    // Reset sidebar blur
    const sidebar = document.getElementById('main-sidebar');
    if (sidebar) { sidebar.style.filter = 'blur(4px)'; sidebar.style.pointerEvents = 'none'; }
    // Reset auth form to login mode
    switchAuthMode('login');
    const phoneInput = document.getElementById('auth-input-identifier');
    if (phoneInput) phoneInput.value = '';
    const nameInput = document.getElementById('auth-input-name');
    if (nameInput) nameInput.value = '';
    const submitBtn = document.querySelector('#core-auth-form button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Kirim OTP'; }
    // Show auth
    document.getElementById('auth-view').style.display = 'flex';
    showToast('Keluar', 'Anda berhasil logout. Sampai jumpa!');
}

// ============================================================
// WORKER DASHBOARD — New tabbed role-based view
// ============================================================

let _currentWorker = null;

function switchWorkerTab(tabId, btn) {
    document.querySelectorAll('.worker-tab-content').forEach(t => {
        t.classList.remove('active');
        t.style.display = 'none';
    });
    document.querySelectorAll('.wbnav-btn').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById(tabId);
    if (tab) {
        tab.classList.add('active');
        tab.style.display = 'block';
    }
    if (!btn) {
        btn = document.querySelector(`.wbnav-btn[data-tab="${tabId}"]`)
            || Array.from(document.querySelectorAll('.wbnav-btn')).find(b => b.getAttribute('onclick')?.includes(`'${tabId}'`));
    }
    if (btn) btn.classList.add('active');
    if (tabId === 'wtab-activity') renderWorkerActiveOrders();
    if (tabId === 'wtab-chat') renderWorkerChats();
}

function renderWorkerDashboard(user) {
    const worker = window.db.getWorkers().find(w => w.id === user.workerId);
    if (!worker) return;
    _currentWorker = worker;

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    setEl('worker-name', worker.name);
    setEl('worker-name-2', worker.name);
    setEl('worker-service', worker.serviceType);
    setEl('worker-rating', `⭐ ${worker.rating}`);
    setEl('worker-vehicle', worker.vehicleNumber || worker.specialty || '—');
    setEl('worker-balance', `Rp ${user.balance.toLocaleString('id-ID')}`);

    const toggle = document.getElementById('worker-status-toggle');
    const statusLbl = document.getElementById('worker-status-label');
    if (toggle) {
        toggle.checked = worker.status === 'available';
        toggle.onchange = () => {
            const status = toggle.checked ? 'available' : 'busy';
            const workers = window.db.getWorkers();
            const w = workers.find(x => x.id === worker.id);
            if (w) { w.status = status; localStorage.setItem('stei_bantu_workers', JSON.stringify(workers)); }
            if (statusLbl) statusLbl.innerText = toggle.checked ? '🟢 Online — Menerima Order' : '🔴 Offline';
            showToast('Status Diperbarui', toggle.checked ? 'Kamu sekarang Online!' : 'Kamu sekarang Offline.');
        };
        if (statusLbl) statusLbl.innerText = worker.status === 'available' ? '🟢 Online — Menerima Order' : '🔴 Offline';
    }

    document.querySelectorAll('.worker-tab-content').forEach(t => {
        t.classList.remove('active');
        t.style.display = 'none';
    });
    const homeTab = document.getElementById('wtab-home');
    if (homeTab) {
        homeTab.classList.add('active');
        homeTab.style.display = 'block';
    }
    document.querySelectorAll('.wbnav-btn').forEach((b, i) => b.classList.toggle('active', i === 0));

    setTimeout(() => initWorkerMap(worker), 300);
    updateWorkerBadges();
}

let workerLeafletMap = null;
function initWorkerMap(worker) {
    const mapEl = document.getElementById('worker-map');
    if (!mapEl) return;
    if (workerLeafletMap) { try { workerLeafletMap.remove(); } catch(e) {} workerLeafletMap = null; delete mapEl._leaflet_id; }
    try {
        workerLeafletMap = L.map('worker-map').setView([worker.lat, worker.lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(workerLeafletMap);
        L.marker([worker.lat, worker.lng]).addTo(workerLeafletMap).bindPopup(`📍 Posisi Kamu: ${worker.name}`).openPopup();
    } catch(e) {}
}

function updateWorkerBadges() {
    if (!_currentWorker) return;
    const activeOrders = window.db.getOrders().filter(o => o.workerId === _currentWorker.id && ['Active','Pending'].includes(o.status));
    const activeBadge = document.getElementById('worker-active-badge');
    if (activeBadge) { activeBadge.style.display = activeOrders.length ? 'flex' : 'none'; activeBadge.innerText = activeOrders.length; }
    const allChats = window.db.getAllChats();
    const chatOrders = window.db.getOrders().filter(o => o.workerId === _currentWorker.id && allChats[o.id]?.length > 0);
    const chatBadge = document.getElementById('worker-chat-badge');
    if (chatBadge) { chatBadge.style.display = chatOrders.length ? 'flex' : 'none'; chatBadge.innerText = chatOrders.length; }
}

function showWorkerOrderList(serviceType) {
    const panel = document.getElementById('worker-order-list-panel');
    const titleEl = document.getElementById('worker-order-list-title');
    const listEl = document.getElementById('worker-available-orders');
    if (!panel || !listEl) return;

    panel.style.display = 'block';
    if (titleEl) titleEl.innerText = `Order ${serviceType} Tersedia`;

    const svcColors = { BantuRide:'#2563eb', BantuSend:'#16a34a', BantuClean:'#9333ea', BantuFix:'#ea580c', BantuShop:'#dc2626' };
    const svcIcons  = { BantuRide:'fa-motorcycle', BantuSend:'fa-box', BantuClean:'fa-broom', BantuFix:'fa-wrench', BantuShop:'fa-bag-shopping' };
    const col = svcColors[serviceType] || '#64748b';
    const icon = svcIcons[serviceType] || 'fa-briefcase';

    const availableOrders = window.db.getOrders().filter(o =>
        o.serviceType === serviceType && ['Pending','Scheduled'].includes(o.status)
        && (!o.workerId || o.workerId === _currentWorker.id)
    );

    if (!availableOrders.length) {
        listEl.innerHTML = `<div class="empty-state-banner"><i class="fa fa-inbox"></i><p>Tidak ada order ${serviceType} saat ini.</p></div>`;
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    listEl.innerHTML = availableOrders.map(order => {
        const workerEarning = Math.round(order.price * 0.8);
        const dateStr = new Date(order.timestamp).toLocaleDateString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
        const isAssignedToMe = _currentWorker && order.workerId === _currentWorker.id;
        const acceptedHtml = isAssignedToMe
            ? `<button class="waoc-accept-btn accepted" disabled><i class="fa fa-circle-check"></i> Diterima</button>`
            : `<button class="waoc-accept-btn" onclick="workerAcceptOrder('${order.id}', this)"><i class="fa fa-hand-point-up"></i> Ambil</button>`;
        return `
        <div class="worker-avail-order-card">
            <div class="waoc-icon" style="background:${col}20; color:${col}">
                <i class="fa ${icon}"></i>
            </div>
            <div class="waoc-info">
                <div class="waoc-service">${order.serviceType}</div>
                <div class="waoc-route">
                    <i class="fa fa-location-dot" style="color:#dc2626; font-size:0.7rem;"></i>
                    ${order.pickupName}${order.destinationName !== order.pickupName ? ` → ${order.destinationName}` : ''}
                </div>
                <div class="waoc-meta">${dateStr} · #${order.id.slice(-5)}</div>
            </div>
            <div class="waoc-right">
                <div>
                    <div class="waoc-earning">Rp ${workerEarning.toLocaleString('id-ID')}</div>
                    <div class="waoc-earning-label">Pendapatanmu</div>
                </div>
                ${acceptedHtml}
            </div>
        </div>`;
    }).join('');

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function workerAcceptOrder(orderId, btn) {
    if (!_currentWorker) return;
    const updatedOrder = window.db.updateOrderStatus(orderId, 'Active', {
        workerId: _currentWorker.id,
        workerName: _currentWorker.name,
        workerRating: _currentWorker.rating,
        workerPhone: _currentWorker.phoneNumber,
        vehicleNumber: _currentWorker.vehicleNumber || _currentWorker.specialty || 'Jasa',
        workerAvatar: _currentWorker.avatar
    });
    if (btn) { btn.classList.add('accepted'); btn.disabled = true; btn.innerHTML = '<i class="fa fa-circle-check"></i> Diterima'; }
    showToast('Order Diterima!', `Kamu mengambil order ${updatedOrder?.serviceType}. Segera menuju lokasi!`);
    updateWorkerBadges();
    renderWorkerActiveOrders();
    renderActivityTab();
}

function renderWorkerActiveOrders() {
    const container = document.getElementById('worker-active-orders-list');
    if (!container || !_currentWorker) return;
    const activeOrders = window.db.getOrders().filter(o =>
        o.workerId === _currentWorker.id && ['Active','Pending'].includes(o.status)
    );
    if (!activeOrders.length) {
        container.innerHTML = `<div class="empty-state-banner"><i class="fa fa-briefcase"></i><p>Belum ada pesanan aktif.</p></div>`;
        return;
    }
    container.innerHTML = activeOrders.map(order => {
        const workerEarning = Math.round(order.price * 0.8);
        const dateStr = new Date(order.timestamp).toLocaleString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
        return `
        <div class="worker-active-card" onclick="openOrderDetail('${order.id}')">
            <div class="wac-header">
                <span class="wac-service-badge">${order.serviceType}</span>
                <span style="display:flex; align-items:center; font-size:0.75rem; color:#16a34a; font-weight:700;">
                    <span class="wac-status-dot"></span> Sedang Berlangsung
                </span>
            </div>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:8px;">
                <i class="fa fa-location-dot" style="color:#dc2626;"></i>
                ${order.pickupName}${order.destinationName !== order.pickupName ? ` → ${order.destinationName}` : ''}
            </div>
            <div class="wac-customer-row">
                <div class="wac-customer-avatar"><i class="fa fa-user"></i></div>
                <div>
                    <div class="wac-customer-name">Pelanggan #${order.id.slice(-5)}</div>
                    <div class="wac-customer-phone"><i class="fa fa-clock" style="font-size:0.7rem;"></i> ${dateStr}</div>
                </div>
            </div>
            <div class="wac-earning-row">
                <div>
                    <div style="font-size:0.72rem; color:var(--text-muted);">Pendapatanmu (80%)</div>
                    <div class="wac-earning-amount">Rp ${workerEarning.toLocaleString('id-ID')}</div>
                </div>
                <button class="wac-complete-btn" onclick="event.stopPropagation(); workerCompleteOrder('${order.id}', this)">
                    <i class="fa fa-circle-check"></i> Selesaikan
                </button>
            </div>
        </div>`;
    }).join('');
}

function workerCompleteOrder(orderId, btn) {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i> Memproses...'; }
    const completed = window.orderService.completeOrder(orderId);
    if (completed) {
        const order = window.db.getOrderById(orderId);
        // If worker is logged in, session will be refreshed by updateUser; pull session
        currentUser = window.db.getSession();
        updateSidebarUser(currentUser);
        if (currentUser && currentUser.role === 'worker') renderWorkerDashboard(currentUser);
        const earning = completed.workerEarning || 0;
        showToast('Pesanan Selesai! 🎉', `+Rp ${earning.toLocaleString('id-ID')} masuk ke saldo kamu`);
    } else {
        showToast('Gagal', 'Tidak dapat menyelesaikan pesanan.');
    }
    renderWorkerActiveOrders();
    updateWorkerBadges();
}

function renderWorkerChats() {
    const container = document.getElementById('worker-chats-list');
    if (!container || !_currentWorker) return;
    const allChats = window.db.getAllChats();
    const orders = window.db.getOrders().filter(o =>
        o.workerId === _currentWorker.id && allChats[o.id]?.length > 0
    );
    if (!orders.length) {
        container.innerHTML = `<div class="empty-state-banner"><i class="fa fa-comment-dots"></i><p>Belum ada pesan dari pelanggan.</p></div>`;
        return;
    }
    container.innerHTML = orders.map(order => {
        const msgs = allChats[order.id] || [];
        const last = msgs[msgs.length - 1];
        const timeStr = new Date(last.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const unread = msgs.filter(m => m.sender === 'user').length;
        return `
        <div class="worker-chat-item" onclick="workerOpenChat('${order.id}')">
            <div class="wci-avatar"><i class="fa fa-user"></i></div>
            <div class="wci-content">
                <div style="display:flex; align-items:center; justify-content:space-between;">
                    <span class="wci-name">Pelanggan #${order.id.slice(-5)}</span>
                    <span style="font-size:0.7rem; color:var(--text-muted);">
                        ${timeStr}${unread > 0 ? ` <span class="cli-badge">${unread}</span>` : ''}
                    </span>
                </div>
                <div class="wci-preview">${last.sender === 'user' ? '💬 ' : '✓ '}${last.text}</div>
                <span class="wci-service-tag">${order.serviceType}</span>
            </div>
        </div>`;
    }).join('');
}

function workerOpenChat(orderId) {
    openOrderDetail(orderId);
}

// Legacy stubs
function renderWorkerOrders() {}
function buildWorkerOrderCard() { return ''; }




// ============================================================
// ORDER DETAIL PAGE
// ============================================================
function openOrderDetail(orderId) {
    if (!orderId) return;
    const order = window.db.getOrderById(orderId);
    if (!order) return;
    currentActiveOrderId = orderId;

    // Hide every main panel before showing order detail
    const allPanels = ['auth-view', 'dashboard-view', 'service-workspace-view',
                       'live-tracking-view', 'worker-view'];
    allPanels.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.style.display = 'none'; el.classList.remove('active'); }
    });

    const detailView = document.getElementById('order-detail-view');
    if (detailView) detailView.style.display = 'flex';

    renderOrderDetailContent(order);

    if (['Active','Scheduled','Pending'].includes(order.status)) {
        startChatPolling(orderId);
    }
}

function renderOrderDetailContent(order) {
    const statusConfig = {
        Active:    { label: 'Sedang Aktif',  color: '#2563eb', icon: 'fa-circle-dot' },
        Scheduled: { label: 'Terjadwal',     color: '#7c3aed', icon: 'fa-calendar' },
        Completed: { label: 'Selesai',       color: '#16a34a', icon: 'fa-circle-check' },
        Cancelled: { label: 'Dibatalkan',    color: '#dc2626', icon: 'fa-circle-xmark' },
        Pending:   { label: 'Diproses',      color: '#d97706', icon: 'fa-clock' }
    };
    const sc = statusConfig[order.status] || statusConfig.Pending;
    const dateStr = new Date(order.timestamp).toLocaleString('id-ID');

    document.getElementById('detail-order-id').innerText = `#${order.id}`;
    document.getElementById('detail-status-label').innerText = sc.label;
    document.getElementById('detail-status-label').style.color = sc.color;
    document.getElementById('detail-service-name').innerText = order.serviceType;
    const isWorkerViewing = currentUser?.role === 'worker' && order.workerId === _currentWorker?.id;
    const detailName = isWorkerViewing ? (order.userName || `Pelanggan #${order.userId?.slice(-5)}`) : (order.workerName || '—');
    const detailMeta = isWorkerViewing ? `Pelanggan` : `⭐ ${order.workerRating || '—'}`;
    const detailSub = isWorkerViewing ? (order.userPhone || 'Telp tidak tersedia') : (order.vehicleNumber || '—');
    const detailPhoneHref = isWorkerViewing ? `tel:${order.userPhone || ''}` : `tel:${order.workerPhone || ''}`;

    document.getElementById('detail-worker-name').innerText = detailName;
    document.getElementById('detail-worker-rating').innerText = detailMeta;
    document.getElementById('detail-worker-vehicle').innerText = detailSub;
    const detailPhone = document.getElementById('detail-worker-phone');
    if (detailPhone) {
        detailPhone.href = detailPhoneHref;
        detailPhone.style.display = detailPhoneHref && detailPhoneHref !== 'tel:' ? 'flex' : 'none';
    }
    document.getElementById('detail-route-from').innerText = order.pickupName;
    document.getElementById('detail-route-to').innerText = order.destinationName;
    document.getElementById('detail-price').innerText = `Rp ${order.price.toLocaleString('id-ID')}`;
    document.getElementById('detail-points').innerText = `+${order.pointsEarned} pts`;
    document.getElementById('detail-timestamp').innerText = dateStr;

    // Avatar / icon
    const avatarImg = document.getElementById('detail-worker-avatar');
    const detailIcon = document.getElementById('detail-worker-icon');
    if (isWorkerViewing) {
        if (avatarImg) avatarImg.style.display = 'none';
        if (detailIcon) detailIcon.innerHTML = '<i class="fa fa-user"></i>';
    } else {
        if (avatarImg && order.workerAvatar) {
            avatarImg.style.display = 'block';
            avatarImg.src = order.workerAvatar;
            avatarImg.onerror = () => avatarImg.src = '';
        }
        if (detailIcon) detailIcon.innerHTML = '<i class="fa fa-user-astronaut"></i>';
    }

    // Show/hide action buttons based on status
    const completeBtn = document.getElementById('detail-complete-btn');
    const cancelBtn = document.getElementById('detail-cancel-btn');
    const chatBtn = document.getElementById('detail-chat-open-btn');
    if (completeBtn) completeBtn.style.display = order.status === 'Active' ? 'flex' : 'none';
    if (cancelBtn) cancelBtn.style.display = ['Active','Pending','Scheduled'].includes(order.status) ? 'flex' : 'none';
    if (chatBtn) chatBtn.setAttribute('data-order-id', order.id);
    if (order.status === 'Active' && isWorkerViewing) {
        completeBtn && (completeBtn.innerHTML = '<i class="fa fa-circle-check"></i> Selesaikan Pesanan');
    }

    const chatTitle = document.querySelector('.detail-chat-section .detail-section-title');
    if (chatTitle) {
        chatTitle.innerText = isWorkerViewing ? 'Obrolan dengan Pelanggan' : 'Obrolan dengan Mitra';
    }

    // Details breakdown
    renderOrderDetails(order);
    // Render mini chat preview
    renderDetailChat(order.id);
    // Init tracking map in detail
    setTimeout(() => initDetailTrackingMap(order), 300);
}

function renderOrderDetails(order) {
    const box = document.getElementById('detail-breakdown');
    if (!box) return;
    const d = order.details || {};
    let html = '';
    if (order.serviceType === 'BantuRide') {
        html = `<div class="detail-kv"><span>Kendaraan</span><b>${d.vehicleType || '—'}</b></div>
                <div class="detail-kv"><span>Tier</span><b>${d.vehicleTier || 'Normal'}</b></div>`;
    } else if (order.serviceType === 'BantuSend') {
        html = `<div class="detail-kv"><span>Ukuran Paket</span><b>${d.packageSize || '—'}</b></div>
                <div class="detail-kv"><span>Kecepatan</span><b>${d.deliverySpeed || d.speed || '—'}</b></div>
                ${d.packageNotes ? `<div class="detail-kv"><span>Catatan</span><b>${d.packageNotes}</b></div>` : ''}`;
    } else if (order.serviceType === 'BantuClean') {
        html = `<div class="detail-kv"><span>Luas Area</span><b>${d.roomArea || '—'} m²</b></div>
                <div class="detail-kv"><span>Tipe Bersih</span><b>${d.cleaningType || '—'}</b></div>
                <div class="detail-kv"><span>Tipe Ruangan</span><b>${d.roomType || '—'}</b></div>
                ${d.scheduledDate ? `<div class="detail-kv"><span>Jadwal</span><b>${d.scheduledDate} ${d.scheduledTime||''}</b></div>` : ''}`;
    } else if (order.serviceType === 'BantuFix') {
        html = `<div class="detail-kv"><span>Kategori</span><b>${d.tradeCategory || d.category || '—'}</b></div>
                <div class="detail-kv"><span>Tingkat</span><b>${d.severity || '—'}</b></div>`;
    } else if (order.serviceType === 'BantuShop') {
        const items = d.cartItems || [];
        const aiReq = d.aiRequest || d.shopRequest || '';
        html = `${aiReq ? `<div class="detail-kv"><span>Permintaan</span><b>${aiReq}</b></div>` : ''}
                ${items.length ? items.map(i => `<div class="detail-kv"><span>${i.name} x${i.qty}</span><b>Rp ${(i.price*i.qty).toLocaleString('id-ID')}</b></div>`).join('') : ''}`;
    }
    box.innerHTML = html || '<div class="detail-kv"><span>Detail</span><b>—</b></div>';
}

function initDetailTrackingMap(order) {
    // Bug 1 fix: always destroy the old instance first so Leaflet never
    // throws "Map container is already initialized".
    if (detailTrackingMap) {
        try { detailTrackingMap.remove(); } catch(e) {}
        detailTrackingMap = null;
    }
    const mapEl = document.getElementById('detail-tracking-map');
    if (!mapEl) return;
    // Also clear any residual Leaflet internal flag on the DOM node
    delete mapEl._leaflet_id;
    try {
        const lat = order.pickupLat || -6.8915;
        const lng = order.pickupLng || 107.6107;
        detailTrackingMap = L.map('detail-tracking-map').setView([lat, lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' })
         .addTo(detailTrackingMap);
        L.marker([lat, lng]).addTo(detailTrackingMap).bindPopup('📍 Pickup').openPopup();
        if (order.workerStartLat) {
            L.marker([order.workerStartLat, order.workerStartLng])
             .addTo(detailTrackingMap)
             .bindPopup(`🏍️ ${order.workerName}`);
        }
    } catch(e) { console.warn('Detail map init failed:', e); }
}

// ============================================================
// CHAT (Order Detail + Chats Tab)
// ============================================================
function renderDetailChat(orderId) {
    const chatList = document.getElementById('detail-chat-messages');
    if (!chatList) return;
    const messages = window.db.getChats(orderId);
    if (!messages.length) {
        chatList.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:0.82rem;">Belum ada pesan. Kirim pesan ke mitra!</div>`;
        return;
    }
    chatList.innerHTML = messages.map(msg => {
        const isUser = msg.sender === 'user';
        const timeStr = new Date(msg.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        return `<div class="chat-bubble-row ${isUser ? 'chat-user' : 'chat-worker'}">
            <div class="chat-bubble ${isUser ? 'bubble-user' : 'bubble-worker'}">
                <span>${msg.text}</span>
                <time>${timeStr}</time>
            </div>
        </div>`;
    }).join('');
    chatList.scrollTop = chatList.scrollHeight;
}

async function sendDetailMessage() {
    const input = document.getElementById('detail-chat-input');
    const text = input?.value?.trim();
    if (!text || !currentActiveOrderId) return;

    const order = window.db.getOrderById(currentActiveOrderId);
    if (!order) return;

    const sender = (currentUser?.role === 'worker' && order.workerId === currentUser.workerId) ? 'worker' : 'user';
    window.db.saveMessage(currentActiveOrderId, sender, text);
    input.value = '';
    renderDetailChat(currentActiveOrderId);
    renderChatsTab();
}

function openChatFromOrder(orderId) {
    openOrderDetail(orderId);
    setTimeout(() => {
        document.getElementById('detail-chat-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
}

function startChatPolling(orderId) {
    stopChatPolling();
    chatPollingInterval = setInterval(() => renderDetailChat(orderId), 3000);
}

function stopChatPolling() {
    if (chatPollingInterval) { clearInterval(chatPollingInterval); chatPollingInterval = null; }
}

function renderChatsTab() {
    const container = document.getElementById('chats-list-container');
    if (!container) return;
    const allChats = window.db.getAllChats();
    const orders = getVisibleOrders();
    const chatOrders = orders.filter(o => allChats[o.id]?.length > 0);

    if (!chatOrders.length) {
        container.innerHTML = `<div class="empty-state-banner"><i class="fa fa-comment-dots"></i><p>Belum ada obrolan aktif.</p></div>`;
        return;
    }

    container.innerHTML = chatOrders.map(order => {
        const msgs = allChats[order.id] || [];
        const last = msgs[msgs.length - 1];
        const timeStr = new Date(last.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const unread = msgs.filter(m => m.sender === 'worker').length;
        return `
        <div class="chat-list-item" onclick="openOrderDetail('${order.id}')">
            <div class="cli-avatar">${order.workerAvatar ? `<img src="${order.workerAvatar}" alt="">` : `<i class="fa fa-user"></i>`}</div>
            <div class="cli-content">
                <div class="cli-header">
                    <span class="cli-name">${order.workerName}</span>
                    <span class="cli-time">${timeStr}</span>
                </div>
                <div class="cli-preview-row">
                    <span class="cli-preview">${last.sender === 'user' ? '✓ ' : ''}${last.text}</span>
                    ${unread > 0 ? `<span class="cli-badge">${unread}</span>` : ''}
                </div>
                <span class="cli-service-tag">${order.serviceType}</span>
            </div>
        </div>`;
    }).join('');
}

// ============================================================
// ORDER ACTIONS (from detail page)
// ============================================================
function completeCurrentOrder() {
    if (!currentActiveOrderId) return;
    const user = currentUser || window.db.getSession();
    if (!user) return;
    const order = window.db.getOrderById(currentActiveOrderId);
    if (!order) return;

    if (user.role === 'worker' && order.workerId === user.workerId) {
        workerCompleteOrder(currentActiveOrderId, null);
        renderOrderDetailContent(window.db.getOrderById(currentActiveOrderId));
        stopChatPolling();
        return;
    }

    const completed = window.orderService.completeOrder(currentActiveOrderId, user.id);
    if (completed) {
        currentUser = window.db.getSession();
        updateSidebarUser(currentUser);
        renderOrderDetailContent(window.db.getOrderById(currentActiveOrderId));
        renderActivityTab();
        stopChatPolling();
        showToast('Pesanan Selesai! 🎉', `+${completed.pointsEarned} BantuPoints earned`);
        if (completed.tierUpgraded) setTimeout(() => showToast('Level Up! 🏆', `Kamu naik ke tier ${completed.newTier}!`), 1500);
    }
}

function cancelCurrentOrder() {
    if (!currentActiveOrderId) return;
    if (!confirm('Yakin ingin membatalkan pesanan ini?')) return;
    const cancelled = window.orderService.cancelOrder(currentActiveOrderId, 'user');
    if (cancelled) {
        // Refresh session user (refund applied)
        currentUser = window.db.getSession();
        updateSidebarUser(currentUser);
        renderOrderDetailContent(window.db.getOrderById(currentActiveOrderId));
        renderActivityTab();
        stopChatPolling();
        showToast('Pesanan Dibatalkan', 'Pesanan berhasil dibatalkan. Saldo telah dikembalikan.');
    } else {
        showToast('Gagal', 'Tidak dapat membatalkan pesanan ini.');
    }
}

function goBackFromDetail() {
    // Destroy detail map so it can be re-created cleanly next time (Bug 1)
    if (detailTrackingMap) {
        try { detailTrackingMap.remove(); } catch(e) {}
        detailTrackingMap = null;
        const mapEl = document.getElementById('detail-tracking-map');
        if (mapEl) delete mapEl._leaflet_id;
    }
    document.getElementById('order-detail-view').style.display = 'none';
    stopChatPolling();

    const user = currentUser || window.db.getSession();
    if (user?.role === 'worker') {
        const workerView = document.getElementById('worker-view');
        if (workerView) {
            workerView.style.display = 'flex';
            workerView.classList.add('active');
            switchWorkerTab('wtab-activity');
        }
        document.querySelectorAll('.tab-nav-btn').forEach(b => b.classList.remove('active'));
        const ordersBtn = document.querySelector('[data-tab="tab-orders"]');
        if (ordersBtn) ordersBtn.classList.add('active');
        return;
    }

    const dash = document.getElementById('dashboard-view');
    if (dash) {
        dash.classList.add('active');
        dash.style.display = 'block';
    }
    renderActivityTab();
    renderChatsTab();
    document.querySelectorAll('.tab-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    const ordersBtn = document.querySelector('[data-tab="tab-orders"]');
    if (ordersBtn) ordersBtn.classList.add('active');
    const ordersTab = document.getElementById('tab-orders');
    if (ordersTab) ordersTab.style.display = 'block';
    if (globalLeafletMap) globalLeafletMap.invalidateSize();
}

// ============================================================
// MODALS & UI HELPERS
// ============================================================
function toggleModal(id, show) {
    const t = document.getElementById(id);
    if (t) t.style.display = show ? 'flex' : 'none';
}

function showQRModal() { toggleModal('qr-modal', true); }

function executeTopUp() {
    const val = parseInt(document.getElementById('topup-amount-input').value) || 0;
    if (val < 10000) { showToast('Nominal Kurang', 'Minimal top-up Rp 10.000'); return; }
    const user = currentUser || window.db.getSession();
    if (user) {
        user.balance += val;
        window.db.updateUser(user);
        window.db.saveTransaction({ type: 'Top Up', amount: val, description: 'BantuPay Top Up' });
        currentUser = user;
        updateSidebarUser(user);
    }
    toggleModal('topup-modal', false);
    showToast('Top-Up Berhasil', `Saldo BantuPay +Rp ${val.toLocaleString('id-ID')}`);
}

function showToast(title, desc) {
    const t = document.getElementById('system-toast');
    document.getElementById('toast-title').innerText = title;
    document.getElementById('toast-desc').innerText = desc;
    t.style.right = '20px';
    setTimeout(() => { t.style.right = '-400px'; }, 3500);
}
