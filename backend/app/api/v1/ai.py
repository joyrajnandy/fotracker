from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.services.portfolio_service import get_home_summary
from app.services.pnl_service import calculate_pnl
from app.services.target_service import get_target_achievement
from app.utils.financial_year import get_current_financial_year

router = APIRouter(prefix="/ai", tags=["AI Strategist"])


@router.get("/insights")
def get_ai_insights(
    financial_year: str = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    AI Portfolio Strategist: analyzes real capital, XIRR, holdings P&L,
    F&O win rate, brokerage drag, and target pacing to generate personalized guidance.
    """
    fy = financial_year or get_current_financial_year()
    summary = get_home_summary(db, current_user.id, fy)
    pnl = calculate_pnl(db, current_user.id, fy)
    targets = get_target_achievement(db, current_user.id, fy)

    broker_cash = summary["total_broker_cash"]
    invested = summary["total_invested"]
    undeployed = summary["broker_vs_invested_diff"]
    holding_pnl = summary["total_holding_pnl"]
    fno_net = pnl["net_pnl"]
    brokerage = pnl["total_brokerage"]
    total_trades = pnl["total_trades"]
    xirr = summary["xirr"]

    expiries = pnl["by_expiry"]
    total_exp = len(expiries)
    win_exp = pnl["profitable_expiries"]
    win_rate = round((win_exp / total_exp) * 100, 1) if total_exp else 0.0

    nifty_pnl = sum(e["realized_pnl"] for e in expiries if "NIFTY" in e["symbol_base"].upper())
    sensex_pnl = sum(e["realized_pnl"] for e in expiries if "SENSEX" in e["symbol_base"].upper())

    # Score calculation (0–100)
    score = 50
    if broker_cash > 0:
        if xirr is not None:
            if xirr >= 0.15:
                score += 20
            elif xirr >= 0.10:
                score += 12
            elif xirr < 0:
                score -= 15
        if win_rate >= 60:
            score += 15
        elif win_rate < 40 and total_exp > 0:
            score -= 10
        if targets["yearly_achieved"]:
            score += 15
    score = max(10, min(98, score))

    suggestions = []

    if broker_cash <= 0:
        suggestions.append({
            "type": "info",
            "title": "Initialize Capital Base",
            "detail": "Add or upload your broker cash deposits (Date,Amount CSV) so AI can track XIRR, margin utilization, and 10% p.a. targets.",
        })
    else:
        if xirr is not None:
            xirr_pct = round(xirr * 100, 2)
            if xirr_pct >= 12:
                suggestions.append({
                    "type": "success",
                    "title": f"Strong Annualised XIRR ({xirr_pct}%)",
                    "detail": "Your capital efficiency is beating the 10% benchmark. Consider locking partial gains into GSec holdings to protect drawdown.",
                })
            elif xirr_pct < 0:
                suggestions.append({
                    "type": "warning",
                    "title": f"Negative XIRR ({xirr_pct}%)",
                    "detail": "Review position sizing on losing expiries and cap weekly loss at 1.5% of broker cash.",
                })
            else:
                suggestions.append({
                    "type": "info",
                    "title": f"Steady XIRR ({xirr_pct}%)",
                    "detail": "You are positive but below the 10–12% optimal zone. Deploying idle cash into short-duration GSecs can add 6.8–7.2% base yield.",
                })

        if undeployed > broker_cash * 0.45 and broker_cash > 0:
            suggestions.append({
                "type": "info",
                "title": f"High Idle Cash (₹{undeployed:,.0f})",
                "detail": f"{round((undeployed / broker_cash) * 100, 1)}% of your broker cash is undeployed. Pledging GSec / Liquid Bees lets you earn base yield while keeping F&O margin.",
            })

    if total_trades > 0:
        if brokerage > abs(pnl["gross_net_pnl"]) * 0.25 and brokerage > 0:
            suggestions.append({
                "type": "warning",
                "title": f"High Brokerage Drag (₹{brokerage:,.0f})",
                "detail": f"Brokerage across {total_trades} trades is eating into net returns. Consolidating legs or fewer adjustments per expiry will boost net P&L.",
            })
        if total_exp >= 3:
            better_idx = "NIFTY" if nifty_pnl >= sensex_pnl else "SENSEX"
            suggestions.append({
                "type": "success" if max(nifty_pnl, sensex_pnl) > 0 else "info",
                "title": f"Index Edge: {better_idx} (Win Rate {win_rate}%)",
                "detail": f"NIFTY net P&L: ₹{nifty_pnl:,.0f} vs SENSEX net P&L: ₹{sensex_pnl:,.0f}. Allocate more weekly risk budget to {better_idx}.",
            })

    if holding_pnl < 0:
        suggestions.append({
            "type": "warning",
            "title": "Holdings Mark-to-Market Drawdown",
            "detail": f"Your GSec/MF holdings show ₹{abs(holding_pnl):,.0f} unrealized loss. Refresh LTPs regularly and rebalance underperforming funds.",
        })

    if not suggestions:
        suggestions.append({
            "type": "info",
            "title": "Portfolio Ready for Analysis",
            "detail": "Upload trades and holdings to unlock deep expiry win-rate, brokerage drag, and XIRR recommendations.",
        })

    headline = (
        "Outperforming Benchmark" if score >= 75
        else "Balanced & On Track" if score >= 50
        else "Needs Risk Optimization"
    )

    return {
        "financial_year": fy,
        "health_score": score,
        "headline": headline,
        "metrics": {
            "win_rate": win_rate,
            "nifty_pnl": round(nifty_pnl, 2),
            "sensex_pnl": round(sensex_pnl, 2),
            "brokerage_drag_pct": round((brokerage / abs(pnl["gross_net_pnl"])) * 100, 1) if pnl["gross_net_pnl"] else 0.0,
        },
        "suggestions": suggestions[:4],
    }
