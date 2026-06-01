(async function(){
  try {
    const payload = {
      serviceType: 'BantuShop',
      pickup: {lat:-6.8915,lng:107.6107},
      destination: {lat:-6.9025,lng:107.6188},
      params: { shopCategory: 'electronics' },
      userTier: 'Bronze',
      aiRequest: "Find current prices and source URLs for these PC parts: CPU (AMD Ryzen 5 5600X or similar), GPU (NVIDIA GeForce RTX 3060 or best-value GPU under $300), 16GB DDR4 RAM kit, B550 motherboard, 650W PSU, 1TB NVMe SSD, mid-tower case. Return a JSON array of items with fields: name, qty, unitPrice, currency, sourceUrl. Return JSON only."
    };
    const res = await fetch('http://localhost:8001/api/price-estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await res.json();
    console.log('gemini-proxy response:', JSON.stringify(j, null, 2));
  } catch (e) { console.error('err', e); }
})();
