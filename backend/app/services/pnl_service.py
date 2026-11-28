from sqlalchemy.orm import Session
from collections import defaultdict
from datetime import date
from typing import Optional
from app.models.trade import Trade
from app.models.brokerage import BrokerageSetting


def _get_symbol_base(symbol: str) -> str:
    """Strip expiry+strike+CE/PE suffix to get the base index name."""
    for i, ch in enumerate(symbol):
        if ch.isdigit():
            return symbol[:i]
    return symbol


def _is_futures_symbol(symbol: str) -> bool:
    sym = (symbol or "").upper()
    return sym.endswith("FUT") or ("FUT" in sym and not (sym.endswith("CE") or sym.endswith("PE")))


def calculate_zerodha_charges(trades: list, brokerage_per_order: float = 20.0) -> float:
    """
    Calculate Zerodha standard F&O brokerage + statutory charges:
    - Options: Rs 20/order, STT 0.1% on sell, Exch 0.03503% (NSE) / 0.0325% (BSE),
      IPFT Rs 50/cr (NSE), SEBI Rs 10/cr, Stamp 0.003% on buy, GST 18% on (Brok+Exch+IPFT+SEBI).
    - Futures: min(0.03%, Rs 20)/order, STT 0.02% on sell, Exch 0.00173% (NSE) / 0% (BSE),
      IPFT Rs 10/cr (NSE), SEBI Rs 10/cr, Stamp 0.002% on buy, GST 18% on (Brok+Exch+IPFT+SEBI).
    """
    if not trades:
        return 0.0

    order_groups: dict = defaultdict(list)
    for idx, t in enumerate(trades):
        key = t.order_id if t.order_id else f"__trade_{idx}"
        order_groups[key].append(t)

    brokerage = 0.0
    for grp in order_groups.values():
        is_fut = all(_is_futures_symbol(t.symbol) for t in grp)
        if is_fut:
            ord_val = sum(float(t.quantity) * float(t.price) for t in grp)
            brokerage += min(ord_val * 0.0003, brokerage_per_order)
        else:
            brokerage += brokerage_per_order

    stt = 0.0
    exch_charge = 0.0
    ipft = 0.0
    sebi = 0.0
    stamp = 0.0

    for t in trades:
        val = float(t.quantity) * float(t.price)
        exch = (t.exchange or "NSE").upper()
        is_bse = "BSE" in exch or "BFO" in exch
        is_fut = _is_futures_symbol(t.symbol)

        if t.trade_type == "buy":
            stamp += val * (0.00002 if is_fut else 0.00003)
        else:
            stt += val * (0.0002 if is_fut else 0.001)

        if is_fut:
            exch_charge += 0.0 if is_bse else val * 0.0000173
            ipft += 0.0 if is_bse else val * 0.000001
        else:
            exch_charge += val * (0.000325 if is_bse else 0.0003503)
            ipft += 0.0 if is_bse else val * 0.000005

        sebi += val * 0.000001

    gst = 0.18 * (brokerage + exch_charge + ipft + sebi)
    return round(brokerage + stt + exch_charge + ipft + sebi + stamp + gst, 2)


def get_or_create_brokerage_setting(db: Session, user_id: int, financial_year: str) -> BrokerageSetting:
    setting = (
        db.query(BrokerageSetting)
        .filter(BrokerageSetting.user_id == user_id, BrokerageSetting.financial_year == financial_year)
        .first()
    )
    if not setting:
        setting = BrokerageSetting(
            user_id=user_id,
            financial_year=financial_year,
            per_trade_fee=20.00,  # Zerodha standard Rs 20/order + statutory charges
            custom_total_brokerage=None,
        )
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting


def set_brokerage_setting(
    db: Session,
    user_id: int,
    financial_year: str,
    custom_total_brokerage: Optional[float],
    per_trade_fee: float = 20.0,
) -> BrokerageSetting:
    setting = get_or_create_brokerage_setting(db, user_id, financial_year)
    setting.per_trade_fee = per_trade_fee
    setting.custom_total_brokerage = custom_total_brokerage
    db.commit()
    db.refresh(setting)
    return setting


def _split_contract_realized_and_open(trades: list, today: date):
    """
    Group trades by exact contract (symbol, expiry_date).
    - Expired contracts (expiry_date < today) or flat contracts (buy_qty == sell_qty):
      100% realized gross P&L = sell_value - buy_value.
    - Unexpired contracts with open qty (buy_qty != sell_qty and expiry_date >= today):
      Matched qty contributes to realized gross P&L; remaining qty goes to open_positions.
    """
    contracts: dict = defaultdict(lambda: {"buys": [], "sells": []})
    for t in trades:
        contracts[(t.symbol, t.expiry_date)]["buys" if t.trade_type == "buy" else "sells"].append(t)

    realized_by_expiry: dict = defaultdict(lambda: {
        "buy_qty": 0.0, "sell_qty": 0.0, "buy_value": 0.0, "sell_value": 0.0,
        "gross_pnl": 0.0, "trades_count": 0, "trades": [],
    })
    open_positions = []

    for (symbol, expiry_date), data in contracts.items():
        bq = sum(float(t.quantity) for t in data["buys"])
        sq = sum(float(t.quantity) for t in data["sells"])
        bv = sum(float(t.quantity) * float(t.price) for t in data["buys"])
        sv = sum(float(t.quantity) * float(t.price) for t in data["sells"])
        all_t = data["buys"] + data["sells"]
        tc = len(all_t)

        is_expired = expiry_date is not None and expiry_date < today
        is_flat = abs(bq - sq) <= 1e-6

        exp_key = (expiry_date, _get_symbol_base(symbol))
        grp = realized_by_expiry[exp_key]
        grp["trades_count"] += tc
        grp["trades"].extend(all_t)

        if is_flat or is_expired:
            grp["buy_qty"] += bq
            grp["sell_qty"] += sq
            grp["buy_value"] += bv
            grp["sell_value"] += sv
            grp["gross_pnl"] += (sv - bv)
        else:
            matched_qty = min(bq, sq)
            avg_buy = (bv / bq) if bq > 0 else 0.0
            avg_sell = (sv / sq) if sq > 0 else 0.0
            if matched_qty > 0:
                m_bv = matched_qty * avg_buy
                m_sv = matched_qty * avg_sell
                grp["buy_qty"] += matched_qty
                grp["sell_qty"] += matched_qty
                grp["buy_value"] += m_bv
                grp["sell_value"] += m_sv
                grp["gross_pnl"] += (m_sv - m_bv)

            net_qty = bq - sq
            open_avg = avg_buy if net_qty > 0 else avg_sell
            open_cashflow = (sv - matched_qty * avg_sell) - (bv - matched_qty * avg_buy)
            open_positions.append({
                "symbol": symbol,
                "symbol_base": _get_symbol_base(symbol),
                "expiry_date": expiry_date,
                "net_qty": round(net_qty, 4),
                "avg_price": round(open_avg, 2),
                "open_value": round(open_cashflow, 2),
                "unrealised_pnl": 0.0,
            })

    return realized_by_expiry, open_positions


def calculate_pnl(db: Session, user_id: int, financial_year: str) -> dict:
    trades = (
        db.query(Trade)
        .filter(Trade.user_id == user_id, Trade.financial_year == financial_year)
        .all()
    )
    setting = get_or_create_brokerage_setting(db, user_id, financial_year)
    per_order_fee = 20.0
    total_trades = len(trades)

    # Calculate exact Zerodha standard charges (Rs 20/order + STT + Exch + IPFT + SEBI + Stamp + 18% GST)
    calculated_brokerage = calculate_zerodha_charges(trades, per_order_fee)
    is_custom = setting.custom_total_brokerage is not None
    total_brokerage = round(float(setting.custom_total_brokerage), 2) if is_custom else calculated_brokerage

    today = date.today()
    realized_by_expiry, open_positions = _split_contract_realized_and_open(trades, today)

    pnl_records, total_profit, total_loss = [], 0.0, 0.0
    gross_net_pnl = 0.0
    profitable_expiries = losing_expiries = 0

    for (expiry_date, symbol_base), grp in realized_by_expiry.items():
        gross_pnl = round(grp["gross_pnl"], 2)
        gross_net_pnl += gross_pnl
        trades_count = grp["trades_count"]

        if is_custom:
            expiry_brokerage = round(total_brokerage * (trades_count / total_trades), 2) if total_trades > 0 else 0.0
        else:
            expiry_brokerage = calculate_zerodha_charges(grp["trades"], per_order_fee)

        net_realized_pnl = round(gross_pnl - expiry_brokerage, 2)

        if net_realized_pnl > 0:
            total_profit += net_realized_pnl
            profitable_expiries += 1
        elif net_realized_pnl < 0:
            total_loss += abs(net_realized_pnl)
            losing_expiries += 1

        pnl_records.append({
            "expiry_date": expiry_date,
            "symbol_base": symbol_base,
            "total_buy_qty": grp["buy_qty"],
            "total_sell_qty": grp["sell_qty"],
            "buy_value": round(grp["buy_value"], 2),
            "sell_value": round(grp["sell_value"], 2),
            "gross_pnl": gross_pnl,
            "brokerage": expiry_brokerage,
            "realized_pnl": net_realized_pnl,
            "trades_count": trades_count,
            "status": "profit" if net_realized_pnl > 0 else ("loss" if net_realized_pnl < 0 else "breakeven"),
        })

    pnl_records.sort(key=lambda x: x["expiry_date"] or date.min, reverse=True)
    open_positions.sort(key=lambda x: (x["expiry_date"] or date.max, x["symbol"]))
    total_unrealised = round(sum(p["open_value"] for p in open_positions), 2)

    return {
        "total_profit": round(total_profit, 2),
        "total_loss": round(total_loss, 2),
        "gross_net_pnl": round(gross_net_pnl, 2),
        "net_pnl": round(total_profit - total_loss, 2),
        "total_brokerage": total_brokerage,
        "calculated_brokerage": calculated_brokerage,
        "per_trade_fee": per_order_fee,
        "is_custom_brokerage": is_custom,
        "total_trades": total_trades,
        "profitable_expiries": profitable_expiries,
        "losing_expiries": losing_expiries,
        "financial_year": financial_year,
        "by_expiry": pnl_records,
        "open_positions": open_positions,
        "total_unrealised_pnl": total_unrealised,
    }


def calculate_period_pnl(
    trades: list,
    start_date: date,
    end_date: date,
    per_order_fee: float = 20.0,
    custom_total_brokerage: Optional[float] = None,
    total_trades_count: int = 0,
) -> float:
    """Net realized period P&L after deducting Zerodha standard charges (or apportioned custom brokerage)."""
    period = [t for t in trades if start_date <= t.trade_date <= end_date]
    if not period:
        return 0.0
    realized_by_expiry, _ = _split_contract_realized_and_open(period, date.today())
    gross = sum(grp["gross_pnl"] for grp in realized_by_expiry.values())
    if custom_total_brokerage is not None and total_trades_count > 0:
        brokerage = round(custom_total_brokerage * (len(period) / total_trades_count), 2)
    else:
        brokerage = calculate_zerodha_charges(period, per_order_fee)
    return round(gross - brokerage, 2)
