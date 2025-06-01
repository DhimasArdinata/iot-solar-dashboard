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
    const coolingStatusIndicator = document.getElementById('coolingStatusIndicator'); // For the "Status Pendingin" card
    const coolingStatusText = document.getElementById('coolingStatusText'); // For the "Status Pendingin" card
    
    const themeToggleCheckbox = document.getElementById('themeToggleCheckbox');

    // NEW DOM Elements for Web Control Card
    const webOverrideSwitch = document.getElementById('webOverrideSwitch');
    const manualCoolerStateSwitch = document.getElementById('manualCoolerStateSwitch');
    const manualCoolerControlContainer = document.getElementById('manualCoolerControlContainer');


    // API URLs
    const API_URL = '/.netlify/functions/api/api/sensordata';
    const CONTROL_API_URL = '/.netlify/functions/api/api/control';
    const HISTORICAL_API_URL = '/.netlify/functions/api/api/historicaldata';
    const COOLING_SETTINGS_API_URL = '/.netlify/functions/api/api/cooling-settings';

    // Dashboard State
    let lastSuccessfulData = null;
    let totalEnergyJoules = 0; 
    const FETCH_INTERVAL_SECONDS = 5;

    // Sidebar and View Switching Elements
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const contentWrapper = document.getElementById('contentWrapper');
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const viewContainers = document.querySelectorAll('.view-container');

    // Data Table Elements & Pagination State
    const dataTableBody = document.getElementById('dataTableBody');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    let lastFetchedOldestTimestamp = null; 
    const RECORDS_PER_PAGE = 50; 

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
            lastSuccessfulData = data;
            const serverTimestamp = data.updatedAtISO ? new Date(data.updatedAtISO) : new Date();
            updateUI(lastSuccessfulData, serverTimestamp);
        } catch (error) {
            console.error("Could not fetch sensor data:", error);
            if (lastSuccessfulData) {
                const lastKnownServerTimestamp = lastSuccessfulData.updatedAtISO ? new Date(lastSuccessfulData.updatedAtISO) : new Date();
                updateUI(lastSuccessfulData, lastKnownServerTimestamp);
            } else {
                displayErrorState();
            }
        }
    }

    // --- Update Main Dashboard UI ---
    function updateUI(data, timestamp) {
        if (datetimeValue && timestamp) datetimeValue.textContent = timestamp.toLocaleString();
        if (panelTempValue) panelTempValue.textContent = data.panelTemp?.toFixed(1) + " °C" ?? "N/A";
        if (ambientTempValue) ambientTempValue.textContent = data.ambientTemp?.toFixed(1) + " °C" ?? "N/A";
        if (lightIntensityValue) lightIntensityValue.textContent = data.lightIntensity?.toFixed(0) + " lx" ?? "N/A";
        if (humidityValue) humidityValue.textContent = data.humidity?.toFixed(0) + " %" ?? "N/A";
        if (panelVoltageValue) panelVoltageValue.textContent = data.panelVoltage?.toFixed(1) + " V" ?? "N/A";
        if (panelCurrentValue) panelCurrentValue.textContent = data.panelCurrent?.toFixed(2) + " A" ?? "N/A";

        let currentPowerWatts = 0;
        if (data.panelVoltage !== undefined && data.panelCurrent !== undefined) {
            currentPowerWatts = data.panelVoltage * data.panelCurrent;
            if (panelPowerValue) panelPowerValue.textContent = currentPowerWatts.toFixed(1) + " W";
        } else {
            if (panelPowerValue) panelPowerValue.textContent = "N/A";
        }

        if (data.panelVoltage !== undefined && data.panelCurrent !== undefined) {
            const energyIncrementJoules = currentPowerWatts * FETCH_INTERVAL_SECONDS;
            totalEnergyJoules += energyIncrementJoules;
        }
        if (panelEnergyValue) panelEnergyValue.textContent = (totalEnergyJoules / 3600000).toFixed(3) + " kWh";

        // Update "Status Pendingin" card (this always shows the actual cooling status)
        if (coolingStatusIndicator && coolingStatusText) {
            const isOn = data.coolingStatus === true;
            coolingStatusIndicator.classList.toggle('on', isOn);
            coolingStatusText.textContent = data.coolingStatus !== undefined ? (isOn ? 'ON' : 'OFF') : "N/A";
        }

        // Update "Kontrol Pendingin Web" card switches
        if (webOverrideSwitch) {
            webOverrideSwitch.checked = data.manualMode === true; // manualMode from server indicates web override is active
        }
        if (manualCoolerStateSwitch && manualCoolerControlContainer) {
            if (data.manualMode === true) { // If web override is active
                manualCoolerControlContainer.style.opacity = '1';
                manualCoolerStateSwitch.disabled = false;
                // The actual coolingStatus (when manualMode is true) IS the manualCoolerState from server
                manualCoolerStateSwitch.checked = data.coolingStatus === true; 
            } else { // Web override is NOT active (ESP32 is in auto mode)
                manualCoolerControlContainer.style.opacity = '0.5';
                manualCoolerStateSwitch.disabled = true;
                // Reflect the ESP32's auto state on the (disabled) manual switch as well for consistency
                manualCoolerStateSwitch.checked = data.coolingStatus === true; 
            }
        }
    }

    // --- Display Error State for Main Dashboard ---
    function displayErrorState() {
        const errorText = "N/A";
        if (datetimeValue) datetimeValue.textContent = "Waiting for data...";
        [panelTempValue, ambientTempValue, lightIntensityValue, humidityValue, panelVoltageValue, panelCurrentValue, panelPowerValue].forEach(el => {
            if (el) el.textContent = errorText;
        });
        if (panelEnergyValue) panelEnergyValue.textContent = "0.000 kWh";
        if (coolingStatusText) coolingStatusText.textContent = "Error";
        if (coolingStatusIndicator) coolingStatusIndicator.classList.remove('on');
        // Also reset web control switches to a safe default (e.g., override off)
        if (webOverrideSwitch) webOverrideSwitch.checked = false;
        if (manualCoolerStateSwitch) {
            manualCoolerStateSwitch.checked = false;
            manualCoolerStateSwitch.disabled = true;
        }
        if (manualCoolerControlContainer) manualCoolerControlContainer.style.opacity = '0.5';
    }

    // --- Send Control Command Function ---
    async function sendControlCommand(manualMode, coolerState) {
        try {
            const response = await fetch(CONTROL_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ manualMode, coolerState }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: "Unknown error processing control command." }));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            console.log('Control command sent:', { manualMode, coolerState }, 'Result:', result);
            // UI will update via the next fetchData call, reflecting the new state from the server.
        } catch (error) {
            console.error("Error sending control command:", error);
            // Optionally, provide user feedback about the error
            // Reverting switch states here can be complex due to async nature;
            // rely on fetchData to eventually show the true state.
        }
    }

    // --- Event Listener for Web Override Switch ---
    if (webOverrideSwitch) {
        webOverrideSwitch.addEventListener('change', () => {
            const isWebOverrideActive = webOverrideSwitch.checked;
            if (manualCoolerStateSwitch && manualCoolerControlContainer) {
                manualCoolerStateSwitch.disabled = !isWebOverrideActive;
                manualCoolerControlContainer.style.opacity = isWebOverrideActive ? '1' : '0.5';
            }
            if (isWebOverrideActive) {
                // When web override is turned ON, send current state of manualCoolerStateSwitch
                sendControlCommand(true, manualCoolerStateSwitch ? manualCoolerStateSwitch.checked : false);
            } else {
                // When web override is turned OFF, tell ESP32 to go to auto mode
                sendControlCommand(false, false); // coolerState: false is a safe default
            }
        });
    }

    // --- Event Listener for Manual Cooler State Switch ---
    if (manualCoolerStateSwitch) {
        manualCoolerStateSwitch.addEventListener('change', () => {
            if (webOverrideSwitch && webOverrideSwitch.checked) { // Only send if web override is active
                sendControlCommand(true, manualCoolerStateSwitch.checked);
            }
        });
    }
    
    // --- Theme Switcher Logic ---
    function applyTheme(theme) {
        document.body.classList.toggle('dark-theme', theme === 'dark');
        if (themeToggleCheckbox) themeToggleCheckbox.checked = (theme === 'dark');
    }
    function toggleTheme() {
        const newTheme = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
        applyTheme(newTheme); localStorage.setItem('theme', newTheme);
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
    if (sidebarToggle) sidebarToggle.addEventListener('click', () => (sidebar?.classList.contains('open') ? closeSidebar() : openSidebar()));
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);

    sidebarLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetViewId = link.getAttribute('data-view');
            viewContainers.forEach(container => container.classList.toggle('active-view', container.id === targetViewId));
            sidebarLinks.forEach(s_link => s_link.classList.remove('active-link'));
            link.classList.add('active-link');
            if (window.innerWidth < 769) closeSidebar();

            if (targetViewId === 'tableView') loadTableData(false);
            if (targetViewId === 'settingsView') loadCoolingSettings();
        });
    });

    // --- Data Table Logic ---
    async function loadTableData(fetchMore = false) {
        if (!dataTableBody) return;
        if (!fetchMore) {
            dataTableBody.innerHTML = `<tr><td colspan="10">Loading historical data...</td></tr>`;
            lastFetchedOldestTimestamp = null;
        } else {
            if (loadMoreBtn) loadMoreBtn.disabled = true;
            dataTableBody.querySelector('.loading-more-row')?.remove();
            const loadingRow = dataTableBody.insertRow(); // Appends at the end
            loadingRow.className = 'loading-more-row';
            loadingRow.innerHTML = `<td colspan="10">Loading more data...</td>`;
        }

        try {
            let url = `${HISTORICAL_API_URL}?limit=${RECORDS_PER_PAGE}`;
            if (fetchMore && lastFetchedOldestTimestamp) {
                url += `&startAfterTimestamp=${encodeURIComponent(lastFetchedOldestTimestamp)}`;
            }
            
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const historicalData = await response.json();

            dataTableBody.querySelector('.loading-more-row')?.remove();
            if (!fetchMore) dataTableBody.innerHTML = ''; 

            if (historicalData.length === 0) {
                if (!fetchMore) dataTableBody.innerHTML = `<tr><td colspan="10">No historical data available.</td></tr>`;
                if (loadMoreBtn) loadMoreBtn.style.display = 'none';
                return;
            }
            
            const chronologicalData = historicalData.slice().reverse();
            let rowsToAppendHTML = '';

            chronologicalData.forEach((record, index) => {
                let energyForThisIntervalkWh = 0;
                const currentTimestamp = record.updatedAtISO ? new Date(record.updatedAtISO) : null;
                if (currentTimestamp && record.panelPower !== null && record.panelPower !== undefined) {
                    if (index < chronologicalData.length - 1) {
                        const nextRecord = chronologicalData[index + 1];
                        const nextTimestamp = nextRecord.updatedAtISO ? new Date(nextRecord.updatedAtISO) : null;
                        if (nextTimestamp) {
                            const timeDeltaSeconds = (nextTimestamp.getTime() - currentTimestamp.getTime()) / 1000;
                            if (timeDeltaSeconds > 0) {
                                energyForThisIntervalkWh = (record.panelPower / 1000) * (timeDeltaSeconds / 3600);
                            }
                        }
                    }
                }
                const coolingStatusVal = record.coolingStatus !== undefined ? (record.coolingStatus ? 'ON' : 'OFF') :
                                     ((record.ssr1 || record.ssr2 || record.ssr3 || record.ssr4) ? 'ON' : 'OFF');
                rowsToAppendHTML += `
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
            dataTableBody.innerHTML += rowsToAppendHTML;

            if (historicalData.length > 0) {
                lastFetchedOldestTimestamp = historicalData[historicalData.length - 1].updatedAtISO;
            }
            if (loadMoreBtn) {
                loadMoreBtn.style.display = historicalData.length === RECORDS_PER_PAGE ? 'inline-block' : 'none';
                loadMoreBtn.disabled = false;
            }
        } catch (error) {
            console.error("Could not fetch historical data:", error);
            dataTableBody.querySelector('.loading-more-row')?.remove();
            if (!fetchMore && dataTableBody) dataTableBody.innerHTML = `<tr><td colspan="10">Error loading historical data.</td></tr>`;
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
        }
    }
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => loadTableData(true));

    // --- Cooling Settings Logic ---
    async function loadCoolingSettings() {
        if (!ambientTempThresholdInput || !currentThresholdValueSpan || !settingsStatusMsg) return;
        try {
            settingsStatusMsg.textContent = 'Memuat pengaturan...';
            settingsStatusMsg.className = 'status-message';
            const response = await fetch(COOLING_SETTINGS_API_URL);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const settings = await response.json();
            if (settings && settings.ambientTempCoolingThreshold !== null && settings.ambientTempCoolingThreshold !== undefined) {
                ambientTempThresholdInput.value = parseFloat(settings.ambientTempCoolingThreshold).toFixed(1);
                currentThresholdValueSpan.textContent = parseFloat(settings.ambientTempCoolingThreshold).toFixed(1);
                settingsStatusMsg.textContent = '';
            } else {
                currentThresholdValueSpan.textContent = "Belum diatur";
                ambientTempThresholdInput.value = '';
                settingsStatusMsg.textContent = 'Ambang batas belum diatur dari server.';
                settingsStatusMsg.classList.remove('success', 'error');
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
        settingsStatusMsg.className = 'status-message';
        try {
            const response = await fetch(COOLING_SETTINGS_API_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ambientTempCoolingThreshold: thresholdValue }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || `HTTP error! status: ${response.status}`);
            settingsStatusMsg.textContent = 'Pengaturan berhasil disimpan!';
            settingsStatusMsg.className = 'status-message success';
            if (currentThresholdValueSpan && result.newSettings?.ambientTempCoolingThreshold !== undefined) {
                currentThresholdValueSpan.textContent = parseFloat(result.newSettings.ambientTempCoolingThreshold).toFixed(1);
            }
        } catch (error) {
            console.error("Error saving cooling settings:", error);
            settingsStatusMsg.textContent = `Gagal menyimpan: ${error.message}`;
            settingsStatusMsg.className = 'status-message error';
        }
    }
    if (saveCoolingSettingsBtn) saveCoolingSettingsBtn.addEventListener('click', saveCoolingSettings);

    // Initial Setup
    fetchData(); 
    setInterval(fetchData, FETCH_INTERVAL_SECONDS * 1000); 

    const initialActiveView = document.querySelector('.view-container.active-view');
    if (initialActiveView) {
        if (initialActiveView.id === 'tableView') loadTableData(false);
        if (initialActiveView.id === 'settingsView') loadCoolingSettings();
    } else { 
        document.getElementById('dashboardView')?.classList.add('active-view');
        document.querySelector('.sidebar-link[data-view="dashboardView"]')?.classList.add('active-link');
    }
});
