const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');
const admin = require('firebase-admin');

// --- Firebase Admin SDK Initialization ---
// Expects a base64 encoded service account key in the environment variable
let serviceAccount;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
        const decodedKey = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8');
        serviceAccount = JSON.parse(decodedKey);
    } else {
        console.error("Firebase service account key (FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) is not set in environment variables.");
        // Potentially throw an error or use a fallback if in local dev without env vars
        // For now, we'll let it fail later if serviceAccount is undefined
    }
} catch (e) {
    console.error("Error parsing Firebase service account key:", e);
}

if (serviceAccount && !admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin SDK initialized successfully.");
    } catch (e) {
        console.error("Firebase Admin SDK initialization error:", e);
    }
} else if (!serviceAccount) {
    console.warn("Firebase Admin SDK not initialized because service account key is missing or invalid.");
}


const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue; // For server timestamps

const SENSOR_READINGS_COLLECTION = 'sensor_readings';
const LATEST_SENSOR_DOC_ID = 'latest_data';
const CONTROL_STATES_COLLECTION = 'control_states';
const CURRENT_CONTROL_DOC_ID = 'current_control';

const DEFAULT_SENSOR_VALUES = {
    panelTemp: 25.0, ambientTemp: 28.0, lightIntensity: 500, humidity: 60,
    panelVoltage: 12.0, panelCurrent: 0.5, panelPower: 6.0, panelEnergy: 0.0,
    ssr1: false, ssr3: false, ssr4: false,
    coolingStatus: false, // Derived, but good to have a default
    manualMode: false,    // ESP32's physical switch mode
    updatedAt: FieldValue.serverTimestamp()
};

const DEFAULT_CONTROL_VALUES = {
    manualModeActive: false, // Web UI manual override
    manualCoolerState: false, // Desired state if web UI manual override is active
    updatedAt: FieldValue.serverTimestamp()
};

const app = express();
app.use(cors());
app.use(express.json());

// --- API Routes ---

// GET latest sensor data (for frontend)
app.get('/api/sensordata', async (req, res) => {
    if (!admin.apps.length) {
        return res.status(503).json({ message: 'Firebase not initialized. Check server logs.' });
    }
    try {
        const sensorDocRef = db.collection(SENSOR_READINGS_COLLECTION).doc(LATEST_SENSOR_DOC_ID);
        const controlDocRef = db.collection(CONTROL_STATES_COLLECTION).doc(CURRENT_CONTROL_DOC_ID);

        const sensorDocSnap = await sensorDocRef.get();
        const controlDocSnap = await controlDocRef.get();

        let latestSensorDataFromDB;
        let controlStateFromDB;

        if (sensorDocSnap.exists) {
            latestSensorDataFromDB = sensorDocSnap.data();
        } else {
            console.log(`Document ${LATEST_SENSOR_DOC_ID} not found in ${SENSOR_READINGS_COLLECTION}. Creating with defaults.`);
            await sensorDocRef.set(DEFAULT_SENSOR_VALUES);
            latestSensorDataFromDB = { ...DEFAULT_SENSOR_VALUES, updatedAt: new Date() }; // Use current date for immediate display
        }

        if (controlDocSnap.exists) {
            controlStateFromDB = controlDocSnap.data();
        } else {
            console.log(`Document ${CURRENT_CONTROL_DOC_ID} not found in ${CONTROL_STATES_COLLECTION}. Creating with defaults.`);
            await controlDocRef.set(DEFAULT_CONTROL_VALUES);
            controlStateFromDB = { ...DEFAULT_CONTROL_VALUES, updatedAt: new Date() }; // Use current date
        }
        
        // Ensure all expected fields are present, even if Firestore data is somehow incomplete
        const mergedSensorData = { ...DEFAULT_SENSOR_VALUES, ...latestSensorDataFromDB };
        const mergedControlState = { ...DEFAULT_CONTROL_VALUES, ...controlStateFromDB };


        const displayData = {
            ...mergedSensorData,
            // If web manual control is active, show its state, otherwise show actual cooler state from sensors
            coolingStatus: mergedControlState.manualModeActive
                           ? mergedControlState.manualCoolerState
                           : (mergedSensorData.ssr1 || mergedSensorData.ssr3 || mergedSensorData.ssr4),
            manualMode: mergedControlState.manualModeActive // Reflects if the web UI switch is in 'manual'
        };
        res.json(displayData);
    } catch (error) {
        console.error("Firestore read error for /api/sensordata:", error);
        // Fallback to ensure the app doesn't completely break, using initial defaults
        const fallbackDisplayData = {
            ...DEFAULT_SENSOR_VALUES,
            coolingStatus: DEFAULT_CONTROL_VALUES.manualCoolerState,
            manualMode: DEFAULT_CONTROL_VALUES.manualModeActive,
            error: 'Failed to retrieve data from Firestore. Displaying defaults.'
        };
        res.status(500).json(fallbackDisplayData);
    }
});

// POST new sensor data (from ESP32)
app.post('/api/update', async (req, res) => {
    if (!admin.apps.length) {
        return res.status(503).json({ message: 'Firebase not initialized. Check server logs.' });
    }
    const data = req.body;
    console.log('Received data from ESP32 for /api/update:', data);

    // Basic validation (expand as needed)
    const panelTemp = data.t_ds !== undefined ? parseFloat(data.t_ds) : DEFAULT_SENSOR_VALUES.panelTemp;
    // ... (add all other validations as in your original file) ...
    // For brevity, I'm skipping the detailed validation block here, but you should include it.
    // Example for one field:
    if (isNaN(panelTemp) || panelTemp < 1 || panelTemp > 80) {
         // Keep your original validation logic here
    }

    const newSensorData = {
        panelTemp: data.t_ds !== undefined ? parseFloat(data.t_ds) : null,
        ambientTemp: data.t_dht !== undefined ? parseFloat(data.t_dht) : null,
        lightIntensity: data.lux !== undefined ? parseFloat(data.lux) : null,
        humidity: data.h_dht !== undefined ? parseFloat(data.h_dht) : null,
        panelVoltage: data.voltage !== undefined ? parseFloat(data.voltage) : null,
        panelCurrent: data.current !== undefined ? parseFloat(data.current) : null,
        panelPower: data.power !== undefined ? parseFloat(data.power) : null,
        panelEnergy: data.energy !== undefined ? parseFloat(data.energy) : null,
        ssr1: data.ssr1 !== undefined ? Boolean(data.ssr1) : false,
        ssr3: data.ssr3 !== undefined ? Boolean(data.ssr3) : false,
        ssr4: data.ssr4 !== undefined ? Boolean(data.ssr4) : false,
        manualMode: data.globalManualMode !== undefined ? Boolean(data.globalManualMode) : false, // ESP32's physical switch state
        updatedAt: FieldValue.serverTimestamp()
    };
    // Filter out null values to avoid overwriting existing fields with null if ESP sends partial data
    const filteredSensorData = Object.fromEntries(Object.entries(newSensorData).filter(([_, v]) => v !== null));


    try {
        const docRef = db.collection(SENSOR_READINGS_COLLECTION).doc(LATEST_SENSOR_DOC_ID);
        // Using set with merge:true ensures the document is created if it doesn't exist,
        // and existing fields are updated, new fields are added.
        await docRef.set(filteredSensorData, { merge: true });
        res.status(200).json({ message: 'Data updated successfully in Firestore' });
    } catch (error) {
        console.error("Firestore update error for /api/update:", error);
        res.status(500).json({ message: 'Failed to update data in Firestore' });
    }
});

// POST control commands (from frontend)
app.post('/api/control', async (req, res) => {
    if (!admin.apps.length) {
        return res.status(503).json({ message: 'Firebase not initialized. Check server logs.' });
    }
    const { manualMode, coolerState } = req.body; // manualMode is manualModeActive from web
    console.log('Received control command from web UI for /api/control:', req.body);

    let newControlData = {};
    if (typeof manualMode === 'boolean') {
        newControlData.manualModeActive = manualMode;
    }
    if (typeof coolerState === 'boolean') {
        newControlData.manualCoolerState = coolerState;
    }
    
    if (Object.keys(newControlData).length === 0) {
        return res.status(400).json({ message: 'No valid control parameters provided.' });
    }
    newControlData.updatedAt = FieldValue.serverTimestamp();

    try {
        const docRef = db.collection(CONTROL_STATES_COLLECTION).doc(CURRENT_CONTROL_DOC_ID);
        await docRef.set(newControlData, { merge: true });
        const updatedDocSnap = await docRef.get(); // Get the merged document to return its state
        res.status(200).json({ message: 'Control state updated in Firestore', newControlState: updatedDocSnap.data() });
    } catch (error) {
        console.error("Firestore control update error for /api/control:", error);
        res.status(500).json({ message: 'Failed to update control state in Firestore' });
    }
});

// GET control commands (for ESP32 to poll)
app.get('/api/getcontrol', async (req, res) => {
    if (!admin.apps.length) {
        return res.status(503).json({ message: 'Firebase not initialized. Check server logs.' });
    }
    try {
        const docRef = db.collection(CONTROL_STATES_COLLECTION).doc(CURRENT_CONTROL_DOC_ID);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            res.json(docSnap.data());
        } else {
            console.log(`Control document ${CURRENT_CONTROL_DOC_ID} not found in ${CONTROL_STATES_COLLECTION} for /api/getcontrol. Creating with defaults.`);
            await docRef.set(DEFAULT_CONTROL_VALUES);
            res.json({ ...DEFAULT_CONTROL_VALUES, updatedAt: new Date() });
        }
    } catch (error) {
        console.error("Firestore getcontrol error for /api/getcontrol:", error);
        res.status(500).json({ ...DEFAULT_CONTROL_VALUES, error: "Could not fetch control state" });
    }
});

// Netlify handler function
const handler = serverless(app);
exports.handler = async (event, context) => {
    // Ensure Firebase is initialized for each invocation if it wasn't globally
    if (serviceAccount && !admin.apps.length) {
        try {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("Firebase Admin SDK re-initialized for invocation.");
        } catch (e) {
            // console.error("Firebase Admin SDK re-initialization error:", e);
            // If it's already initialized, it might throw an error, which is fine.
            if (e.code !== 'app/duplicate-app') {
                console.error("Firebase Admin SDK re-initialization error:", e);
            }
        }
    }


    // Path rewriting logic from original file
    if (event.path.startsWith('/.netlify/functions/api')) {
        event.path = event.path.replace(/^\/\.netlify\/functions\/api/, '');
    } else if (!event.path.startsWith('/api/')) {
        if (event.path === '/getcontrol') event.path = '/api/getcontrol';
        else if (event.path === '/update') event.path = '/api/update';
        else if (event.path === '/sensordata') event.path = '/api/sensordata'; // Added for completeness
        else if (event.path === '/control') event.path = '/api/control';     // Added for completeness
    }
    if (event.path === '') event.path = '/';
    // console.log('Modified event path for Express:', event.path);

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
