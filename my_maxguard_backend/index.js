var AWS = require('aws-sdk');

// DynamoDB and IoT Data clients
var dynamodb = new AWS.DynamoDB();
var docClient = new AWS.DynamoDB.DocumentClient();
var iotdata = new AWS.IotData({ endpoint: "adq3zf94hcaqm-ats.iot.ap-southeast-1.amazonaws.com" });

// Table name can be provided via env var TABLE_NAME, default to 'MaxGuardData'
var TABLE_NAME = process.env.TABLE_NAME || 'MaxGuardData';

// CORS is handled by API Gateway, not in Lambda

async function ensureTableExists() {
    try {
        const desc = await dynamodb.describeTable({ TableName: TABLE_NAME }).promise();
        const ks = desc.Table.KeySchema || [];
        ensureTableExists.hashKeyName = ks[0] ? ks[0].AttributeName : 'device_id';
        ensureTableExists.rangeKeyName = ks[1] ? ks[1].AttributeName : 'time';
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
        ensureTableExists.hashKeyName = 'device_id';
        ensureTableExists.rangeKeyName = 'time';
    }
}

exports.handler = async function(event, context) {
    console.log('Received event:', JSON.stringify(event));
    console.log('httpMethod:', event.httpMethod);

    // Handle OPTIONS (preflight)
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, body: '' };
    }

    // --- 1. HANDLE GET REQUESTS (Dashboard Read) ---
    if (event.httpMethod === 'GET' || event.requestContext?.http?.method === 'GET') {
        const q = event.queryStringParameters || {};
        const qDevice = Number(q.device_id || q.deviceId || 1);
        const limit = Number(q.limit || 20);

        try {
            await ensureTableExists();
            const params = {
                TableName: TABLE_NAME,
                KeyConditionExpression: 'device_id = :did',
                ExpressionAttributeValues: { ':did': qDevice },
                ScanIndexForward: false, // Newest first
                Limit: limit
            };
            const res = await docClient.query(params).promise();
            console.log('Query result:', res.Items);
            
            return { 
                statusCode: 200, 
                body: JSON.stringify(res.Items || []) 
            };
        } catch (err) {
            console.error('GET error:', err);
            return { 
                statusCode: 500, 
                body: JSON.stringify({ error: 'Read failed', detail: err.message }) 
            };
        }
    }

    // --- 2. HANDLE POST REQUESTS (Sensor Data Ingest) ---
    let payload = event;
    if (typeof event === 'string') {
        try { payload = JSON.parse(event); } catch (e) { }
    }
    if (event && event.body && typeof event.body === 'string') {
        try { payload = JSON.parse(event.body); } catch (e) { }
    }

    const device_id = Number(payload.device_id || payload.deviceId || 1);
    const distance = Number(payload.distance || payload.dist || 0);
    const light_level = Number(payload.light_level || payload.light || 0);
    const motion_detected = payload.motion_detected === true || payload.motion === true || false;
    // Prefer device-provided time (epoch seconds or ISO). Fallback to server time.
    const incomingTime = payload.time;
    const time = (() => {
        if (incomingTime === undefined || incomingTime === null) return new Date().toISOString();
        if (typeof incomingTime === 'number') return new Date(incomingTime * 1000).toISOString();
        if (!isNaN(Number(incomingTime))) return new Date(Number(incomingTime) * 1000).toISOString();
        // If it's already ISO-like, try to parse directly
        const parsed = new Date(incomingTime);
        if (!isNaN(parsed.getTime())) return parsed.toISOString();
        return new Date().toISOString();
    })();

    try {
        await ensureTableExists();
        const item = {
            device_id: device_id,
            time: time,
            distance: distance,
            light_level: light_level,
            motion_detected: motion_detected
        };

        await docClient.put({ TableName: TABLE_NAME, Item: item }).promise();
        console.log('Saved to DynamoDB', item);

        // Optional: IoT Publish logic if needed
        if (distance < 30) { // Example: Threshold alert
            const alertParams = { 
                topic: 'intrusion/alerts', 
                payload: JSON.stringify({ alert: "Intrusion Detected!", device: device_id }), 
                qos: 0 
            };
            await iotdata.publish(alertParams).promise();
        }

        return { 
            statusCode: 200, 
            body: JSON.stringify({ saved: true, item: item }) 
        };
    } catch (err) {
        console.error('Put error', err);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: 'Save failed', detail: err.message }) 
        };
    }
};