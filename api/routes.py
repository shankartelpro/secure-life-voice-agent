# insurance_voice_agent/api/routes.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Lead
from schemas import LeadCreate, LeadResponse

router = APIRouter()

@router.post("/", response_model=LeadResponse)
def create_lead(lead: LeadCreate, db: Session = Depends(get_db)):
    # Create a new lead
    db_lead = Lead(**lead.dict())
    db.add(db_lead)
    db.commit()
    db.refresh(db_lead)
    return db_lead

@router.get("/", response_model=List[LeadResponse])
def get_leads(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    # Get all leads
    leads = db.query(Lead).offset(skip).limit(limit).all()
    return leads

@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead

@router.put("/{lead_id}/status", response_model=LeadResponse)
def update_lead_status(lead_id: int, status: str, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead.status = status
    db.commit()
    db.refresh(lead)
    return lead