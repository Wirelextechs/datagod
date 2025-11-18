// admin.js

// --- MOCK DATABASE DATA (Expanded to include Orders and Token) ---

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

// --- Database Interaction Mockups ---

/**
 * Simulates fetching the list of all orders, sorted by newest first.
 */
async function fetchAllOrders() {
    MOCK_ORDERS.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return MOCK_ORDERS;
}

/**
 * Simulates updating a single order's status in the database (Individual Status Update).
 */
async function updateOrderStatus(orderId, newStatus) {
    const orderIndex = MOCK_ORDERS.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
        MOCK_ORDERS[orderIndex].status = newStatus;
        MOCK_ORDERS[orderIndex].updatedAt = new Date();
        // Simulate re-rendering after a DB update (Live Synchronization)
        renderDashboard(); 
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

// --- Admin Dashboard Logic ---

/**
 * Handles the Login Barrier check.
 */
async function handleLogin(event) {
    event.preventDefault();
    const tokenInput = document.getElementById('admin-token-input');
    const tokenAttempt = tokenInput.value.trim();
    const storedToken = await fetchAdminToken();

    if (tokenAttempt === storedToken) {
        // Successful Session Management
        sessionStorage.setItem('admin_session_valid', 'true');
        window.location.hash = '#dashboard';
        renderDashboard();
    } else {
        alert('Invalid Secret Admin Token.');
        tokenInput.value = '';
    }
}

/**
 * Renders the orders into the management table.
 */
async function renderOrderTable(orders) {
    const tableBody = document.getElementById('orders-table-body');
    if (!tableBody) return;

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
        alert(`Status for ${orderId} updated to ${newStatus}.`);
    } else {
        // Revert the dropdown if canceled (by re-rendering the dashboard)
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
            const orders = await fetchAllOrders();
            renderOrderTable(orders);
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
    
    // Check session on load/hash change for secure access routing
    window.addEventListener('hashchange', renderDashboard);
    renderDashboard();
});
