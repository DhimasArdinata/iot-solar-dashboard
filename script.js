document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements for Dashboard
    const panelTempValue = document.getElementById('panelTempValue');
    const ambientTempValue = document.getElementById('ambientTempValue');
    const lightIntensityValue = document.getElementById('lightIntensityValue');
    const humidityValue = document.getElementById('humidityValue');
    const panelEnergyValue = document.getElementById('panelEnergyValue');
    const panelVoltageValue = document.getElementById('panelVoltageValue');
    const panelCurrentValue = document.getElementById('panelCurrentValue');
    const panelPowerValue = document.getElementById('panelPowerValue');
    const datetimeValue = document.getElementById('datetimeValue');
    const coolingStatusIndicator = document.getElementById('coolingStatusIndicator');
    const coolingStatusText = document.getElementById('coolingStatusText');
    const coolingSwitch = document.getElementById('coolingSwitch');
    const themeToggleCheckbox = document.getElementById('themeToggleCheckbox');

    // API URLs
    const API_URL = '/.netlify/functions/api/api/sensordata';
    const CONTROL_API_URL = '/.netlify/functions/api/api/control';
    const HISTORICAL_API_URL = '/.netlify/functions/api/api/historicaldata';
    const COOLING_SETTINGS_API_URL = '/.netlify/functions/api/api/cooling-settings';

    // Dashboard State
    let lastSuccessfulData = null;
    let lastSuccessfulTimestamp = null;
    let totalEnergyJoules = 0;
    const FETCH_INTERVAL_SECONDS = 5;

    // Sidebar and View Switching Elements
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const contentWrapper = document.getElementById('contentWrapper');
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const viewContainers = document.querySelectorAll('.view-container');

    // Data Table Elements
    const dataTableBody = document.getElementById('dataTableBody');

    // Settings View Elements
    const ambientTempThresholdInput = document.getElementById('ambientTempThresholdInput');
    const saveCoolingSettingsBtn = document.getElementById('saveCoolingSettingsBtn');
    const currentThresholdValueSpan = document.getElementById('currentThresholdValue');
    const settingsStatusMsg = document.getElementById('settingsStatusMsg');

    // --- Fetch and Update Main Dashboard Data ---
    async function fetchData() {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            console.log('Fetched data:', data);
            lastSuccessfulData = data;
            lastSuccessfulTimestamp = new Date(); // Use client time for "last updated" display
            updateUI(lastSuccessfulData, lastSuccessfulTimestamp);
        } catch (error) {
            console.error("Could not fetch sensor data:", error);
            if (lastSuccessfulData && lastSuccessfulTimestamp) {
                updateUI(lastSuccessfulData, lastSuccessfulTimestamp);
            } else {
                displayErrorState();
            }
        }
    }

    // --- Update Main Dashboard UI ---
    function updateUI(data, timestamp) {
        if (datetimeValue && timestamp) datetimeValue.textContent = timestamp.toLocaleString();
        if (panelTempValue) panelTempValue.textContent = data.panelTemp !== undefined ? `${data.panelTemp.toFixed(1)} °C` : "N/A";
        if (ambientTempValue) ambientTempValue.textContent = data.ambientTemp !== undefined ? `${data.ambientTemp.toFixed(1)} °C` : "N/A";
        if (lightIntensityValue) lightIntensityValue.textContent = data.lightIntensity !== undefined ? `${data.lightIntensity.toFixed(0)} lx` : "N/A";
        if (humidityValue) humidityValue.textContent = data.humidity !== undefined ? `${data.humidity.toFixed(0)} %` : "N/A";
        if (panelVoltageValue) panelVoltageValue.textContent = data.panelVoltage !== undefined ? `${data.panelVoltage.toFixed(1)} V` : "N/A";
        if (panelCurrentValue) panelCurrentValue.textContent = data.panelCurrent !== undefined ? `${data.panelCurrent.toFixed(2)} A` : "N/A";

        let currentPowerWatts = 0;
        if (data.panelVoltage !== undefined && data.panelCurrent !== undefined) {
            currentPowerWatts = data.panelVoltage * data.panelCurrent;
            if (panelPowerValue) panelPowerValue.textContent = `${currentPowerWatts.toFixed(1)} W`;
        } else {
            if (panelPowerValue) panelPowerValue.textContent = "N/A";
        }

        if (data.panelVoltage !== undefined && data.panelCurrent !== undefined) {
            const energyIncrementJoules = currentPowerWatts * FETCH_INTERVAL_SECONDS;
            totalEnergyJoules += energyIncrementJoules;
        }
        if (panelEnergyValue) panelEnergyValue.textContent = `${(totalEnergyJoules / 3600000).toFixed(3)} kWh`;

        if (coolingStatusIndicator && coolingStatusText && data.coolingStatus !== undefined) {
            coolingStatusIndicator.classList.toggle('on', data.coolingStatus);
            coolingStatusText.textContent = data.coolingStatus ? 'ON' : 'OFF';
        } else if (coolingStatusIndicator && coolingStatusText) {
            coolingStatusText.textContent = "N/A";
            coolingStatusIndicator.classList.remove('on');
        }
        if (coolingSwitch && data.coolingStatus !== undefined) coolingSwitch.checked = data.coolingStatus;
    }

    // --- Display Error State for Main Dashboard ---
    function displayErrorState() {
        const errorText = "N/A";
        if (datetimeValue) datetimeValue.textContent = "Waiting for data...";
        [panelTempValue, ambientTempValue, lightIntensityValue, humidityValue, panelEnergyValue, panelVoltageValue, panelCurrentValue, panelPowerValue].forEach(el => {
            if (el) el.textContent = errorText;
        });
        if (panelEnergyValue) panelEnergyValue.textContent = "0.000 kWh"; // Or errorText
        if (coolingStatusText) coolingStatusText.textContent = "Error";
        if (coolingStatusIndicator) coolingStatusIndicator.classList.remove('on');
    }

    // --- Control Switch Handler ---
    async function handleCoolingSwitchChange() {
        if (!coolingSwitch) return;
        const newState = coolingSwitch.checked;
        try {
            const response = await fetch(CONTROL_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ manualMode: true, coolerState: newState }),
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const result = await response.json();
            console.log('Control command result:', result);
            // fetchData will update the actual state
        } catch (error) {
            console.error("Error sending control command:", error);
            coolingSwitch.checked = !newState; // Revert UI
            if (coolingStatusIndicator && coolingStatusText) {
                coolingStatusIndicator.classList.toggle('on', !newState);
                coolingStatusText.textContent = !newState ? 'ON' : 'OFF';
            }
        }
    }
    if (coolingSwitch) coolingSwitch.addEventListener('change', handleCoolingSwitchChange);

    // --- Theme Switcher Logic ---
    function applyTheme(theme) {
        document.body.classList.toggle('dark-theme', theme === 'dark');
        if (themeToggleCheckbox) themeToggleCheckbox.checked = (theme === 'dark');
    }
    function toggleTheme() {
        const newTheme = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
        applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
    }
    if (themeToggleCheckbox) themeToggleCheckbox.addEventListener('change', toggleTheme);
    applyTheme(localStorage.getItem('theme') || 'light');

    // --- Sidebar and View Switching Logic ---
    function openSidebar() {
        if (sidebar) sidebar.classList.add('open');
        if (contentWrapper) contentWrapper.classList.add('sidebar-open');
    }
    function closeSidebar() {
        if (sidebar) sidebar.classList.remove('open');
        if (contentWrapper) contentWrapper.classList.remove('sidebar-open');
    }
    if (sidebarToggle) sidebarToggle.addEventListener('click', () => (sidebar && sidebar.classList.contains('open') ? closeSidebar() : openSidebar()));
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);

    sidebarLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetViewId = link.getAttribute('data-view');
            viewContainers.forEach(container => container.classList.toggle('active-view', container.id === targetViewId));
            sidebarLinks.forEach(s_link => s_link.classList.remove('active-link'));
            link.classList.add('active-link');
            if (window.innerWidth < 769) closeSidebar();

            if (targetViewId === 'tableView') loadTableData();
            if (targetViewId === 'settingsView') loadCoolingSettings();
        });
    });

    // --- Data Table Logic ---
    async function loadTableData(limit = 50, startAfterTimestamp = null) {
        if (!dataTableBody) return;
        dataTableBody.innerHTML = `<tr><td colspan="10">Loading historical data...</td></tr>`;
        try {
            let url = `${HISTORICAL_API_URL}?limit=${limit}`;
            if (startAfterTimestamp) url += `&startAfterTimestamp=${encodeURIComponent(startAfterTimestamp)}`;
            
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const historicalData = await response.json(); // API sends newest first

            if (historicalData.length === 0) {
                dataTableBody.innerHTML = `<tr><td colspan="10">No historical data available.</td></tr>`;
                return;
            }

            const chronologicalData = historicalData.slice().reverse(); // Sort to oldest first for processing
            let tableRowsHtml = '';

            chronologicalData.forEach((record, index) => {
                let energyForThisIntervalkWh = 0;
                const currentTimestamp = record.updatedAtISO ? new Date(record.updatedAtISO) : null;

                // Calculate energy for the interval starting from this record's timestamp until the next record's timestamp
                if (currentTimestamp && record.panelPower !== null && record.panelPower !== undefined) {
                    if (index < chronologicalData.length - 1) { // If there is a next record
                        const nextRecord = chronologicalData[index + 1];
                        const nextTimestamp = nextRecord.updatedAtISO ? new Date(nextRecord.updatedAtISO) : null;
                        
                        if (nextTimestamp) {
                            const timeDeltaSeconds = (nextTimestamp.getTime() - currentTimestamp.getTime()) / 1000;
                            if (timeDeltaSeconds > 0) {
                                const timeDeltaHours = timeDeltaSeconds / 3600;
                                // Energy (kWh) = Power (kW) * time (h)
                                // panelPower is in Watts, so convert to kW
                                energyForThisIntervalkWh = (record.panelPower / 1000) * timeDeltaHours;
                            }
                        }
                    }
                    // For the very last record in this batch (chronologically), energyForThisIntervalkWh remains 0
                    // as we don't know the duration until the "next" un-fetched data point.
                }
                
                const coolingStatusVal = record.coolingStatus !== undefined ? (record.coolingStatus ? 'ON' : 'OFF') : 
                                     ((record.ssr1 || record.ssr3 || record.ssr4) ? 'ON' : 'OFF'); // Fallback if coolingStatus field itself isn't in historical record

                tableRowsHtml += `
                    <tr>
                        <td>${currentTimestamp ? currentTimestamp.toLocaleString() : 'N/A'}</td>
                        <td>${record.panelTemp?.toFixed(1) ?? 'N/A'}</td>
                        <td>${record.ambientTemp?.toFixed(1) ?? 'N/A'}</td>
                        <td>${record.lightIntensity?.toFixed(0) ?? 'N/A'}</td>
                        <td>${record.humidity?.toFixed(0) ?? 'N/A'}</td>
                        <td>${record.panelVoltage?.toFixed(1) ?? 'N/A'}</td>
                        <td>${record.panelCurrent?.toFixed(2) ?? 'N/A'}</td>
                        <td>${record.panelPower?.toFixed(1) ?? 'N/A'}</td>
                        <td>${energyForThisIntervalkWh.toFixed(5)}</td>
                        <td>${coolingStatusVal}</td>
                    </tr>`;
            });
            dataTableBody.innerHTML = tableRowsHtml;
        } catch (error) {
            console.error("Could not fetch historical data:", error);
            if (dataTableBody) dataTableBody.innerHTML = `<tr><td colspan="10">Error loading historical data.</td></tr>`;
        }
    }

    // --- Cooling Settings Logic ---
    async function loadCoolingSettings() {
        if (!ambientTempThresholdInput || !currentThresholdValueSpan || !settingsStatusMsg) return;
        try {
            settingsStatusMsg.textContent = 'Memuat pengaturan...';
            settingsStatusMsg.className = 'status-message'; // Clear previous status classes

            const response = await fetch(COOLING_SETTINGS_API_URL);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const settings = await response.json();
            
            if (settings && settings.ambientTempCoolingThreshold !== null && settings.ambientTempCoolingThreshold !== undefined) {
                ambientTempThresholdInput.value = parseFloat(settings.ambientTempCoolingThreshold).toFixed(1);
                currentThresholdValueSpan.textContent = parseFloat(settings.ambientTempCoolingThreshold).toFixed(1);
                settingsStatusMsg.textContent = ''; // Clear loading message
            } else {
                currentThresholdValueSpan.textContent = "Belum diatur";
                ambientTempThresholdInput.value = ''; // Clear input if not set
                settingsStatusMsg.textContent = 'Ambang batas belum diatur dari server.';
                settingsStatusMsg.classList.remove('success', 'error'); // Clear any previous status
            }
        } catch (error) {
            console.error("Error loading cooling settings:", error);
            currentThresholdValueSpan.textContent = "Error";
            settingsStatusMsg.textContent = 'Gagal memuat pengaturan.';
            settingsStatusMsg.className = 'status-message error';
        }
    }

    async function saveCoolingSettings() {
        if (!ambientTempThresholdInput || !settingsStatusMsg) return;
        const thresholdValue = parseFloat(ambientTempThresholdInput.value);

        if (isNaN(thresholdValue) || thresholdValue < 0 || thresholdValue > 50) {
            settingsStatusMsg.textContent = 'Nilai threshold tidak valid (harus antara 0-50).';
            settingsStatusMsg.className = 'status-message error';
            return;
        }

        settingsStatusMsg.textContent = 'Menyimpan...';
        settingsStatusMsg.className = 'status-message'; // Clear previous status classes

        try {
            const response = await fetch(COOLING_SETTINGS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ambientTempCoolingThreshold: thresholdValue }),
            });
            const result = await response.json(); // Try to parse JSON regardless of response.ok for error messages

            if (!response.ok) {
                throw new Error(result.message || `HTTP error! status: ${response.status}`);
            }
            
            console.log('Save settings result:', result);
            settingsStatusMsg.textContent = 'Pengaturan berhasil disimpan!';
            settingsStatusMsg.className = 'status-message success';
            if (currentThresholdValueSpan && result.newSettings && result.newSettings.ambientTempCoolingThreshold !== undefined) {
                currentThresholdValueSpan.textContent = parseFloat(result.newSettings.ambientTempCoolingThreshold).toFixed(1);
            }
        } catch (error) {
            console.error("Error saving cooling settings:", error);
            settingsStatusMsg.textContent = `Gagal menyimpan: ${error.message}`;
            settingsStatusMsg.className = 'status-message error';
        }
    }

    if (saveCoolingSettingsBtn) {
        saveCoolingSettingsBtn.addEventListener('click', saveCoolingSettings);
    }

    // Initial data fetch for dashboard
    fetchData();
    setInterval(fetchData, FETCH_INTERVAL_SECONDS * 1000);

    // Load settings if settingsView is active by default (e.g. if URL hash points to it)
    // Or if the default view set in HTML is settingsView
    if (document.querySelector('#settingsView.active-view')) {
        loadCoolingSettings();
    }
});
