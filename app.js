// --- 1. CONFIGURATION ---
const API_URL = "https://yge6fdq3va.execute-api.ap-southeast-1.amazonaws.com/readings";
const RELAY_URL = "ws://localhost:8080"; // MQTT Relay Server
let ws = null;

// --- 2. SETUP THE CHARTS ---
let distanceChart, lightChart;
let distData = [];
let lightData = [];
let labels = [];

function initCharts() {
    const ctxDist = document.getElementById('distanceChart').getContext('2d');
    const ctxLight = document.getElementById('lightChart').getContext('2d');

    distanceChart = new Chart(ctxDist, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Distance (cm)',
                data: distData,
                borderColor: '#4e38d6',
                backgroundColor: 'rgba(78, 56, 214, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true }, x: { display: false } } }
    });

    lightChart = new Chart(ctxLight, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Light Level (lux)',
                data: lightData,
                borderColor: '#2ecc71',
                backgroundColor: 'rgba(46, 204, 113, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true }, x: { display: false } } }
    });
}

// --- 3. CONNECT TO MQTT RELAY (No AWS Keys Required) ---
function connectToRelay() {
    try {
        ws = new WebSocket(RELAY_URL);

        ws.onopen = function () {
            console.log('✓ Connected to MQTT Relay');
            document.querySelector('.status-dot').style.boxShadow = '0 0 5px var(--accent-green)';
        };

        ws.onmessage = function (event) {
            try {
                const payload = JSON.parse(event.data);
                console.log('📨 Live update from MQTT:', payload);
                updateDashboardLive(payload);
            } catch (e) {
                console.error('Parse error:', e);
            }
        };

        ws.onerror = function (err) {
            console.warn('Relay error:', err);
        };

        ws.onclose = function () {
            console.log('Connection closed. Retrying in 3 seconds...');
            setTimeout(connectToRelay, 3000);
        };

    } catch (err) {
        console.error('WebSocket error:', err);
        setTimeout(connectToRelay, 3000);
    }
}

// Update dashboard from live MQTT message
function updateDashboardLive(payload) {
    const distance = Number(payload.distance || 0);
    const light_level = Number(payload.light_level || 0);
    const motion_detected = payload.motion_detected === true || payload.motion_detected === 'true';

    // Update sidebar
    document.getElementById('dist-val').innerText = distance;
    document.getElementById('light-val').innerText = light_level;
    document.getElementById('motion-val').innerText = motion_detected ? 'DETECTED' : 'None';

    // Update status
    const statusEl = document.getElementById('sys-status');
    if (motion_detected) {
        statusEl.innerText = 'INTRUSION ALERT';
        statusEl.className = 'system-status status-alarm';
    } else {
        statusEl.innerText = 'System Normal';
        statusEl.className = 'system-status status-normal';
    }

    document.getElementById('last-updated').innerText = new Date().toLocaleTimeString();

    // Add to chart (rolling 20 points)
    labels.push(new Date().toLocaleTimeString('en-US', { hour12: false }));
    distData.push(distance);
    lightData.push(light_level);

    if (labels.length > 20) {
        labels.shift();
        distData.shift();
        lightData.shift();
    }

    distanceChart.update();
    lightChart.update();
}

// --- 4. FETCH HISTORICAL DATA (Fallback) ---
async function refreshDashboard() {
    try {
        const response = await fetch(API_URL + '?device_id=1&limit=20');
        const data = await response.json();
        
        let items = Array.isArray(data) ? data : (data.Items || []);
        if (!items.length && data.item) {
            items = [data.item];
        }
        
        if (!items.length) return;

        const sortedItems = items.sort((a, b) => new Date(a.time) - new Date(b.time));

        if (sortedItems.length > 0) {
            labels.length = 0;
            distData.length = 0;
            lightData.length = 0;

            sortedItems.forEach((item) => {
                const timeObj = new Date(item.time);
                const timeLabel = timeObj.toLocaleTimeString('en-US', { hour12: false });
                labels.push(timeLabel);
                distData.push(Number(item.distance || 0));
                lightData.push(Number(item.light_level || 0));
            });

            const latest = sortedItems[sortedItems.length - 1];
            document.getElementById('dist-val').innerText = latest.distance || "--";
            document.getElementById('light-val').innerText = latest.light_level || "--";

            const motionEl = document.getElementById('motion-val');
            const statusEl = document.getElementById('sys-status');

            if (latest.motion_detected === true || latest.motion_detected === "true") {
                motionEl.innerText = "DETECTED";
                statusEl.innerText = "INTRUSION ALERT";
                statusEl.className = "system-status status-alarm";
            } else {
                motionEl.innerText = "None";
                statusEl.innerText = "System Normal";
                statusEl.className = "system-status status-normal";
            }

            distanceChart.update();
            lightChart.update();
        }
    } catch (err) {
        console.error("Dashboard Fetch Error:", err);
    }
}

// --- 5. INITIALIZE ON PAGE LOAD ---
document.addEventListener('DOMContentLoaded', function () {
    initCharts();
    connectToRelay();
    refreshDashboard();
    setInterval(refreshDashboard, 10000);
});
