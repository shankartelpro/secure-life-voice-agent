# insurance_voice_agent/app.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pathlib import Path
from contextlib import asynccontextmanager # <--- IMPORT THIS
import asyncio
import json
import base64

# Local Imports
from database import engine, Base, get_db
from models import Lead
from services.llm import get_response_from_llm
from services.voice import deepgram_transcription_stream, text_to_speech_stream
from api.routes import router as lead_router
from utils.logger import log
from config import settings, validate_keys

# --- 1. Validate Keys ---
validate_keys()

# --- 2. Define Lifespan (Replaces @app.on_event) ---
# --- 2. Define Lifespan ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup Code
    log.info("Application Starting up...")
    try:
        # FIX: Change 'check_first' to 'checkfirst' (no underscore)
        Base.metadata.create_all(bind=engine, checkfirst=True)
        log.info("Database tables checked/created.")
    except Exception as e:
        if "already exists" in str(e):
            log.info(f"Database already exists. ({e})")
        else:
            log.error(f"Database Error: {e}")
    
    yield # App is running
    
    # Shutdown Code
    log.info("Application Shutting down...")

# --- 3. Create App (Pass lifespan here) ---
app = FastAPI(
    title="SecureLife AI Agent",
    lifespan=lifespan # <--- ADD THIS
)

# --- 4. Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 5. Include API Routes ---
app.include_router(lead_router, prefix="/api/leads", tags=["leads"])

# --- 6. Routes ---
@app.get("/")
def read_root():
    # Serve the main index.html file automatically
    frontend_path = Path(__file__).resolve().parent / "frontend"
    return FileResponse(frontend_path / "index.html")

@app.websocket("/ws/agent")
async def websocket_endpoint(websocket: WebSocket, lead_id: int = Query(...), db: Session = Depends(get_db)):
    await websocket.accept()
    log.info(f"--- WebSocket Connection Opened for Lead ID: {lead_id} ---")
    
    # Fetch Lead
    try:
        lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if not lead:
            log.error(f"Lead ID {lead_id} not found. Closing connection.")
            await websocket.close(code=4000, reason="Lead not found")
            return
        log.info(f"Lead Found: {lead.name}")
    except Exception as e:
        log.error(f"Database Error: {e}")
        await websocket.close(code=4001, reason="Database Error")
        return

    conversation_history = [] 
    dg_ws = None 

    try:
        # 1. Connect to Deepgram
        log.info("Connecting to Deepgram...")
        dg_ws = await deepgram_transcription_stream()
        
        # 2. Initial Greeting
        if not conversation_history:
            initial_text = "Hi, this is Daniel from SecureLife Insurance. I'm here to help you find the right coverage. Are you looking for family protection today?"
            conversation_history.append({"role": "assistant", "content": initial_text})
            
            await websocket.send_json({"type": "bot_text", "text": initial_text})
            
            try:
                async for chunk in text_to_speech_stream(initial_text):
                    await websocket.send_json({"type": "audio", "audio": base64.b64encode(chunk).decode("utf-8")})
                await websocket.send_json({"type": "audio_end"})
                log.info("Initial Greeting Audio Sent.")
            except Exception as e:
                log.error(f"Failed to stream initial audio: {e}")

        # 3. Main Loop
        while True:
            # A. Receive Audio from Frontend
            try:
                data = await asyncio.wait_for(websocket.receive_bytes(), timeout=0.1)
                await dg_ws.send(data)
            except asyncio.TimeoutError:
                pass 
            except Exception as e:
                log.warning(f"Error receiving audio from frontend: {e}")
                break
            
            # B. Receive Transcript from Deepgram
            try:
                message = json.loads(await asyncio.wait_for(dg_ws.recv(), timeout=0.1))
                
                if message.get("channel") and message["channel"].get("alternatives"):
                    transcript = message["channel"]["alternatives"][0].get("transcript")
                    is_final = message.get("speech_final", False)
                    
                    if transcript:
                        await websocket.send_json({
                            "type": "transcript", 
                            "text": transcript, 
                            "is_final": is_final
                        })
                        
                        if is_final:
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
                            
                            await websocket.send_json({"type": "audio_end"})

            except asyncio.TimeoutError:
                pass 
            except Exception as e:
                log.error(f"Error processing Deepgram stream: {e}")

    except WebSocketDisconnect:
        log.info("Client disconnected normally.")
    except Exception as e:
        log.critical(f"UNHANDLED ERROR: {e}")
        import traceback
        log.critical(traceback.format_exc())
    finally:
        log.info("Cleaning up connection...")
        if dg_ws:
            try:
                await dg_ws.close()
            except Exception:
                pass
        if websocket.client_state.name != "DISCONNECTED":
            await websocket.close()
        log.info("--- WebSocket Connection Closed ---")

# --- SERVE FRONTEND ---
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    print("Starting SecureLife Server...")
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)