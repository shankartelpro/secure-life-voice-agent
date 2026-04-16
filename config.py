# insurance_voice_agent/config.py

from pydantic_settings import BaseSettings
from typing import Optional
from utils.logger import log
from dotenv import load_dotenv
import os

# Load .env file
load_dotenv()


class Settings(BaseSettings):
    # App Config
    APP_NAME: str = "SecureLife AI Agent"
    APP_VERSION: str = "1.0.0"
    
    # API Keys (fetch from env)
    DEEPGRAM_API_KEY: str = os.getenv("DEEPGRAM_API_KEY")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY")
    ELEVENLABS_API_KEY: str = os.getenv("ELEVENLABS_API_KEY")
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./insurance_agent.db")

    # Model Configs
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    OPENAI_TEMPERATURE: float = float(os.getenv("OPENAI_TEMPERATURE", 0.7))

    DEEPGRAM_MODEL: str = os.getenv("DEEPGRAM_MODEL", "nova-3") 
    DEEPGRAM_LANGUAGE: str = os.getenv("DEEPGRAM_LANGUAGE", "en-US")

    ELEVEN_VOICE_ID: str = os.getenv("ELEVEN_VOICE_ID", "7EzWGsX10sAS4c9m9cPf")
    ELEVEN_MODEL_ID: str = os.getenv("ELEVEN_MODEL_ID", "eleven_turbo_v2_5")

    class Config:
        env_file = ".env"


settings = Settings()


# --- Validate Keys on Load ---
def validate_keys():
    log.info("Validating API Keys...")

    if not settings.DEEPGRAM_API_KEY:
        log.error("❌ DEEPGRAM_API_KEY missing")
    else:
        log.info(f"DEEPGRAM: {settings.DEEPGRAM_API_KEY[:6]}*****")

    if not settings.OPENAI_API_KEY:
        log.error("❌ OPENAI_API_KEY missing")
    else:
        log.info(f"OPENAI: {settings.OPENAI_API_KEY[:6]}*****")

    if not settings.ELEVENLABS_API_KEY:
        log.error("❌ ELEVENLABS_API_KEY missing")
    else:
        log.info(f"ELEVEN: {settings.ELEVENLABS_API_KEY[:6]}*****")

    log.info("API Keys configuration check complete.")


validate_keys()