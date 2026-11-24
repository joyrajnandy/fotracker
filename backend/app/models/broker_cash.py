from sqlalchemy import Column, Integer, String, DateTime, Numeric, ForeignKey, Date, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class BrokerCash(Base):
    """Cash deposits made to the broking account."""
    __tablename__ = "broker_cash"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(15, 2), nullable=False)
    cash_date = Column(Date, nullable=False)
    financial_year = Column(String(10), nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="broker_cash")
