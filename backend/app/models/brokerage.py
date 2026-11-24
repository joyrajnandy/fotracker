from sqlalchemy import Column, Integer, String, DateTime, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class BrokerageSetting(Base):
    """Per-FY brokerage configuration (default 69/trade, or custom total override)."""
    __tablename__ = "brokerage_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    financial_year = Column(String(10), nullable=False)
    per_trade_fee = Column(Numeric(10, 2), nullable=False, default=25.70)
    custom_total_brokerage = Column(Numeric(15, 2), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "financial_year", name="uq_user_brokerage_fy"),
    )
