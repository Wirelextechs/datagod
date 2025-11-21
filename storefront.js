// storefront.js (COMPLETE SUPABASE INTEGRATION)

// --- SUPABASE INITIALIZATION ---
const SUPABASE_URL = 'https://sjvxlvsmjwpfxlkjjvod.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqdnhsdnNtandwZnhsa2pqdm9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MzM1NTksImV4cCI6MjA3OTAwOTU1OX0.VmrDs5I6zn9wY1VUAsk0f1IzcvjLI7oe_BT5o1CT8J0'; 

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- PAYSTACK INITIALIZATION ---
const PAYSTACK_PUBLIC_KEY = 'pk_test_af33df7aad299f46565a2f5fc2adb221e22122d6';

// Enum for clear, controlled status values (Matches database status)
const ORDER_STATUS = { PAID: 'PAID', PROCESSING: 'PROCESSING', FULFILLED: 'FULFILLED', CANCELLED: 'CANCELLED' };

// --- Utility Functions ---

/**
 * Generates a unique 4-digit string ID.
 */
function generateShortId() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// --- Supabase Interaction Functions ---

/**
 * Fetches enabled packages, sorted by dataValueGB (Ascending).
 */
async function fetchPackages() {
    const { data, error } = await supabaseClient
        .from('packages')
        .select('id, package_name, data_value_gb, price_ghs')
        .eq('is_enabled', true)
        .order('data_value_gb', { ascending: true });

    if (error) {
        console.error('Error fetching packages:', error);
        return [];
    }
    // Map data fields to match original JS object structure for compatibility
    return data.map(p => ({
        id: p.id,
        packageName: p.package_name,
        dataValueGB: p.data_value_gb,
        priceGHS: p.price_ghs,
        isEnabled: true // Already filtered by is_enabled=true
    }));
}

/**
 * Fetches the platform settings (WhatsApp Link).
 */
async function fetchSettings() {
    const { data, error } = await supabaseClient
        .from('settings')
        .select('whats_app_link')
        .limit(1)
        .single();
    
    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching settings:', error);
        return { whatsAppLink: '#' }; // Fallback
    }
    // Map data field
    return { whatsAppLink: data ? data.whats_app_link : '#' };
}

/**
 * Creates a new order transaction in the database.
 */
async function createOrderInDB(orderData) {
    const { data, error } = await supabaseClient
        .from('orders')
        .insert([{
            short_id: orderData.shortId,
            customer_phone: orderData.customerPhone,
            package_gb: orderData.packageGB,
            package_price: orderData.packagePrice,
            package_details: orderData.packageDetails,
            status: orderData.status,
            created_at: orderData.createdAt,
            updated_at: orderData.updatedAt,
        }])
        .select('short_id'); 

    if (error) {
        console.error('Error submitting order:', error);
        return { success: false };
    }
    return { success: true, shortId: data[0].short_id }; 
}

/**
 * Queries the database to find an order by Short ID.
 */
async function findOrderByShortId(shortId) {
    const { data, error } = await supabaseClient
        .from('orders')
        .select('package_details, status') // Only fetch needed fields
        .eq('short_id', shortId)
        .single(); 

    if (error && error.code !== 'PGRST116') { 
        console.error('Error looking up order:', error);
    }
    
    // Map data fields back to original object structure
    if (data) {
        return {
            packageDetails: data.package_details,
            status: data.status
        };
    }
    return null;
}

// --- Status Checker Logic (NO CHANGE NEEDED) ---
// (getStatusReportHtml and handleStatusLookup functions remain the same)

// ... [Keep getStatusReportHtml function] ...
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

// ... [Keep handleStatusLookup function] ...
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

// --- Storefront Logic (Ordering) (NO CHANGE NEEDED) ---

// ... [Keep all other functions including renderCatalog, renderContactLink, etc.] ...
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
            // Find the package from the fetched data
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
        // Use the mapped field name
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
 * Handles Paystack payment initialization and processing.
 */
async function handleOrderSubmission(event) {
    event.preventDefault();
    const momoNumberInput = document.getElementById('momo-number');
    const customerPhone = momoNumberInput.value.trim();

    if (!selectedPackage || !customerPhone || customerPhone.length < 10) {
        alert('Please enter a valid MTN Mobile Money number (10 digits).');
        return;
    }

    if (!PaystackPop) {
        alert('Payment system not loaded. Please refresh and try again.');
        return;
    }

    // Generate a unique short ID and email for Paystack
    const shortId = generateShortId();
    const email = `customer-${shortId}@datagod.local`; // Dummy email for Paystack
    
    // Initialize Paystack payment
    const handler = PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: email,
        amount: selectedPackage.priceGHS * 100, // Paystack expects amount in pesewas (cent equivalent)
        ref: shortId, // Use short ID as reference
        currency: 'GHS',
        onClose: function() {
            console.log('Payment window closed.');
            alert('Payment cancelled. Your order was not created.');
        },
        onSuccess: async function(response) {
            console.log('Payment successful:', response);
            
            // Create the transaction record in Supabase after successful payment
            const orderData = {
                shortId: shortId,
                customerPhone: customerPhone,
                packageGB: selectedPackage.dataValueGB,
                packagePrice: selectedPackage.priceGHS,
                packageDetails: selectedPackage.packageName,
                status: ORDER_STATUS.PAID,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                paystackRef: response.reference, // Store Paystack reference for verification
            };

            try {
                const result = await createOrderInDB(orderData);
                
                if (result.success) {
                    closeOrderModal();
                    showSuccessScreen(shortId, selectedPackage.packageName);
                } else {
                    alert('Order creation failed after payment. Please contact support with ref: ' + shortId);
                    console.error('Failed to create order in database');
                }
            } catch (error) {
                console.error("Error creating order after payment:", error);
                alert('Order creation error. Please contact support with ref: ' + shortId);
            }
        }
    });
    
    handler.openIframe();
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

    const lookupBtn = document.getElementById('lookup-btn');
    if (lookupBtn) {
        lookupBtn.addEventListener('click', handleStatusLookup);
    }
});
