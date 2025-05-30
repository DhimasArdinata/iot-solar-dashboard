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

    let lastSuccessfulData = null; // To store the last successfully fetched data
    let lastSuccessfulTimestamp = null; // To store the timestamp of the last successful fetch
    const coolingSwitch = document.getElementById('coolingSwitch');
    const themeToggleCheckbox = document.getElementById('themeToggleCheckbox');

    const API_URL = '/.netlify/functions/api/api/sensordata';
    const CONTROL_API_URL = '/.netlify/functions/api/api/control';

    let totalEnergyJoules = 0; // Variable to accumulate energy in Joules
    const FETCH_INTERVAL_SECONDS = 5; // Define fetch interval in seconds

    // --- Fetch and Update Data ---
    async function fetchData() {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log('Fetched data:', data);

            // Store successful data and timestamp
            lastSuccessfulData = data;
            lastSuccessfulTimestamp = new Date();

            // Update UI elements with new data
            updateUI(lastSuccessfulData, lastSuccessfulTimestamp);

        } catch (error) {
            console.error("Could not fetch sensor data:", error);
            // If fetch fails, try to display last known good data
            if (lastSuccessfulData && lastSuccessfulTimestamp) {
                console.log('Displaying last known good data due to fetch error.');
                updateUI(lastSuccessfulData, lastSuccessfulTimestamp); // Display last known good data
            } else {
                // If no data has ever been successfully fetched, display error/N/A
                displayErrorState();
            }
        }
    }

    // --- Update UI Function ---
    function updateUI(data, timestamp) {
        if (datetimeValue && timestamp) {
            datetimeValue.textContent = timestamp.toLocaleString();
        }

        if (panelTempValue && data.panelTemp !== undefined) {
            panelTempValue.textContent = `${data.panelTemp.toFixed(1)} °C`;
        } else if (panelTempValue) {
            panelTempValue.textContent = "N/A";
        }

        if (ambientTempValue && data.ambientTemp !== undefined) {
            ambientTempValue.textContent = `${data.ambientTemp.toFixed(1)} °C`;
        } else if (ambientTempValue) {
            ambientTempValue.textContent = "N/A";
        }

        if (lightIntensityValue && data.lightIntensity !== undefined) {
            lightIntensityValue.textContent = `${data.lightIntensity.toFixed(0)} lx`;
        } else if (lightIntensityValue) {
            lightIntensityValue.textContent = "N/A";
        }

        if (humidityValue && data.humidity !== undefined) {
            humidityValue.textContent = `${data.humidity.toFixed(0)} %`;
        } else if (humidityValue) {
            humidityValue.textContent = "N/A";
        }
        
        if (panelVoltageValue && data.panelVoltage !== undefined) {
            panelVoltageValue.textContent = `${data.panelVoltage.toFixed(1)} V`;
        } else if (panelVoltageValue) {
            panelVoltageValue.textContent = "N/A";
        }

        if (panelCurrentValue && data.panelCurrent !== undefined) {
            panelCurrentValue.textContent = `${data.panelCurrent.toFixed(2)} A`;
        } else if (panelCurrentValue) {
            panelCurrentValue.textContent = "N/A";
        }

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
        // This calculation should ideally happen only when new data arrives,
        // or be based on the duration since the last *new* data point.
        // For simplicity, if we are displaying stale data, energy accumulation might pause or be handled differently.
        // Here, we assume energy accumulation continues based on the *displayed* power, even if stale.
        // A more robust solution would involve timestamps from the ESP.
        if (data.panelVoltage !== undefined && data.panelCurrent !== undefined) { // Only accumulate if power can be calculated
            const energyIncrementJoules = currentPowerWatts * FETCH_INTERVAL_SECONDS; // This assumes fetchData interval
            totalEnergyJoules += energyIncrementJoules;
        }
        
        const totalEnergyKWh = totalEnergyJoules / 3600000;
        if (panelEnergyValue) {
            panelEnergyValue.textContent = `${totalEnergyKWh.toFixed(3)} kWh`;
        }

        if (coolingStatusIndicator && coolingStatusText && data.coolingStatus !== undefined) {
            if (data.coolingStatus) {
                coolingStatusIndicator.classList.add('on');
                coolingStatusText.textContent = 'ON';
            } else {
                coolingStatusIndicator.classList.remove('on');
                coolingStatusText.textContent = 'OFF';
            }
        } else if (coolingStatusIndicator && coolingStatusText) {
            coolingStatusText.textContent = "N/A";
            coolingStatusIndicator.classList.remove('on');
        }

        if (coolingSwitch && data.coolingStatus !== undefined) {
            coolingSwitch.checked = data.coolingStatus;
        }
    }

    // --- Display Error State Function ---
    function displayErrorState() {
        const errorText = "N/A";
        if (datetimeValue) datetimeValue.textContent = "Waiting for data...";
        if (panelTempValue) panelTempValue.textContent = errorText;
        if (ambientTempValue) ambientTempValue.textContent = errorText;
        if (lightIntensityValue) lightIntensityValue.textContent = errorText;
        if (humidityValue) humidityValue.textContent = errorText;
        if (panelEnergyValue) panelEnergyValue.textContent = errorText; // Or "0.000 kWh"
        if (panelVoltageValue) panelVoltageValue.textContent = errorText;
        if (panelCurrentValue) panelCurrentValue.textContent = errorText;
        if (panelPowerValue) panelPowerValue.textContent = errorText;
        if (coolingStatusText) coolingStatusText.textContent = "Error";
        if (coolingStatusIndicator) coolingStatusIndicator.classList.remove('on');
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

    // Initial data fetch
    fetchData(); 

    // Fetch data periodically
    setInterval(fetchData, FETCH_INTERVAL_SECONDS * 1000); // Fetch every FETCH_INTERVAL_SECONDS

    // --- Theme Switcher Logic ---
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
            if (themeToggleCheckbox) themeToggleCheckbox.checked = true;
        } else {
            document.body.classList.remove('dark-theme');
            if (themeToggleCheckbox) themeToggleCheckbox.checked = false;
        }
    }

    function toggleTheme() {
        const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
    }

    if (themeToggleCheckbox) {
        themeToggleCheckbox.addEventListener('change', toggleTheme);
    }

    // Load saved theme from localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        applyTheme('light'); // Default to light
    }

    // --- Sidebar and View Switching Logic ---
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const contentWrapper = document.getElementById('contentWrapper');
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const viewContainers = document.querySelectorAll('.view-container');

    function openSidebar() {
        if (sidebar) sidebar.classList.add('open');
        if (contentWrapper) contentWrapper.classList.add('sidebar-open');
    }

    function closeSidebar() {
        if (sidebar) sidebar.classList.remove('open');
        if (contentWrapper) contentWrapper.classList.remove('sidebar-open');
    }

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            if (sidebar && sidebar.classList.contains('open')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        });
    }

    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', closeSidebar);
    }

    // Optional: Close sidebar when clicking outside of it on larger screens
    // document.addEventListener('click', (event) => {
    //     if (sidebar && sidebar.classList.contains('open') && !sidebar.contains(event.target) && !sidebarToggle.contains(event.target)) {
    //         if (window.innerWidth > 768) { // Example: only for larger screens
    //             closeSidebar();
    //         }
    //     }
    // });

    sidebarLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetViewId = link.getAttribute('data-view');

            // Switch active view
            viewContainers.forEach(container => {
                container.classList.remove('active-view');
                if (container.id === targetViewId) {
                    container.classList.add('active-view');
                }
            });

            // Update active link state
            sidebarLinks.forEach(s_link => s_link.classList.remove('active-link'));
            link.classList.add('active-link');

            // Optionally close sidebar after selection (good for mobile)
            if (window.innerWidth < 769) { // Or always, depending on preference
                 closeSidebar();
            }

            // If switching to table view, you might want to load/refresh table data here
            if (targetViewId === 'tableView') {
                loadTableData(); 
            }
        });
    });

    // --- Data Table Logic ---
    const dataTableBody = document.getElementById('dataTableBody');
    const HISTORICAL_API_URL = '/.netlify/functions/api/api/historicaldata';

    async function loadTableData(limit = 50, startAfterTimestamp = null) {
        if (!dataTableBody) return;

        dataTableBody.innerHTML = `<tr><td colspan="10">Loading historical data...</td></tr>`; // Show loading state

        try {
            let url = `${HISTORICAL_API_URL}?limit=${limit}`;
            if (startAfterTimestamp) {
                url += `&startAfterTimestamp=${encodeURIComponent(startAfterTimestamp)}`;
            }
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const historicalData = await response.json();
            console.log('Fetched historical data:', historicalData);

            if (historicalData.length === 0) {
                dataTableBody.innerHTML = `<tr><td colspan="10">No historical data available.</td></tr>`;
                return;
            }

            // Data comes newest first, reverse for chronological processing for energy calculation
            const chronologicalData = historicalData.slice().reverse(); 
            let tableRowsHtml = '';
            let previousTimestamp = null;

            chronologicalData.forEach((record, index) => {
                let energyForIntervalkWh = 0;
                const currentTimestamp = record.updatedAtISO ? new Date(record.updatedAtISO) : null;

                if (previousTimestamp && currentTimestamp && record.panelPower !== null && record.panelPower !== undefined) {
                    const timeDeltaSeconds = (currentTimestamp.getTime() - previousTimestamp.getTime()) / 1000;
                    if (timeDeltaSeconds > 0) {
                        const timeDeltaHours = timeDeltaSeconds / 3600;
                        // Energy (kWh) = Power (kW) * time (h)
                        // panelPower is in Watts, so convert to kW
                        energyForIntervalkWh = (record.panelPower / 1000) * timeDeltaHours;
                    }
                }
                
                // Prepare data for display, handling potential nulls
                const displayRecord = {
                    timestamp: currentTimestamp ? currentTimestamp.toLocaleString() : 'N/A',
                    panelTemp: record.panelTemp !== null && record.panelTemp !== undefined ? record.panelTemp.toFixed(1) : 'N/A',
                    ambientTemp: record.ambientTemp !== null && record.ambientTemp !== undefined ? record.ambientTemp.toFixed(1) : 'N/A',
                    lightIntensity: record.lightIntensity !== null && record.lightIntensity !== undefined ? record.lightIntensity.toFixed(0) : 'N/A',
                    humidity: record.humidity !== null && record.humidity !== undefined ? record.humidity.toFixed(0) : 'N/A',
                    panelVoltage: record.panelVoltage !== null && record.panelVoltage !== undefined ? record.panelVoltage.toFixed(1) : 'N/A',
                    panelCurrent: record.panelCurrent !== null && record.panelCurrent !== undefined ? record.panelCurrent.toFixed(2) : 'N/A',
                    panelPower: record.panelPower !== null && record.panelPower !== undefined ? record.panelPower.toFixed(1) : 'N/A',
                    energy: energyForIntervalkWh.toFixed(5), // Display calculated interval energy
                    coolingStatus: record.coolingStatus ? 'ON' : (record.coolingStatus !== undefined ? 'OFF' : 'N/A') // Handle undefined coolingStatus
                };
                
                // Handle ssr states for coolingStatus if direct coolingStatus is not present
                // This logic depends on what's stored. Assuming 'coolingStatus' is now directly stored based on ssr states.
                // If not, and only ssr1, ssr3, ssr4 are stored:
                // displayRecord.coolingStatus = (record.ssr1 || record.ssr3 || record.ssr4) ? 'ON' : 'OFF';


                tableRowsHtml += `
                    <tr>
                        <td>${displayRecord.timestamp}</td>
                        <td>${displayRecord.panelTemp}</td>
                        <td>${displayRecord.ambientTemp}</td>
                        <td>${displayRecord.lightIntensity}</td>
                        <td>${displayRecord.humidity}</td>
                        <td>${displayRecord.panelVoltage}</td>
                        <td>${displayRecord.panelCurrent}</td>
                        <td>${displayRecord.panelPower}</td>
                        <td>${displayRecord.energy}</td>
                        <td>${displayRecord.coolingStatus}</td>
                    </tr>
                `;
                previousTimestamp = currentTimestamp;
            });

            dataTableBody.innerHTML = tableRowsHtml;

            // Basic pagination idea (needs UI buttons and state management)
            // if (historicalData.length === limit && historicalData.length > 0) {
            //     const lastRecordTimestamp = historicalData[0].updatedAtISO; // Newest record (original order)
            //     // Add a "Load More" button or similar, passing lastRecordTimestamp
            // }

        } catch (error) {
            console.error("Could not fetch historical data:", error);
            if (dataTableBody) {
                dataTableBody.innerHTML = `<tr><td colspan="10">Error loading historical data.</td></tr>`;
            }
        }
    }

    // Ensure the default view (Dashboard) is shown on page load
    // This is handled by the 'active-view' class set in HTML initially.
    // If not, you could add:
    // document.getElementById('dashboardView')?.classList.add('active-view');
    // document.querySelector('.sidebar-link[data-view="dashboardView"]')?.classList.add('active-link');

});
