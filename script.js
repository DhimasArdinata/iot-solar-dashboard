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
    let totalEnergyJoules = 0; // For session-based energy accumulation on dashboard card
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
    let lastFetchedOldestTimestamp = null; // For data table pagination: ISO string
    const RECORDS_PER_PAGE = 50; // Should match backend limit if not passed in URL

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

        if (coolingStatusIndicator && coolingStatusText) {
            const isOn = data.coolingStatus === true;
            coolingStatusIndicator.classList.toggle('on', isOn);
            coolingStatusText.textContent = data.coolingStatus !== undefined ? (isOn ? 'ON' : 'OFF') : "N/A";
        }
        if (coolingSwitch && data.coolingStatus !== undefined) coolingSwitch.checked = data.coolingStatus;
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
    }

    // --- Control Switch Handler ---
    async function handleCoolingSwitchChange() {
        if (!coolingSwitch) return;
        const newState = coolingSwitch.checked;
        try {
            const response = await fetch(CONTROL_API_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ manualMode: true, coolerState: newState }),
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            await response.json(); // console.log('Control command result:', result);
        } catch (error) {
            console.error("Error sending control command:", error);
            coolingSwitch.checked = !newState;
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

            if (targetViewId === 'tableView') loadTableData(false); // Initial load for table view
            if (targetViewId === 'settingsView') loadCoolingSettings();
        });
    });

    // --- Data Table Logic ---
    async function loadTableData(fetchMore = false) {
        if (!dataTableBody) return;
        if (!fetchMore) { // Initial load or view switch
            dataTableBody.innerHTML = `<tr><td colspan="10">Loading historical data...</td></tr>`;
            lastFetchedOldestTimestamp = null; // Reset for a fresh load
        } else {
            if (loadMoreBtn) loadMoreBtn.disabled = true; // Disable button while loading more
            dataTableBody.querySelector('.loading-more-row')?.remove(); // Remove previous loading more indicator
            const loadingRow = dataTableBody.insertRow();
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
            const historicalData = await response.json(); // API sends newest first

            if (!fetchMore) dataTableBody.innerHTML = ''; // Clear for initial load after fetch success

            if (historicalData.length === 0 && !fetchMore) {
                dataTableBody.innerHTML = `<tr><td colspan="10">No historical data available.</td></tr>`;
                if (loadMoreBtn) loadMoreBtn.style.display = 'none';
                return;
            }
            if (historicalData.length === 0 && fetchMore) {
                 dataTableBody.querySelector('.loading-more-row')?.remove();
                 // Optionally add a message "No more data"
                if (loadMoreBtn) loadMoreBtn.style.display = 'none';
                return;
            }
            
            dataTableBody.querySelector('.loading-more-row')?.remove();


            const chronologicalData = historicalData.slice().reverse(); // Sort to oldest first for processing
            let rowsToAppend = '';

            chronologicalData.forEach((record, index) => {
                let energyForThisIntervalkWh = 0;
                const currentTimestamp = record.updatedAtISO ? new Date(record.updatedAtISO) : null;

                if (currentTimestamp && record.panelPower !== null && record.panelPower !== undefined) {
                    // For energy calculation: use this record's power and duration until NEXT record
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
                                     ((record.ssr1 || record.ssr3 || record.ssr4) ? 'ON' : 'OFF');
                rowsToAppend += `
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
            dataTableBody.innerHTML += rowsToAppend; // Append new rows

            if (historicalData.length > 0) {
                // API returns newest first, so historicalData[length-1] is the oldest in this batch
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
            if (loadMoreBtn) loadMoreBtn.style.display = 'none'; // Hide on error
        }
    }
    
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => loadTableData(true));
    }


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
    fetchData(); // Initial fetch for dashboard cards
    setInterval(fetchData, FETCH_INTERVAL_SECONDS * 1000); // Periodic fetch for dashboard cards

    // Initial view setup (ensure correct view is active and loads its data if necessary)
    const initialActiveView = document.querySelector('.view-container.active-view');
    if (initialActiveView) {
        if (initialActiveView.id === 'tableView') loadTableData(false);
        if (initialActiveView.id === 'settingsView') loadCoolingSettings();
    } else { // Default to dashboardView if no view is marked active in HTML
        document.getElementById('dashboardView')?.classList.add('active-view');
        document.querySelector('.sidebar-link[data-view="dashboardView"]')?.classList.add('active-link');
    }
});
