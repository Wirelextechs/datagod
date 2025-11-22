// storefront.js (COMPLETE SUPABASE INTEGRATION)

// --- SUPABASE INITIALIZATION ---
const SUPABASE_URL = 'https://sjvxlvsmjwpfxlkjjvod.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqdnhsdnNtandwZnhsa2pqdm9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MzM1NTksImV4cCI6MjA3OTAwOTU1OX0.VmrDs5I6zn9wY1VUAsk0f1IzcvjLI7oe_BT5o1CT8J0'; 

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- PAYSTACK INITIALIZATION ---
const PAYSTACK_PUBLIC_KEY = 'pk_live_7e49a5058739c7db12015d0a8ca0c27917110ce0';

// Enum for clear, controlled status values (Matches database status)
const ORDER_STATUS = { CANCELLED: 'CANCELLED', PAID: 'PAID', PROCESSING: 'PROCESSING', FULFILLED: 'FULFILLED' };

// --- Utility Functions ---
// (Server now generates all IDs securely)

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
 * NOTE: createOrderInDB removed - server now creates all orders
 */

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


/**
 * Gets an order's current status from the database.
 */
async function getOrderStatus(shortId) {
    const { data, error } = await supabaseClient
        .from('orders')
        .select('status')
        .eq('short_id', shortId)
        .single();

    if (error) {
        console.error('Error fetching order status:', error);
        return null;
    }
    return data;
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
    const shortId = lookupInput.value.trim().toLowerCase();

    // NEW FORMAT: Alphabetic prefix + 4 digits (e.g., a0001, b0023, z9999)
    const validFormat = /^[a-z]\d{4}$/;
    if (!validFormat.test(shortId)) {
        reportArea.innerHTML = '<p style="color: red;">Please enter a valid Tracking ID (format: a0001, b0123, etc.)</p>';
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
 * Auto-verify payment when returning from Paystack checkout
 */
async function autoVerifyOnPageLoad() {
    const lastOrderRef = sessionStorage.getItem('lastOrderReference');
    
    if (lastOrderRef) {
        console.log('[AUTO-VERIFY] Detected return from Paystack for order:', lastOrderRef);
        sessionStorage.removeItem('lastOrderReference'); // Clear it so we don't re-verify
        
        // Small delay to ensure Paystack has updated their backend
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('[AUTO-VERIFY] Starting automatic verification...');
        // Verify payment
        try {
            const verifyUrl = `${window.location.origin}/api/verify-payment`;
            const response = await fetch(verifyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: lastOrderRef })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('[AUTO-VERIFY] ✓ Payment verified automatically!');
                showSuccessScreen(lastOrderRef, 'MTN Package');
            } else {
                console.log('[AUTO-VERIFY] Payment not confirmed yet, user can verify manually');
            }
        } catch (error) {
            console.log('[AUTO-VERIFY] Error during auto-verification:', error);
        }
    }
}

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
 * Opens the purchase confirmation modal with fee breakdown.
 */
function openOrderModal() {
    const modal = document.getElementById('order-modal');
    const modalTitle = document.getElementById('modal-package-name');
    const basePrice = selectedPackage.priceGHS;
    const fee = basePrice * 0.015; // 1.5% fee
    const total = basePrice + fee;
    
    if (modal && selectedPackage) {
        modalTitle.textContent = selectedPackage.packageName;
        document.getElementById('modal-base-price').textContent = `GHS ${basePrice.toFixed(2)}`;
        document.getElementById('modal-fee-amount').textContent = `GHS ${fee.toFixed(2)}`;
        document.getElementById('modal-total-price').textContent = `GHS ${total.toFixed(2)}`;
        document.getElementById('customer-email').value = ''; 
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
 * Handles order submission - creates order FIRST, then processes payment
 */
async function handleOrderSubmission(event) {
    event.preventDefault();
    
    // Prevent double-submission by disabling button
    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';
    
    try {
        const emailInput = document.getElementById('customer-email');
        const momoNumberInput = document.getElementById('momo-number');
        const email = emailInput.value.trim();
        const customerPhone = momoNumberInput.value.trim();

        if (!selectedPackage || !email || !customerPhone || customerPhone.length < 10) {
            alert('Please enter a valid email and MTN Mobile Money number (10 digits).');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirm Order & Pay';
            return;
        }

        console.log('[ORDER] Initializing secure payment for package:', selectedPackage.id);

        // SECURITY FIX: Send package_id to server, not amount
        // Server will lookup package price and calculate total (prevents price tampering)
        const initUrl = `${window.location.origin}/api/initialize-payment`;
        console.log('[ORDER] Calling:', initUrl);
        
        const response = await fetch(initUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                package_id: selectedPackage.id,
                phone: customerPhone,
                email: email
            })
        });

        const result = await response.json();
        console.log('[ORDER] Response:', result);

        if (!result.success) {
            console.error('Payment initialization failed:', result.error);
            alert('Failed to initialize payment. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirm Order & Pay';
            return;
        }

        // Server created order and generated secure IDs
        const shortId = result.short_id;  // Alphabetic prefix ID (e.g., a0001)
        const authorizationUrl = result.authorization_url;
        const totalAmount = result.amount;

        console.log('[ORDER] ✓ Order created with ID:', shortId);
        console.log('[ORDER] Total amount: GHS', totalAmount);

        // Close modal
        closeOrderModal();
        
        // Show order confirmation with payment redirect
        showPaymentRedirectScreen(shortId, selectedPackage.packageName, authorizationUrl);
        
    } catch (error) {
        console.error("Error processing order:", error);
        alert('An error occurred. Please try again: ' + error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Order & Pay';
    }
}

/**
 * Shows waiting screen with payment button - avoids iframe blocking issues
 */
/**
 * Show payment redirect screen and automatically redirect to Paystack
 * NEW SECURE FLOW: Server has already created order with short_id
 */
function showPaymentRedirectScreen(shortId, packageName, authorizationUrl) {
    console.log('[PAYMENT] Redirecting to Paystack for order:', shortId);
    
    const modal = document.getElementById('order-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Store short ID for auto-verification when user returns
    sessionStorage.setItem('lastOrderReference', shortId);
    console.log('[PAYMENT] Stored short ID for auto-verification:', shortId);
    
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.innerHTML = `
            <div class="waiting-screen" style="z-index: 9999; position: relative; background: white; padding: 30px; text-align: center; max-width: 500px; margin: 40px auto; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="font-size: 3em; margin-bottom: 20px;">📦</div>
                <h2 style="color: #007bff; margin-bottom: 15px;">Order Created Successfully!</h2>
                <p style="margin-bottom: 10px;">Your tracking ID:</p>
                <div style="background: #f0f8ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <strong style="font-size: 2.5em; color: #007bff;">${shortId}</strong>
                </div>
                <p style="color: #666; margin-bottom: 10px;"><strong>Package:</strong> ${packageName}</p>
                
                <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; text-align: left;">
                    <p style="margin: 0; color: #856404;"><strong>⚠️ Important:</strong> Save your tracking ID <strong>${shortId}</strong>!</p>
                </div>
                
                <p style="margin: 20px 0; font-size: 1.1em; color: #333;">
                    Redirecting to payment gateway in <span id="countdown">3</span> seconds...
                </p>
                
                <button 
                    onclick="window.location.href='${authorizationUrl}'"
                    style="background-color: #007bff; color: white; padding: 15px 40px; border: none; border-radius: 5px; font-size: 1.1em; cursor: pointer; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-bottom: 15px; width: 100%;">
                    💳 Pay Now
                </button>
                
                <button 
                    onclick="location.reload()" 
                    style="background-color: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">
                    ← Cancel
                </button>
            </div>
        `;
        
        // Countdown and auto-redirect
        let countdown = 3;
        const countdownEl = document.getElementById('countdown');
        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdownEl) countdownEl.textContent = countdown;
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                window.location.href = authorizationUrl;
            }
        }, 1000);
    }
}

// Global variables to store auto-polling state (for manual verification)
let autoVerifyIntervalId = null;
let autoVerifyAttempts = 0;
const MAX_VERIFY_ATTEMPTS = 60; // 60 attempts * 2 seconds = 2 minutes timeout

/**
 * Automatically verify payment by polling the backend
 */
async function autoVerifyPayment(shortId) {
    try {
        console.log('[AUTO-VERIFY] Checking payment status for:', shortId);
        
        const verifyUrl = `${window.location.origin}/api/verify-payment`;
        const response = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference: shortId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('[AUTO-VERIFY] ✓ Payment verified automatically!');
            
            // Stop polling
            if (autoVerifyIntervalId) {
                clearInterval(autoVerifyIntervalId);
                autoVerifyIntervalId = null;
            }
            
            // Update UI to show success
            const verifyBtn = document.getElementById('verify-payment-btn');
            if (verifyBtn) {
                verifyBtn.textContent = '✓ Payment Verified!';
                verifyBtn.disabled = true;
                verifyBtn.style.backgroundColor = '#28a745';
            }
            
            // Show success screen
            showSuccessScreen(shortId, document.querySelector('[data-package-name]')?.getAttribute('data-package-name') || 'MTN Package');
        } else {
            console.log('[AUTO-VERIFY] Payment not yet confirmed, retrying...');
        }
    } catch (error) {
        console.log('[AUTO-VERIFY] Polling error (will retry):', error.message);
        // Silently continue polling on error
    }
}

/**
 * Shows waiting screen with automatic verification indicator
 */
function showWaitingScreen(shortId, packageName) {
    console.log('[WAITING] Showing waiting screen for order:', shortId);
    
    const modal = document.getElementById('order-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.innerHTML = `
            <div class="waiting-screen" style="z-index: 9999; position: relative; background: white; padding: 30px; text-align: center; max-width: 500px; margin: 40px auto; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="font-size: 3em; margin-bottom: 20px; animation: spin 2s linear infinite;" id="spinner">🔄</div>
                <h2 style="color: #007bff; margin-bottom: 15px;">Verifying Payment...</h2>
                <p style="margin-bottom: 10px;">Your order has been created with tracking ID:</p>
                <div style="background: #f0f8ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <strong style="font-size: 2.5em; color: #007bff;">${shortId}</strong>
                </div>
                <p style="color: #666; margin-bottom: 25px;">
                    Please wait while we verify your payment automatically. This usually takes a few seconds...
                </p>
                <div style="background: #e8f4f8; border-left: 4px solid #17a2b8; padding: 12px; margin: 20px 0; text-align: left;">
                    <p style="margin: 0; color: #495057; font-size: 0.9em;">
                        ℹ️ <strong>If payment verification is taking too long:</strong> You can manually click the button below to verify.
                    </p>
                </div>
                <button 
                    id="verify-payment-btn" 
                    onclick="verifyManualPayment('${shortId}', '${packageName}')"
                    style="background-color: #28a745; color: white; padding: 12px 30px; border: none; border-radius: 5px; font-size: 0.95em; cursor: pointer; font-weight: bold;">
                    ✓ Verify Manually (If Needed)
                </button>
                <button 
                    onclick="location.reload()" 
                    style="background-color: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; margin-top: 15px; cursor: pointer;">
                    Cancel & Start Over
                </button>
            </div>
            <style>
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            </style>
        `;
        window.scrollTo(0, 0);
    }
}

/**
 * Manually verify payment with backend
 */
async function verifyManualPayment(shortId, packageName) {
    const btn = document.getElementById('verify-payment-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Verifying...';
        btn.style.backgroundColor = '#6c757d';
    }
    
    try {
        console.log('[VERIFY] Manually verifying payment for:', shortId);
        
        const verifyUrl = `${window.location.origin}/api/verify-payment`;
        const response = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference: shortId })
        });
        
        const result = await response.json();
        console.log('[VERIFY] Backend response:', result);
        
        if (result.success) {
            console.log('[VERIFY] ✓ Payment verified!');
            showSuccessScreen(shortId, packageName);
        } else {
            console.error('[VERIFY] Payment verification failed:', result.error);
            alert('Payment verification failed: ' + (result.error || 'Unknown error') + '\n\nYour order reference is: ' + shortId + '\n\nPlease contact support if you made a payment.');
            if (btn) {
                btn.disabled = false;
                btn.textContent = '✓ I Have Paid - Verify Now';
                btn.style.backgroundColor = '#28a745';
            }
        }
        
    } catch (error) {
        console.error('[VERIFY] Error:', error);
        alert('Error verifying payment: ' + error.message + '\n\nOrder reference: ' + shortId);
        if (btn) {
            btn.disabled = false;
            btn.textContent = '✓ I Have Paid - Verify Now';
            btn.style.backgroundColor = '#28a745';
        }
    }
}



/**
 * Displays the success/confirmation screen.
 */
function showSuccessScreen(shortId, packageName) {
    console.log('showSuccessScreen called with shortId:', shortId, 'packageName:', packageName);
    
    // Remove all Paystack elements forcefully
    const paystackElements = document.querySelectorAll('iframe[src*="paystack"], iframe[name*="paystack"], .paystack-overlay, .paystack-container');
    paystackElements.forEach(el => {
        console.log('Removing Paystack element:', el);
        el.remove();
    });
    
    // Hide modal completely
    const modal = document.getElementById('order-modal');
    if (modal) {
        modal.style.display = 'none';
        console.log('Modal hidden');
    }
    
    const mainContent = document.getElementById('main-content');
    console.log('Main content element found:', !!mainContent);
    
    if (mainContent) {
        mainContent.innerHTML = `
            <div class="success-screen" style="z-index: 9999; position: relative; background: white; padding: 20px;">
                <h2 style="color: #28a745;">✅ Purchase Confirmed!</h2>
                <p>Your order for <strong>${packageName}</strong> has been successfully placed.</p>
                <div class="short-id-box">
                    <p>Your Tracking ID (Short ID):</p>
                    <strong style="font-size: 2em; color: #007bff;">${shortId}</strong>
                </div>
                <p class="instruction">
                    <strong>IMPORTANT:</strong> Please save this 4-digit ID to track your order status on this page.
                </p>
                <button onclick="location.reload()" style="background-color: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; margin-top: 20px; cursor: pointer;">Back to Store</button>
            </div>
        `;
        console.log('Success screen HTML set');
        
        // Scroll to top to ensure success screen is visible
        window.scrollTo(0, 0);
        console.log('Scrolled to top');
    } else {
        console.error('Main content element not found!');
    }
}

// Initialize the Storefront when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check for returning users from Paystack checkout
    autoVerifyOnPageLoad();
    
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
