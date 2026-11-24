from sqlalchemy import Column, Integer, String, DateTime, Numeric, ForeignKey, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Investment(Base):
    __tablename__ = "investments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    instrument_type = Column(String(50), nullable=False)   # GSec, Mutual Fund
    instrument_code = Column(String(60), nullable=True)    # e.g. AMFI code or NSE/BSE ticker
    name = Column(String(200), nullable=False)
    quantity = Column(Numeric(15, 4), nullable=True, default=1)
    buy_price = Column(Numeric(15, 4), nullable=True)
    ltp = Column(Numeric(15, 4), nullable=True)
    invested_value = Column(Numeric(15, 2), nullable=False)
    investment_date = Column(Date, nullable=True)
    financial_year = Column(String(10), nullable=False, index=True)
    notes = Column(String(500), nullable=True)
    current_value = Column(Numeric(15, 2), nullable=True)   # live/updated market value (GSec, MF, Equity etc.)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="investments")
    interests = relationship("Interest", back_populates="investment", cascade="all, delete-orphan")
