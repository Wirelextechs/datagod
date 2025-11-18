// storefront.js

// --- MOCK DATABASE DATA (Simulates live data from the backend) ---

const MOCK_PACKAGES = [
  { id: 'p1', packageName: '1GB MTN', dataValueGB: 1, priceGHS: 4.80, isEnabled: true },
  { id: 'p2', packageName: '2GB MTN', dataValueGB: 2, priceGHS: 9.40, isEnabled: true },
  { id: 'p3', packageName: '3GB MTN', dataValueGB: 3, priceGHS: 14.50, isEnabled: true },
  { id: 'p4', packageName: '4GB MTN', dataValueGB: 4, priceGHS: 18.40, isEnabled: false }, 
  { id: 'p5', packageName: '5GB MTN', dataValueGB: 5, priceGHS: 22.00, isEnabled: true },
  { id: 'p10', packageName: '10GB MTN', dataValueGB: 10, priceGHS: 44.00, isEnabled: true },
];

const MOCK_SETTINGS = {
  whatsAppLink: 'https://wa.me/233241234567?text=I%20need%20support%20with%20data%20purchase',
};

// Enum for clear, controlled status values
const ORDER_STATUS = { PAID: 'PAID', PROCESSING: 'PROCESSING', FULFILLED: 'FULFILLED', CANCELLED: 'CANCELLED' };

// MOCK ORDERS COLLECTION (Example records for status checking)
const MOCK_ORDERS = [
    { shortId: '1234', packageDetails: '5GB MTN', status: ORDER_STATUS.PROCESSING }, // PROCESSING Example
    { shortId: '5678', packageDetails: '1GB MTN', status: ORDER_STATUS.FULFILLED }, // FULFILLED Example
    { shortId: '9012', packageDetails: '10GB MTN', status: ORDER_STATUS.PAID }, // PAID Example
    { shortId: '3456', packageDetails: '3GB MTN', status: ORDER_STATUS.CANCELLED }, // CANCELLED Example
];

// --- END MOCK DATABASE DATA ---

// --- Utility Functions ---

/**
 * Generates a unique 4-digit string ID.
 */
function generateShortId() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// --- Database Interaction Mockups ---

/**
 * Simulates fetching enabled packages, sorted by dataValueGB (Ascending).
 */
async function fetchPackages() {
    const enabledPackages = MOCK_PACKAGES.filter(p => p.isEnabled);
    enabledPackages.sort((a, b) => a.dataValueGB - b.dataValueGB); // Intuitive Ordering by GB
    return enabledPackages;
}

/**
 * Simulates fetching the platform settings (WhatsApp Link).
 */
async function fetchSettings() {
    return MOCK_SETTINGS;
}

/**
 * Simulates creating a new order transaction in the database.
 */
async function createOrderInDB(orderData) {
    // In a real system, this is a call to your DB/API endpoint.
    console.log('--- Order Submitted to DB ---');
    console.log(orderData);
    // Simulate successful submission and return the Short ID
    return { success: true, shortId: orderData.shortId };
}

// --- Status Checker Logic (NEW) ---

/**
 * Simulates querying the database to find an order by Short ID.
 */
async function findOrderByShortId(shortId) {
    // In a real system: db.collection('orders').where('shortId', '==', shortId).limit(1).get()
    return MOCK_ORDERS.find(order => order.shortId === shortId);
}

/**
 * Provides color-coded HTML output based on the order status.
 */
function getStatusReportHtml(order) {
    let color, label;

    switch (order.status) {
        case ORDER_STATUS.PAID:
            color = 'orange';
            label = 'Payment received and confirmed. Awaiting administrator processing.';
            break;
        case ORDER_STATUS.PROCESSING:
            color = 'blue';
            label = 'Order is actively being loaded onto your number.';
            break;
        case ORDER_STATUS.FULFILLED:
            color = 'green';
            label = 'Data has been successfully loaded to your number!';
            break;
        case ORDER_STATUS.CANCELLED:
            color = 'red';
            label = 'Order could not be completed. Please contact support immediately.';
            break;
        default:
            color = 'gray';
            label = 'Status unknown.';
    }

    return `
        <div style="margin-top: 10px; padding: 15px; border-left: 5px solid ${color}; background-color: #f8f8f8;">
            <p><strong>Package:</strong> ${order.packageDetails}</p>
            <p><strong>Current Status:</strong> 
                <span style="color: ${color}; font-weight: bold; text-transform: uppercase;">${order.status}</span>
            </p>
            <p>${label}</p>
        </div>
    `;
}

/**
 * Event handler for the Order Status Checker lookup.
 */
async function handleStatusLookup() {
    const lookupInput = document.getElementById('short-id-lookup');
    const reportArea = document.getElementById('status-report');
    const shortId = lookupInput.value.trim();

    if (shortId.length !== 4 || isNaN(shortId)) {
        reportArea.innerHTML = '<p style="color: red;">Please enter a valid 4-digit Short ID.</p>';
        return;
    }

    reportArea.innerHTML = '<p>Searching...</p>';
    
    const order = await findOrderByShortId(shortId);

    if (order) {
        reportArea.innerHTML = getStatusReportHtml(order);
    } else {
        reportArea.innerHTML = '<p style="color: red;">Order not found. Please verify the ID.</p>';
    }
}

// --- Storefront Logic (Ordering) ---

let selectedPackage = null;

/**
 * Renders the package catalog dynamically.
 */
async function renderCatalog() {
    const catalogContainer = document.getElementById('package-catalog');
    const packages = await fetchPackages();
    
    if (!catalogContainer) return;

    catalogContainer.innerHTML = ''; 

    packages.forEach(pkg => {
        const card = document.createElement('div');
        card.className = 'package-card';
        card.innerHTML = `
            <h3>${pkg.packageName}</h3>
            <p class="data-value">${pkg.dataValueGB} GB</p>
            <p class="price">GHS ${pkg.priceGHS.toFixed(2)}</p>
            <button class="buy-btn" data-id="${pkg.id}">Buy Now</button>
        `;
        catalogContainer.appendChild(card);
    });

    // Attach event listeners for purchase initiation
    document.querySelectorAll('.buy-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const pkgId = e.target.getAttribute('data-id');
            selectedPackage = packages.find(p => p.id === pkgId);
            openOrderModal();
        });
    });
}

/**
 * Renders the dynamic WhatsApp contact link.
 */
async function renderContactLink() {
    const contactBtn = document.getElementById('contact-link');
    const settings = await fetchSettings();
    
    if (contactBtn) {
        contactBtn.href = settings.whatsAppLink; // Admin Configurability
    }
}

/**
 * Opens the purchase confirmation modal.
 */
function openOrderModal() {
    const modal = document.getElementById('order-modal');
    const modalTitle = document.getElementById('modal-package-name');
    const modalPrice = document.getElementById('modal-package-price');
    
    if (modal && selectedPackage) {
        modalTitle.textContent = selectedPackage.packageName;
        modalPrice.textContent = `GHS ${selectedPackage.priceGHS.toFixed(2)}`;
        document.getElementById('momo-number').value = ''; 
        modal.style.display = 'flex';
    }
}

/**
 * Closes the purchase confirmation modal.
 */
function closeOrderModal() {
    const modal = document.getElementById('order-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Handles the final order submission (Transaction Creation).
 */
async function handleOrderSubmission(event) {
    event.preventDefault();
    const momoNumberInput = document.getElementById('momo-number');
    const customerPhone = momoNumberInput.value.trim();

    if (!selectedPackage || !customerPhone || customerPhone.length < 10) {
        alert('Please enter a valid MTN Mobile Money number (10 digits).');
        return;
    }

    // Create the transaction record
    const orderData = {
        shortId: generateShortId(), // Generate unique 4-digit Order ID
        customerPhone: customerPhone,
        packageGB: selectedPackage.dataValueGB,
        packagePrice: selectedPackage.priceGHS,
        packageDetails: selectedPackage.packageName,
        status: ORDER_STATUS.PAID, // Initial status is automatically set to PAID
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    try {
        const result = await createOrderInDB(orderData);
        
        // Confirmation and Tracking
        if (result.success) {
            closeOrderModal();
            // Show the success screen with the 4-digit Short ID
            showSuccessScreen(result.shortId, selectedPackage.packageName);
        } else {
            alert('Order creation failed. Please try again.');
        }

    } catch (error) {
        console.error("Error submitting order:", error);
        alert('An error occurred during submission.');
    }
}

/**
 * Displays the success/confirmation screen.
 */
function showSuccessScreen(shortId, packageName) {
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.innerHTML = `
            <div class="success-screen">
                <h2>✅ Purchase Confirmed!</h2>
                <p>Your order for <strong>${packageName}</strong> has been successfully placed.</p>
                <div class="short-id-box">
                    <p>Your Tracking ID (Short ID):</p>
                    <strong>${shortId}</strong>
                </div>
                <p class="instruction">
                    **IMPORTANT:** Please save this 4-digit ID to track your order status on this page.
                </p>
                <button onclick="window.location.reload()">Back to Store</button>
            </div>
        `;
    }
}

// Initialize the Storefront when the page loads
document.addEventListener('DOMContentLoaded', () => {
    renderCatalog();
    renderContactLink();
    
    const orderForm = document.getElementById('order-form');
    if (orderForm) {
        orderForm.addEventListener('submit', handleOrderSubmission);
    }

    const closeBtn = document.querySelector('.close-button');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeOrderModal);
    }

    // Attach handler for status lookup (NEW)
    const lookupBtn = document.getElementById('lookup-btn');
    if (lookupBtn) {
        lookupBtn.addEventListener('click', handleStatusLookup);
    }
});
