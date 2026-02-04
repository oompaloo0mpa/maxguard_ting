var awsIot = require('aws-iot-device-sdk');

var device = awsIot.device({
    keyPath: './certs/private.key',
    certPath: './certs/certificate.crt',
    caPath: './certs/AmazonRootCA1.pem',
    clientId: 'first-try',
    host: 'adq3zf94hcaqm-ats.iot.ap-southeast-1.amazonaws.com'
});

var current = new Date();
var current = new Date();

var deviceId = 1;

function publishReading() {
    const now = new Date().toISOString();
    // example sensor values (random for testing) - replace with real sensor reads
    const device_data = Math.floor(Math.random() * 100);
    const distance = Math.floor(Math.random() * 200); // cm
    const light_level = Math.floor(Math.random() * 1000); // lux
    const motion_detected = Math.random() > 0.8; // 20% chance
    const payload = {
        time: now,
        device_id: deviceId,
        device_data: device_data,
        distance: distance,
        light_level: light_level,
        motion_detected: motion_detected
    };
    device.publish('topic_1', JSON.stringify(payload), {}, function() {
        console.log('published', payload);
    });
}

device.on('connect', function () {
    console.log('connect');
    device.subscribe('topic_1');
    // publish immediately and then every 5 seconds
    publishReading();
    setInterval(publishReading, 5000);
});

// handle network / TLS / DNS errors gracefully
device.on('error', function(err) {
    console.error('Device error', err && err.message ? err.message : err);
});

device.on('message', function (topic, payload) {
    console.log('message', topic, payload.toString());
    let msg;
    try { msg = JSON.parse(payload.toString()); } catch (e) { return; }
    if (msg.command === 'shutdown') {
        console.log('Shutdown command received — exiting process (safe test)');
        process.exit(0);
    }
});




