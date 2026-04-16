# insurance_voice_agent/schemas.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

# Schema for creating a lead (e.g., via Dashboard)
class LeadCreate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None

# Schema for returning Lead data
class LeadResponse(BaseModel):
    id: int
    name: Optional[str]
    phone: Optional[str]
    intent: str
    status: str
    plan_selected: Optional[str]
    coverage_amount: Optional[float]
    monthly_premium: Optional[float]
    objections: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True