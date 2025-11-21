// admin.js (COMPLETE SUPABASE INTEGRATION)

// --- SUPABASE INITIALIZATION ---
const SUPABASE_URL = 'https://sjvxlvsmjwpfxlkjjvod.supabase.co'; 
// NOTE: We use the same public key here. For a *real* admin dashboard,
// you would use a separate service key or Row Level Security (RLS) on Supabase.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqdnhsdnNtandwZnhsa2pqdm9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MzM1NTksImV4cCI6MjA3OTAwOTU1OX0.VmrDs5I6zn9wY1VUAsk0f1IzcvjLI7oe_BT5o1CT8J0'; 

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Enum for clear, controlled status values (Matches database status)
const OrderStatus = {
    PAID: 'PAID',
    PROCESSING: 'PROCESSING',
    FULFILLED: 'FULFILLED',
    CANCELLED: 'CANCELLED'
};

// --- Supabase Interaction Functions ---

/**
 * Fetches the list of all orders, sorted by newest first.
 */
async function fetchAllOrders() {
    const { data, error } = await supabaseClient
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching orders:', error);
        return [];
    }
    
    // Map data fields from snake_case to camelCase for existing JS compatibility
    return data.map(o => ({
        id: o.id,
        shortId: o.short_id,
        customerPhone: o.customer_phone,
        packageGB: o.package_gb,
        packagePrice: o.package_price,
        packageDetails: o.package_details,
        status: o.status,
        createdAt: new Date(o.created_at),
        updatedAt: o.updated_at ? new Date(o.updated_at) : null,
    }));
}

/**
 * Updates a single order's status in the database.
 */
async function updateOrderStatus(orderId, newStatus) {
    const { error } = await supabaseClient
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

    if (error) {
        console.error('Error updating order status:', error);
        return { success: false };
    }
    return { success: true };
}

/**
 * Fetches the admin token from the database settings.
 */
async function fetchAdminToken() {
    const { data, error } = await supabaseClient
        .from('settings')
        .select('admin_token')
        .limit(1)
        .single();
    
    if (error) {
        console.error('Error fetching admin token:', error);
        return null;
    }
    return data.admin_token;
}

// --- PACKAGE CRUD FUNCTIONS (NEW) ---

/**
 * Fetches all packages (for the admin editor).
 */
async function fetchAllPackages() {
    const { data, error } = await supabaseClient
        .from('packages')
        .select('*')
        .order('data_value_gb', { ascending: true });

    if (error) {
        console.error('Error fetching packages:', error);
        return [];
    }
    
    // Map data fields
    return data.map(p => ({
        id: p.id,
        packageName: p.package_name,
        dataValueGB: p.data_value_gb,
        priceGHS: p.price_ghs,
        isEnabled: p.is_enabled
    }));
}

/**
 * Saves a new or updated package.
 */
async function savePackage(pkg) {
    const packageData = {
        id: pkg.id || `p${Date.now()}`, // Ensure ID exists for insert/upsert
        package_name: pkg.packageName,
        data_value_gb: pkg.dataValueGB,
        price_ghs: pkg.priceGHS,
        is_enabled: pkg.isEnabled
    };
    
    // Use upsert to handle both insert (new) and update (existing)
    const { error } = await supabaseClient
        .from('packages')
        .upsert(packageData);

    if (error) {
        console.error('Error saving package:', error);
        return { success: false };
    }
    renderPackageEditor();
    return { success: true };
}

/**
 * Deletes a package.
 */
async function deletePackage(pkgId) {
    const { error } = await supabaseClient
        .from('packages')
        .delete()
        .eq('id', pkgId);
        
    if (error) {
        console.error('Error deleting package:', error);
        return { success: false };
    }
    renderPackageEditor();
    return { success: true };
}

/**
 * Fetches the current platform settings.
 */
async function fetchSettings() {
    const { data, error } = await supabaseClient
        .from('settings')
        .select('whats_app_link')
        .limit(1)
        .single();
    
    if (error) {
        console.error('Error fetching settings:', error);
        return { whatsAppLink: '#' }; 
    }
    return { whatsAppLink: data.whats_app_link };
}

/**
 * Updates the platform settings (WhatsApp link).
 */
async function updateSettings(newSettings) {
    const { error } = await supabaseClient
        .from('settings')
        // We know the ID of the single settings row is 1
        .update({ whats_app_link: newSettings.whatsAppLink }) 
        .eq('id', 1); 

    if (error) {
        console.error('Error updating settings:', error);
        return { success: false };
    }
    renderSettingsEditor();
    return { success: true };
}

// --- BULK PROCESSING TOOLS (REMAINS SAME LOGIC, BUT USES LIVE DATA) ---

let currentOrders = []; // Cached array for filtered orders

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
    // Use the cached currentOrders array
    return currentOrders.filter(order => selectedIds.includes(order.id)); 
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
    
    currentOrders = filteredOrders; // Cache the filtered result
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

    let successCount = 0;
    for (const id of selectedOrders) {
        const result = await updateOrderStatus(id, newStatus); 
        if(result.success) successCount++;
    }

    alert(`${successCount} orders successfully updated to ${newStatus}.`);
    // Re-render the table after the batch update is complete
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

    // Define the CSV header: Customer Phone and Data Value (GB) are needed
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

// --- CONFIGURATION RENDERING AND LOGIC (UPDATED DB CALLS) ---

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
                    <button onclick="editPackage('${pkg.id}')" class="btn-primary" style="padding: 5px 10px;">Edit</button>
                    <button onclick="handleDeletePackage('${pkg.id}')" style="background-color: #dc3545; color: white; padding: 5px 10px;">Delete</button>
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
    // Note: This relies on fetchAllPackages having been run recently to populate the table.
    // In a production app, we would fetch the single package here for accuracy.
    const pkg = currentOrders.find(p => p.id === pkgId) || fetchAllPackages().then(pkgs => pkgs.find(p => p.id === pkgId));
    
    // To simplify the mockup, we'll re-fetch everything and find the match
    fetchAllPackages().then(packages => {
        const pkg = packages.find(p => p.id === pkgId);
        if (!pkg) return;
        
        document.getElementById('package-modal-title').textContent = 'Edit Data Package';
        document.getElementById('pkg-id').value = pkg.id;
        document.getElementById('pkg-name').value = pkg.packageName;
        document.getElementById('pkg-data').value = pkg.dataValueGB;
        document.getElementById('pkg-price').value = pkg.priceGHS;
        document.getElementById('pkg-enabled').checked = pkg.isEnabled;

        document.getElementById('package-editor-modal').style.display = 'flex';
    });
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

    const result = await savePackage(pkg);
    if(result.success) {
        closePackageModal();
        alert(`Package ${pkg.id ? 'updated' : 'created'} successfully.`);
    } else {
        alert('Failed to save package.');
    }
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
    const settings = await fetchSettings(); 
    const linkInput = document.getElementById('whats-app-link-input');
    
    if (settings && linkInput) {
        linkInput.value = settings.whatsAppLink;
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
    
    const result = await updateSettings(newSettings);
    if(result.success) {
        alert("Platform settings (WhatsApp link) updated successfully.");
    } else {
        alert("Failed to update settings.");
    }
}


// --- Admin Dashboard Logic (UPDATED AUTHENTICATION) ---

/**
 * Handles the Login Barrier check.
 */
async function handleLogin(event) {
    event.preventDefault();
    const tokenInput = document.getElementById('admin-token-input');
    const tokenAttempt = tokenInput.value.trim();
    
    // Fetch the token from Supabase instead of mock data
    const storedToken = await fetchAdminToken(); 

    if (storedToken && tokenAttempt === storedToken) {
        sessionStorage.setItem('admin_session_valid', 'true');
        window.location.hash = '#dashboard';
        renderDashboard();
    } else {
        alert('Invalid Secret Admin Token.');
        tokenInput.value = '';
    }
}

/**
 * Renders the orders into the management table. (Existing bulk logic, now uses live data)
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
        const result = await updateOrderStatus(orderId, newStatus);
        if (result.success) {
            // Refetch and display updated orders
            await filterOrders();
            alert(`Status for ${orderId} updated to ${newStatus}.`);
        } else {
            alert('Failed to update order status. Please try again.');
        }
    } else {
        renderDashboard(); 
    }
}

/**
 * Renders the correct view (Login or Dashboard) based on session status.
 */
async function renderDashboard() {
    const isAdminValid = sessionStorage.getItem('admin_session_valid') === 'true';
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');

    if (loginView && dashboardView) {
        if (isAdminValid) {
            loginView.style.display = 'none';
            dashboardView.style.display = 'block';
            
            filterOrders(); 
            renderPackageEditor();
            renderSettingsEditor();
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

    const packageForm = document.getElementById('package-form');
    if (packageForm) {
        packageForm.addEventListener('submit', handlePackageFormSubmit);
    }

    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', handleSettingsFormSubmit);
    }
    
    renderDashboard();
});
