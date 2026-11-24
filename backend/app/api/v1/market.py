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
            change = round(price - prev_close, 2)
            change_pct = round((change / prev_close) * 100, 2) if prev_close else 0.0
            return {
                "symbol": display_name,
                "price": round(price, 2),
                "prev_close": round(prev_close, 2),
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
        "change": None,
        "change_pct": None,
        "market_state": "UNAVAILABLE",
        "live": False,
    }


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
    instrument_code: str = Query(..., min_length=1, max_length=60),
    instrument_type: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch live LTP / NAV by instrument code:
    - Numeric code (AMFI Mutual Fund scheme code, e.g. 119551): queries mfapi.in
    - Ticker symbol (e.g. GOLDBEES.NS, NIFTYBEES.NS, IN0020230085): queries Yahoo Finance
    """
    code = instrument_code.strip()
    async with httpx.AsyncClient() as client:
        # 1. Mutual Fund AMFI numeric scheme code
        if code.isdigit():
            try:
                resp = await client.get(f"https://api.mfapi.in/mf/{code}/latest", timeout=6.0)
                resp.raise_for_status()
                body = resp.json()
                data = body.get("data") or []
                if data:
                    nav = float(data[0]["nav"])
                    scheme_name = body.get("meta", {}).get("scheme_name", code)
                    return {
                        "instrument_code": code,
                        "ltp": round(nav, 4),
                        "name": scheme_name,
                        "source": "AMFI",
                    }
            except Exception:
                pass

        # 2. Yahoo Finance ticker (try exact, .NS, .BO)
        candidates = [code] if ("." in code or code.startswith("^")) else [code, f"{code}.NS", f"{code}.BO"]
        for sym in candidates:
            quote = await _fetch_yahoo_quote(client, sym, sym)
            if quote["live"] and quote["price"] is not None:
                return {
                    "instrument_code": code,
                    "ltp": quote["price"],
                    "name": sym,
                    "source": "Yahoo Finance",
                }

    raise HTTPException(
        status_code=404,
        detail=f"Could not fetch live LTP for '{code}'. For Mutual Funds use AMFI scheme code (e.g. 119551); for ETFs/GSec use NSE/BSE ticker (e.g. GOLDBEES.NS, LTGILTBEES.NS).",
    )
