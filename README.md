# STEIbantu
Tubes Teknologi Platform

## Price Proxy

This project includes a local price-proxy (`price-proxy.js`) that the frontend calls for AI-powered price estimates. Run it locally and provide your external API credentials via environment variables so keys are never embedded in frontend code.

PowerShell (Windows) example:

```powershell
$env:EXTERNAL_PRICE_API_URL='https://serpapi.com/search'
$env:EXTERNAL_PRICE_API_KEY='YOUR_SERPAPI_KEY'
$env:USD_IDR_RATE='15000'  # optional
npm run price-proxy
```

Bash/macOS/Linux example:

```bash
export EXTERNAL_PRICE_API_URL='https://serpapi.com/search'
export EXTERNAL_PRICE_API_KEY='YOUR_SERPAPI_KEY'
export USD_IDR_RATE='15000'  # optional
npm run price-proxy
```

The frontend calls `http://localhost:8001/api/price-estimate` by default; the proxy will forward to SerpAPI (or an external generative API) and compute fares.
