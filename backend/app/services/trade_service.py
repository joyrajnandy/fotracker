import pandas as pd
import io
import csv
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from typing import Optional
from app.models.trade import Trade
from app.utils.financial_year import get_financial_year


_COLUMN_ALIASES = {
    "symbol": "symbol",
    "tradingsymbol": "symbol",
    "isin": "isin",
    "trade_date": "trade_date",
    "date": "trade_date",
    "exchange": "exchange",
    "segment": "segment",
    "series": "series",
    "trade_type": "trade_type",
    "type": "trade_type",
    "buy_sell": "trade_type",
    "auction": "auction",
    "quantity": "quantity",
    "qty": "quantity",
    "price": "price",
    "trade_id": "trade_id",
    "order_id": "order_id",
    "order_execution_time": "order_execution_time",
    "execution_time": "order_execution_time",
    "expiry_date": "expiry_date",
}


def _read_trade_csv(file_content: bytes) -> pd.DataFrame:
    text = file_content.decode("utf-8-sig", errors="replace")
    lines = text.splitlines()

    # Auto-detect header row (handles Zerodha Console CSVs with leading metadata lines)
    header_idx = 0
    for i, line in enumerate(lines[:30]):
        low = line.lower()
        if ("symbol" in low or "tradingsymbol" in low) and ("trade_date" in low or "trade date" in low or "price" in low):
            header_idx = i
            break

    sliced = "\n".join(lines[header_idx:])
    sample = "\n".join(lines[header_idx:header_idx + 5])
    sep = ","
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        sep = dialect.delimiter
    except Exception:
        if "\t" in lines[header_idx]:
            sep = "\t"
        elif ";" in lines[header_idx]:
            sep = ";"

    df = pd.read_csv(io.StringIO(sliced), sep=sep)
    # Normalize headers: strip, lowercase, spaces/hyphens/slashes -> _
    normalized = []
    for col in df.columns:
        key = str(col).strip().lower().replace(" ", "_").replace("-", "_").replace("/", "_")
        normalized.append(_COLUMN_ALIASES.get(key, key))
    df.columns = normalized
    return df


def upload_trades_csv(db: Session, user_id: int, file_content: bytes) -> dict:
    try:
        df = _read_trade_csv(file_content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid CSV format: {str(e)}")

    required = {"symbol", "trade_date", "exchange", "segment", "trade_type",
                "quantity", "price", "trade_id", "order_id", "order_execution_time"}
    missing = required - set(df.columns)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing CSV columns: {sorted(missing)}. Found: {list(df.columns)}",
        )

    inserted, skipped, errors = 0, 0, []

    for idx, row in df.iterrows():
        if pd.isna(row.get("symbol")) and pd.isna(row.get("trade_id")):
            continue
        try:
            trade_date = pd.to_datetime(str(row["trade_date"])).date()
            fy = get_financial_year(trade_date)

            expiry_date = None
            if "expiry_date" in row and pd.notna(row.get("expiry_date")):
                expiry_date = pd.to_datetime(str(row["expiry_date"])).date()

            order_exec = pd.to_datetime(str(row["order_execution_time"]))

            trade = Trade(
                user_id=user_id,
                symbol=str(row["symbol"]).strip(),
                isin=str(row["isin"]).strip() if pd.notna(row.get("isin")) else None,
                trade_date=trade_date,
                exchange=str(row["exchange"]).strip(),
                segment=str(row["segment"]).strip(),
                series=str(row["series"]).strip() if pd.notna(row.get("series")) else None,
                trade_type=str(row["trade_type"]).strip().lower(),
                auction=str(row.get("auction", "false")).lower() in ("true", "1"),
                quantity=float(row["quantity"]),
                price=float(row["price"]),
                trade_id=str(row["trade_id"]).strip(),
                order_id=str(row["order_id"]).strip(),
                order_execution_time=order_exec,
                expiry_date=expiry_date,
                financial_year=fy,
            )
            with db.begin_nested():
                db.add(trade)
                db.flush()
            inserted += 1
        except IntegrityError:
            skipped += 1
        except Exception as e:
            errors.append(f"Row {idx + 2}: {str(e)}")

    db.commit()
    return {"total_rows": len(df), "inserted": inserted, "skipped_duplicates": skipped, "errors": errors}


def delete_trades(db: Session, user_id: int, financial_year: Optional[str] = None) -> int:
    query = db.query(Trade).filter(Trade.user_id == user_id)
    if financial_year:
        query = query.filter(Trade.financial_year == financial_year)
    deleted = query.delete(synchronize_session=False)
    db.commit()
    return deleted


def get_trades(
    db: Session,
    user_id: int,
    financial_year: str,
    page: int = 1,
    page_size: int = 15,
    symbol: Optional[str] = None,
    trade_type: Optional[str] = None,
):
    query = db.query(Trade).filter(
        Trade.user_id == user_id,
        Trade.financial_year == financial_year,
    )
    if symbol:
        query = query.filter(Trade.symbol.ilike(f"%{symbol}%"))
    if trade_type:
        query = query.filter(Trade.trade_type == trade_type.lower())

    total = query.count()
    trades = (
        query.order_by(Trade.trade_date.desc(), Trade.order_execution_time.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "trades": trades,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }
