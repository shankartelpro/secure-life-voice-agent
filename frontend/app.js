// frontend/app.js
let socket;
let mediaRecorder;
let isRecording = false;
let audioContext;
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
            console.log("WebSocket Opened Successfully!");
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
                // Accumulate chunks
                const binaryString = atob(data.audio);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                audioSegments.push(bytes);

                // Play if we have enough (e.g., 10-15 seconds)
                let totalSize = audioSegments.reduce((sum, arr) => sum + arr.length, 0);
                if (totalSize > 327680) { 
                    playSegment();
                }
            } else if (data.type === 'audio_end') {
                // Force play whatever is left
                playSegment();
            } else if (data.type === 'bot_text') {
                addMessage(data.text, 'bot');
                status.innerText = "Status: AI Speaking...";
            }
        };

        // --- ADDED: Error Handler ---
        socket.onerror = (event) => {
            console.error("WebSocket Error:", event);
            alert("Connection to server failed or server crashed. Please check Render logs.");
            status.innerText = "Status: Error";
            stopMicrophone();
        };

        socket.onclose = () => {
            console.log("WebSocket Closed");
            status.innerText = "Status: Idle";
            btn.innerText = "Start Conversation";
            btn.onclick = toggleConnection;
            stopMicrophone();
        };

    } else {
        socket.close();
    }
}

// --- Playback Logic: Segmented Blobs ---
function playSegment() {
    if (audioSegments.length === 0) return;

    const blob = new Blob(audioSegments, { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    
    // Stop previous audio
    stopCurrentAudio();

    // Play new segment
    const audio = new Audio(url);
    audio.play().catch(e => console.log("Audio play error:", e));
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