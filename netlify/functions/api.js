const express = require('express');
const cors = require('cors');
const path = require('path');
const serverless = require('serverless-http');

const app = express();
// const PORT = process.env.PORT || 3000; // Netlify provides its own port

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON bodies

// Serve static files (HTML, CSS, JS) from the current directory
// This ensures that files like style.css and script.js are found relative to index.html
// app.use(express.static(__dirname)); // Static files are served by Netlify

// In-memory data store (replace with a database in production)
let latestSensorData = {
    panelTemp: 25.0,
    ambientTemp: 28.0,
    lightIntensity: 500,
    humidity: 60,
    panelEnergy: 0.0,
    panelVoltage: 12.0,
    panelCurrent: 0.5,
    panelPower: 6.0,
    coolingStatus: false, // Represents actual cooler state
    manualMode: false,    // Is the system in manual control mode?
    ssr1: false,
    ssr3: false,
    ssr4: false
};

let controlState = {
    manualModeActive: false, // Is manual override from web active?
    manualCoolerState: false // Desired cooler state if manualModeActive is true
};

// --- API Routes ---

// GET latest sensor data (for frontend)
app.get('/api/sensordata', (req, res) => {
    // Combine actual sensor data with control state for the cooling switch display
    const displayData = {
        ...latestSensorData,
        // If manual web control is active, show its state, otherwise show actual cooler state
        coolingStatus: controlState.manualModeActive ? controlState.manualCoolerState : (latestSensorData.ssr1 || latestSensorData.ssr3 || latestSensorData.ssr4),
        manualMode: controlState.manualModeActive // Reflects if the web UI switch is in 'manual'
    };
    res.json(displayData);
});

// POST new sensor data (from ESP32)
// ESP32 should send data in this format:
// {
//   "t_ds": 29.2, "t_dht": 25.5, "h_dht": 55.0, "lux": 1200,
//   "voltage": 12.1, "current": 1.1, "power": 13.3, "energy": 1.23,
//   "ssr1": false, "ssr3": false, "ssr4": false, "globalManualMode": false
// }
app.post('/api/update', (req, res) => {
    const data = req.body;
    console.log('Received data from ESP32:', data);

    // Data validation
    const panelTemp = data.t_ds !== undefined ? parseFloat(data.t_ds) : latestSensorData.panelTemp;
    const ambientTemp = data.t_dht !== undefined ? parseFloat(data.t_dht) : latestSensorData.ambientTemp;
    const lightIntensity = data.lux !== undefined ? parseFloat(data.lux) : latestSensorData.lightIntensity;
    const humidity = data.h_dht !== undefined ? parseFloat(data.h_dht) : latestSensorData.humidity;
    const panelVoltage = data.voltage !== undefined ? parseFloat(data.voltage) : latestSensorData.panelVoltage;
    const panelCurrent = data.current !== undefined ? parseFloat(data.current) : latestSensorData.panelCurrent;
    const panelPower = data.power !== undefined ? parseFloat(data.power) : latestSensorData.panelPower;
    const panelEnergy = data.energy !== undefined ? parseFloat(data.energy) : latestSensorData.panelEnergy;
    const ssr1 = data.ssr1 !== undefined ? Boolean(data.ssr1) : latestSensorData.ssr1;
    const ssr3 = data.ssr3 !== undefined ? Boolean(data.ssr3) : latestSensorData.ssr3;
    const ssr4 = data.ssr4 !== undefined ? Boolean(data.ssr4) : latestSensorData.ssr4;
    const manualMode = data.globalManualMode !== undefined ? Boolean(data.globalManualMode) : latestSensorData.manualMode;

    if (isNaN(panelTemp) || panelTemp < 1 || panelTemp > 80) {
        return res.status(400).json({ message: 'Invalid panel temperature value' });
    }
    if (isNaN(ambientTemp) || ambientTemp < -50 || ambientTemp > 50) {
        return res.status(400).json({ message: 'Invalid ambient temperature value' });
    }
    if (isNaN(lightIntensity) || lightIntensity < 0 || lightIntensity > 100000) {
        return res.status(400).json({ message: 'Invalid light intensity value' });
    }
    if (isNaN(humidity) || humidity < 0 || humidity > 100) {
        return res.status(400).json({ message: 'Invalid humidity value' });
    }
    if (isNaN(panelVoltage) || panelVoltage < 0 || panelVoltage > 20) {
        return res.status(400).json({ message: 'Invalid panel voltage value' });
    }
    if (isNaN(panelCurrent) || panelCurrent < 0 || panelCurrent > 10) {
        return res.status(400).json({ message: 'Invalid panel current value' });
    }
    if (isNaN(panelPower) || panelPower < 0 || panelPower > 200) {
        return res.status(400).json({ message: 'Invalid panel power value' });
    }
    if (isNaN(panelEnergy) || panelEnergy < 0) {
        return res.status(400).json({ message: 'Invalid panel energy value' });
    }

    latestSensorData = {
        panelTemp,
        ambientTemp,
        lightIntensity,
        humidity,
        panelVoltage,
        panelCurrent,
        panelPower,
        panelEnergy,
        ssr1,
        ssr3,
        ssr4,
        // coolingStatus is derived from ssr states if not in web manual mode
        coolingStatus: (ssr1 || ssr3 || ssr4),
        manualMode, // ESP32's auto/manual mode
    };
    res.status(200).json({ message: 'Data updated successfully' });
});

// POST control commands (from frontend)
// Frontend sends: { manualMode: true/false, coolerState: true/false }
// 'manualMode' here refers to the web UI's desire to override ESP32's logic.
// 'coolerState' is the desired state for the cooler if manualMode is true.
app.post('/api/control', (req, res) => {
    const { manualMode, coolerState } = req.body;
    console.log('Received control command from web UI:', req.body);

    if (typeof manualMode === 'boolean') {
        controlState.manualModeActive = manualMode;
    }
    if (typeof coolerState === 'boolean') {
        controlState.manualCoolerState = coolerState;
    }

    // This endpoint now primarily updates the server's 'controlState'.
    // The ESP32 will need to fetch this controlState periodically.
    res.status(200).json({ message: 'Control state updated', newControlState: controlState });
});

// GET control commands (for ESP32 to poll)
// ESP32 can poll this to see if web UI wants to override.
// Response: { "manualModeActive": true/false, "manualCoolerState": true/false }
app.get('/api/getcontrol', (req, res) => {
    res.json(controlState);
});


// // Serve index.html for the root path // Netlify handles static files
// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, 'index.html'));
// });

// app.listen(PORT, () => { // Netlify provides its own port
//     console.log(`Server running on http://localhost:${PORT}`);
//     console.log(`Frontend served from: ${path.join(__dirname, '/')}`);
//     console.log(`API endpoints:`);
//     console.log(`  GET  /api/sensordata  (for frontend to get all data)`);
//     console.log(`  POST /api/update       (for ESP32 to send sensor readings)`);
//     console.log(`  POST /api/control      (for frontend to send control switch state)`);
//     console.log(`  GET  /api/getcontrol    (for ESP32 to poll for web UI commands)`);
// });

// Wrap the Express app with serverless-http
const handler = serverless(app);

// Netlify handler function
exports.handler = async (event, context) => {
    // You can add any specific pre-processing for the event or context here if needed
    // For example, ensuring the path is correctly interpreted by Express
    // if (event.path.startsWith('/.netlify/functions/api')) {
    //     event.path = event.path.substring('/.netlify/functions/api'.length) || '/';
    // }
    // console.log('Modified event path:', event.path);

    // It's good practice to set a base path if your function is not at the root
    // However, serverless-http usually handles path resolution well.
    // If you have issues with routing, you might need to adjust `event.path`
    // or use Express Routers with base paths.

    try {
        const result = await handler(event, context);
        return result;
    } catch (error) {
        console.error('Error in serverless handler:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal Server Error in handler', error: error.message }),
        };
    }
};
