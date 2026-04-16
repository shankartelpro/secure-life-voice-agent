# insurance_voice_agent/lifespan.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from database import engine, Base
from utils.logger import log

# Define a simple, robust lifespan manager
class AppLifespan:
    def __init__(self, app: FastAPI):
        self.app = app

    async def __aenter__(self):
        log.info("Application Starting up...")
        
        # FIX: Use try/except to handle the "Table already exists" error gracefully
        # This prevents the crash loop.
        try:
            # check_first=True is removed to avoid the Render warning
            Base.metadata.create_all(bind=engine)
            log.info("Database tables checked/created (or already exists).")
        except Exception as e:
            # If table exists, log it and continue. Don't crash.
            log.warning(f"Database startup skipped: {e}")
        
        yield

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        log.info("Application Shutting down...")

# Define the lifespan generator function
def lifespan(app: FastAPI):
    return AppLifespan(app)