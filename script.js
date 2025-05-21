document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const panelTempGauge = document.getElementById('panelTempGauge');
    let panelTempChart;
    const ambientTempValue = document.getElementById('ambientTempValue');
    const lightIntensityValue = document.getElementById('lightIntensityValue');
    const humidityValue = document.getElementById('humidityValue');
    const panelEnergyValue = document.getElementById('panelEnergyValue');
    const panelVoltageValue = document.getElementById('panelVoltageValue');
    const panelCurrentValue = document.getElementById('panelCurrentValue');
    const panelPowerValue = document.getElementById('panelPowerValue');
    const coolingStatusIndicator = document.getElementById('coolingStatusIndicator');
    const coolingStatusText = document.getElementById('coolingStatusText');
    const coolingSwitch = document.getElementById('coolingSwitch');

    const API_URL = '/.netlify/functions/api/api/sensordata'; // Netlify Function URL
    const CONTROL_API_URL = '/.netlify/functions/api/api/control'; // Netlify Function URL

    function updateGauge(value) {
        const minTemp = 1;
        const maxTemp = 80;
        const percentage = Math.max(0, Math.min(100, ((value - minTemp) / (maxTemp - minTemp)) * 100));
        const rotation = (percentage / 100) * 180 - 90;
    }

    // --- Fetch and Update Data ---
    async function fetchData() {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log('Fetched data:', data);

            // Update UI elements
            updateGauge(data.panelTemp);
            if (ambientTempValue) ambientTempValue.textContent = `${data.ambientTemp.toFixed(1)} °C`;
            if (lightIntensityValue) lightIntensityValue.textContent = `${data.lightIntensity.toFixed(0)} lx`;
            if (humidityValue) humidityValue.textContent = `${data.humidity.toFixed(0)} %`;
            if (panelEnergyValue) panelEnergyValue.textContent = `${data.panelEnergy.toFixed(1)} kWh`;
            if (panelVoltageValue) panelVoltageValue.textContent = `${data.panelVoltage.toFixed(1)} V`;
            if (panelCurrentValue) panelCurrentValue.textContent = `${data.panelCurrent.toFixed(2)} A`;
            if (panelPowerValue) panelPowerValue.textContent = `${data.panelPower.toFixed(1)} W`;

            if (coolingStatusIndicator && coolingStatusText) {
                if (data.coolingStatus) {
                    coolingStatusIndicator.classList.add('on');
                    coolingStatusText.textContent = 'ON';
                } else {
                    coolingStatusIndicator.classList.remove('on');
                    coolingStatusText.textContent = 'OFF';
                }
            }
            if (coolingSwitch) {
                coolingSwitch.checked = data.coolingStatus; // This might represent manual override state
                                                            // or actual cooler state depending on backend logic
            }

        } catch (error) {
            console.error("Could not fetch sensor data:", error);
            // Display error message or fallback data
            if (panelTempValue) panelTempValue.textContent = "Error";
            // ... update other fields to show error or N/A
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
            // Optionally, update UI based on backend confirmation
            // For now, we assume the switch reflects the desired state immediately
            // and fetchData will update with the actual state.
        } catch (error) {
            console.error("Error sending control command:", error);
            // Revert switch if command failed? Or show error.
            // coolingSwitch.checked = !newState; // Example: revert on error
        }
    }

    if (coolingSwitch) {
        coolingSwitch.addEventListener('change', handleCoolingSwitchChange);
    }

    function initializeChart() {
        panelTempChart = new Chart(panelTempGauge, {
            type: 'radialGauge',
            data: {
                datasets: [{
                    data: [0],
                    backgroundColor: ['rgba(77, 208, 225, 0.8)'],
                    borderWidth: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    }
                },
                scales: {
                    r: {
                        min: 1,
                        max: 80,
                        axis: 'r',
                        ticks: {
                            display: true,
                            stepSize: 10,
                            color: '#666',
                            z: 1
                        },
                        grid: {
                            color: '#ccc',
                            circular: true
                        },
                        pointLabels: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    // Initial data fetch
    initializeChart();
    fetchData();

    // Fetch data periodically
    setInterval(fetchData, 5000); // Fetch every 5 seconds
});
