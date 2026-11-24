# Live Market Data & Scalability Architecture

This document explains how **FO Tracker** fetches, caches, streams, and scales live market data for **Indices (NIFTY 50, SENSEX)**, **Government Securities (GSec)**, and **Mutual Funds**.

---

## 1. Data Sources & APIs Used

| Asset Class | Source | Endpoint / Method | Cache TTL | Details Extracted |
|---|---|---|---|---|
| **NIFTY 50 & SENSEX** | Yahoo Finance Chart API | `GET https://query1.finance.yahoo.com/v8/finance/chart/^NSEI` and `^BSESN` (with `query2.finance.yahoo.com` fallback) | `15s` shared cache | `regularMarketPrice`, `previousClose`, `regularMarketDayHigh`, `regularMarketDayLow`, `change`, `change_pct`, `marketState` |
| **Government Securities (GSec)** | NSE Official CM BhavCopy Archive | `GET https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_YYYYMMDD_F_0000.csv.zip` (filters `SctySrs == 'GS'`) | `6h` shared cache | `TckrSymb` (e.g. `734GS2064-GS`, `725GS2063-GS`), `ISIN`, `FinInstrmNm`, `LastPric` / `ClsPric`, `PrvsClsgPric`, parsed Coupon %, Maturity Year, Current Yield %, Semi-Annual Interest Pay Dates |
| **Mutual Funds** | AMFI India (`mfapi.in`) | `GET https://api.mfapi.in/mf/{schemeCode}/latest` and `/mf/search?q=...` (scored for Direct Plan / Growth Option) | Live on-demand / refresh | Latest NAV (`nav`), `scheme_name`, `scheme_code` |
| **ETFs / Equities** | Yahoo Finance Chart API | `GET /v8/finance/chart/{symbol}.NS` / `.BO` | On-demand | `regularMarketPrice` |

---

## 2. Scalable Push Architecture: SSE + Webhook

To prevent every connected browser/mobile client from hammering upstream APIs:

1. **Shared In-Memory Cache + Concurrent Fetching**:
   - `GET /api/v1/market/indices` uses `asyncio.gather` to fetch `^NSEI` and `^BSESN` in parallel and caches the result for **15 seconds**.
   - `GET /api/v1/market/gsec` downloads the NSE BhavCopy ZIP **once every 6 hours** and serves all `-GS` bonds in `<1 ms` from memory.
2. **Server-Sent Events (`GET /api/v1/market/stream?token=...`)**:
   - The frontend subscribes to a single persistent SSE stream (`EventSource`) instead of independent polling loops.
   - Multiple concurrent users share the same cached feed with zero redundant upstream requests.
3. **Webhook Receiver (`POST /api/v1/market/webhook` & `POST /api/v1/market/webhook/batch`)**:
   - All live data (Indices, GSec, Mutual Funds, ETFs) flows through the unified webhook ingestion pipeline (`ingest_webhook_quotes`).
   - An internal background feeder (`run_background_webhook_feeder` in `main.py` lifespan) periodically fetches NIFTY 50, SENSEX, NSE GSec BhavCopy, and AMFI Mutual Fund NAVs and ingests them via the webhook pipeline, auto-updating matching DB holdings (`ltp` and `current_value`) and broadcasting to all SSE clients.
   - External market data feeds or broker scripts can also push real-time LTP updates directly:
     ```json
     POST /api/v1/market/webhook
     Header: X-Webhook-Secret: <SECRET_KEY>
     {
       "symbol": "734GS2064-GS",
       "price": 95.62,
       "change": 0.14,
       "change_pct": 0.15
     }
     ```
   - Batch pushes are supported via `POST /api/v1/market/webhook/batch` with a JSON array of payloads.

---

## 3. Scalability & Performance Hardening

- **Database Connection Pooling** (`backend/app/core/database.py`): `pool_size=20`, `max_overflow=40`, `pool_pre_ping=True`, `pool_recycle=1800`.
- **GZip Compression** (`backend/main.py`): `GZipMiddleware(minimum_size=500)` reduces payload size over mobile Wi-Fi.
- **LAN / Mobile Access**: Vite dev server binds to `0.0.0.0:5173` with `allowedHosts: true`, and Windows Firewall allows inbound TCP `5173` & `8000` so devices on the same Wi-Fi network can open `http://<HOST_LAN_IP>:5173`.
