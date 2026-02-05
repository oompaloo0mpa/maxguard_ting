var AWS = require('aws-sdk');

// DynamoDB, IoT Data, and CloudWatch clients
var dynamodb = new AWS.DynamoDB();
var docClient = new AWS.DynamoDB.DocumentClient();
var iotdata = new AWS.IotData({ endpoint: "adq3zf94hcaqm-ats.iot.ap-southeast-1.amazonaws.com" });
var cloudwatch = new AWS.CloudWatch(); 

// --- CONFIGURATION ---
var sns = new AWS.SNS();
var SNS_TOPIC_ARN = "arn:aws:sns:ap-southeast-1:393149179689:maxguard_topic";
var THRESH_DIST = 300; // Updated for better detection
var THRESH_LIGHT = 400; // Updated for better detection
var THRESH_MOTION = 1;

// Table name default
var TABLE_NAME = process.env.TABLE_NAME || 'MaxGuardData';

async function ensureTableExists() {
    try {
        await dynamodb.describeTable({ TableName: TABLE_NAME }).promise();
        return;
    } catch (err) {
        if (err.code !== 'ResourceNotFoundException') throw err;
        var params = {
            TableName: TABLE_NAME,
            KeySchema: [
                { AttributeName: 'device_id', KeyType: 'HASH' },
                { AttributeName: 'time', KeyType: 'RANGE' }
            ],
            AttributeDefinitions: [
                { AttributeName: 'device_id', AttributeType: 'N' },
                { AttributeName: 'time', AttributeType: 'S' }
            ],
            ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
        };
        await dynamodb.createTable(params).promise();
        await dynamodb.waitFor('tableExists', { TableName: TABLE_NAME }).promise();
    }
}

exports.handler = async function(event, context) {
    console.log('Received event:', JSON.stringify(event));

    if (event.httpMethod === 'OPTIONS') {
        return { 
            statusCode: 200, 
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }, 
            body: '' 
        };
    }

    // --- 1. HANDLE GET REQUESTS ---
    if (event.httpMethod === 'GET' || event.requestContext?.http?.method === 'GET') {
        const q = event.queryStringParameters || {};

        if (q.checkHealth === '1') {
            try {
                const alarmData = await cloudwatch.describeAlarms({
                    AlarmNames: ['MaxGuard_Offline Alarm']
                }).promise();
                
                const state = alarmData.MetricAlarms.length > 0 
                    ? alarmData.MetricAlarms[0].StateValue 
                    : 'INSUFFICIENT_DATA';

                return {
                    statusCode: 200,
                    headers: { "Access-Control-Allow-Origin": "*" },
                    body: JSON.stringify({ state: state })
                };
            } catch (err) {
                console.error('CloudWatch Alarm Check Error:', err);
                return { statusCode: 500, body: JSON.stringify({ error: 'Alarm check failed' }) };
            }
        }

        const qDevice = Number(q.device_id || q.deviceId || 1);
        const limit = Number(q.limit || 20);

        try {
            await ensureTableExists();
            const params = {
                TableName: TABLE_NAME,
                KeyConditionExpression: 'device_id = :did',
                ExpressionAttributeValues: { ':did': qDevice },
                ScanIndexForward: false,
                Limit: limit
            };
            const res = await docClient.query(params).promise();
            return { 
                statusCode: 200, 
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify(res.Items || []) 
            };
        } catch (err) {
            return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
        }
    }

    // --- 2. HANDLE POST REQUESTS ---
    let payload = event;
    if (typeof event === 'string') { try { payload = JSON.parse(event); } catch (e) { } }
    if (event && event.body) { try { payload = JSON.parse(event.body); } catch (e) { } }

    const device_id = Number(payload.device_id || payload.deviceId || 1);
    const distance = Number(payload.distance || payload.dist || 0);
    const light_level = Number(payload.light_level || payload.light || 0);
    const motion_detected = Number(payload.motion_detected ?? payload.motion ?? 0) ? 1 : 0;
    
    const time = payload.time || new Date().toISOString();

    try {
        await ensureTableExists();
        const item = { device_id, time, distance, light_level, motion_detected };
        await docClient.put({ TableName: TABLE_NAME, Item: item }).promise();

        // --- UNIFIED ALARM LOGIC ---
        const isPaused = payload.action === "OFF" ? 1 : 0;

        // --- PUSH METRICS TO CLOUDWATCH ---
        try {
            let metricData = [];

            // Only send heartbeat if NOT paused.
            // This triggers the Offline Alarm when you click "STOP".
            if (!isPaused) {
                metricData.push({
                    MetricName: 'DeviceHeartbeat',
                    Dimensions: [{ Name: 'DeviceId', Value: String(device_id) }],
                    Value: 1,
                    Unit: 'Count'
                });
            }

            metricData.push({
                MetricName: 'SystemPauseState',
                Dimensions: [{ Name: 'DeviceId', Value: String(device_id) }],
                Value: isPaused,
                Unit: 'Count'
            });

            await cloudwatch.putMetricData({
                Namespace: 'MaxGuard',
                MetricData: metricData
            }).promise();
        } catch (cwErr) {
            console.error('CloudWatch PutMetric Error:', cwErr);
        }

        // --- ALERT LOGIC WITH VALUES ---
        let score = 0;
        let reasons = [];
        if (distance > 0 && distance < THRESH_DIST) { score += 2; reasons.push(`Close Proximity`); }
        if (motion_detected === THRESH_MOTION) { score += 2; reasons.push(`Motion Detected`); }
        if (light_level > THRESH_LIGHT) { score += 2; reasons.push(`Bright Light`); }

        if (score >= 2) {
            const emailMessage = `🚨 BRO THERES A FREAKING INTRUDER LOCK IN 🚨\n\n` +
                                 `Reason: ${reasons.join(", ")}\n\n` +
                                 `Values:\n` +
                                 `Dist: ${distance.toFixed(3)}\n` +
                                 `Light: ${light_level.toFixed(2)}\n` +
                                 `Motion: ${motion_detected}`;

            await sns.publish({
                TopicArn: SNS_TOPIC_ARN,
                Message: emailMessage,
                Subject: `⚠️ MaxGuard ALARM ALERT !`
            }).promise();
        }

        return { 
            statusCode: 200, 
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ saved: true }) 
        };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Save failed' }) };
    }
};