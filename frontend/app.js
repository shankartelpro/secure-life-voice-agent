// frontend/app.js
let socket;
let mediaRecorder;
let isRecording = false;
let audioContext; // Needed for mic, not playback
let currentAudio = null;
let audioSegments = []; // Accumulator for smooth playback

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

    if (!socket || socket.readyState === WebSocket.CLOSED) {
        status.innerText = "Status: Connecting...";
        btn.disabled = true;

        socket = new WebSocket(`ws://localhost:8000/ws/agent?lead_id=${leadId}`);

        socket.onopen = async () => {
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
                    stopCurrentAudio(); // Stop if talking
                }
            } else if (data.type === 'audio') {
                // 1. Accumulate chunks
                const binaryString = atob(data.audio);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                audioSegments.push(bytes);

                // 2. Play if we have enough (e.g., 320KB = ~10-15 seconds)
                // This prevents breaking by playing long smooth segments
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

        socket.onclose = () => {
            status.innerText = "Status: Idle";
            btn.innerText = "Start Conversation";
            btn.onclick = toggleConnection;
            stopMicrophone();
        };

    } else {
        socket.close();
    }
}

// --- New Playback Logic: Segmented Blobs ---
function playSegment() {
    if (audioSegments.length === 0) return;

    // Combine all chunks into one Blob
    const blob = new Blob(audioSegments, { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    
    // Stop previous audio
    stopCurrentAudio();

    // Play new segment
    currentAudio = new Audio(url);
    currentAudio.play().catch(e => console.log("Audio error:", e));

    // Clear accumulator
    audioSegments = [];
}

function stopCurrentAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
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