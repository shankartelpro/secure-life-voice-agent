// frontend/app.js
let socket;
let mediaRecorder;
let isRecording = false;
let audioContext;
let audioSegments = []; // Accumulator for smooth playback
let isPlaying = false;
let nextStartTime = 0;

function addMessage(text, sender) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    div.innerText = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// --- HELPER: Dynamic URL Detection ---
function getWebSocketURL() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname; // e.g., "secure-life-voice-agent.onrender.com"
    const port = window.location.port || "8000";
    
    // Construct URL dynamically
    return `${protocol}//${host}:${port}/ws/agent`;
}

// --- WebSocket Connection ---
async function toggleConnection() {
    const btn = document.getElementById('start-btn');
    const status = document.getElementById('status');
    
    // Get Lead ID safely
    const urlParams = new URLSearchParams(window.location.search);
    const leadId = urlParams.get('lead_id') || '1';

    if (!socket || socket.readyState === WebSocket.CLOSED) {
        status.innerText = "Status: Connecting...";
        btn.disabled = true;

        // Use Dynamic URL instead of hardcoded localhost:8000
        const wsUrl = getWebSocketURL();
        
        socket = new WebSocket(wsUrl);
        console.log(`%c[CONN] Attempting connection to: ${wsUrl}`); // Debugging

        socket.onopen = async () => {
            console.log(`%c[OPEN] Connection established.`); 
            status.innerText = "Status: Connected - Listening...";
            btn.innerText = "Stop Conversation";
            btn.disabled = false;
            btn.onclick = toggleConnection;
            
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            await startMicrophone();
        };

        socket.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'transcript') {
                if (data.is_final) {
                    addMessage(data.text, 'user');
                    status.innerText = "Status: AI Thinking...";
                    stopCurrentAudio();
                }
            } else if (data.type === 'audio') {
                // 1. Accumulate chunks
                const binaryString = atob(data.audio);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                audioSegments.push(bytes);

                // 2. Play if we have enough
                let totalSize = audioSegments.reduce((sum, arr) => sum + arr.length, 0);
                if (totalSize > 327680) { // 32KB - Same as backend
                    playSegment();
                }
            } else if (data.type === 'audio_end') {
                // 3. Force play whatever is left
                playSegment();
            } else if (data.type === 'bot_text') {
                addMessage(data.text, 'bot');
                status.innerText = "Status: AI Speaking...";
            }
        };

        // --- ADDED: Robust Error Handling for Render ---
        socket.onerror = (event) => {
            console.error(`%c[ERR] WebSocket Error:`, event);
            alert(`Connection Error: ${event.reason || "Unknown error"}. Check if backend is running.`);
            status.innerText = "Status: Connection Error";
            
            // Attempt reconnect automatically after 3 seconds if it was a network glitch
            setTimeout(() => {
                if (socket.readyState === WebSocket.CLOSED) {
                    console.log("%c[RETRY] Attempting to reconnect...");
                    toggleConnection(); 
                }
            }, 3000);
        };

        socket.onclose = (event) => {
            console.log(`%c[END] WebSocket Closed.`); 
            status.innerText = "Status: Idle";
            btn.innerText = "Start Conversation";
            btn.disabled = false;
            btn.onclick = toggleConnection;
            stopMicrophone();
            
            // Clear accumulator
            audioSegments = [];
            nextStartTime = 0;
        };

    } else {
        socket.close();
    }
}

// --- Playback Logic: Segmented Blobs ---
function playSegment() {
    if (audioSegments.length === 0) return;

    isPlaying = true;
    const buffer = audioSegments.shift();

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    // Scheduling for smoothness
    const startTime = Math.max(audioContext.currentTime, nextStartTime);
    source.start(startTime);
    nextStartTime = startTime + buffer.duration;

    source.onended = () => {
        playQueue();
    };
}

function stopCurrentAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
    audioSegments = []; // Clear accumulator
}

// --- Microphone ---
async function startMicrophone() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
                socket.send(event.data); 
            }
        };

        mediaRecorder.start(250); 
        isRecording = true;
        console.log(`%c[MIC] Microphone started.`);
    } catch (err) {
        console.error(`%c[MIC] Error accessing microphone:`, err);
        alert("Microphone access denied.");
    }
}

function stopMicrophone() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
    }
}