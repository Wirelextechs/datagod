// admin.js (COMPLETE UPDATED CODE)

// --- MOCK DATABASE DATA (Expanded to include Packages) ---

const MOCK_SETTINGS = {
  whatsAppLink: 'https://wa.me/233241234567',
  adminToken: 'DATA_GOD_SECRET_KEY_2025', // The token needed for access
};

const OrderStatus = {
    PAID: 'PAID',
    PROCESSING: 'PROCESSING',
    FULFILLED: 'FULFILLED',
    CANCELLED: 'CANCELLED'
};

// MOCK ORDERS COLLECTION (Simulates data for the management table)
let MOCK_ORDERS = [
    { id: 'ord1', shortId: '4591', customerPhone: '0241111222', packageGB: 5, packagePrice: 22.00, packageDetails: '5GB MTN', status: OrderStatus.PAID, createdAt: new Date(Date.now() - 3600000) },
    { id: 'ord2', shortId: '1003', customerPhone: '0559998888', packageGB: 10, packagePrice: 44.00, packageDetails: '10GB MTN', status: OrderStatus.PROCESSING, createdAt: new Date(Date.now() - 1800000) },
    { id: 'ord3', shortId: '7219', customerPhone: '0205554444', packageGB: 2, packagePrice: 9.40, packageDetails: '2GB MTN', status: OrderStatus.FULFILLED, createdAt: new Date(Date.now() - 86400000) },
    { id: 'ord4', shortId: '9876', customerPhone: '0543332222', packageGB: 15, packagePrice: 60.00, packageDetails: '15GB MTN', status: OrderStatus.PAID, createdAt: new Date() }, // Most recent
];

// MOCK PACKAGES (Needed for Configuration and Storefront)
let MOCK_PACKAGES = [
    { id: 'p1', packageName: '1GB MTN', dataValueGB: 1, priceGHS: 4.80, isEnabled: true },
    { id: 'p2', packageName: '2GB MTN', dataValueGB: 2, priceGHS: 9.40, isEnabled: true },
    { id: 'p3', packageName: '3GB MTN', dataValueGB: 3, priceGHS: 14.50, isEnabled: true },
    { id: 'p5', packageName: '5GB MTN', dataValueGB: 5, priceGHS: 22.00, isEnabled: true },
    { id: 'p10', packageName: '10GB MTN', dataValueGB: 10, priceGHS: 44.00, isEnabled: true },
];

// --- Database Interaction Mockups ---

/**
 * Simulates fetching the list of all orders, sorted by newest first.
 */
async function fetchAllOrders() {
    MOCK_ORDERS.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return MOCK_ORDERS;
}

/**
 * Simulates updating a single order's status in the database.
 */
async function updateOrderStatus(orderId, newStatus) {
    const orderIndex = MOCK_ORDERS.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
        MOCK_ORDERS[orderIndex].status = newStatus;
        MOCK_ORDERS[orderIndex].updatedAt = new Date();
        return { success: true };
    }
    return { success: false };
}

/**
 * Simulates fetching the admin token from the database settings.
 */
async function fetchAdminToken() {
    return MOCK_SETTINGS.adminToken;
}

// --- PACKAGE CRUD MOCKUPS (NEW) ---

/**
 * Simulates fetching all packages (for the admin editor).
 */
async function fetchAllPackages() {
    MOCK_PACKAGES.sort((a, b) => a.dataValueGB - b.dataValueGB);
    return MOCK_PACKAGES;
}

/**
 * Simulates saving a new or updated package.
 */
async function savePackage(pkg) {
    if (pkg.id) {
        // Update existing package
        const index = MOCK_PACKAGES.findIndex(p => p.id === pkg.id);
        if (index !== -1) {
            MOCK_PACKAGES[index] = pkg;
        }
    } else {
        // Create new package
        pkg.id = `p${Date.now()}`;
        MOCK_PACKAGES.push(pkg);
    }
    renderPackageEditor();
}

/**
 * Simulates deleting a package.
 */
async function deletePackage(pkgId) {
    MOCK_PACKAGES = MOCK_PACKAGES.filter(p => p.id !== pkgId);
    renderPackageEditor();
}

/**
 * Simulates updating the platform settings (WhatsApp link).
 */
async function updateSettings(newSettings) {
    MOCK_SETTINGS.whatsAppLink = newSettings.whatsAppLink;
    renderSettingsEditor();
}

// --- BULK PROCESSING TOOLS (EXISTING) ---

/**
 * Gets the IDs of all checked orders.
 */
function getSelectedOrderIds() {
    const checkedCheckboxes = document.querySelectorAll('#orders-table-body .order-checkbox:checked');
    return Array.from(checkedCheckboxes).map(cb => cb.getAttribute('data-order-id'));
}

/**
 * Gets the full objects of all checked orders (used for CSV export).
 */
function getSelectedOrderObjects() {
    const selectedIds = getSelectedOrderIds();
    return MOCK_ORDERS.filter(order => selectedIds.includes(order.id));
}

/**
 * Selects or deselects all visible orders based on the master checkbox.
 */
function toggleSelectAll(masterCheckbox) {
    const isChecked = masterCheckbox.checked;
    const visibleCheckboxes = document.querySelectorAll('#orders-table-body .order-checkbox');
    visibleCheckboxes.forEach(cb => {
        cb.checked = isChecked;
    });
}

/**
 * Handles filtering the order table by status.
 */
async function filterOrders() {
    const statusFilter = document.getElementById('filter-status').value;
    const allOrders = await fetchAllOrders();
    
    let filteredOrders;
    if (statusFilter === 'ALL') {
        filteredOrders = allOrders;
    } else {
        filteredOrders = allOrders.filter(order => order.status === statusFilter);
    }

    renderOrderTable(filteredOrders);
}

/**
 * Executes a bulk status change on selected orders.
 */
async function handleBulkStatusChange() {
    const selectedOrders = getSelectedOrderIds();
    const bulkStatusSelect = document.getElementById('bulk-status-select');
    const newStatus = bulkStatusSelect.value;

    if (selectedOrders.length === 0) {
        alert('Please select at least one order to process.');
        return;
    }
    if (!newStatus) {
        alert('Please select a new status.');
        return;
    }

    if (!confirm(`Are you sure you want to change the status of ${selectedOrders.length} orders to ${newStatus}?`)) {
        return;
    }

    for (const id of selectedOrders) {
        await updateOrderStatus(id, newStatus); 
    }

    alert(`${selectedOrders.length} orders successfully updated to ${newStatus}.`);
    filterOrders();
}


/**
 * Generates and downloads the CSV file for bulk loading.
 */
function exportOrdersToCSV() {
    const selectedOrders = getSelectedOrderObjects();
    
    if (selectedOrders.length === 0) {
        alert('Please select orders for CSV export.');
        return;
    }

    let csvContent = "CustomerPhone,DataValueGB\r\n";

    selectedOrders.forEach(order => {
        csvContent += `${order.customerPhone},${order.packageGB}\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0];

    link.setAttribute("href", url);
    link.setAttribute("download", `DataGod_Bulk_Load_${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert(`Exported ${selectedOrders.length} orders to CSV for bulk loading.`);
}

// --- CONFIGURATION RENDERING AND LOGIC (NEW) ---

/**
 * Renders the package list for CRUD.
 */
async function renderPackageEditor() {
    const tableBody = document.getElementById('package-editor-body');
    const packages = await fetchAllPackages();
    
    if (!tableBody) return;

    let html = '';
    packages.forEach(pkg => {
        html += `
            <tr data-id="${pkg.id}">
                <td>${pkg.packageName}</td>
                <td>${pkg.dataValueGB} GB</td>
                <td>GHS ${pkg.priceGHS.toFixed(2)}</td>
                <td><span style="color: ${pkg.isEnabled ? 'green' : 'red'};">${pkg.isEnabled ? 'Active' : 'Disabled'}</span></td>
                <td>
                    <button onclick="editPackage('${pkg.id}')">Edit</button>
                    <button onclick="handleDeletePackage('${pkg.id}')" style="background-color: #dc3545; color: white;">Delete</button>
                </td>
            </tr>
        `;
    });
    tableBody.innerHTML = html;
}

/**
 * Pre-fills the modal form for editing an existing package.
 */
function editPackage(pkgId) {
    const pkg = MOCK_PACKAGES.find(p => p.id === pkgId);
    if (!pkg) return;

    document.getElementById('package-modal-title').textContent = 'Edit Data Package';
    document.getElementById('pkg-id').value = pkg.id;
    document.getElementById('pkg-name').value = pkg.packageName;
    document.getElementById('pkg-data').value = pkg.dataValueGB;
    document.getElementById('pkg-price').value = pkg.priceGHS;
    document.getElementById('pkg-enabled').checked = pkg.isEnabled;

    document.getElementById('package-editor-modal').style.display = 'flex';
}

/**
 * Clears the modal form for creating a new package.
 */
function openCreatePackageModal() {
    document.getElementById('package-modal-title').textContent = 'Create New Data Package';
    document.getElementById('pkg-id').value = '';
    document.getElementById('pkg-name').value = '';
    document.getElementById('pkg-data').value = '';
    document.getElementById('pkg-price').value = '';
    document.getElementById('pkg-enabled').checked = true;

    document.getElementById('package-editor-modal').style.display = 'flex';
}

/**
 * Handles the submission of the package creation/edit form.
 */
async function handlePackageFormSubmit(event) {
    event.preventDefault();

    const pkg = {
        id: document.getElementById('pkg-id').value || null,
        packageName: document.getElementById('pkg-name').value,
        dataValueGB: parseFloat(document.getElementById('pkg-data').value),
        priceGHS: parseFloat(document.getElementById('pkg-price').value),
        isEnabled: document.getElementById('pkg-enabled').checked,
    };

    await savePackage(pkg);
    closePackageModal();
    alert(`Package ${pkg.id ? 'updated' : 'created'} successfully.`);
}

/**
 * Handles package deletion confirmation.
 */
function handleDeletePackage(pkgId) {
    if (confirm("Are you sure you want to permanently delete this package?")) {
        deletePackage(pkgId);
        alert("Package deleted.");
    }
}

/**
 * Closes the package editor modal.
 */
function closePackageModal() {
    document.getElementById('package-editor-modal').style.display = 'none';
}

/**
 * Initializes and displays the current settings.
 */
async function renderSettingsEditor() {
    const settings = MOCK_SETTINGS; 
    if (settings) {
        const linkInput = document.getElementById('whats-app-link-input');
        if(linkInput) linkInput.value = settings.whatsAppLink;
    }
}

/**
 * Handles the submission of the settings form.
 */
async function handleSettingsFormSubmit(event) {
    event.preventDefault();

    const newSettings = {
        whatsAppLink: document.getElementById('whats-app-link-input').value.trim(),
    };
    
    await updateSettings(newSettings);
    alert("Platform settings (WhatsApp link) updated successfully.");
}


// --- Admin Dashboard Logic (MODIFIED) ---

/**
 * Handles the Login Barrier check.
 */
async function handleLogin(event) {
    event.preventDefault();
    const tokenInput = document.getElementById('admin-token-input');
    const tokenAttempt = tokenInput.value.trim();
    const storedToken = await fetchAdminToken();

    if (tokenAttempt === storedToken) {
        sessionStorage.setItem('admin_session_valid', 'true');
        window.location.hash = '#dashboard';
        renderDashboard();
    } else {
        alert('Invalid Secret Admin Token.');
        tokenInput.value = '';
    }
}

/**
 * Renders the orders into the management table. (Existing bulk logic)
 */
async function renderOrderTable(orders) {
    const tableBody = document.getElementById('orders-table-body');
    const statusKeys = Object.keys(OrderStatus);
    const filterStatusSelect = document.getElementById('filter-status');
    const bulkStatusSelect = document.getElementById('bulk-status-select');

    if (!tableBody) return;
    
    // 1. Initialize Dropdowns (if not already populated)
    if (filterStatusSelect.options.length === 1) { 
        statusKeys.forEach(status => {
            const option = document.createElement('option');
            option.value = status;
            option.textContent = status;
            filterStatusSelect.appendChild(option);
            bulkStatusSelect.appendChild(option.cloneNode(true)); // Clone for bulk selector
        });
    }

    let html = '';
    orders.forEach(order => {
        const statusColor = getStatusColor(order.status);
        
        html += `
            <tr data-order-id="${order.id}">
                <td><input type="checkbox" class="order-checkbox" data-order-id="${order.id}"></td>
                <td><strong>${order.shortId}</strong></td>
                <td>${order.customerPhone}</td>
                <td>${order.packageDetails} (${order.packageGB} GB)</td>
                <td>GHS ${order.packagePrice.toFixed(2)}</td>
                <td><span class="status-badge" style="background-color: ${statusColor};">${order.status}</span></td>
                <td>
                    <select class="status-dropdown" data-order-id="${order.id}" onchange="handleStatusChange(this)">
                        ${Object.values(OrderStatus).map(status => `
                            <option value="${status}" ${order.status === status ? 'selected' : ''}>${status}</option>
                        `).join('')}
                    </select>
                </td>
            </tr>
        `;
    });
    tableBody.innerHTML = html;
    
    // 2. Reset master checkbox
    const masterCheckbox = document.getElementById('select-all-checkbox');
    if(masterCheckbox) {
        masterCheckbox.checked = false;
    }
}

/**
 * Helper function to determine badge color based on status.
 */
function getStatusColor(status) {
    switch(status) {
        case OrderStatus.PAID: return '#ffc107'; // Yellow
        case OrderStatus.PROCESSING: return '#17a2b8'; // Blue
        case OrderStatus.FULFILLED: return '#28a745'; // Green
        case OrderStatus.CANCELLED: return '#dc3545'; // Red
        default: return '#6c757d'; // Gray
    }
}

/**
 * Handles the status change from the individual row dropdown.
 */
async function handleStatusChange(selectElement) {
    const orderId = selectElement.getAttribute('data-order-id');
    const newStatus = selectElement.value;
    
    if (confirm(`Are you sure you want to change order ${orderId} status to ${newStatus}?`)) {
        await updateOrderStatus(orderId, newStatus);
        filterOrders();
        alert(`Status for ${orderId} updated to ${newStatus}.`);
    } else {
        renderDashboard(); 
    }
}

/**
 * Renders the correct view (Login or Dashboard) based on session status. (MODIFIED)
 */
async function renderDashboard() {
    const isAdminValid = sessionStorage.getItem('admin_session_valid') === 'true';
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');

    if (loginView && dashboardView) {
        if (isAdminValid) {
            loginView.style.display = 'none';
            dashboardView.style.display = 'block';
            
            // Render orders
            filterOrders(); 
            
            // --- NEW: Render Configuration Editors ---
            renderPackageEditor();
            renderSettingsEditor();
            // --- END NEW ---
        } else {
            loginView.style.display = 'block';
            dashboardView.style.display = 'none';
        }
    }
}

/**
 * Logs the admin out.
 */
function handleLogout() {
    sessionStorage.removeItem('admin_session_valid');
    window.location.hash = ''; 
    renderDashboard();
}

// Initial check when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Attach event listeners
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    window.addEventListener('hashchange', renderDashboard);
    
    const filterSelect = document.getElementById('filter-status');
    if (filterSelect) {
        filterSelect.addEventListener('change', filterOrders);
    }

    // Attach form submit handler for package modal (NEW)
    const packageForm = document.getElementById('package-form');
    if (packageForm) {
        packageForm.addEventListener('submit', handlePackageFormSubmit);
    }

    // Attach form submit handler for settings (NEW)
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', handleSettingsFormSubmit);
    }
    
    renderDashboard();
});
