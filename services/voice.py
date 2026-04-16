# insurance_voice_agent/services/voice.py
import asyncio
import websockets
import json
import aiohttp
from config import settings
from utils.logger import log

# --- TTS (ElevenLabs) ---
async def text_to_speech_stream(text: str):
    log.info(f"TTS: Generating Audio for: '{text[:30]}...'")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{settings.ELEVEN_VOICE_ID}/stream?output_format=mp3_44100_192"
    
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": settings.ELEVENLABS_API_KEY
    }
    
    data = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {
            "stability": 0.4,
            "similarity_boost": 1.0,
            "style": 0.3,
            "use_speaker_boost": True,
            "speed": 1.1   # 🔥 ADD THIS (1.0 = normal, >1 faster)
        }
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=data, headers=headers) as resp:
                if resp.status == 200:
                    log.info("TTS: Stream started successfully.")
                    # 16KB chunks
                    async for chunk in resp.content.iter_chunked(16384):
                        yield chunk
                else:
                    log.error(f"TTS Error: {resp.status} - {await resp.text()}")
                    yield b'' 
    except Exception as e:
        log.error(f"TTS Exception: {e}")
        yield b''

# --- STT (Deepgram) ---
async def deepgram_transcription_stream():
    uri = f"wss://api.deepgram.com/v1/listen?model={settings.DEEPGRAM_MODEL}&language={settings.DEEPGRAM_LANGUAGE}&smart_format=true"
    extra_headers = {
        "Authorization": f"Token {settings.DEEPGRAM_API_KEY}"
    }
    log.info(f"Deepgram: Attempting connection to {uri}...")
    try:
        ws = await websockets.connect(uri, additional_headers=extra_headers)
        log.info("Deepgram: Connection Established Successfully.")
        return ws
    except Exception as e:
        log.error(f"Deepgram: Failed to connect - {type(e).__name__}: {e}")
        raise e