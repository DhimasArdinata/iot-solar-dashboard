const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON bodies

// Serve static files (HTML, CSS, JS) from the current directory
// This ensures that files like style.css and script.js are found relative to index.html
app.use(express.static(__dirname));

// In-memory data store (replace with a database in production)
// Configuration for automatic mode
const TEMPERATURE_THRESHOLD = 30.0; // Degrees Celsius

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
    manualCoolerState: false, // Desired cooler state if manualModeActive is true
    autoCoolerState: false   // Desired cooler state if auto mode is active (calculated by server)
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

    latestSensorData = {
        panelTemp: data.t_ds !== undefined ? parseFloat(data.t_ds) : latestSensorData.panelTemp,
        ambientTemp: data.t_dht !== undefined ? parseFloat(data.t_dht) : latestSensorData.ambientTemp,
        lightIntensity: data.lux !== undefined ? parseFloat(data.lux) : latestSensorData.lightIntensity,
        humidity: data.h_dht !== undefined ? parseFloat(data.h_dht) : latestSensorData.humidity,
        panelVoltage: data.voltage !== undefined ? parseFloat(data.voltage) : latestSensorData.panelVoltage,
        panelCurrent: data.current !== undefined ? parseFloat(data.current) : latestSensorData.panelCurrent,
        panelPower: data.power !== undefined ? parseFloat(data.power) : latestSensorData.panelPower,
        panelEnergy: data.energy !== undefined ? parseFloat(data.energy) : latestSensorData.panelEnergy,
        // ssr states are now controlled by server logic if not in manual mode
        ssr1: data.ssr1 !== undefined ? Boolean(data.ssr1) : latestSensorData.ssr1, // Keep ESP32's reported state for now, will be overridden by auto logic
        ssr3: data.ssr3 !== undefined ? Boolean(data.ssr3) : latestSensorData.ssr3,
        ssr4: data.ssr4 !== undefined ? Boolean(data.ssr4) : latestSensorData.ssr4,
        // coolingStatus is derived from ssr states if not in web manual mode
        coolingStatus: (data.ssr1 || data.ssr3 || data.ssr4),
        manualMode: data.globalManualMode !== undefined ? Boolean(data.globalManualMode) : latestSensorData.manualMode, // ESP32's auto/manual mode
    };

    // --- Automatic Control Logic ---
    // Only apply automatic control if manual mode is NOT active from the web UI
    if (!controlState.manualModeActive) {
        const currentPanelTemp = latestSensorData.panelTemp;
        let desiredCoolerState;

        if (currentPanelTemp < TEMPERATURE_THRESHOLD) {
            desiredCoolerState = false; // Turn off relay
        } else {
            desiredCoolerState = true;  // Turn on relay
        }

        // Update the autoCoolerState in controlState
        controlState.autoCoolerState = desiredCoolerState;

        // Update latestSensorData's SSR states based on automatic control
        latestSensorData.ssr1 = desiredCoolerState;
        latestSensorData.ssr3 = desiredCoolerState;
        latestSensorData.ssr4 = desiredCoolerState;
        latestSensorData.coolingStatus = desiredCoolerState; // Reflect the auto-controlled state
    } else {
        // If manual mode is active, ensure autoCoolerState reflects the manual state
        // This is important for the ESP32 to correctly interpret the server's intent
        controlState.autoCoolerState = controlState.manualCoolerState;
    }

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
// Response: { "manualModeActive": true/false, "manualCoolerState": true/false, "autoCoolerState": true/false }
app.get('/api/getcontrol', (req, res) => {
    // The ESP32 will decide whether to use manualCoolerState or autoCoolerState
    // based on manualModeActive.
    res.json(controlState);
});


// Serve index.html for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Frontend served from: ${path.join(__dirname, '/')}`);
    console.log(`API endpoints:`);
    console.log(`  GET  /api/sensordata  (for frontend to get all data)`);
    console.log(`  POST /api/update       (for ESP32 to send sensor readings)`);
    console.log(`  POST /api/control      (for frontend to send control switch state)`);
    console.log(`  GET  /api/getcontrol    (for ESP32 to poll for web UI commands)`);
});
