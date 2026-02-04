const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const awsIot = require('aws-iot-device-sdk');

// Create HTTP server to serve dashboard
const server = http.createServer((req, res) => {
    if (req.url === '/') {
        const dashboardPath = path.join(__dirname, 'dashboard.html');
        fs.readFile(dashboardPath, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading dashboard');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// WebSocket server for real-time MQTT updates
const wss = new WebSocket.Server({ server });

// Connect to AWS IoT Core
const device = awsIot.device({
    keyPath: './certs/private.key',
    certPath: './certs/certificate.crt',
    caPath: './certs/AmazonRootCA1.pem',
    clientId: 'dashboard-server-' + Math.random().toString(36).substring(7),
    host: 'adq3zf94hcaqm-ats.iot.ap-southeast-1.amazonaws.com'
});

let connectedClients = [];

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('✅ Browser connected to dashboard');
    connectedClients.push(ws);

    ws.on('close', () => {
        console.log('❌ Browser disconnected');
        connectedClients = connectedClients.filter(client => client !== ws);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
    });
});

// Connect to IoT MQTT
device.on('connect', function () {
    console.log('✅ Connected to AWS IoT Core MQTT');
    device.subscribe('topic_1');
    console.log('📡 Subscribed to topic_1');
});

// Receive MQTT messages and broadcast to browsers
device.on('message', function (topic, payload) {
    try {
        const msg = JSON.parse(payload.toString());
        console.log('📨 MQTT received:', msg);

        // Broadcast to all connected browsers
        connectedClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(msg));
                console.log('📤 Sent to browser:', msg);
            }
        });
    } catch (e) {
        console.error('Parse error:', e);
    }
});

device.on('error', (err) => {
    console.error('❌ IoT error:', err.message);
});

// Start server on configurable port (default 3000)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Dashboard server running on http://localhost:${PORT}`);
    console.log('📲 Waiting for MQTT messages...');
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Set a free port with PORT env (e.g., PORT=4001) or stop the other process.`);
    } else {
        console.error('❌ Server error:', err.message);
    }
    process.exit(1);
});
