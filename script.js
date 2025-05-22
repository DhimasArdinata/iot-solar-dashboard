document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const panelTempValue = document.getElementById('panelTempValue');
    const ambientTempValue = document.getElementById('ambientTempValue');
    const lightIntensityValue = document.getElementById('lightIntensityValue');
    const humidityValue = document.getElementById('humidityValue');
    const panelEnergyValue = document.getElementById('panelEnergyValue');
    const panelVoltageValue = document.getElementById('panelVoltageValue');
    const panelCurrentValue = document.getElementById('panelCurrentValue');
    const panelPowerValue = document.getElementById('panelPowerValue');
    const datetimeValue = document.getElementById('datetimeValue'); // Added for datetime display
    const coolingStatusIndicator = document.getElementById('coolingStatusIndicator');
    const coolingStatusText = document.getElementById('coolingStatusText');
    const coolingSwitch = document.getElementById('coolingSwitch');

    const API_URL = '/.netlify/functions/api/api/sensordata'; 
    const CONTROL_API_URL = '/.netlify/functions/api/api/control';

    let totalEnergyJoules = 0; // Variable to accumulate energy in Joules
    const FETCH_INTERVAL_SECONDS = 5; // Define fetch interval in seconds

    // --- Update DateTime ---
    function updateDateTime() {
        if (datetimeValue) {
            const now = new Date();
            datetimeValue.textContent = now.toLocaleString(); // Or use any other preferred format
        }
    }

    // --- Fetch and Update Data ---
    async function fetchData() {
        updateDateTime(); // Update date and time on each fetch
        try {
            const response = await fetch(API_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log('Fetched data:', data);

            // Update UI elements
            if (panelTempValue && data.panelTemp !== undefined) {
                panelTempValue.textContent = `${data.panelTemp.toFixed(1)} °C`;
            }
            if (ambientTempValue && data.ambientTemp !== undefined) ambientTempValue.textContent = `${data.ambientTemp.toFixed(1)} °C`;
            if (lightIntensityValue && data.lightIntensity !== undefined) lightIntensityValue.textContent = `${data.lightIntensity.toFixed(0)} lx`;
            if (humidityValue && data.humidity !== undefined) humidityValue.textContent = `${data.humidity.toFixed(0)} %`;
            // if (panelEnergyValue && data.panelEnergy !== undefined) panelEnergyValue.textContent = `${data.panelEnergy.toFixed(1)} kWh`; // Original energy
            if (panelVoltageValue && data.panelVoltage !== undefined) panelVoltageValue.textContent = `${data.panelVoltage.toFixed(1)} V`;
            if (panelCurrentValue && data.panelCurrent !== undefined) panelCurrentValue.textContent = `${data.panelCurrent.toFixed(2)} A`;
            // if (panelPowerValue && data.panelPower !== undefined) panelPowerValue.textContent = `${data.panelPower.toFixed(1)} W`; // Original power

            // Calculate Power (P = V * I)
            let currentPowerWatts = 0;
            if (data.panelVoltage !== undefined && data.panelCurrent !== undefined) {
                currentPowerWatts = data.panelVoltage * data.panelCurrent;
                if (panelPowerValue) {
                    panelPowerValue.textContent = `${currentPowerWatts.toFixed(1)} W`;
                }
            } else {
                if (panelPowerValue) panelPowerValue.textContent = "N/A";
            }

            // Calculate and Accumulate Energy
            // Energy increment in Joules = Power (Watts) * Time (seconds)
            const energyIncrementJoules = currentPowerWatts * FETCH_INTERVAL_SECONDS;
            totalEnergyJoules += energyIncrementJoules;
            
            // Convert total energy from Joules to kWh (1 kWh = 3,600,000 J)
            const totalEnergyKWh = totalEnergyJoules / 3600000;
            if (panelEnergyValue) {
                panelEnergyValue.textContent = `${totalEnergyKWh.toFixed(3)} kWh`; // Display with more precision
            }


            if (coolingStatusIndicator && coolingStatusText && data.coolingStatus !== undefined) {
                if (data.coolingStatus) {
                    coolingStatusIndicator.classList.add('on');
                    coolingStatusText.textContent = 'ON';
                } else {
                    coolingStatusIndicator.classList.remove('on');
                    coolingStatusText.textContent = 'OFF';
                }
            }
            if (coolingSwitch && data.coolingStatus !== undefined) {
                coolingSwitch.checked = data.coolingStatus;
            }

        } catch (error) {
            console.error("Could not fetch sensor data:", error);
            // Display error message or fallback data for all fields
            const errorText = "N/A";
            if (panelTempValue) panelTempValue.textContent = errorText;
            if (ambientTempValue) ambientTempValue.textContent = errorText;
            if (lightIntensityValue) lightIntensityValue.textContent = errorText;
            if (humidityValue) humidityValue.textContent = errorText;
            if (panelEnergyValue) panelEnergyValue.textContent = errorText;
            if (panelVoltageValue) panelVoltageValue.textContent = errorText;
            if (panelCurrentValue) panelCurrentValue.textContent = errorText;
            if (panelPowerValue) panelPowerValue.textContent = errorText;
            if (coolingStatusText) coolingStatusText.textContent = "Error";
            if (coolingStatusIndicator) coolingStatusIndicator.classList.remove('on');
        }
    }

    // --- Control Switch Handler ---
    async function handleCoolingSwitchChange() {
        const newState = coolingSwitch.checked;
        console.log(`Switch toggled. New state: ${newState ? 'ON' : 'OFF'}`);
        try {
            const response = await fetch(CONTROL_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ manualMode: true, coolerState: newState }), // Example payload
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            console.log('Control command result:', result);
            // Optionally, update UI based on backend confirmation.
            // For now, fetchData will update with the actual state.
            // Consider adding immediate visual feedback if the backend confirms quickly.
        } catch (error) {
            console.error("Error sending control command:", error);
            // Revert switch and notify user if command failed
            coolingSwitch.checked = !newState; 
            // alert("Failed to update cooling status. Please try again."); // Basic alert, consider a more subtle notification
            // For a more professional UI, a small, non-blocking notification (toast) would be better than an alert.
            // For now, just reverting the switch is a simple feedback mechanism.
            if (coolingStatusIndicator && coolingStatusText) { // Also revert visual status indicator
                if (coolingSwitch.checked) {
                    coolingStatusIndicator.classList.add('on');
                    coolingStatusText.textContent = 'ON';
                } else {
                    coolingStatusIndicator.classList.remove('on');
                    coolingStatusText.textContent = 'OFF';
                }
            }
        }
    }

    if (coolingSwitch) {
        coolingSwitch.addEventListener('change', handleCoolingSwitchChange);
    }

    // Initial data fetch and datetime update
    fetchData(); 
    updateDateTime(); // Initial call to set datetime immediately

    // Fetch data periodically
    setInterval(fetchData, FETCH_INTERVAL_SECONDS * 1000); // Fetch every FETCH_INTERVAL_SECONDS
});
