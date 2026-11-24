from fastapi import APIRouter
from app.api.v1 import auth, home, tradebook, pnl, target, broker_cash, market, ai

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(home.router)
api_router.include_router(tradebook.router)
api_router.include_router(pnl.router)
api_router.include_router(target.router)
api_router.include_router(broker_cash.router)
api_router.include_router(market.router)
api_router.include_router(ai.router)
