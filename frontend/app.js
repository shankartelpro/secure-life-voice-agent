// frontend/app.js
let socket;
let mediaRecorder;
let isRecording = false;
let audioContext;
let audioSegments = []; // Accumulator for smooth playback
let isPlaying = false;
let nextStartTime = 0;
let currentAudio = null; // FIXED: Added missing global variable

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
    const host = window.location.host; 
    return `${protocol}//${host}/ws/agent`;
}

// --- WebSocket Connection ---
async function toggleConnection() {
    const btn = document.getElementById('start-btn');
    const status = document.getElementById('status');
    
    // 1. Handle Disconnection (Stop)
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
        return;
    }

    // 2. Handle Connection (Start)
    if (!socket || socket.readyState === WebSocket.CLOSED) {
        status.innerText = "Status: Connecting...";
        btn.disabled = true;

        // Get Lead ID (Default to 1)
        const urlParams = new URLSearchParams(window.location.search);
        const leadId = urlParams.get('lead_id') || '1'; 

        // Create URL with lead_id parameter
        const wsUrl = `${getWebSocketURL()}?lead_id=${leadId}`;
        console.log("Connecting to:", wsUrl);
        
        socket = new WebSocket(wsUrl);

        socket.onopen = async () => {
            console.log("WebSocket Opened Successfully!");
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

                // 2. Play if we have enough data
                let totalSize = audioSegments.reduce((sum, arr) => sum + arr.length, 0);
                if (totalSize > 327680) { 
                    playSegment();
                }
            } else if (data.type === 'audio_end') {
                // 3. Force play whatever is left (End of sentence)
                playSegment();
            } else if (data.type === 'bot_text') {
                addMessage(data.text, 'bot');
                status.innerText = "Status: AI Speaking...";
            }
        };

        socket.onerror = (event) => {
            console.error("WebSocket Error:", event);
            alert(`Connection failed. Please check logs.`);
            status.innerText = "Status: Connection Error";
            stopMicrophone();
            
            // Force Reset button to allow retry
            btn.disabled = false;
            btn.innerText = "Try Again";
        };

        socket.onclose = () => {
            console.log("WebSocket Closed");
            status.innerText = "Status: Idle";
            btn.innerText = "Start Conversation";
            stopMicrophone();
        };
    }
} // FIXED: Added missing closing bracket for toggleConnection

// --- Playback Logic: Segmented Blobs ---
function playSegment() {
    if (audioSegments.length === 0) return;

    // Combine all chunks into one Blob
    const blob = new Blob(audioSegments, { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    
    // Stop previous audio
    stopCurrentAudio();

    // Play new segment
    currentAudio = new Audio(url);
    currentAudio.play().catch(e => console.log("Audio play error:", e));

    // Play next segment
    currentAudio.onended = () => {
        playQueue();
    };
}

function playQueue() {
    if (audioSegments.length === 0) {
        isPlaying = false;
        return;
    }

    // Combine all chunks into one Blob
    const blob = new Blob(audioSegments, { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    
    // Stop previous audio
    stopCurrentAudio();

    // Play new segment
    currentAudio = new Audio(url);
    currentAudio.play().catch(e => console.log("Audio play error:", e));

    // Play next segment
    currentAudio.onended = () => {
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
    } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Microphone access denied.");
    }
}

function stopMicrophone() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
    }
}