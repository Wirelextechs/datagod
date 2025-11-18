// storefront.js

// --- Utility Functions (From previous conversation) ---

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
    // In a real app, this is db.collection('packages').where('isEnabled', '==', true).orderBy('dataValueGB').get()
    const enabledPackages = MOCK_PACKAGES.filter(p => p.isEnabled);
    enabledPackages.sort((a, b) => a.dataValueGB - b.dataValueGB);
    return enabledPackages;
}

/**
 * Simulates fetching the platform settings (WhatsApp Link).
 */
async function fetchSettings() {
    // In a real app, this is db.collection('settings').doc('platform').get()
    return MOCK_SETTINGS;
}

/**
 * Simulates creating a new order transaction in the database.
 */
async function createOrderInDB(orderData) {
    // In a real app, this is db.collection('orders').add(orderData)
    console.log('--- Order Submitted to DB ---');
    console.log(orderData);
    // Simulate successful database ID creation
    return { success: true, shortId: orderData.shortId };
}

// --- Storefront Logic ---

let selectedPackage = null;
const ORDER_STATUS = { PAID: 'PAID' };

/**
 * Renders the package catalog dynamically.
 */
async function renderCatalog() {
    const catalogContainer = document.getElementById('package-catalog');
    const packages = await fetchPackages();
    
    if (!catalogContainer) return;

    catalogContainer.innerHTML = ''; // Clear previous content

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

    // Attach event listeners after rendering
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
        contactBtn.href = settings.whatsAppLink;
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
        document.getElementById('momo-number').value = ''; // Clear previous input
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
 * Handles the final order submission.
 */
async function handleOrderSubmission(event) {
    event.preventDefault();
    const momoNumberInput = document.getElementById('momo-number');
    const customerPhone = momoNumberInput.value.trim();

    if (!selectedPackage || !customerPhone || customerPhone.length < 10) {
        alert('Please enter a valid MTN Mobile Money number.');
        return;
    }

    // 1. Transaction Creation
    const orderData = {
        shortId: generateShortId(), // Unique 4-digit ID
        customerPhone: customerPhone,
        packageGB: selectedPackage.dataValueGB,
        packagePrice: selectedPackage.priceGHS,
        packageDetails: selectedPackage.packageName,
        status: ORDER_STATUS.PAID, // Set to PAID immediately
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    try {
        const result = await createOrderInDB(orderData);
        
        // 2. Confirmation and Tracking
        if (result.success) {
            closeOrderModal();
            // Show the success screen with the Short ID
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
                    Your data will be loaded shortly.
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
    
    // Attach the order submission handler to the modal form
    const orderForm = document.getElementById('order-form');
    if (orderForm) {
        orderForm.addEventListener('submit', handleOrderSubmission);
    }

    // Attach handler for closing the modal
    const closeBtn = document.querySelector('.close-button');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeOrderModal);
    }
});
