# insurance_voice_agent/lifespan.py
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from fastapi import FastAPI
from database import engine, Base
from utils.logger import log

# Define a custom context manager that Starlette handles correctly
class AppLifespan:
    def __init__(self, app: FastAPI):
        self.app = app

    async def __aenter__(self):
        log.info("Application Starting up...")
        
        # Database Setup with error handling (Prevents crash loop)
        try:
            # We force check_first=True to prevent "Table already exists" crash on Render
            Base.metadata.create_all(bind=engine, check_first=True)
            log.info("Database tables checked/created (or already exists).")
        except Exception as e:
            log.warning(f"Database startup warning: {e}")
            # Note: We do NOT raise the error here, allowing app to start
            
        log.info("Application Startup Complete.")

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        log.info("Application Shutting down...")

# Define the lifespan generator function to return this custom manager
def lifespan(app: FastAPI):
    return AppLifespan(app)