const express = require('express');
const app = express();
const port = process.env.PORT || 8001;

app.use(express.json());

// Allow cross-origin requests from the static server (e.g., port 8000)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-api-key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Read external price API configuration from environment for security
const EXTERNAL_PRICE_API_URL = process.env.EXTERNAL_PRICE_API_URL || null;
const EXTERNAL_PRICE_API_KEY = process.env.EXTERNAL_PRICE_API_KEY || null;

// Helper: build Gemini/Generative Language JSON-schema request
function buildGeminiPayload(userReq) {
  const userText = userReq.aiRequest || `Create a shopping cart for items requested: ${JSON.stringify(userReq.params || {})}`;
  const schema = {
    type: 'object',
    properties: {
      cart: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            qty: { type: 'integer' },
            unitPrice: { type: 'number' },
            currency: { type: 'string' },
            sourceUrl: { type: 'string' }
          },
          required: ['name','qty','unitPrice']
        }
      },
      estimatedItemsCost: { type: 'number' },
      notes: { type: 'string' }
    },
    required: ['cart','estimatedItemsCost']
  };

  return {
    prompt: userText,
    maxOutputTokens: 800,
    temperature: 0.0,
    responseFormat: { type: 'json_schema', json_schema: schema }
  };
}

// Helper: try to extract structured JSON from Gemini-like responses
function extractJsonFromGeminiResponse(resp) {
  try {
    // common GL shape: { candidates: [ { content: [ { type: 'output_text', text: '...' } ] } ] }
    if (resp?.candidates && Array.isArray(resp.candidates) && resp.candidates[0]?.content) {
      const parts = resp.candidates[0].content.map(c => c.text || c).filter(Boolean).join('\n');
      const txt = parts.trim();
      try { return JSON.parse(txt); } catch (e) { /* fallthrough to regex */ }
      const m = txt.match(/(\{[\s\S]*\})/m);
      if (m) return JSON.parse(m[1]);
    }
    // fallback: the API might return the JSON at root
    if (typeof resp === 'object' && (resp.cart || resp.estimatedItemsCost)) return resp;
  } catch (e) {
    console.warn('Failed to extract JSON from Gemini response', e);
  }
  return null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function getDistanceViaGoogle(orig, dest, apiKey) {
  const origins = `${orig.lat},${orig.lng}`;
  const destinations = `${dest.lat},${dest.lng}`;
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?units=metric&origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google API ${res.status}`);
  const data = await res.json();
  if (data.rows && data.rows[0] && data.rows[0].elements && data.rows[0].elements[0] && data.rows[0].elements[0].status === 'OK') {
    const element = data.rows[0].elements[0];
    return { distanceKm: element.distance.value / 1000, durationMin: Math.round(element.duration.value / 60) };
  }
  throw new Error('No route found');
}

function estimateFareLocal(serviceType, distanceKm, durationMins, userTier = 'Bronze', params = {}) {
  // Mirror logic from frontend PriceEstimatorService
  let baseFare = 0, distanceFare = 0, timeFare = 0, platformFee = 2000, itemsCost = 0;
  let dynamicDuration = durationMins;

  switch (serviceType) {
    case 'BantuRide': {
      const vehicle = params.vehicleType || 'motorcycle';
      const tier = params.vehicleTier || 'Normal';
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

// Simple fallback parser for short Indonesian shopping phrases (shared between SerpAPI and external failures)
function parseFallbackCartFromQuery(rawQuery) {
  try {
    const q = (rawQuery || '').toString().toLowerCase();
    const parts = q.split(/,| dan |\+|;/).map(s => s.trim()).filter(Boolean);
    const map = [
      { keys: ['nasi kotak','nasi box','nasi kotak'], price: 20000, unit: 'porsi' },
      { keys: ['air mineral','galon','air galon'], price: 22000, unit: 'galon' },
      { keys: ['paracetamol','parasetamol','paracetamol 500','paracetamol 500mg'], price: 6000, unit: 'strip' },
      { keys: ['kertas hvs','kertas','hvs','hvs a4'], price: 55000, unit: 'rim' },
      { keys: ['indomie','mie instan','indomie goreng'], price: 2500, unit: 'pcs' }
    ];
    const fallbackCart = [];
    for (const p of parts) {
      let qty = 1;
      const m = p.match(/(\d+)\s*(porsi|pcs|pcs|strip|galon|botol|dos|pack|rim)?/i);
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

// Simple fallback diagnostic parser for short Indonesian fix descriptions
function parseFallbackFixDiagnosis(rawQuery) {
  try {
    const q = (rawQuery || '').toString().toLowerCase();
    // Basic keyword mapping
    const mappings = [
      { keys: ['lampu', 'mati', 'tidak menyala'], category: 'Kelistrikan', diagnosis: 'Lampu tidak menyala, kemungkinan bohlam putus atau sambungan longgar', parts: [{ part: 'Bohlam LED', estimatedCost: 15000 }], labor: 20000, duration: '15-30 mnt' },
      { keys: ['stop kontak', 'konslet', 'arus pendek'], category: 'Kelistrikan', diagnosis: 'Stop kontak bermasalah atau terjadi korsleting', parts: [{ part: 'Stop Kontak', estimatedCost: 30000 }], labor: 35000, duration: '20-45 mnt' },
      { keys: ['ac', 'ac tidak dingin', 'pendingin'], category: 'AC / Pendingin', diagnosis: 'AC kurang dingin, perlu pengecekan freon atau pembersihan filter', parts: [{ part: 'Freon (estimasi)', estimatedCost: 200000 }], labor: 80000, duration: '60-120 mnt' },
      { keys: ['pipa bocor', 'bocor', 'air bocor'], category: 'Pipa & Plumbing', diagnosis: 'Kebocoran pipa, perlu perbaikan sambungan atau penggantian seal', parts: [{ part: 'Seal / Pipa kecil', estimatedCost: 20000 }], labor: 40000, duration: '30-90 mnt' },
      { keys: ['laptop', 'komputer', 'boot', 'hidup'], category: 'Laptop & Komputer', diagnosis: 'Masalah komputer/laptop — perlu diagnosa lebih lanjut', parts: [], labor: 50000, duration: '60-180 mnt' }
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
          estimatedDuration: m.duration || '30-60 mnt',
          technicianNote: 'Perkiraan awal — teknisi akan verifikasi di lokasi.',
          diyTip: ''
        };
      }
    }
    // Generic fallback: return a safe generic diagnosis for non-mapped cases
    return {
      diagnosis: 'Perlu pemeriksaan lanjutan oleh teknisi di lokasi; deskripsi awal tidak spesifik.',
      severity: 'Sedang',
      category: 'Lainnya',
      partsNeeded: [],
      laborCost: 50000,
      totalEstimate: 50000,
      estimatedDuration: '30-90 mnt',
      technicianNote: 'Estimasi awal — teknisi perlu cek untuk menentukan penyebab dan parts.',
      diyTip: 'Coba catat gejala lebih spesifik (bunyi, asap, lampu indikator) sebelum memesan.'
    };
  } catch (e) { return null; }
}

app.post('/api/price-estimate', async (req, res) => {
  try {
    const { serviceType, pickup, destination, params = {}, userTier = 'Bronze', useGoogle = false } = req.body || {};
    console.log('price-proxy: request', { serviceType, hasPickup: !!pickup, hasDestination: !!destination, paramsKeys: Object.keys(params||{}), bodySample: JSON.stringify(req.body).slice(0,1000) });
    if (!serviceType || !pickup || !destination) return res.status(400).json({ success: false, error: 'missing fields' });

    // If configured, forward requests for BantuShop and BantuFix to an external price API
    if ((serviceType === 'BantuShop' || serviceType === 'BantuFix') && EXTERNAL_PRICE_API_URL) {
      try {
        // If the external endpoint looks like Generative Language, construct a json_schema request
        const isGeminiLike = EXTERNAL_PRICE_API_URL.includes('generativelanguage') || EXTERNAL_PRICE_API_URL.includes('generative') || EXTERNAL_PRICE_API_URL.includes('gemini');
        if (isGeminiLike && EXTERNAL_PRICE_API_KEY) {
          const payload = buildGeminiPayload({ aiRequest: req.body.aiRequest || '', params: req.body.params || {} });
          const forwardRes = await fetch(EXTERNAL_PRICE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${EXTERNAL_PRICE_API_KEY}` },
            body: JSON.stringify(payload)
          });
          const j = await forwardRes.json();
          const parsed = extractJsonFromGeminiResponse(j);
          console.log('price-proxy: gemini-forward response sample ->', JSON.stringify(j).slice(0,1000));
          if (parsed) {
            // compute estimatedItemsCost if missing
            if (!parsed.estimatedItemsCost && Array.isArray(parsed.cart)) {
              parsed.estimatedItemsCost = parsed.cart.reduce((s, it) => s + ((it.unitPrice||0) * (it.qty||1)), 0);
            }
            // Map to local fare using estimatedItemsCost
            const estItemsCost = parsed.estimatedItemsCost || 0;
            const localFare = estimateFareLocal(serviceType, haversineKm(pickup.lat, pickup.lng, destination.lat, destination.lng), Math.max(1, Math.round(haversineKm(pickup.lat, pickup.lng, destination.lat, destination.lng) / 22 * 60 + 3)), userTier, Object.assign({}, params, { estimatedItemsCost: estItemsCost }));
            console.log('price-proxy: returning external-gemini parsed ->', JSON.stringify({ parsed: parsed, fare: localFare }).slice(0,1000));
            return res.json({ success: true, method: 'external-gemini', forwarded: EXTERNAL_PRICE_API_URL, parsed, fare: localFare });
          }
          // if parsing failed, fall back to raw forward response
          console.log('price-proxy: gemini parse failed, forwarding raw ->', JSON.stringify(j).slice(0,1000));
          return res.json({ success: true, method: 'external-forward-raw', forwarded: EXTERNAL_PRICE_API_URL, response: j });
        }

        // If the external URL appears to be SerpAPI, use its shopping engine
        const lowerUrl = (EXTERNAL_PRICE_API_URL || '').toLowerCase();
        const isSerpapi = lowerUrl.includes('serpapi.com') || lowerUrl.includes('serpapi');
        if (isSerpapi && EXTERNAL_PRICE_API_KEY) {
          const USD_IDR_RATE = parseFloat(process.env.USD_IDR_RATE) || 15000;
          try {
            // Improve hit-rate for Indonesian queries: prefer local marketplaces and bilingual keywords
            // Prefer aiRequest inside params for BantuFix; include it generally as a fallback
            let rawQuery = '';
            if (serviceType === 'BantuFix') {
              rawQuery = (req.body.params?.aiRequest || req.body.aiRequest || req.body.params?.fixQuery || req.body.params?.shopQuery || '').toString();
            } else {
              rawQuery = (req.body.aiRequest || req.body.params?.shopQuery || req.body.params?.aiRequest || req.body.params?.estimatedItemsCost || 'items').toString();
            }
            // If this is a BantuFix request, try the shortcut diagnosis parser before hitting SerpAPI
            if (serviceType === 'BantuFix') {
              const diag = parseFallbackFixDiagnosis(rawQuery);
              if (diag) {
                const localFare = { total: diag.totalEstimate, pointsEarned: Math.floor(diag.totalEstimate / 100), laborCost: diag.laborCost };
                console.log('price-proxy: returning fallback-fix (shortcircuit) ->', JSON.stringify(diag));
                return res.json({ success: true, method: 'fallback-fix-shortcircuit', parsed: diag, fare: localFare });
              }
            }
            const marketSites = 'site:tokopedia.com OR site:shopee.co.id OR site:lazada.co.id';
            // include Indonesian keyword 'harga' and English 'price' to broaden matches
            const composed = `${rawQuery} harga price ${marketSites}`;
            // Ask Google Shopping to prefer Indonesian results
            const serpUrl = `${EXTERNAL_PRICE_API_URL}?engine=google_shopping&gl=id&hl=id&google_domain=google.co.id&q=${encodeURIComponent(composed)}&api_key=${EXTERNAL_PRICE_API_KEY}`;
            const forwardRes = await fetch(serpUrl, { method: 'GET' });
            const j = await forwardRes.json();
            console.log('price-proxy: serpapi response sample ->', JSON.stringify(j).slice(0,1000));
            const results = j.shopping_results || j['organic_results'] || j['results'] || [];
            const cart = [];
            for (const r of results.slice(0, 6)) {
              const title = r.title || r.product_title || r.name || r.snippet || '';
              const url = r.link || r.source || r.product_link || r.website || '';
              let priceRaw = r.price || r.extracted_price || r.displayed_price || r['product_price'] || r['price'] || '';
              if (!priceRaw && r.extensions && r.extensions.length) priceRaw = r.extensions[0].price || '';
              let unitPrice = 0; let currency = 'IDR';
              if (typeof priceRaw === 'string') {
                const m = priceRaw.match(/[0-9,.]+/g);
                if (m) {
                  const num = m.join('').replace(/,/g, '');
                  unitPrice = parseFloat(num) || 0;
                  currency = priceRaw.includes('Rp') || priceRaw.toLowerCase().includes('idr') ? 'IDR' : (priceRaw.includes('$') ? 'USD' : 'USD');
                }
              } else if (typeof priceRaw === 'number') { unitPrice = priceRaw; }
              // If provider provides explicit currency field, use it
              if (r.currency && typeof r.currency === 'string') currency = r.currency.toUpperCase();
              // If we still consider the price as numeric without IDR marker, assume USD and convert below
              if (!unitPrice && r.extracted_price && typeof r.extracted_price === 'number') unitPrice = r.extracted_price;
              if (!unitPrice && r.inline && r.inline.price) unitPrice = parseFloat(String(r.inline.price)) || 0;
              if (!unitPrice && r.price && typeof r.price === 'object' && r.price.value) unitPrice = parseFloat(String(r.price.value)) || 0;
              if (!unitPrice && r.price && typeof r.price === 'string') {
                const m = r.price.match(/[0-9,.]+/g);
                if (m) unitPrice = parseFloat(m.join('').replace(/,/g,'')) || 0;
              }
              // Convert non-IDR numeric prices to IDR using configured rate
              if (unitPrice > 0) {
                if (currency !== 'IDR') {
                  unitPrice = Math.round(unitPrice * USD_IDR_RATE);
                  currency = 'IDR';
                }
                cart.push({ name: title.trim().slice(0,200), qty: 1, unitPrice, currency, sourceUrl: url });
              }
            }
            let estimatedItemsCost = cart.reduce((s,i) => s + (i.unitPrice||0) * (i.qty||1), 0);
            console.log('price-proxy: serpapi parsed cart ->', JSON.stringify(cart).slice(0,1000));

            // If SerpAPI returns empty cart, try a simple Indonesian phrase parser as a fallback
            if (cart.length === 0) {
              try {
                const fallbackCart = parseFallbackCartFromQuery(rawQuery);
                if (fallbackCart && fallbackCart.length) {
                  console.log('price-proxy: fallbackCart parsed ->', JSON.stringify(fallbackCart));
                  for (const it of fallbackCart) cart.push(it);
                  estimatedItemsCost = cart.reduce((s,i) => s + (i.unitPrice||0) * (i.qty||1), 0);
                }
              } catch (e) { /* ignore fallback failures */ }
              // If still empty and this is a BantuFix request, try diagnosis fallback
              if (cart.length === 0 && serviceType === 'BantuFix') {
                const diag = parseFallbackFixDiagnosis(rawQuery);
                if (diag) {
                  const localFare = { total: diag.totalEstimate, pointsEarned: Math.floor(diag.totalEstimate / 100), laborCost: diag.laborCost };
                  console.log('price-proxy: returning fallback-fix-serp ->', JSON.stringify(diag));
                  return res.json({ success: true, method: 'fallback-fix-serp', forwarded: serpUrl, parsed: diag, fare: localFare });
                }
                // If still no diag, return a generic diagnosis so frontend receives useful output
                console.log('price-proxy: no serpapi results and no diag mapping; returning generic diagnosis');
                const genericDiag = parseFallbackFixDiagnosis('');
                const localFare = { total: genericDiag.totalEstimate, pointsEarned: Math.floor(genericDiag.totalEstimate / 100), laborCost: genericDiag.laborCost };
                return res.json({ success: true, method: 'fallback-fix-generic', forwarded: serpUrl, parsed: genericDiag, fare: localFare });
              }
            }
            console.log('price-proxy: returning external-serpapi parsed ->', JSON.stringify({ cart, estimatedItemsCost }).slice(0,1000));
            const localFare = estimateFareLocal(serviceType, haversineKm(pickup.lat, pickup.lng, destination.lat, destination.lng), Math.max(1, Math.round(haversineKm(pickup.lat, pickup.lng, destination.lat, destination.lng) / 22 * 60 + 3)), userTier, Object.assign({}, params, { estimatedItemsCost }));
            return res.json({ success: true, method: 'external-serpapi', forwarded: serpUrl, parsed: { cart, estimatedItemsCost }, fare: localFare });
          } catch (e) {
            console.warn('SerpAPI forwarding failed, falling back', e);
          }
        }

        const headers = { 'Content-Type': 'application/json' };
        if (EXTERNAL_PRICE_API_KEY) headers['Authorization'] = `Bearer ${EXTERNAL_PRICE_API_KEY}`;
        const forwardRes = await fetch(EXTERNAL_PRICE_API_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify(req.body)
        });
        const j = await forwardRes.json();
        return res.json({ success: true, method: 'external-forward', forwarded: EXTERNAL_PRICE_API_URL, response: j });
      } catch (e) {
        console.warn('External price API forwarding failed, falling back to local estimator', e);
        // Try to provide a fallback parsed cart so frontend can render AI suggestions
        try {
          const rawQuery = req.body.aiRequest || req.body.params?.shopQuery || '';
          const fallbackCart = parseFallbackCartFromQuery(rawQuery);
          if (fallbackCart && fallbackCart.length) {
            const estimatedItemsCost = fallbackCart.reduce((s,i) => s + (i.unitPrice||0) * (i.qty||1), 0);
            const localFare = estimateFareLocal(serviceType, haversineKm(pickup.lat, pickup.lng, destination.lat, destination.lng), Math.max(1, Math.round(haversineKm(pickup.lat, pickup.lng, destination.lat, destination.lng) / 22 * 60 + 3)), userTier, Object.assign({}, params, { estimatedItemsCost }));
            return res.json({ success: true, method: 'fallback-local', forwarded: EXTERNAL_PRICE_API_URL, parsed: { cart: fallbackCart, estimatedItemsCost }, fare: localFare });
          }
          // If BantuFix, try fallback diagnosis parser
          if (serviceType === 'BantuFix') {
            const raw = req.body.aiRequest || req.body.params?.aiRequest || req.body.params?.fixQuery || '';
            const diag = parseFallbackFixDiagnosis(raw);
            if (diag) {
              const localFare = { total: diag.totalEstimate, pointsEarned: Math.floor(diag.totalEstimate / 100), laborCost: diag.laborCost };
              return res.json({ success: true, method: 'fallback-fix', forwarded: EXTERNAL_PRICE_API_URL, parsed: diag, fare: localFare });
            }
          }
        } catch (ee) { console.warn('Fallback parsing also failed', ee); }
        // fallthrough to local estimator
      }
    }

    // For ride/send/clean, compute locally using simple equations
    let distanceKm, durationMin, method = 'haversine';
    const googleKey = process.env.GOOGLE_API_KEY;
    if (useGoogle && googleKey && (serviceType === 'BantuRide' || serviceType === 'BantuSend')) {
      try {
        const g = await getDistanceViaGoogle(pickup, destination, googleKey);
        distanceKm = g.distanceKm; durationMin = g.durationMin; method = 'google';
      } catch (e) {
        console.warn('Google distance failed, fallback to haversine', e);
        distanceKm = haversineKm(pickup.lat, pickup.lng, destination.lat, destination.lng);
        durationMin = Math.max(1, Math.round(distanceKm / 22 * 60 + 3));
      }
    } else {
      distanceKm = haversineKm(pickup.lat, pickup.lng, destination.lat, destination.lng);
      durationMin = Math.max(1, Math.round(distanceKm / 22 * 60 + 3));
    }

    // Adjust BantuClean to depend on sqrt(area)
    if (serviceType === 'BantuClean') {
      const area = parseFloat(params.roomArea) || 12;
      // compute a pseudo-duration based on sqrt(area)
      durationMin = Math.max(1, Math.round(Math.sqrt(area) * 10));
    }

    const fare = estimateFareLocal(serviceType, distanceKm, durationMin, userTier, params);
    return res.json({ success: true, method, distanceKm, durationMin, fare });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.listen(port, () => console.log(`Price proxy listening on http://localhost:${port}`));
