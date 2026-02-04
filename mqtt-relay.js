const WebSocket = require('ws');
const awsIot = require('aws-iot-device-sdk');
const http = require('http');

// Create HTTP server
const server = http.createServer();

// WebSocket server for browser clients
const wss = new WebSocket.Server({ server });

// IoT MQTT connection (same as simple_iot.js)
const device = awsIot.device({
    keyPath: './certs/private.key',
    certPath: './certs/certificate.crt',
    caPath: './certs/AmazonRootCA1.pem',
    clientId: 'mqtt-relay-' + Math.random().toString(36).substring(7),
    host: 'adq3zf94hcaqm-ats.iot.ap-southeast-1.amazonaws.com'
});

let connectedClients = [];

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('🌐 Browser client connected');
    connectedClients.push(ws);

    ws.on('close', () => {
        console.log('🌐 Browser client disconnected');
        connectedClients = connectedClients.filter(client => client !== ws);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
    });
});

// IoT MQTT connection
device.on('connect', function () {
    console.log('✓ Connected to AWS IoT Core');
    device.subscribe('topic_1');
});

device.on('message', function (topic, payload) {
    try {
        const msg = JSON.parse(payload.toString());
        console.log('📨 MQTT message:', msg);

        // Broadcast to all connected browsers
        connectedClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(msg));
            }
        });
    } catch (e) {
        console.error('Parse error:', e);
    }
});

device.on('error', (err) => {
    console.error('IoT error:', err.message);
});

// Start WebSocket server on port 8080
server.listen(8080, () => {
    console.log('🚀 MQTT Relay running on ws://localhost:8080');
});
