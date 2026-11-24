from fastapi import APIRouter, Depends
import httpx
import time
from typing import Optional
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/market", tags=["Market"])

_cache: dict = {"data": None, "ts": 0.0}
_CACHE_TTL = 15  # seconds


async def _fetch_yahoo_quote(client: httpx.AsyncClient, symbol: str, display_name: str) -> dict:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    params = {"interval": "1m", "range": "1d"}
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        resp = await client.get(url, params=params, headers=headers, timeout=5.0)
        resp.raise_for_status()
        meta = resp.json()["chart"]["result"][0]["meta"]
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
            "market_state": meta.get("marketState", "CLOSED"),
            "live": True,
        }
    except Exception:
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
    """Fetch real-time SENSEX and NIFTY 50 index quotes (15s cache)."""
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
    _cache["data"] = payload
    _cache["ts"] = now
    return payload
