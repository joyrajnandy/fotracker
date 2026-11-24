from fastapi import APIRouter, Depends, HTTPException, Query
import httpx
import time
from typing import Optional
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/market", tags=["Market"])

_cache: dict = {"data": None, "ts": 0.0}
_CACHE_TTL = 15  # seconds

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}


async def _fetch_yahoo_quote(client: httpx.AsyncClient, symbol: str, display_name: str) -> dict:
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


async def _search_mfapi(client: httpx.AsyncClient, query: str) -> Optional[dict]:
    try:
        resp = await client.get("https://api.mfapi.in/mf/search", params={"q": query}, timeout=6.0)
        resp.raise_for_status()
        matches = resp.json() or []
        if matches:
            code = str(matches[0]["schemeCode"])
            return await _fetch_mfapi_by_code(client, code)
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
    Resolve live LTP / NAV for Mutual Funds (AMFI code or name search) and GSec/ETFs (Yahoo NSE/BSE or AMFI Gilt).
    """
    code = (instrument_code or "").strip()
    clean_name = (name or "").strip()

    # 1. Numeric AMFI code
    if code.isdigit():
        res = await _fetch_mfapi_by_code(client, code)
        if res:
            return res

    # 2. Yahoo Finance ticker candidates (GSec ETFs, SGBs, NSE/BSE GSec symbols)
    if code:
        candidates = [code] if ("." in code or code.startswith("^")) else [
            code, f"{code}.NS", f"{code}.BO", f"{code}-GS.NS", f"{code}-SG.NS"
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

    # 3. Fallback: AMFI search by code or name (handles Mutual Funds & Gilt/GSec funds)
    search_term = code if (code and not code.upper().startswith("IN")) else clean_name
    if search_term:
        res = await _search_mfapi(client, search_term)
        if res:
            return res

    return None


@router.get("/indices")
async def get_market_indices(current_user: User = Depends(get_current_user)):
    """Fetch real-time SENSEX and NIFTY 50 index quotes (15s cache when live)."""
    now = time.time()
    if _cache["data"] is not None and (now - _cache["ts"]) < _CACHE_TTL:
        return _cache["data"]

    async with httpx.AsyncClient() as client:
        nifty = await _fetch_yahoo_quote(client, "^NSEI", "NIFTY 50")
        sensex = await _fetch_yahoo_quote(client, "^BSESN", "SENSEX")

    payload = {
        "indices": [nifty, sensex],
        "updated_at": int(now),
    }
    if nifty["live"] or sensex["live"]:
        _cache["data"] = payload
        _cache["ts"] = now
    return payload


@router.get("/ltp")
async def get_instrument_ltp(
    instrument_code: str = Query(..., min_length=1, max_length=120),
    instrument_type: Optional[str] = Query(default=None),
    name: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    """Fetch live LTP / NAV by AMFI scheme code, NSE/BSE ticker, or scheme name."""
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
        detail=(
            f"Could not fetch live LTP for '{instrument_code}'. "
            "For Mutual Funds enter AMFI code (e.g. 119551) or scheme name; "
            "for GSec/ETFs enter NSE/BSE ticker (e.g. LTGILTBEES.NS, GILT5YBEES.NS)."
        ),
    )
