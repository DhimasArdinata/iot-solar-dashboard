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
const SENSOR_HISTORY_COLLECTION = 'sensor_history'; // New collection for historical data
const CONTROL_STATES_COLLECTION = 'control_states';
const CURRENT_CONTROL_DOC_ID = 'current_control';
const CONFIGURATION_COLLECTION = 'configuration'; // New
const COOLING_SETTINGS_DOC_ID = 'cooling_config'; // New

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
            if (latestSensorDataFromDB.updatedAt && typeof latestSensorDataFromDB.updatedAt.toDate === 'function') {
                latestSensorDataFromDB.updatedAtISO = latestSensorDataFromDB.updatedAt.toDate().toISOString();
            } else {
                // Fallback if updatedAt is not a Firestore timestamp (e.g. during initial creation with JS Date)
                latestSensorDataFromDB.updatedAtISO = new Date().toISOString(); 
            }
        } else {
            console.log(`Document ${LATEST_SENSOR_DOC_ID} not found in ${SENSOR_READINGS_COLLECTION}. Creating with defaults.`);
            const defaultDataWithTimestamp = { ...DEFAULT_SENSOR_VALUES };
            // For DEFAULT_SENSOR_VALUES, 'updatedAt' is FieldValue.serverTimestamp()
            // This won't resolve to a date until written. So, for initial creation display, use current time.
            await sensorDocRef.set(defaultDataWithTimestamp);
            latestSensorDataFromDB = { ...defaultDataWithTimestamp, updatedAtISO: new Date().toISOString() };
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
                           : (mergedSensorData.ssr1 || mergedSensorData.ssr2 || mergedSensorData.ssr3 || mergedSensorData.ssr4), // Added ssr2
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

// GANTI SELURUH BLOK app.post('/api/update', ...) DENGAN YANG INI
app.post('/api/update', async (req, res) => {
    if (!admin.apps.length) {
        return res.status(503).json({ message: 'Firebase not initialized. Check server logs.' });
    }
    const data = req.body;
    console.log('Received data from ESP32 for /api/update:', data);

    // Validasi dan persiapan data (kode ini tetap sama)
    const newSensorData = {
        panelTemp: data.t_ds !== undefined ? parseFloat(data.t_ds) : null,
        ambientTemp: data.t_dht !== undefined ? parseFloat(data.t_dht) : null,
        lightIntensity: data.lux !== undefined ? parseFloat(data.lux) : null,
        humidity: data.h_dht !== undefined ? parseFloat(data.h_dht) : null,
        panelVoltage: data.voltage !== undefined ? parseFloat(data.voltage) : null,
        panelCurrent: data.current !== undefined ? parseFloat(data.current) : null,
        panelEnergy: data.energy !== undefined ? parseFloat(data.energy) : null,
        ssr1: data.ssr1 !== undefined ? Boolean(data.ssr1) : false,
        ssr2: data.ssr2 !== undefined ? Boolean(data.ssr2) : false,
        ssr3: data.ssr3 !== undefined ? Boolean(data.ssr3) : false,
        ssr4: data.ssr4 !== undefined ? Boolean(data.ssr4) : false,
        manualMode: data.globalManualMode !== undefined ? Boolean(data.globalManualMode) : false,
        updatedAt: FieldValue.serverTimestamp()
    };

    if (newSensorData.panelVoltage !== null && newSensorData.panelCurrent !== null) {
        newSensorData.panelPower = parseFloat((newSensorData.panelVoltage * newSensorData.panelCurrent).toFixed(2));
    } else {
        newSensorData.panelPower = null;
    }
    const filteredSensorData = Object.fromEntries(Object.entries(newSensorData).filter(([_, v]) => v !== null));
    if (newSensorData.panelPower === null && !('panelPower' in filteredSensorData)) {
        filteredSensorData.panelPower = null;
    }

    // --- AWAL DARI LOGIKA KONTROL BARU (SERVER-SIDE) ---
    try {
        // 1. Ambil dokumen kontrol dan konfigurasi saat ini dari Firestore
        const controlDocRef = db.collection(CONTROL_STATES_COLLECTION).doc(CURRENT_CONTROL_DOC_ID);
        const coolingConfigDocRef = db.collection(CONFIGURATION_COLLECTION).doc(COOLING_SETTINGS_DOC_ID);

        const [controlDocSnap, coolingConfigSnap] = await Promise.all([
            controlDocRef.get(),
            coolingConfigDocRef.get()
        ]);

        const currentControlState = controlDocSnap.exists ? controlDocSnap.data() : DEFAULT_CONTROL_VALUES;
        
        // Ambil threshold dari konfigurasi, atau gunakan default 30.0
        const panelTempCoolingThreshold = coolingConfigSnap.exists ?
            (coolingConfigSnap.data().panelTempCoolingThreshold || 30.0) :
            30.0;
        const HYSTERESIS = 2.0; // Definisikan hysteresis (misal 2 derajat) agar tidak nyala-mati terus

        // 2. Cek apakah sistem sedang dalam mode manual dari Web UI
        if (currentControlState.manualModeActive) {
            // JIKA MODE MANUAL: Server tidak melakukan apa-apa.
            // Biarkan state yang sudah diatur oleh user melalui Web UI.
            // ESP32 akan mengambil state ini dan menjalankannya.
            console.log('Mode Manual Aktif. Server tidak mengubah state pendingin.');

        } else {
            // JIKA MODE OTOMATIS: Server akan menghitung dan memutuskan.
            console.log('Mode Otomatis Aktif. Server akan menghitung state pendingin.');
            const currentPanelTemp = filteredSensorData.panelTemp;
            let newDesiredCoolerState;

            if (currentPanelTemp === null || isNaN(currentPanelTemp)) {
                // Jika suhu tidak valid, pertahankan state terakhir atau matikan
                newDesiredCoolerState = false; // Pilihan aman adalah mematikan
                console.log('Suhu panel tidak valid, pendingin diatur ke OFF.');
            } else {
                // Logika Hysteresis untuk menentukan state baru
                const upperThreshold = panelTempCoolingThreshold;
                const lowerThreshold = panelTempCoolingThreshold - HYSTERESIS;

                if (currentPanelTemp >= upperThreshold) {
                    newDesiredCoolerState = true; // Nyalakan jika suhu di atas ambang batas atas
                } else if (currentPanelTemp <= lowerThreshold) {
                    newDesiredCoolerState = false; // Matikan jika suhu di bawah ambang batas bawah
                } else {
                    // Jika suhu di antara keduanya, pertahankan state sebelumnya
                    newDesiredCoolerState = currentControlState.manualCoolerState;
                }
                console.log(`Suhu: ${currentPanelTemp.toFixed(1)}C, Threshold: ${lowerThreshold.toFixed(1)}-${upperThreshold.toFixed(1)}C. State pendingin dihitung: ${newDesiredCoolerState ? 'ON' : 'OFF'}`);
            }

            // 3. Update 'manualCoolerState' di Firestore HANYA JIKA ada perubahan
            if (newDesiredCoolerState !== currentControlState.manualCoolerState) {
                console.log(`State pendingin berubah dari ${currentControlState.manualCoolerState} ke ${newDesiredCoolerState}. Mengupdate Firestore...`);
                await controlDocRef.set({
                    manualCoolerState: newDesiredCoolerState
                }, { merge: true });
            }
        }
        
        // --- AKHIR DARI LOGIKA KONTROL BARU ---
        
        // Lanjutkan dengan menyimpan data sensor ke 'latest_data' dan 'sensor_history'
        // Kita juga perlu update coolingStatus untuk ditampilkan di dashboard
        const finalControlState = (await controlDocRef.get()).data();
        const finalCoolingStatus = finalControlState.manualModeActive 
                                   ? finalControlState.manualCoolerState 
                                   : finalControlState.manualCoolerState; // Di mode auto, status pendingin juga mengikuti manualCoolerState yang baru dihitung server

        filteredSensorData.coolingStatus = finalCoolingStatus;
        filteredSensorData.ssr1 = finalCoolingStatus;
        filteredSensorData.ssr2 = finalCoolingStatus;
        filteredSensorData.ssr3 = finalCoolingStatus;
        filteredSensorData.ssr4 = finalCoolingStatus;

        const latestDocRef = db.collection(SENSOR_READINGS_COLLECTION).doc(LATEST_SENSOR_DOC_ID);
        await latestDocRef.set(filteredSensorData, { merge: true });
        await db.collection(SENSOR_HISTORY_COLLECTION).add(filteredSensorData);

        res.status(200).json({
            message: 'Data updated successfully and control state evaluated'
        });

    } catch (error) {
        console.error("Firestore update/history log error for /api/update:", error);
        res.status(500).json({
            message: 'Failed to update data and log to history in Firestore'
        });
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

// GET historical sensor data
app.get('/api/historicaldata', async (req, res) => {
    if (!admin.apps.length) {
        return res.status(503).json({ message: 'Firebase not initialized. Check server logs.' });
    }
    try {
        const historyLimit = parseInt(req.query.limit) || 50; // Default to 50 records
        let query = db.collection(SENSOR_HISTORY_COLLECTION)
                      .orderBy('updatedAt', 'desc') // Assuming 'updatedAt' is the Firestore server timestamp
                      .limit(historyLimit);

        // Basic pagination: if 'startAfterTimestamp' is provided, use it to get the next page
        // For this to work, 'startAfterTimestamp' should be the 'updatedAt' value of the last item from the previous page
        // And it needs to be a valid Firestore Timestamp object or an ISO string that can be parsed.
        // For simplicity, this example assumes client sends an ISO string if paginating.
        if (req.query.startAfterTimestamp) {
            // Firestore's startAfter() expects the actual value from the document,
            // if 'updatedAt' is a Firestore Timestamp, you'd need to pass that.
            // If client sends ISO string, convert it. For server Timestamps, this is tricky.
            // A simpler pagination for server timestamps might involve client sending the whole last document's snapshot.
            // For now, this is a simplified placeholder for cursor-based pagination.
            // A more robust solution would involve sending the actual DocumentSnapshot reference or specific field values.
            // Let's assume for now client might send an ISO string of the last 'updatedAt'
            try {
                 const startAfterDate = new Date(req.query.startAfterTimestamp);
                 if (!isNaN(startAfterDate)) {
                    query = query.startAfter(admin.firestore.Timestamp.fromDate(startAfterDate));
                 } else if (req.query.startAfterTimestamp === "firstPage") {
                    // do nothing, it's the first page
                 } else {
                    console.warn("Invalid startAfterTimestamp received:", req.query.startAfterTimestamp);
                 }
            } catch(e){
                console.warn("Error parsing startAfterTimestamp:", e);
            }
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            return res.status(200).json([]);
        }

        const historicalData = [];
        snapshot.forEach(doc => {
            let data = doc.data();
            // Convert Firestore Timestamp to ISO string for easier client-side handling
            if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
                data.updatedAtISO = data.updatedAt.toDate().toISOString();
            }
            historicalData.push({ id: doc.id, ...data });
        });
        res.json(historicalData);
    } catch (error) {
        console.error("Firestore read error for /api/historicaldata:", error);
        res.status(500).json({ message: 'Failed to retrieve historical data', details: error.message });
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

// --- Cooling Configuration Settings API ---

// GET current cooling settings (for ESP32 and frontend)
app.get('/api/cooling-settings', async (req, res) => {
    if (!admin.apps.length) {
        return res.status(503).json({ message: 'Firebase not initialized.' });
    }
    try {
        const docRef = db.collection(CONFIGURATION_COLLECTION).doc(COOLING_SETTINGS_DOC_ID);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            res.json(docSnap.data());
        } else {
            // If no settings exist, return default and create it
            const defaultCoolingSettings = { 
                panelTempCoolingThreshold: 30.0, // Default for panel temperature
                updatedAt: FieldValue.serverTimestamp()
            };
            await docRef.set(defaultCoolingSettings); 
            res.status(200).json(defaultCoolingSettings);
        }
    } catch (error) {
        console.error("Firestore error getting cooling settings:", error);
        res.status(500).json({ message: 'Failed to retrieve cooling settings', details: error.message });
    }
});

// POST new cooling settings (from frontend)
app.post('/api/cooling-settings', async (req, res) => {
    if (!admin.apps.length) {
        return res.status(503).json({ message: 'Firebase not initialized.' });
    }
    const { panelTempCoolingThreshold } = req.body;

    if (panelTempCoolingThreshold === undefined || typeof panelTempCoolingThreshold !== 'number' || isNaN(panelTempCoolingThreshold)) {
        return res.status(400).json({ message: 'Invalid or missing panelTempCoolingThreshold. Must be a number.' });
    }
    
    // Add reasonable bounds for the threshold
    if (panelTempCoolingThreshold < 0 || panelTempCoolingThreshold > 80) { // Adjusted max temp for panel
        return res.status(400).json({ message: 'Threshold must be between 0 and 80 degrees Celsius.' });
    }

    const newSettings = {
        panelTempCoolingThreshold: parseFloat(panelTempCoolingThreshold.toFixed(1)), // Store with one decimal place
        updatedAt: FieldValue.serverTimestamp()
    };

    try {
        const docRef = db.collection(CONFIGURATION_COLLECTION).doc(COOLING_SETTINGS_DOC_ID);
        await docRef.set(newSettings, { merge: true }); // Use merge:true to update or create

        // --- Re-evaluate cooling state immediately after threshold change ---
        const latestSensorDocRef = db.collection(SENSOR_READINGS_COLLECTION).doc(LATEST_SENSOR_DOC_ID);
        const latestSensorDocSnap = await latestSensorDocRef.get();
        const latestSensorData = latestSensorDocSnap.exists ? latestSensorDocSnap.data() : DEFAULT_SENSOR_VALUES;

        const controlDocRef = db.collection(CONTROL_STATES_COLLECTION).doc(CURRENT_CONTROL_DOC_ID);
        const controlDocSnap = await controlDocRef.get();
        let currentControlState = controlDocSnap.exists ? controlDocSnap.data() : DEFAULT_CONTROL_VALUES;

        let desiredCoolerState;
        const currentPanelTemp = latestSensorData.panelTemp;
        const newPanelTempCoolingThreshold = newSettings.panelTempCoolingThreshold; // Use the newly set threshold

        if (currentPanelTemp !== null && currentPanelTemp < newPanelTempCoolingThreshold) {
            desiredCoolerState = false; // Turn off relay
        } else if (currentPanelTemp !== null) { // If temp is available and >= threshold
            desiredCoolerState = true;  // Turn on relay
        } else {
            // If panelTemp is null, maintain current state or default to off
            desiredCoolerState = currentControlState.manualCoolerState; // Maintain last known state
        }

        // Only update manualCoolerState if manualModeActive is false (server is in auto control)
        if (!currentControlState.manualModeActive) {
            currentControlState.manualCoolerState = desiredCoolerState;
            // Update the SSR states in the latest sensor data for dashboard display
            latestSensorData.ssr1 = desiredCoolerState;
            latestSensorData.ssr3 = desiredCoolerState;
            latestSensorData.ssr4 = desiredCoolerState;
            latestSensorData.coolingStatus = desiredCoolerState; // Reflect the auto-controlled state
        } else {
            // If manual mode is active, ensure the coolingStatus for display reflects the manual state.
            // SSR states in latestSensorData should ideally reflect what ESP32 reports, but for display consistency,
            // we'll ensure coolingStatus matches the manual state.
            latestSensorData.coolingStatus = currentControlState.manualCoolerState;
        }

        // Update Firestore documents
        await latestSensorDocRef.set(latestSensorData, { merge: true });
        await controlDocRef.set(currentControlState, { merge: true });
        
        res.status(200).json({ message: 'Cooling settings updated successfully and cooling state re-evaluated', newSettings });
    } catch (error) {
        console.error("Firestore error setting cooling settings:", error);
        res.status(500).json({ message: 'Failed to update cooling settings', details: error.message });
    }
});
