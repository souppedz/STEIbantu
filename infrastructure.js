/**
 * STEI BANTU - INFRASTRUCTURE LAYER (V3)
 * 
 * Centralized localStorage state DB.
 * V3: Extended shop catalog, detailed order tracking, chat history, BantuFix categories.
 */

class InfrastructureStore {
    constructor() {
        this.DB_KEYS = {
            USERS: 'stei_bantu_users',
            WORKERS: 'stei_bantu_workers',
            ORDERS: 'stei_bantu_orders',
            TRANSACTIONS: 'stei_bantu_transactions',
            CHATS: 'stei_bantu_chats',
            SESSION: 'stei_bantu_session',
            CART: 'stei_bantu_cart'
        };
        this.initDb();
    }

    _read(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) { return null; }
    }

    _write(key, data) {
        try { localStorage.setItem(key, JSON.stringify(data)); return true; }
        catch (e) { return false; }
    }

    initDb() {
        const defaultUsers = [
            {
                id: 'usr_001', phoneNumber: '+628123456789',
                name: 'Budi Santoso', email: 'budi.santoso@itb.ac.id',
                pin: '123456', balance: 250000, points: 620,
                tier: 'Silver', xp: 280, role: 'user'
            },
            {
                id: 'usr_worker_001', phoneNumber: '+628999999901',
                name: 'Asep Knalpot', email: 'asep@steibantu.id',
                pin: '123456', balance: 750000, points: 3200,
                tier: 'Gold', xp: 820, role: 'worker', workerId: 'wrk_001'
            },
            {
                id: 'usr_worker_002', phoneNumber: '+628999999902',
                name: 'Budi Innova', email: 'budi.innova@steibantu.id',
                pin: '123456', balance: 520000, points: 1800,
                tier: 'Silver', xp: 540, role: 'worker', workerId: 'wrk_002'
            },
            {
                id: 'usr_worker_003', phoneNumber: '+628999999903',
                name: 'Mang Ujang', email: 'ujang@steibantu.id',
                pin: '123456', balance: 430000, points: 2100,
                tier: 'Silver', xp: 410, role: 'worker', workerId: 'wrk_003'
            },
            {
                id: 'usr_worker_004', phoneNumber: '+628999999904',
                name: 'Teh Imas', email: 'imas@steibantu.id',
                pin: '123456', balance: 380000, points: 1600,
                tier: 'Silver', xp: 360, role: 'worker', workerId: 'wrk_004'
            },
            {
                id: 'usr_worker_005', phoneNumber: '+628999999905',
                name: 'Cecep Paxel', email: 'cecep@steibantu.id',
                pin: '123456', balance: 610000, points: 2900,
                tier: 'Gold', xp: 710, role: 'worker', workerId: 'wrk_005'
            },
            {
                id: 'usr_worker_006', phoneNumber: '+628999999906',
                name: 'Siti Belanja', email: 'siti@steibantu.id',
                pin: '123456', balance: 490000, points: 2400,
                tier: 'Silver', xp: 480, role: 'worker', workerId: 'wrk_006'
            }
        ];

        const existingUsers = this._read(this.DB_KEYS.USERS);
        if (!existingUsers) {
            this._write(this.DB_KEYS.USERS, defaultUsers);
        } else {
            const mergedUsers = [...existingUsers];
            defaultUsers.forEach(defaultUser => {
                const alreadyExists = existingUsers.some(u => u.phoneNumber === defaultUser.phoneNumber || u.id === defaultUser.id);
                if (!alreadyExists) mergedUsers.push(defaultUser);
            });
            if (mergedUsers.length !== existingUsers.length) {
                this._write(this.DB_KEYS.USERS, mergedUsers);
            }
        }

        const defaultWorkers = [
            { id: 'wrk_001', name: 'Asep Knalpot', avatar: 'https://i.pravatar.cc/150?img=11', serviceType: 'BantuRide', vehicleType: 'motorcycle', rating: 4.9, vehicleNumber: 'D 1234 ITB (Vario)', phoneNumber: '+62899112233', isVerified: true, lat: -6.8920, lng: 107.6105, status: 'available' },
            { id: 'wrk_002', name: 'Budi Innova', avatar: 'https://i.pravatar.cc/150?img=12', serviceType: 'BantuRide', vehicleType: 'car', rating: 4.8, vehicleNumber: 'D 888 CAR (Innova)', phoneNumber: '+62899443322', isVerified: true, lat: -6.8940, lng: 107.6150, status: 'available' },
            { id: 'wrk_003', name: 'Mang Ujang', avatar: 'https://i.pravatar.cc/150?img=13', serviceType: 'BantuFix', rating: 4.8, specialty: 'AC & Kelistrikan Kos', phoneNumber: '+62899445566', isVerified: true, lat: -6.8850, lng: 107.6135, status: 'available' },
            { id: 'wrk_004', name: 'Teh Imas', avatar: 'https://i.pravatar.cc/150?img=47', serviceType: 'BantuClean', rating: 4.7, specialty: 'Housekeeping & Laundry Kos', phoneNumber: '+62899778899', isVerified: true, lat: -6.9025, lng: 107.6185, status: 'available' },
            { id: 'wrk_005', name: 'Cecep Paxel', avatar: 'https://i.pravatar.cc/150?img=14', serviceType: 'BantuSend', rating: 4.9, vehicleNumber: 'D 9876 PX (Box)', phoneNumber: '+62899001122', isVerified: true, lat: -6.8985, lng: 107.6090, status: 'available' },
            { id: 'wrk_006', name: 'Siti Belanja', avatar: 'https://i.pravatar.cc/150?img=48', serviceType: 'BantuShop', rating: 4.8, specialty: 'Maket & Grocery Specialist', phoneNumber: '+62899334455', isVerified: true, lat: -6.8895, lng: 107.5960, status: 'available' }
        ];
        const existingWorkers = this._read(this.DB_KEYS.WORKERS);
        if (!existingWorkers) {
            this._write(this.DB_KEYS.WORKERS, defaultWorkers);
        } else {
            const mergedWorkers = [...existingWorkers];
            defaultWorkers.forEach(defaultWorker => {
                const alreadyExists = existingWorkers.some(w => w.id === defaultWorker.id || w.phoneNumber === defaultWorker.phoneNumber);
                if (!alreadyExists) mergedWorkers.push(defaultWorker);
            });
            if (mergedWorkers.length !== existingWorkers.length) {
                this._write(this.DB_KEYS.WORKERS, mergedWorkers);
            }
        }

        if (!this._read(this.DB_KEYS.TRANSACTIONS)) {
            this._write(this.DB_KEYS.TRANSACTIONS, [
                { id: 'tx_001', type: 'Top Up', amount: 150000, timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), status: 'Success', description: 'BantuPay Top Up via BCA Virtual Account' },
                { id: 'tx_002', type: 'BantuShop Order', amount: -45000, timestamp: new Date(Date.now() - 86400000).toISOString(), status: 'Success', description: 'Bahan Maket Arsitektur & Kertas Print (Runner: Siti Belanja)' },
                { id: 'tx_003', type: 'Reward Cashback', amount: 450, timestamp: new Date(Date.now() - 86400000).toISOString(), status: 'Success', description: 'BantuPoints cashback from BantuShop Order' }
            ]);
        }

        if (!this._read(this.DB_KEYS.ORDERS)) {
            this._write(this.DB_KEYS.ORDERS, [
                {
                    id: 'ord_901', userId: 'usr_001', serviceType: 'BantuShop', status: 'Completed',
                    pickupName: 'Toko Buku Braga', destinationName: 'Kost Dago Elok',
                    price: 45000, pointsEarned: 450, workerId: 'wrk_006', workerName: 'Siti Belanja',
                    workerAvatar: 'https://i.pravatar.cc/150?img=48', workerRating: 4.8,
                    workerPhone: '+62899334455', vehicleNumber: 'Jasa Belanja',
                    timestamp: new Date(Date.now() - 86400000).toISOString(),
                    details: { shopRequest: 'Tolong belikan kertas dupleks maket 3 lembar dan lem Fox botol.', itemsCost: 30000, serviceFee: 15000 }
                },
                {
                    id: 'ord_902', userId: 'usr_001', serviceType: 'BantuClean', status: 'Scheduled',
                    pickupName: 'Kost Orange Ganesha', destinationName: 'Kost Orange Ganesha (Target Bersih)',
                    price: 38000, pointsEarned: 380, workerId: 'wrk_004', workerName: 'Teh Imas',
                    workerAvatar: 'https://i.pravatar.cc/150?img=47', workerRating: 4.7,
                    workerPhone: '+62899778899', vehicleNumber: 'Jasa Bersih',
                    timestamp: new Date(Date.now() + 86400000).toISOString(),
                    details: { roomArea: 16, cleaningType: 'Deep Clean', scheduledDate: new Date(Date.now() + 86400000).toLocaleDateString('id-ID'), scheduledTime: '10:00' }
                },
                {
                    id: 'ord_903', userId: 'usr_001', serviceType: 'BantuSend', status: 'Cancelled',
                    pickupName: 'Lab STEI ITB Ganesha', destinationName: 'Kantor Pos Dago',
                    price: 15000, pointsEarned: 0, workerId: 'wrk_005', workerName: 'Cecep Paxel',
                    workerAvatar: 'https://i.pravatar.cc/150?img=14', workerRating: 4.9,
                    workerPhone: '+62899001122', vehicleNumber: 'D 9876 PX (Box)',
                    timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
                    cancelReason: 'Salah alamat penerima.',
                    details: { packageSize: 'M', packageNotes: 'Dokumen Laboratorium penting', speed: 'Instant' }
                }
            ]);
        }

        if (!this._read(this.DB_KEYS.CHATS)) this._write(this.DB_KEYS.CHATS, {});
        if (!this._read(this.DB_KEYS.CART)) this._write(this.DB_KEYS.CART, []);
    }

    // --- USER ---
    getUsers() { return this._read(this.DB_KEYS.USERS) || []; }
    updateUser(updatedUser) {
        const users = this.getUsers();
        const index = users.findIndex(u => u.id === updatedUser.id);
        if (index !== -1) {
            users[index] = updatedUser;
            this._write(this.DB_KEYS.USERS, users);
            const session = this.getSession();
            if (session && session.id === updatedUser.id) this.saveSession(updatedUser);
            return true;
        }
        return false;
    }

    // --- SESSION ---
    saveSession(user) { return this._write(this.DB_KEYS.SESSION, user); }
    getSession() { return this._read(this.DB_KEYS.SESSION); }
    clearSession() { localStorage.removeItem(this.DB_KEYS.SESSION); }

    // --- WORKERS ---
    getWorkers() { return this._read(this.DB_KEYS.WORKERS) || []; }

    // --- ORDERS ---
    getOrders() { return this._read(this.DB_KEYS.ORDERS) || []; }
    saveOrder(order) {
        const orders = this.getOrders();
        orders.unshift(order);
        this._write(this.DB_KEYS.ORDERS, orders);
        return order;
    }
    updateOrderStatus(orderId, status, details = {}) {
        const orders = this.getOrders();
        const order = orders.find(o => o.id === orderId);
        if (order) {
            order.status = status;
            Object.assign(order, details);
            this._write(this.DB_KEYS.ORDERS, orders);
            return order;
        }
        return null;
    }
    getOrderById(orderId) {
        return this.getOrders().find(o => o.id === orderId) || null;
    }

    // --- TRANSACTIONS ---
    getTransactions() { return this._read(this.DB_KEYS.TRANSACTIONS) || []; }
    saveTransaction(transaction) {
        const txs = this.getTransactions();
        const newTx = { id: `tx_${Date.now()}`, timestamp: new Date().toISOString(), status: 'Success', ...transaction };
        txs.unshift(newTx);
        this._write(this.DB_KEYS.TRANSACTIONS, txs);
        return newTx;
    }

    // --- CHATS ---
    getChats(orderId) {
        const chats = this._read(this.DB_KEYS.CHATS) || {};
        return chats[orderId] || [];
    }
    saveMessage(orderId, sender, text) {
        const chats = this._read(this.DB_KEYS.CHATS) || {};
        if (!chats[orderId]) chats[orderId] = [];
        const newMsg = { sender, text, timestamp: new Date().toISOString() };
        chats[orderId].push(newMsg);
        this._write(this.DB_KEYS.CHATS, chats);
        return newMsg;
    }
    getAllChats() { return this._read(this.DB_KEYS.CHATS) || {}; }

    // --- CART (BantuShop) ---
    getCart() { return this._read(this.DB_KEYS.CART) || []; }
    saveCart(cart) { return this._write(this.DB_KEYS.CART, cart); }
    clearCart() { return this._write(this.DB_KEYS.CART, []); }

    resetDatabase() {
        Object.values(this.DB_KEYS).forEach(k => localStorage.removeItem(k));
        this.initDb();
    }
}

window.db = new InfrastructureStore();
console.log('STEI Bantu Infrastructure V3: Loaded.');
