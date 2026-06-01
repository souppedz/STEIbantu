const fs = require('fs');
const vm = require('vm');
const path = require('path');

function makeLocalStorage() {
    const store = {};
    return {
        getItem(k) { return store.hasOwnProperty(k) ? store[k] : null; },
        setItem(k,v) { store[k] = String(v); },
        removeItem(k) { delete store[k]; },
        clear() { Object.keys(store).forEach(k => delete store[k]); }
    };
}

(async function(){
    try {
        const base = __dirname;
        const infraCode = fs.readFileSync(path.join(base, 'infrastructure.js'), 'utf8');
        const servicesCode = fs.readFileSync(path.join(base, 'services.js'), 'utf8');

        const localStorage = makeLocalStorage();
        const context = {
            window: {},
            localStorage,
            console,
            Date,
            setTimeout,
            clearTimeout,
            fetch: async () => ({ ok: true, json: async () => ({}) }),
            navigator: {},
        };
        vm.createContext(context);

        // Run infra then services
        vm.runInContext(infraCode, context, { filename: 'infrastructure.js' });
        vm.runInContext(servicesCode, context, { filename: 'services.js' });

        const db = context.window.db;
        const orderService = context.window.orderService;
        const priceEstimator = context.window.priceEstimatorService;

        // Pick a regular user and first worker
        const users = db.getUsers();
        const user = users.find(u => u.role === 'user');
        const workers = db.getWorkers();
        const worker = workers[0];

        console.log('=== BEFORE ===');
        console.log('User:', user.name, 'balance=', user.balance);
        console.log('Worker:', worker.name);

        // Estimate fare
        const fare = priceEstimator.estimateFare('BantuRide', 2.5, 10, user.tier, { vehicleType: 'motorcycle', vehicleTier: 'Normal' });
        console.log('Estimated fare:', fare.total);

        // Book order
        const pickup = { name: 'ITB Ganesha', lat: -6.8915, lng: 107.6107 };
        const dest = { name: 'Gedung Sate', lat: -6.9025, lng: 107.6188 };
        const order = orderService.bookOrder(user, 'BantuRide', pickup, dest, fare, {});
        console.log('Order created:', order.id, 'status=', order.status);

        const freshUser1 = db.getUsers().find(u => u.id === user.id);
        console.log('After booking - user balance:', freshUser1.balance);

        // Assign worker (simulate worker accept)
        db.updateOrderStatus(order.id, 'Active', { workerId: worker.id, workerName: worker.name });
        console.log('Assigned to worker:', worker.name);

        // Simulate user cancelling the order to test refund
        const order2 = orderService.bookOrder(user, 'BantuRide', pickup, dest, fare, {});
        console.log('Order2 created for cancellation test:', order2.id, 'status=', order2.status);
        const beforeCancelUser = db.getUsers().find(u => u.id === user.id);
        console.log('User balance before cancel:', beforeCancelUser.balance);
        const cancelled = orderService.cancelOrder(order2.id, 'user');
        console.log('Cancel result:', cancelled ? 'cancelled' : 'failed');
        const afterCancelUser = db.getUsers().find(u => u.id === user.id);
        console.log('User balance after cancel:', afterCancelUser.balance);

        // Simulate user completing the original order
        const completion = orderService.completeOrder(order.id, user.id);
        console.log('Complete result:', completion);

        const freshUsers = db.getUsers();
        const finalUser = freshUsers.find(u => u.id === user.id);
        const finalWorkerUser = freshUsers.find(u => u.workerId === worker.id);

        console.log('=== AFTER COMPLETION ===');
        console.log('User balance:', finalUser ? finalUser.balance : 'N/A');
        console.log('User points:', finalUser ? finalUser.points : 'N/A', 'xp:', finalUser ? finalUser.xp : 'N/A');
        console.log('Worker user record (by workerId):', finalWorkerUser ? `${finalWorkerUser.name} balance=${finalWorkerUser.balance}` : 'Worker user not found');

        console.log('\nRecent transactions:');
        console.log(db.getTransactions().slice(0,10));

    } catch (e) {
        console.error('Simulation failed:', e);
        process.exitCode = 2;
    }
})();
