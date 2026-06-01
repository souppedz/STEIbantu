(async ()=>{
  try {
    const payload = {
      serviceType: 'BantuShop',
      pickup: { lat: -6.8915, lng: 107.6107 },
      destination: { lat: -6.9025, lng: 107.6188 },
      params: { shopQuery: 'Saya ingin beli: nasi kotak 10 porsi, air mineral 2 galon, Paracetamol 10 strip' },
      userTier: 'Bronze'
    };
    const res = await fetch('http://localhost:8001/api/price-estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await res.json();
    console.log('proxy response:', JSON.stringify(j, null, 2));
  } catch (e) {
    console.error('err', e);
    process.exit(1);
  }
})();
