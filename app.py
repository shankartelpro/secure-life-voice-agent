# insurance_voice_agent/app.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
import uvicorn
from pathlib import Path

# Local Imports
from database import engine, Base, get_db
from models import Lead
from services.llm import get_response_from_llm
from services.voice import deepgram_transcription_stream, text_to_speech_stream
from api.routes import router as lead_router
from utils.logger import log
from config import validate_keys

import json
import base64
import asyncio
from dotenv import load_dotenv
import os

validate_keys()

# --- Lifespan Event Handler (Standard) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    log.info("Application Starting up...")
    try:
        # check_first=True prevents crash if table exists on Render
        Base.metadata.create_all(bind=engine, check_first=True)
        log.info("Database tables checked/created.")
    except Exception as e:
        log.warning(f"Database startup skipped: {e}")
    yield
    # Shutdown
    log.info("Application Shutting down...")

# --- Create App ---
app = FastAPI(
    title="SecureLife AI Agent",
    lifespan=lifespan 
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routes
app.include_router(lead_router, prefix="/api/leads", tags=["leads"])

@app.get("/")
def read_root():
    return {"message": "SecureLife AI Backend is Running"}

@app.websocket("/ws/agent")
async def websocket_endpoint(websocket: WebSocket, lead_id: int = Query(...), db: Session = Depends(get_db)):
    await websocket.accept()
    log.info(f"--- WebSocket Connection Opened for Lead ID: {lead_id} ---")
    
    # Fetch Lead
    try:
        lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if not lead:
            log.error(f"Lead ID {lead_id} not found in database. Closing connection.")
            await websocket.close(code=4000, reason="Lead not found")
            return
        log.info(f"Lead Found: {lead.name}")
    except Exception as e:
        log.error(f"Database Error: {e}")
        await websocket.close(code=4001, reason="Database Error")
        return

    conversation_history = [] 
    
    # Initialize Deepgram variable
    dg_ws = None 

    try:
        # 1. Connect to Deepgram
        log.info("Step 1: Connecting to Deepgram...")
        dg_ws = await deepgram_transcription_stream()
        
        # 2. Initial Greeting
        log.info("Step 2: Sending Initial Greeting...")
        if not conversation_history:
            initial_text = "Hi, this is Daniel from SecureLife Insurance. I'm here to help you find the right coverage. Are you looking for family protection today?"
            conversation_history.append({"role": "assistant", "content": initial_text})
            
            # Send text to UI
            await websocket.send_json({"type": "bot_text", "text": initial_text})
            
            # Stream TTS
            try:
                async for chunk in text_to_speech_stream(initial_text):
                    await websocket.send_json({"type": "audio", "audio": base64.b64encode(chunk).decode("utf-8")})
                
                # --- ADDED: Signal End of Initial Audio ---
                await websocket.send_json({"type": "audio_end"})
                # ---------------------------------------
                
                log.info("Initial Greeting Audio Sent.")
            except Exception as e:
                log.error(f"Failed to stream initial audio: {e}")

        # 3. Main Loop
        log.info("Step 3: Entering Main Listening Loop...")
        while True:
            # A. Receive Audio from Frontend
            try:
                data = await asyncio.wait_for(websocket.receive_bytes(), timeout=0.1)
                # Forward audio to Deepgram
                await dg_ws.send(data)
            except asyncio.TimeoutError:
                pass 
            except Exception as e:
                log.warning(f"Error receiving audio from frontend: {e}")
                break # Stop loop if client disconnects unexpectedly
            
            # B. Receive Transcript from Deepgram
            try:
                message = json.loads(await asyncio.wait_for(dg_ws.recv(), timeout=0.1))
                
                if message.get("channel") and message["channel"].get("alternatives"):
                    transcript = message["channel"]["alternatives"][0].get("transcript")
                    is_final = message.get("speech_final", False)
                    
                    if transcript:
                        # Send transcript to UI
                        await websocket.send_json({
                            "type": "transcript", 
                            "text": transcript, 
                            "is_final": is_final
                        })
                        
                        if is_final:
                            # C. Process with LLM
                            log.info(f"User said (Final): {transcript}")
                            conversation_history.append({"role": "user", "content": transcript})
                            
                            # Generate Response
                            response_text = await get_response_from_llm(conversation_history)
                            conversation_history.append({"role": "assistant", "content": response_text})
                            
                            # Save to DB
                            try:
                                lead.intent = "interested" 
                                db.commit()
                            except Exception as e:
                                log.error(f"DB Commit Error: {e}")
                            
                            # D. Send Response
                            await websocket.send_json({"type": "bot_text", "text": response_text})
                            
                            async for chunk in text_to_speech_stream(response_text):
                                await websocket.send_json({"type": "audio", "audio": base64.b64encode(chunk).decode("utf-8")})
                            
                            # --- ADDED: Signal End of Response Audio ---
                            await websocket.send_json({"type": "audio_end"})
                            # ------------------------------------------

            except asyncio.TimeoutError:
                pass 
            except Exception as e:
                log.error(f"Error processing Deepgram stream: {e}")
                # Don't break immediately, might be a transient error

    except WebSocketDisconnect:
        log.info("Client disconnected normally.")
    except Exception as e:
        log.critical(f"!!! UNHANDLED ERROR IN WEBSOCKET LOOP !!!")
        log.critical(f"Error Type: {type(e).__name__}")
        log.critical(f"Error Details: {e}")
        import traceback
        log.critical(traceback.format_exc())
    finally:
        # Cleanup
        log.info("Cleaning up connection...")
        if dg_ws:
            try:
                await dg_ws.close()
                log.info("Deepgram socket closed.")
            except Exception:
                pass
        
        # Check if socket is still open before closing
        if websocket.client_state.name != "DISCONNECTED":
            await websocket.close()
        
        log.info("--- WebSocket Connection Closed ---")


# --- SERVE FRONTEND ---
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")

if __name__ == "__main__":
    print("Starting SecureLife Server...")
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)