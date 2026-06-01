/**
 * STEI BANTU - SERVICE LAYER (V3)
 * 
 * Extended: AI-powered chat, richer BantuFix categories, BantuClean room types,
 * BantuRide tiers (Hemat/Normal/Luxe), BantuSend speed tiers, BantuShop cart.
 */

class LocationService {
    constructor() {
        this.landmarks = [
            { id: 'loc_itb', name: 'Gerbang Depan ITB Ganesha', lat: -6.8915, lng: 107.6107 },
            { id: 'loc_sate', name: 'Gedung Sate Bandung', lat: -6.9025, lng: 107.6188 },
            { id: 'loc_braga', name: 'Braga City Walk', lat: -6.9174, lng: 107.6091 },
            { id: 'loc_dago', name: 'Dago Plaza', lat: -6.8992, lng: 107.6120 },
            { id: 'loc_ciwalk', name: 'Cihampelas Walk (Ciwalk)', lat: -6.8965, lng: 107.6040 },
            { id: 'loc_tsb', name: 'Trans Studio Bandung (TSB)', lat: -6.9250, lng: 107.6365 },
            { id: 'loc_pvj', name: 'Paris Van Java Mall', lat: -6.8895, lng: 107.5962 },
            { id: 'loc_stasiun', name: 'Stasiun Kereta Bandung', lat: -6.9142, lng: 107.6025 }
        ];
    }
    getLocations() { return this.landmarks; }
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this._deg2rad(lat2 - lat1);
        const dLon = this._deg2rad(lon2 - lon1);
        const a = Math.sin(dLat/2)**2 + Math.cos(this._deg2rad(lat1)) * Math.cos(this._deg2rad(lat2)) * Math.sin(dLon/2)**2;
        return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(2));
    }
    calculateDuration(distanceKm) { return Math.max(1, Math.round(distanceKm / 22 * 60 + 3)); }
    _deg2rad(deg) { return deg * (Math.PI / 180); }
}

class PriceEstimatorService {
    estimateFare(serviceType, distanceKm, durationMins, userTier = 'Bronze', params = {}) {
        let baseFare = 0, distanceFare = 0, timeFare = 0, platformFee = 2000, itemsCost = 0;
        let dynamicDuration = durationMins;

        switch (serviceType) {
            case 'BantuRide': {
                const vehicle = params.vehicleType || 'motorcycle';
                const tier = params.vehicleTier || 'Normal'; // Hemat, Normal, Luxe
                const rates = {
                    motorcycle: { base: 6000, perKm: 2200, perMin: 100 },
                    car:        { base: 11000, perKm: 3500, perMin: 200 }
                };
                const rate = rates[vehicle] || rates.motorcycle;
                const mult = tier === 'Hemat' ? 0.85 : tier === 'Luxe' ? 1.4 : 1.0;
                baseFare = Math.round(rate.base * mult);
                distanceFare = Math.round(distanceKm * rate.perKm * mult);
                timeFare = Math.round(durationMins * rate.perMin * mult);
                platformFee = tier === 'Luxe' ? 4000 : 2000;
                break;
            }
            case 'BantuSend': {
                const size = params.packageSize || 'S';
                const speed = params.deliverySpeed || 'Instant';
                const sizeBase = { S: 7000, M: 11000, L: 17000, XL: 26000 };
                baseFare = sizeBase[size] || 7000;
                let distRate = 2500, speedSurcharge = 0;
                if (speed === 'Instant')   { speedSurcharge = 5000; distRate = 2800; }
                else if (speed === 'Same-Day') { distRate = 2000; }
                else if (speed === 'Hemat')    { distRate = 1500; speedSurcharge = 1000; }
                distanceFare = Math.round(distanceKm * distRate);
                timeFare = speedSurcharge;
                platformFee = 3000;
                break;
            }
            case 'BantuClean': {
                const area = parseFloat(params.roomArea) || 12;
                const cleanType = params.cleaningType || 'Sapu & Pel';
                const roomType = params.roomType || 'Kamar Tidur';
                const typeRates = {
                    'Sapu & Pel':      { base: 12000, ratePerM2: 800,  timePerM2: 1.5 },
                    'Bersih Standar':  { base: 18000, ratePerM2: 1200, timePerM2: 2.0 },
                    'Deep Clean':      { base: 28000, ratePerM2: 2200, timePerM2: 3.5 },
                    'Sterilisasi UV':  { base: 40000, ratePerM2: 3200, timePerM2: 4.5 }
                };
                const roomMult = { 'Kamar Tidur': 1.0, 'Kamar Mandi': 1.3, 'Dapur': 1.2, 'Ruang Tamu': 1.0, 'Kost Keseluruhan': 1.5 };
                const cfg = typeRates[cleanType] || typeRates['Sapu & Pel'];
                const rm = roomMult[roomType] || 1.0;
                baseFare = Math.round(cfg.base * rm);
                distanceFare = Math.round(area * cfg.ratePerM2 * rm);
                dynamicDuration = Math.round(area * cfg.timePerM2);
                timeFare = Math.round(dynamicDuration * 200);
                platformFee = 4000;
                break;
            }
            case 'BantuFix': {
                const category = params.tradeCategory || 'Kelistrikan';
                const severity = params.severity || 'Ringan';
                const catRates = {
                    'Kelistrikan':         30000,
                    'AC / Pendingin':      40000,
                    'Pipa & Plumbing':     35000,
                    'Furnitur & Kayu':     25000,
                    'Laptop & Komputer':   50000,
                    'Smartphone & Gadget': 45000,
                    'Pintu & Kunci':       30000,
                    'Atap & Bocor':        45000,
                    'Cat & Dinding':       35000,
                    'Lainnya':             30000
                };
                const sevMult = { Ringan: 1.0, Sedang: 1.4, Darurat: 2.0 };
                baseFare = Math.round((catRates[category] || 30000) * (sevMult[severity] || 1.0));
                distanceFare = Math.round(distanceKm * 3000);
                timeFare = Math.round(durationMins * 150);
                platformFee = 5000;
                break;
            }
            case 'BantuShop': {
                const estItems = parseFloat(params.estimatedItemsCost) || 0;
                const shopCat = params.shopCategory || 'custom';
                const fees = { grocery: 10000, stationery: 12000, fashion: 15000, hardware: 18000, custom: 20000 };
                baseFare = fees[shopCat] || fees.custom;
                distanceFare = Math.round(distanceKm * 2500);
                timeFare = 2000;
                platformFee = 3000;
                itemsCost = estItems;
                break;
            }
        }

        const subtotal = baseFare + distanceFare + timeFare + platformFee;
        const discountPct = userTier === 'Silver' ? 0.05 : userTier === 'Gold' ? 0.10 : 0;
        const discountAmount = Math.round(subtotal * discountPct);
        const serviceTotal = subtotal - discountAmount;
        const finalTotal = serviceTotal + itemsCost;
        const pointsEarned = Math.floor(serviceTotal / 100);

        return { baseFare, distanceFare, timeFare, platformFee, discount: discountAmount, discountRate: discountPct * 100, itemsCost, total: finalTotal, pointsEarned, dynamicDuration };
    }
}

class AuthService {
    login(phoneNumber, pin) {
        const user = window.db.getUsers().find(u => u.phoneNumber === phoneNumber);
        if (!user) return { success: false, error: 'Nomor telepon tidak terdaftar.' };
        if (user.pin !== pin) return { success: false, error: 'PIN yang Anda masukkan salah.' };
        window.db.saveSession(user);
        return { success: true, user, role: user.role || 'user' };
    }
    signup(name, email, phoneNumber, pin) {
        const users = window.db.getUsers();
        if (users.some(u => u.phoneNumber === phoneNumber)) return { success: false, error: 'Nomor telepon sudah terdaftar.' };
        if (users.some(u => u.email === email)) return { success: false, error: 'Email sudah terdaftar.' };
        const newUser = { id: `usr_${Date.now()}`, name, email, phoneNumber, pin,
                          balance: 100000, points: 100, tier: 'Bronze', xp: 0, role: 'user' };
        users.push(newUser);
        localStorage.setItem('stei_bantu_users', JSON.stringify(users));
        window.db.saveSession(newUser);
        window.db.saveTransaction({ type: 'Promo Reward', amount: 100000, description: 'Bonus Pendaftaran Anggota Baru STEI Bantu' });
        return { success: true, user: newUser, role: 'user' };
    }
    logout() { window.db.clearSession(); return true; }
}

class OrderService {
    findNearestWorker(serviceType, vehicleType, pickupLat, pickupLng) {
        let workers = window.db.getWorkers().filter(w => w.serviceType === serviceType && w.status === 'available');
        if (serviceType === 'BantuRide' && vehicleType) workers = workers.filter(w => w.vehicleType === vehicleType);
        if (!workers.length) return null;
        const ls = new LocationService();
        let nearest = null, minDist = Infinity;
        workers.forEach(w => {
            const d = ls.calculateDistance(pickupLat, pickupLng, w.lat, w.lng);
            if (d < minDist) { minDist = d; nearest = w; }
        });
        return nearest ? { worker: nearest, distance: minDist } : null;
    }

    bookOrder(user, serviceType, pickup, destination, fare, workspaceParams = {}) {
        if (user.balance < fare.total) throw new Error('Saldo BantuPay Anda tidak mencukupi.');
        // Deduct user balance immediately (hold/payment on booking)
        user.balance -= fare.total;
        window.db.updateUser(user);
        window.db.saveTransaction({ type: `${serviceType} Payment`, amount: -fare.total, description: `Pembayaran ${serviceType} oleh ${user.name}` });

        const newOrder = {
            id: `ord_${Date.now()}`,
            userId: user.id,
            userName: user.name,
            userPhone: user.phoneNumber,
            serviceType,
            status: workspaceParams.isScheduled ? 'Scheduled' : 'Pending',
            pickupName: pickup.name,
            pickupLat: pickup.lat,
            pickupLng: pickup.lng,
            destinationName: destination.name,
            destinationLat: destination.lat,
            destinationLng: destination.lng,
            price: fare.total,
            pointsEarned: fare.pointsEarned,
            timestamp: new Date().toISOString(),
            details: workspaceParams
        };
        return window.db.saveOrder(newOrder);
    }

    completeOrder(orderId, userId) {
        const order = window.db.getOrders().find(o => o.id === orderId);
        if (!order || order.status === 'Completed') return null;
        const users = window.db.getUsers();

        // Award points and XP to the customer (on completion)
        const customer = users.find(u => u.id === order.userId);
        if (customer) {
            customer.points = (customer.points || 0) + (order.pointsEarned || 0);
            const xpGained = Math.round(order.price * 0.05);
            customer.xp = (customer.xp || 0) + xpGained;
            let tierUpgraded = false, oldTier = customer.tier;
            if (customer.tier === 'Bronze' && customer.xp >= 200) { customer.tier = 'Silver'; tierUpgraded = true; }
            else if (customer.tier === 'Silver' && customer.xp >= 600) { customer.tier = 'Gold'; tierUpgraded = true; }
            window.db.updateUser(customer);
            window.db.saveTransaction({ type: 'Reward Cashback', amount: order.pointsEarned || 0, description: `BantuPoints cashback dari pesanan ${order.id}` });

            // Credit the assigned worker (if any)
            let earning = 0;
            if (order.workerId) {
                const workerUser = users.find(u => u.workerId === order.workerId);
                if (workerUser) {
                    earning = Math.round((order.price || 0) * 0.8);
                    workerUser.balance = (workerUser.balance || 0) + earning;
                    window.db.updateUser(workerUser);
                    window.db.saveTransaction({ type: `${order.serviceType} Earning`, amount: earning, description: `Pendapatan ${workerUser.name} dari order ${order.id}` });
                } else {
                    // If there's no matching user record for the worker, create one so earnings are tracked
                    const workers = window.db.getWorkers();
                    const workerInfo = workers.find(w => w.id === order.workerId);
                    if (workerInfo) {
                        earning = Math.round((order.price || 0) * 0.8);
                        const newWorkerUser = {
                            id: `usr_${Date.now()}`,
                            name: workerInfo.name || 'Mitra STEI Bantu',
                            email: `${(workerInfo.name||'mitra').toLowerCase().replace(/\s+/g,'')}@steibantu.local`,
                            phoneNumber: workerInfo.phoneNumber || '',
                            pin: '000000',
                            balance: earning,
                            points: 0,
                            tier: 'Bronze',
                            xp: 0,
                            role: 'worker',
                            workerId: workerInfo.id
                        };
                        const allUsers = window.db.getUsers();
                        allUsers.push(newWorkerUser);
                        window.db._write('stei_bantu_users', allUsers);
                        window.db.saveTransaction({ type: `${order.serviceType} Earning`, amount: earning, description: `Pendapatan ${newWorkerUser.name} dari order ${order.id}` });
                    }
                }
            }

            // Persist order status as Completed with meta
            const xpGainedVal = Math.round(order.price * 0.05);
            return window.db.updateOrderStatus(orderId, 'Completed', { tierUpgraded, oldTier, newTier: customer.tier, xpGained: xpGainedVal, workerEarning: earning });
        }
        return null;
    }

    cancelOrder(orderId, cancelledBy = 'user') {
        const order = window.db.getOrders().find(o => o.id === orderId);
        if (!order || ['Completed','Cancelled'].includes(order.status)) return null;

        // Refund the customer since payment was taken at booking
        const users = window.db.getUsers();
        const customer = users.find(u => u.id === order.userId);
        if (customer) {
            customer.balance = (customer.balance || 0) + (order.price || 0);
            window.db.updateUser(customer);
            window.db.saveTransaction({ type: `${order.serviceType} Refund`, amount: order.price, description: `Refund untuk order ${order.id} (Dibatalkan oleh ${cancelledBy})` });
        }

        return window.db.updateOrderStatus(orderId, 'Cancelled', { cancelReason: `Dibatalkan oleh ${cancelledBy}` });
    }
}

// AI-powered chat: calls Claude API for dummy worker responses
class ChatService {
    async getAiWorkerResponse(orderId, workerName, serviceType, userMessage) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 150,
                    system: `Kamu adalah mitra driver/worker aplikasi STEI Bantu bernama "${workerName}" yang melayani layanan ${serviceType} untuk mahasiswa ITB Bandung. Balas pesan user dengan singkat, ramah, natural seperti chat WhatsApp. Gunakan bahasa Indonesia informal/santai, sesekali pakai emoji. Max 2 kalimat. Jangan berlebihan. Jangan sebut nama kamu kecuali diminta.`,
                    messages: [{ role: 'user', content: userMessage }]
                })
            });
            const data = await response.json();
            return data.content?.[0]?.text || 'Siap kak! 👍';
        } catch (e) {
            // Fallback to scripted response
            const fallbacks = [
                'Siap kak, sedang dalam perjalanan! 🚀',
                'Oke kak, noted ya! 👌',
                'Baik kak, saya usahakan secepatnya!',
                'Siap kak! Mohon ditunggu sebentar ya 🙏'
            ];
            return fallbacks[Math.floor(Math.random() * fallbacks.length)];
        }
    }
}

// --- External Price API wrapper (template) ---
class PriceApiService {
    constructor(opts = {}) {
        this.apiKey = opts.apiKey || 'AQ.Ab8RN6KDzfdlhwowvd3iDSrMwO6uuD90UxhWZ30sytZsKx-ZEQ';
        this.endpoint = opts.endpoint || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    }

    // Example method: send pricing request to external API (async)
    // Note: For security, proxy this request through your server — do NOT embed real API keys in frontend.
    async fetchEstimate(payload) {
        try {
            const res = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey
                },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(`Price API error ${res.status}`);
            return await res.json();
        } catch (e) {
            console.warn('PriceApiService.fetchEstimate failed:', e);
            return null;
        }
    }
}


// SHOP CATALOG (V3 - comprehensive for mahasiswa)
window.SHOP_CATALOG = {
    categories: [
        { id: 'maket', label: '🏗️ Maket & Arsitektur', icon: 'fa-drafting-compass' },
        { id: 'stationery', label: '✏️ ATK & Stationery', icon: 'fa-pen-ruler' },
        { id: 'grocery', label: '🛒 Groceries & Makanan', icon: 'fa-basket-shopping' },
        { id: 'fashion', label: '👕 Fashion & Pakaian', icon: 'fa-shirt' },
        { id: 'hardware', label: '🔧 Peralatan & Hardware', icon: 'fa-screwdriver-wrench' },
        { id: 'electronics', label: '💡 Elektronik & Aksesoris', icon: 'fa-plug' },
        { id: 'kesehatan', label: '💊 Kesehatan & Kebersihan', icon: 'fa-kit-medical' },
        { id: 'print', label: '🖨️ Print & Fotokopi', icon: 'fa-print' }
    ],
    products: [
        // MAKET
        { id: 'p001', cat: 'maket', name: 'Foam Board A1 (5mm)', price: 18000, unit: 'lembar', emoji: '📐', tags: ['arsitektur','maket','model'] },
        { id: 'p002', cat: 'maket', name: 'Balsa Wood Sheet 30x10cm', price: 12000, unit: 'pcs', emoji: '🪵', tags: ['kayu','maket'] },
        { id: 'p003', cat: 'maket', name: 'Lem Fox (Kuning) 50ml', price: 9000, unit: 'botol', emoji: '🧴', tags: ['lem','maket'] },
        { id: 'p004', cat: 'maket', name: 'Kertas Duplex A3', price: 3500, unit: 'lembar', emoji: '📄', tags: ['kertas','maket'] },
        { id: 'p005', cat: 'maket', name: 'Cutter Stanley + Isi', price: 22000, unit: 'set', emoji: '🔪', tags: ['cutter','alat'] },
        { id: 'p006', cat: 'maket', name: 'Triplek 3mm 60x120cm', price: 45000, unit: 'lembar', emoji: '🪵', tags: ['triplek','maket'] },
        { id: 'p007', cat: 'maket', name: 'Cat Poster (Set 12 Warna)', price: 35000, unit: 'set', emoji: '🎨', tags: ['cat','maket','warna'] },
        { id: 'p008', cat: 'maket', name: 'Kawat Tembaga 0.5mm (10m)', price: 15000, unit: 'roll', emoji: '🔌', tags: ['kawat','maket'] },
        // STATIONERY
        { id: 'p009', cat: 'stationery', name: 'Kertas HVS A4 80gr (1 Rim)', price: 55000, unit: 'rim', emoji: '📋', tags: ['kertas','print','hvs'] },
        { id: 'p010', cat: 'stationery', name: 'Pulpen Pilot G-2 (Hitam)', price: 8500, unit: 'pcs', emoji: '✒️', tags: ['pulpen','tulis'] },
        { id: 'p011', cat: 'stationery', name: 'Buku Tulis Sidu 58 Lembar', price: 6000, unit: 'pcs', emoji: '📓', tags: ['buku','tulis'] },
        { id: 'p012', cat: 'stationery', name: 'Stabilo Boss (Set 4 Warna)', price: 18000, unit: 'set', emoji: '🖊️', tags: ['stabilo','warna'] },
        { id: 'p013', cat: 'stationery', name: 'Sticky Notes 3x3 (4 Warna)', price: 12000, unit: 'pack', emoji: '📌', tags: ['sticky','notes'] },
        { id: 'p014', cat: 'stationery', name: 'Map Plastik Snelhecter', price: 5000, unit: 'pcs', emoji: '📁', tags: ['map','file'] },
        { id: 'p015', cat: 'stationery', name: 'Penggaris 30cm + Segitiga Set', price: 14000, unit: 'set', emoji: '📐', tags: ['penggaris','geometri'] },
        { id: 'p016', cat: 'stationery', name: 'Flashdisk 32GB SanDisk', price: 85000, unit: 'pcs', emoji: '💾', tags: ['flashdisk','storage'] },
        // GROCERY
        { id: 'p017', cat: 'grocery', name: 'Indomie Goreng (1 Dos = 40pcs)', price: 95000, unit: 'dos', emoji: '🍜', tags: ['mie','indomie','makanan'] },
        { id: 'p018', cat: 'grocery', name: 'Kopi Kapal Api Special (165gr)', price: 16000, unit: 'sachet', emoji: '☕', tags: ['kopi','minuman'] },
        { id: 'p019', cat: 'grocery', name: 'Aqua Galon 19L', price: 22000, unit: 'galon', emoji: '💧', tags: ['air','minum','aqua'] },
        { id: 'p020', cat: 'grocery', name: 'Roti Tawar Sari Roti (622gr)', price: 18000, unit: 'pack', emoji: '🍞', tags: ['roti','sarapan'] },
        { id: 'p021', cat: 'grocery', name: 'Teh Botol Sosro 1L', price: 8000, unit: 'pcs', emoji: '🧃', tags: ['teh','minuman'] },
        { id: 'p022', cat: 'grocery', name: 'Snack All-Nighter Pack (Anek)', price: 45000, unit: 'pack', emoji: '🍫', tags: ['snack','begadang','TA'] },
        { id: 'p023', cat: 'grocery', name: 'Telur Ayam 1 Lusin', price: 28000, unit: 'lusin', emoji: '🥚', tags: ['telur','grocery'] },
        { id: 'p024', cat: 'grocery', name: 'Minyak Goreng Bimoli 2L', price: 36000, unit: 'botol', emoji: '🛢️', tags: ['minyak','masak'] },
        // FASHION
        { id: 'p025', cat: 'fashion', name: 'Kaos Polos Cotton 30s (S-XL)', price: 45000, unit: 'pcs', emoji: '👕', tags: ['kaos','baju','polos'] },
        { id: 'p026', cat: 'fashion', name: 'Kain Drill Seragam (per meter)', price: 25000, unit: 'meter', emoji: '🧵', tags: ['kain','seragam','jahit'] },
        { id: 'p027', cat: 'fashion', name: 'Kaos Kaki Cotton (3 Pasang)', price: 18000, unit: 'pack', emoji: '🧦', tags: ['kaos kaki','pakain'] },
        { id: 'p028', cat: 'fashion', name: 'Sabuk/Belt Kulit Imitasi', price: 35000, unit: 'pcs', emoji: '👔', tags: ['sabuk','belt'] },
        { id: 'p029', cat: 'fashion', name: 'Masker KF94 (10 pcs)', price: 22000, unit: 'box', emoji: '😷', tags: ['masker','kesehatan'] },
        // HARDWARE
        { id: 'p030', cat: 'hardware', name: 'Obeng Set Phillips + Flat', price: 25000, unit: 'set', emoji: '🔧', tags: ['obeng','tools'] },
        { id: 'p031', cat: 'hardware', name: 'Baterai AA Alkaline (4pcs)', price: 18000, unit: 'pack', emoji: '🔋', tags: ['baterai','energi'] },
        { id: 'p032', cat: 'hardware', name: 'Kabel Tis (Tie) 100pcs', price: 12000, unit: 'pack', emoji: '🔗', tags: ['kabel','tis'] },
        { id: 'p033', cat: 'hardware', name: 'Solatip Putih 2cm x 10m', price: 7000, unit: 'roll', emoji: '🩹', tags: ['solatip','isolasi'] },
        { id: 'p034', cat: 'hardware', name: 'Paku Kayu Assorted (250gr)', price: 15000, unit: 'pack', emoji: '📌', tags: ['paku','kayu'] },
        { id: 'p035', cat: 'hardware', name: 'Amplas (Sandpaper) Halus 5 Lembar', price: 8000, unit: 'pack', emoji: '🪵', tags: ['amplas','maket'] },
        // ELECTRONICS
        { id: 'p036', cat: 'electronics', name: 'Kabel USB-C to USB-C 1m', price: 35000, unit: 'pcs', emoji: '🔌', tags: ['kabel','charger','usbc'] },
        { id: 'p037', cat: 'electronics', name: 'Lampu LED E27 9W (Terang)', price: 22000, unit: 'pcs', emoji: '💡', tags: ['lampu','led','kamar'] },
        { id: 'p038', cat: 'electronics', name: 'Stop Kontak 4 Colokan (3m)', price: 45000, unit: 'pcs', emoji: '🔌', tags: ['stopkontak','colokan'] },
        { id: 'p039', cat: 'electronics', name: 'Earphone In-Ear 3.5mm Basic', price: 35000, unit: 'pcs', emoji: '🎧', tags: ['earphone','audio'] },
        { id: 'p040', cat: 'electronics', name: 'Mouse Wireless Logitech M170', price: 145000, unit: 'pcs', emoji: '🖱️', tags: ['mouse','laptop','komputer'] },
        // KESEHATAN
        { id: 'p041', cat: 'kesehatan', name: 'Paracetamol 500mg (10 Tab)', price: 6000, unit: 'strip', emoji: '💊', tags: ['obat','paracetamol','demam'] },
        { id: 'p042', cat: 'kesehatan', name: 'Sabun Mandi Lifebuoy (110gr)', price: 8000, unit: 'pcs', emoji: '🧼', tags: ['sabun','mandi'] },
        { id: 'p043', cat: 'kesehatan', name: 'Shampo Sunsilk (170ml)', price: 18000, unit: 'botol', emoji: '🧴', tags: ['shampo','rambut'] },
        { id: 'p044', cat: 'kesehatan', name: 'Hand Sanitizer 50ml', price: 12000, unit: 'botol', emoji: '🧴', tags: ['sanitizer','bersih'] },
        { id: 'p045', cat: 'kesehatan', name: 'Vitamin C 1000mg (10 Tab)', price: 15000, unit: 'strip', emoji: '💊', tags: ['vitamin','imun'] },
        // PRINT
        { id: 'p046', cat: 'print', name: 'Print B&W A4 (per lembar)', price: 500, unit: 'lembar', emoji: '🖨️', tags: ['print','hitam putih'] },
        { id: 'p047', cat: 'print', name: 'Print Warna A4 (per lembar)', price: 2000, unit: 'lembar', emoji: '🖨️', tags: ['print','warna'] },
        { id: 'p048', cat: 'print', name: 'Jilid Buku Proposal (Mika)', price: 8000, unit: 'pcs', emoji: '📖', tags: ['jilid','print','proposal'] },
        { id: 'p049', cat: 'print', name: 'Fotokopi per lembar', price: 300, unit: 'lembar', emoji: '📋', tags: ['fotokopi','copy'] },
        { id: 'p050', cat: 'print', name: 'Laminating A4', price: 5000, unit: 'lembar', emoji: '🗂️', tags: ['laminasi','laminating'] }
    ]
};

// BANTUFIX CATEGORIES (V3 - comprehensive)
window.BANTUFIX_CATALOG = {
    categories: [
        {
            id: 'kelistrikan', name: 'Kelistrikan', icon: 'fa-bolt', color: '#f59e0b',
            items: [
                { n: 'Lampu Putus / Tidak Menyala', d: '15-30 mnt', p: 30000 },
                { n: 'Stop Kontak Goyang / Konslet', d: '20-45 mnt', p: 40000 },
                { n: 'MCB/Sekring Sering Trip', d: '30-60 mnt', p: 55000 },
                { n: 'Kabel Terkelupas / Berbahaya', d: '30-90 mnt', p: 65000 },
                { n: 'Instalasi Stop Kontak Baru', d: '60-120 mnt', p: 85000 }
            ]
        },
        {
            id: 'ac', name: 'AC & Pendingin', icon: 'fa-wind', color: '#0ea5e9',
            items: [
                { n: 'AC Tidak Dingin (Cuci AC)', d: '60-90 mnt', p: 75000 },
                { n: 'AC Bocor Air / Menetes', d: '30-60 mnt', p: 55000 },
                { n: 'AC Tidak Mau Nyala', d: '30-60 mnt', p: 50000 },
                { n: 'Isi Freon AC (per 0.5kg)', d: '30-45 mnt', p: 90000 },
                { n: 'Pasang AC Unit Baru', d: '90-180 mnt', p: 150000 }
            ]
        },
        {
            id: 'plumbing', name: 'Pipa & Plumbing', icon: 'fa-faucet', color: '#06b6d4',
            items: [
                { n: 'Saluran Air Mampet / Tersumbat', d: '20-60 mnt', p: 45000 },
                { n: 'Keran Bocor / Menetes', d: '15-30 mnt', p: 35000 },
                { n: 'WC / Closet Tersumbat', d: '20-60 mnt', p: 55000 },
                { n: 'Pipa Bocor (Repair)', d: '30-90 mnt', p: 70000 },
                { n: 'Pompa Air Tidak Naik', d: '45-120 mnt', p: 85000 }
            ]
        },
        {
            id: 'gadget', name: 'Laptop & Komputer', icon: 'fa-laptop', color: '#8b5cf6',
            items: [
                { n: 'Laptop Lambat / Hang', d: '30-60 mnt', p: 50000 },
                { n: 'Layar Laptop Retak', d: '60-120 mnt', p: 120000 },
                { n: 'Keyboard Laptop Macet', d: '45-90 mnt', p: 80000 },
                { n: 'Baterai Laptop Tidak Mengisi', d: '30-60 mnt', p: 55000 },
                { n: 'Install Ulang Windows/Linux', d: '60-120 mnt', p: 75000 },
                { n: 'Laptop Mati Total', d: '60-180 mnt', p: 100000 }
            ]
        },
        {
            id: 'smartphone', name: 'Smartphone & Gadget', icon: 'fa-mobile-screen', color: '#ec4899',
            items: [
                { n: 'Layar HP Retak (Ganti LCD)', d: '60-120 mnt', p: 150000 },
                { n: 'Baterai HP Kembung / Lemah', d: '30-60 mnt', p: 80000 },
                { n: 'Port Charger Longgar/Rusak', d: '45-90 mnt', p: 70000 },
                { n: 'Kamera HP Kabur/Rusak', d: '60-90 mnt', p: 90000 },
                { n: 'HP Mati Tidak Bisa Hidup', d: '30-90 mnt', p: 60000 }
            ]
        },
        {
            id: 'furnitur', name: 'Furnitur & Kayu', icon: 'fa-chair', color: '#a3855f',
            items: [
                { n: 'Engsel Pintu / Lemari Rusak', d: '15-30 mnt', p: 30000 },
                { n: 'Kursi Patah / Goyang', d: '20-45 mnt', p: 45000 },
                { n: 'Pasang Gantungan Tembok', d: '10-20 mnt', p: 25000 },
                { n: 'Rakit Furnitur IKEA/Flat Pack', d: '60-180 mnt', p: 85000 },
                { n: 'Lemari Geser Macet', d: '20-40 mnt', p: 40000 }
            ]
        },
        {
            id: 'kunci', name: 'Pintu & Kunci', icon: 'fa-key', color: '#f59e0b',
            items: [
                { n: 'Kunci Pintu Macet / Susah', d: '15-30 mnt', p: 35000 },
                { n: 'Ganti Kunci / Silinder Baru', d: '20-40 mnt', p: 55000 },
                { n: 'Pintu Tidak Bisa Tutup Rapat', d: '20-45 mnt', p: 45000 },
                { n: 'Kunci Tertinggal di Dalam', d: '15-45 mnt', p: 50000 }
            ]
        },
        {
            id: 'cat', name: 'Cat & Dinding', icon: 'fa-paint-roller', color: '#10b981',
            items: [
                { n: 'Dinding Kusam / Kotor (Cat Ulang)', d: '120-240 mnt', p: 120000 },
                { n: 'Tembok Retak (Tambal + Cat)', d: '60-120 mnt', p: 80000 },
                { n: 'Atap Bocor (Waterproof)', d: '60-180 mnt', p: 100000 },
                { n: 'Pasang Wallpaper', d: '90-180 mnt', p: 95000 }
            ]
        }
    ]
};

window.locationService = new LocationService();
window.priceEstimatorService = new PriceEstimatorService();
// Default to local proxy endpoint. Replace with your deployed proxy URL in production.
window.priceApi = new PriceApiService({ apiKey: 'TaroDisiniYaAPIKeyNya', endpoint: 'http://localhost:8001/api/price-estimate' });
window.authService = new AuthService();
window.orderService = new OrderService();
window.chatService = new ChatService();

console.log('STEI Bantu Services V3: Loaded.');
