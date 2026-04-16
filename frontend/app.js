// frontend/app.js
let socket;
let mediaRecorder;
let isRecording = false;
let audioContext;
let audioSegments = [];
let isPlaying = false;
let nextStartTime = 0;
let connectionAttempts = 0;

function addMessage(text, sender) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    div.innerText = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// --- WebSocket Connection ---
async function toggleConnection() {
    const btn = document.getElementById('start-btn');
    const status = document.getElementById('status');
    
    const urlParams = new URLSearchParams(window.location.search);
    const leadId = urlParams.get('lead_id') || '1';

    // 1. Visual Feedback
    btn.disabled = true;
    status.innerText = "Status: Connecting...";
    
    console.log(`%c[START] User clicked Start. Attempt ID: ${leadId}`); // Cyan

    // 2. Detect Protocol (Render vs Localhost)
    const isSecure = window.location.protocol === 'https:';
    const protocol = isSecure ? 'wss://' : 'ws://';
    const host = isSecure ? window.location.hostname : '127.0.0.1'; // Use real host if HTTPS
    const wsUrl = `${protocol}${host}:8000/ws/agent?lead_id=${leadId}`;

    console.log(`%c[CONN] Connecting to ${wsUrl}`); // Blue

    try {
        socket = new WebSocket(wsUrl);
        
        // IMPORTANT: Save reference to button to re-enable it on error/close
        window.currentSocket = socket;
        window.currentBtn = btn;

        socket.onopen = async () => {
            console.log(`%c[OPEN] WebSocket Opened!`); // Green
            status.innerText = "Status: Connected - Listening...";
            
            btn.innerText = "Stop Conversation";
            btn.disabled = false;
            
            // Resume Audio Context
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            await startMicrophone();
        };

        socket.onmessage = async (event) => {
            console.log(`%c[MSG] WS Data:`, event.data); // Magenta
            const data = JSON.parse(event.data);
            
            if (data.type === 'transcript' && data.is_final) {
                console.log(`%c[USER] User said: "${data.text}"`); // Yellow
                addMessage(data.text, 'user');
                status.innerText = "Status: AI Thinking...";
                stopCurrentAudio();
            } else if (data.type === 'audio') {
                // console.log(`%c[AUDIO] Chunk received`); // White
                // ... audio buffer logic ...
            } else if (data.type === 'bot_text') {
                console.log(`%c[BOT] Agent said: "${data.text}"`); // Green
                addMessage(data.text, 'bot');
                status.innerText = "Status: AI Speaking...";
            }
        };

        // --- ERROR HANDLING (Forced) ---
        socket.onerror = (event) => {
            console.error(`%c[ERR] WebSocket Error:`, event); // Red
            alert(`Connection Failed: ${event.reason || "Unknown error"}. Check Console (F12) for details.`);
            status.innerText = "Status: Connection Error";
            
            // FORCE RESET BUTTON
            btn.disabled = false;
            btn.innerText = "Try Again";
            
            // Close any existing socket
            if (socket) {
                socket.close();
            }
        };

        socket.onclose = (event) => {
            console.log(`%c[END] WebSocket Closed.`); // Blue
            status.innerText = "Status: Idle";
            btn.innerText = "Start Conversation";
            btn.disabled = false;
            stopMicrophone();
            
            // Clean up references
            window.currentSocket = null;
            window.currentBtn = null;
        };
        
        socket.onclose = (event) => {
            console.log(`%c[END] (Event)`, event);
        };

    } catch (e) {
        console.error(`%c[CATCH] Creation Error:`, e); // Red
        alert(`Failed to create WebSocket: ${e.message}`);
        status.innerText = "Status: Setup Error";
        
        // FORCE RESET BUTTON
        btn.disabled = false;
        btn.innerText = "Start Conversation";
        window.currentSocket = null;
        window.currentBtn = null;
    }

    // ... rest of audio playback code ...
}