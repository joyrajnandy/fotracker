from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import httpx
import asyncio
import csv
import io
import json
import os
import re
import time
import zipfile
from datetime import date, timedelta
from typing import Optional, List
from pydantic import BaseModel, Field
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import decode_token
from app.models.user import User
from app.models.investment import Investment
from app.utils.financial_year import get_current_financial_year

router = APIRouter(prefix="/market", tags=["Market"])

_cache: dict = {"data": None, "ts": 0.0}
_CACHE_TTL = 15  # seconds

# NSE BhavCopy GSec cache (6-hour TTL)
_gsec_cache: dict = {"by_key": {}, "list": [], "trade_date": None, "ts": 0.0}
_GSEC_TTL = 21600  # 6 hours

# Webhook-pushed live overrides & SSE subscriber queues
_webhook_quotes: dict[str, dict] = {}
_sse_subscribers: set[asyncio.Queue] = set()

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}


# ─────────────────────────── Yahoo Finance (Indices & ETFs) ───────────────────

async def _fetch_yahoo_quote(
    client: httpx.AsyncClient, symbol: str, display_name: str, bypass_webhook: bool = False
) -> dict:
    # Check webhook-pushed quote first if recent (< 5 min)
    if not bypass_webhook:
        wh = _webhook_quotes.get(symbol.upper())
        if wh and (time.time() - wh["ts"]) < 300:
            return wh["data"]

    for host in ("query1.finance.yahoo.com", "query2.finance.yahoo.com"):
        url = f"https://{host}/v8/finance/chart/{symbol}"
        try:
            resp = await client.get(
                url, params={"interval": "1m", "range": "1d"}, headers=_HEADERS, timeout=6.0
            )
            resp.raise_for_status()
            result = resp.json().get("chart", {}).get("result")
            if not result:
                continue
            meta = result[0]["meta"]
            price = float(meta.get("regularMarketPrice", 0))
            prev_close = float(meta.get("chartPreviousClose") or meta.get("previousClose") or price)
            day_high = float(meta.get("regularMarketDayHigh") or price)
            day_low = float(meta.get("regularMarketDayLow") or price)
            change = round(price - prev_close, 2)
            change_pct = round((change / prev_close) * 100, 2) if prev_close else 0.0
            return {
                "symbol": display_name,
                "price": round(price, 2),
                "prev_close": round(prev_close, 2),
                "day_high": round(day_high, 2),
                "day_low": round(day_low, 2),
                "change": change,
                "change_pct": change_pct,
                "market_state": meta.get("marketState", "REGULAR"),
                "live": True,
            }
        except Exception:
            continue

    return {
        "symbol": display_name,
        "price": None,
        "prev_close": None,
        "day_high": None,
        "day_low": None,
        "change": None,
        "change_pct": None,
        "market_state": "UNAVAILABLE",
        "live": False,
    }


# ─────────────────────────── NSE BhavCopy GSec Loader ─────────────────────────

def _parse_gsec_metadata(symbol: str, fin_name: str = "") -> dict:
    """Extract coupon rate, maturity year, and semi-annual interest pay dates from GSec symbol/name."""
    clean = symbol.upper().replace("-GS", "").strip()
    coupon = None
    maturity_year = None

    m = re.match(r"^(\d{3,4})GS(\d{4})$", clean)
    if m:
        raw_c = int(m.group(1))
        coupon = round(raw_c / 100.0, 2)
        maturity_year = int(m.group(2))
    else:
        cm = re.search(r"(\d+\.\d+)\s*%", fin_name)
        ym = re.search(r"(20\d{2})", fin_name)
        if cm:
            coupon = float(cm.group(1))
        if ym:
            maturity_year = int(ym.group(1))

    # Standard GOI semi-annual coupon cycle
    pay_dates = "Jun 15 & Dec 15"
    pay_md = [(6, 15), (12, 15)]
    if maturity_year:
        if maturity_year % 2 == 0:
            pay_dates = "Apr 15 & Oct 15"
            pay_md = [(4, 15), (10, 15)]
        else:
            pay_dates = "Jun 12 & Dec 12"
            pay_md = [(6, 12), (12, 12)]

    today = date.today()
    candidates = []
    for yr in (today.year, today.year + 1):
        for m, d in pay_md:
            dt = date(yr, m, d)
            if dt >= today:
                candidates.append(dt)
    next_pay_date = min(candidates).isoformat() if candidates else None

    return {
        "coupon_rate": coupon,
        "maturity_year": maturity_year,
        "interest_pay_dates": pay_dates,
        "next_payoff_date": next_pay_date,
        "face_value": 100.0,
    }


async def _load_nse_gsec_bhavcopy(client: httpx.AsyncClient) -> dict:
    """Download & cache all NSE Government Securities (-GS) from nsearchives.nseindia.com."""
    now = time.time()
    if _gsec_cache["by_key"] and (now - _gsec_cache["ts"]) < _GSEC_TTL:
        return _gsec_cache

    for days_back in range(0, 7):
        dt = date.today() - timedelta(days=days_back)
        ds = dt.strftime("%Y%m%d")
        url = f"https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{ds}_F_0000.csv.zip"
        try:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10.0)
            if resp.status_code != 200:
                continue
            with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
                csv_name = zf.namelist()[0]
                raw_text = zf.read(csv_name).decode("utf-8", errors="ignore")

            by_key: dict = {}
            gsec_list: list = []
            reader = csv.DictReader(io.StringIO(raw_text))
            for row in reader:
                if (row.get("SctySrs") or "").strip().upper() != "GS":
                    continue
                tckr = (row.get("TckrSymb") or "").strip().upper()
                isin = (row.get("ISIN") or "").strip().upper()
                name = (row.get("FinInstrmNm") or tckr).strip()
                last_p = float(row.get("LastPric") or row.get("ClsPric") or 0)
                cls_p = float(row.get("ClsPric") or last_p)
                prev_p = float(row.get("PrvsClsgPric") or cls_p)
                price = round(last_p or cls_p, 4)
                if price <= 0:
                    continue

                meta = _parse_gsec_metadata(tckr, name)
                coupon = meta["coupon_rate"]
                current_yield = round((coupon / price) * 100, 2) if coupon and price > 0 else None

                entry = {
                    "symbol": f"{tckr}-GS",
                    "ticker": tckr,
                    "isin": isin,
                    "name": name,
                    "price": price,
                    "prev_close": round(prev_p, 4),
                    "change": round(price - prev_p, 4),
                    "coupon_rate": coupon,
                    "current_yield": current_yield,
                    "maturity_year": meta["maturity_year"],
                    "interest_pay_dates": meta["interest_pay_dates"],
                    "face_value": meta["face_value"],
                    "trade_date": dt.isoformat(),
                    "source": "NSE BhavCopy",
                }
                by_key[tckr] = entry
                by_key[f"{tckr}-GS"] = entry
                if isin:
                    by_key[isin] = entry
                gsec_list.append(entry)

            if gsec_list:
                _gsec_cache["by_key"] = by_key
                _gsec_cache["list"] = gsec_list
                _gsec_cache["trade_date"] = dt.isoformat()
                _gsec_cache["ts"] = now
                return _gsec_cache
        except Exception:
            continue

    return _gsec_cache


# ─────────────────────────── AMFI Mutual Fund Lookup ──────────────────────────

async def _fetch_mfapi_by_code(client: httpx.AsyncClient, scheme_code: str) -> Optional[dict]:
    try:
        resp = await client.get(f"https://api.mfapi.in/mf/{scheme_code}/latest", timeout=6.0)
        resp.raise_for_status()
        body = resp.json()
        data = body.get("data") or []
        if data:
            return {
                "ltp": round(float(data[0]["nav"]), 4),
                "name": body.get("meta", {}).get("scheme_name", scheme_code),
                "matched_code": str(scheme_code),
                "source": "AMFI",
            }
    except Exception:
        pass
    return None


async def _search_mfapi(client: httpx.AsyncClient, query: str, prefer_name: Optional[str] = None) -> Optional[dict]:
    try:
        resp = await client.get("https://api.mfapi.in/mf/search", params={"q": query}, timeout=6.0)
        resp.raise_for_status()
        matches = resp.json() or []
        if not matches:
            return None
        target_tokens = set((prefer_name or query).upper().replace("-", " ").split())

        def _score(item: dict) -> tuple:
            sname = item.get("schemeName", "").upper()
            stokens = set(sname.replace("-", " ").split())
            overlap = len(target_tokens & stokens)
            direct_bonus = 2 if ("DIRECT" in sname and ("DIRECT" in target_tokens or "GROWTH" not in target_tokens)) else 0
            growth_bonus = 2 if "GROWTH" in sname else 0
            return (overlap + direct_bonus + growth_bonus, -len(sname))

        best = max(matches, key=_score)
        return await _fetch_mfapi_by_code(client, str(best["schemeCode"]))
    except Exception:
        pass
    return None


async def resolve_live_ltp(
    client: httpx.AsyncClient,
    instrument_code: Optional[str],
    instrument_type: Optional[str] = None,
    name: Optional[str] = None,
) -> Optional[dict]:
    """
    Resolve live LTP / NAV:
    1. Webhook override cache (if pushed)
    2. Numeric AMFI Mutual Fund scheme code
    3. NSE BhavCopy Government Securities (-GS or ISIN IN00...)
    4. Yahoo Finance tickers (ETFs / equities)
    5. AMFI scheme name search (scored for Direct/Growth)
    """
    code = (instrument_code or "").strip()
    clean_name = (name or "").strip()

    # 1. Check webhook-pushed price override
    if code and code.upper() in _webhook_quotes:
        wh = _webhook_quotes[code.upper()]
        if (time.time() - wh["ts"]) < 3600:
            return {
                "ltp": wh["data"]["price"],
                "name": clean_name or code,
                "matched_code": code,
                "source": "Webhook",
            }

    # 2. Numeric AMFI code
    if code.isdigit():
        res = await _fetch_mfapi_by_code(client, code)
        if res:
            return res

    # 3. NSE Official BhavCopy for GSec (-GS or IN00... ISIN)
    if instrument_type == "GSec" or "-GS" in code.upper() or code.upper().startswith("IN00"):
        gsec_db = await _load_nse_gsec_bhavcopy(client)
        lookup_keys = [k.upper() for k in (code, clean_name, code.upper().replace("-GS", "")) if k]
        for k in lookup_keys:
            if k in gsec_db["by_key"]:
                item = gsec_db["by_key"][k]
                return {
                    "ltp": item["price"],
                    "name": item["name"],
                    "matched_code": item["symbol"],
                    "source": f"NSE BhavCopy ({item['trade_date']})",
                }

    # 4. Yahoo Finance ticker candidates
    if code:
        candidates = [code] if ("." in code or code.startswith("^")) else [
            code, f"{code}.NS", f"{code}.BO"
        ]
        for sym in candidates:
            quote = await _fetch_yahoo_quote(client, sym, sym)
            if quote["live"] and quote["price"] is not None:
                return {
                    "ltp": quote["price"],
                    "name": sym,
                    "matched_code": sym,
                    "source": "Yahoo Finance",
                }

    # 5. AMFI search fallback
    search_term = code if (code and not code.upper().startswith("IN")) else clean_name
    if search_term:
        res = await _search_mfapi(client, search_term, prefer_name=clean_name or search_term)
        if res:
            return res

    return None


# ─────────────────────────── Endpoints ────────────────────────────────────────

async def _get_cached_indices() -> dict:
    now = time.time()
    if _cache["data"] is not None and (now - _cache["ts"]) < _CACHE_TTL:
        return _cache["data"]

    async with httpx.AsyncClient() as client:
        nifty, sensex = await asyncio.gather(
            _fetch_yahoo_quote(client, "^NSEI", "NIFTY 50"),
            _fetch_yahoo_quote(client, "^BSESN", "SENSEX"),
        )

    payload = {"indices": [nifty, sensex], "updated_at": int(now)}
    if nifty["live"] or sensex["live"]:
        _cache["data"] = payload
        _cache["ts"] = now
    return payload


@router.get("/indices")
async def get_market_indices(current_user: User = Depends(get_current_user)):
    """Fetch real-time SENSEX and NIFTY 50 index quotes (15s shared cache)."""
    return await _get_cached_indices()


@router.get("/stream")
async def stream_market_indices(token: str = Query(...)):
    """
    Scalable Server-Sent Events (SSE) stream for live SENSEX & NIFTY updates.
    Uses a single shared cache + webhook broadcaster so N clients cause 0 extra API calls.
    """
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token")

    queue: asyncio.Queue = asyncio.Queue(maxsize=10)
    _sse_subscribers.add(queue)

    async def event_generator():
        try:
            initial = await _get_cached_indices()
            yield f"data: {json.dumps(initial)}\n\n"
            # Under WSGI (e.g. PythonAnywhere), do not hold the worker thread open indefinitely
            if os.getenv("DISABLE_BACKGROUND_FEEDER", "").lower() == "true" or os.getenv("PYTHONANYWHERE_DOMAIN"):
                return
            while True:
                try:
                    pushed = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {json.dumps(pushed)}\n\n"
                except asyncio.TimeoutError:
                    latest = await _get_cached_indices()
                    yield f"data: {json.dumps(latest)}\n\n"
        finally:
            _sse_subscribers.discard(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


class WebhookPricePayload(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=60)
    price: float = Field(..., gt=0)
    change: Optional[float] = 0.0
    change_pct: Optional[float] = 0.0
    day_high: Optional[float] = None
    day_low: Optional[float] = None
    prev_close: Optional[float] = None
    source: Optional[str] = "Webhook"


async def ingest_webhook_quotes(items: List[WebhookPricePayload], db: Optional[Session] = None):
    """Ingest one or more webhook price payloads, update DB holdings, and broadcast via SSE."""
    now = time.time()
    index_updated = False
    for body in items:
        sym = body.symbol.strip().upper()
        prev_c = body.prev_close if body.prev_close is not None else round(body.price - (body.change or 0), 2)
        _webhook_quotes[sym] = {
            "ts": now,
            "source": body.source or "Webhook",
            "data": {
                "symbol": "NIFTY 50" if sym == "^NSEI" else ("SENSEX" if sym == "^BSESN" else sym),
                "price": round(body.price, 4),
                "prev_close": round(prev_c, 4),
                "day_high": round(body.day_high if body.day_high is not None else body.price, 2),
                "day_low": round(body.day_low if body.day_low is not None else body.price, 2),
                "change": round(body.change or 0, 2),
                "change_pct": round(body.change_pct or 0, 2),
                "market_state": "REGULAR",
                "live": True,
            },
        }
        if sym in ("^NSEI", "^BSESN", "NIFTY 50", "SENSEX"):
            index_updated = True

        # Auto-sync matching holdings LTP & current_value in DB when pushed via webhook
        if db is not None:
            from decimal import Decimal
            matched = (
                db.query(Investment)
                .filter(Investment.instrument_code.ilike(sym))
                .all()
            )
            for h in matched:
                qty = Decimal(str(h.quantity or 1))
                ltp_dec = Decimal(str(round(body.price, 4)))
                h.ltp = ltp_dec
                h.current_value = round(qty * ltp_dec, 2)
            if matched:
                db.commit()

    if index_updated:
        _cache["ts"] = 0.0
        latest = await _get_cached_indices()
        for q in list(_sse_subscribers):
            try:
                q.put_nowait(latest)
            except asyncio.QueueFull:
                pass


@router.post("/webhook")
async def market_webhook(
    body: WebhookPricePayload,
    x_webhook_secret: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Webhook receiver for single-symbol real-time price pushes."""
    if x_webhook_secret != settings.SECRET_KEY:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")
    await ingest_webhook_quotes([body], db=db)
    return {"status": "accepted", "symbol": body.symbol.strip().upper(), "price": body.price}


@router.post("/webhook/batch")
async def market_webhook_batch(
    items: List[WebhookPricePayload],
    x_webhook_secret: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Batch webhook receiver for pushing multiple index, GSec, and MF prices at once."""
    if x_webhook_secret != settings.SECRET_KEY:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")
    await ingest_webhook_quotes(items, db=db)
    return {"status": "accepted", "count": len(items)}


async def run_background_webhook_feeder():
    """
    Background task that periodically fetches NIFTY 50, SENSEX, GSec BhavCopy,
    and active Mutual Fund NAVs and ingests them through the webhook pipeline.
    """
    from app.core.database import SessionLocal
    tick = 0
    while True:
        try:
            async with httpx.AsyncClient() as client:
                nifty, sensex = await asyncio.gather(
                    _fetch_yahoo_quote(client, "^NSEI", "NIFTY 50", bypass_webhook=True),
                    _fetch_yahoo_quote(client, "^BSESN", "SENSEX", bypass_webhook=True),
                )
                batch: List[WebhookPricePayload] = []
                for sym_code, q in (("^NSEI", nifty), ("^BSESN", sensex)):
                    if q.get("live") and q.get("price") is not None:
                        batch.append(WebhookPricePayload(
                            symbol=sym_code,
                            price=q["price"],
                            change=q["change"] or 0.0,
                            change_pct=q["change_pct"] or 0.0,
                            day_high=q.get("day_high"),
                            day_low=q.get("day_low"),
                            prev_close=q.get("prev_close"),
                            source="Yahoo Webhook Feeder",
                        ))

                # Every 30 minutes (120 ticks * 15s), refresh GSec BhavCopy & Mutual Fund holdings via webhook
                if tick % 120 == 0:
                    await _load_nse_gsec_bhavcopy(client)
                    with SessionLocal() as db:
                        holdings = db.query(Investment).filter(
                            Investment.instrument_type.in_(["GSec", "Mutual Fund"])
                        ).all()
                        for h in holdings:
                            res = await resolve_live_ltp(client, h.instrument_code, h.instrument_type, h.name)
                            if res and res.get("ltp") is not None:
                                code_key = (h.instrument_code or res.get("matched_code") or h.name).strip()
                                batch.append(WebhookPricePayload(
                                    symbol=code_key,
                                    price=float(res["ltp"]),
                                    source=f"Webhook ({res['source']})",
                                ))
                        if batch:
                            await ingest_webhook_quotes(batch, db=db)
                elif batch:
                    await ingest_webhook_quotes(batch)
        except Exception:
            pass
        tick += 1
        await asyncio.sleep(15)


@router.get("/ltp")
async def get_instrument_ltp(
    instrument_code: str = Query(..., min_length=1, max_length=120),
    instrument_type: Optional[str] = Query(default=None),
    name: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    """Fetch live LTP / NAV by AMFI code, NSE GSec BhavCopy (-GS / ISIN), or Yahoo ticker."""
    async with httpx.AsyncClient() as client:
        res = await resolve_live_ltp(client, instrument_code, instrument_type, name)
        if res:
            return {
                "instrument_code": instrument_code,
                "ltp": res["ltp"],
                "name": res["name"],
                "matched_code": res["matched_code"],
                "source": res["source"],
            }

    raise HTTPException(
        status_code=404,
        detail=f"Could not fetch live LTP for '{instrument_code}'.",
    )


@router.get("/gsec")
async def get_gsec_bonds(
    financial_year: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return user's GSec holdings enriched with live price, yield, and interest pay dates,
    plus all active NSE Government Securities from BhavCopy.
    """
    fy = financial_year or get_current_financial_year()
    async with httpx.AsyncClient() as client:
        gsec_db = await _load_nse_gsec_bhavcopy(client)

    holdings = (
        db.query(Investment)
        .filter(
            Investment.user_id == current_user.id,
            Investment.financial_year == fy,
            Investment.instrument_type == "GSec",
        )
        .order_by(Investment.id.desc())
        .all()
    )

    my_bonds = []
    for h in holdings:
        code_key = (h.instrument_code or h.name or "").strip().upper()
        market_item = gsec_db["by_key"].get(code_key) or gsec_db["by_key"].get(code_key.replace("-GS", ""))
        live_price = market_item["price"] if market_item else (float(h.ltp) if h.ltp is not None else None)
        meta = _parse_gsec_metadata(h.instrument_code or h.name, market_item["name"] if market_item else h.name)
        coupon = meta["coupon_rate"]
        qty = float(h.quantity or 1)
        buy_p = float(h.buy_price or h.invested_value)
        invested = float(h.invested_value)
        curr_val = round(qty * live_price, 2) if live_price is not None else (float(h.current_value) if h.current_value is not None else None)
        pnl = round(curr_val - invested, 2) if curr_val is not None else None
        cur_yield = round((coupon / live_price) * 100, 2) if (coupon and live_price and live_price > 0) else None

        my_bonds.append({
            "id": h.id,
            "symbol": h.instrument_code or h.name,
            "isin": market_item["isin"] if market_item else "—",
            "name": market_item["name"] if market_item else h.name,
            "coupon_rate": coupon,
            "maturity_year": meta["maturity_year"],
            "interest_pay_dates": meta["interest_pay_dates"],
            "next_payoff_date": meta["next_payoff_date"],
            "next_payoff_amount": round((qty * 100.0 * (coupon / 100.0)) / 2, 2) if coupon else 0.0,
            "face_value": 100.0,
            "qty": qty,
            "buy_price": buy_p,
            "live_price": live_price,
            "current_yield": cur_yield,
            "invested_value": invested,
            "current_value": curr_val,
            "pnl": pnl,
            "trade_date": market_item["trade_date"] if market_item else None,
        })

    return {
        "financial_year": fy,
        "bhavcopy_date": gsec_db["trade_date"],
        "my_bonds": my_bonds,
        "all_nse_gsec": gsec_db["list"],
    }
