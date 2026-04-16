# insurance_voice_agent/models.py
from sqlalchemy import Column, Integer, String, DateTime, Text, Float
from sqlalchemy.sql import func
from database import Base

class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True) # Nullable because we might not know name yet
    phone = Column(String, nullable=True)
    
    # AI Analysis Fields
    intent = Column(String, default="browsing") # browsing, interested, resistant
    status = Column(String, default="new") # new, interested, converted, not_interested
    plan_selected = Column(String, nullable=True)
    coverage_amount = Column(Float, nullable=True)
    monthly_premium = Column(Float, nullable=True)
    objections = Column(Text, nullable=True) # Stores JSON or string of objections raised
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<Lead(id={self.id}, name={self.name}, status={self.status})>"