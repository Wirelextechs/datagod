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
        }])
        .select('short_id'); 

    if (error) {
        console.error('Error submitting order:', error.message || JSON.stringify(error));
        return { success: false, error: error };
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

        // Generate short ID for this order
        const shortId = generateShortId();
        
        // Calculate total amount with 1.5% processing fee
        const basePrice = selectedPackage.priceGHS;
        const fee = basePrice * 0.015; // 1.5% fee
        const totalPrice = basePrice + fee;
        const amount = Math.round(totalPrice * 100); // Convert to pesewas for Paystack

        console.log('[ORDER] Creating order with shortId:', shortId);

        // CREATE THE ORDER FIRST with CANCELLED status (pending payment verification)
        const orderResult = await createOrderInDB({
            shortId: shortId,
            customerPhone: customerPhone,
            packageGB: selectedPackage.dataValueGB,
            packagePrice: totalPrice, // Store total with fee
            packageDetails: selectedPackage.packageName,
            status: ORDER_STATUS.CANCELLED, // Start as CANCELLED, will be verified and updated to PAID
            createdAt: new Date().toISOString(),
        });

        if (!orderResult.success) {
            console.error('Order creation failed:', orderResult.error);
            alert('Failed to create order. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirm Order & Pay';
            return;
        }

        console.log('[ORDER] ✓ Order created with id:', shortId);

        // Close modal
        closeOrderModal();
        
        // Show waiting screen immediately with payment instructions
        showWaitingScreenWithPayment(shortId, selectedPackage.packageName, email, amount);
        
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
function showWaitingScreenWithPayment(shortId, packageName, email, amount) {
    console.log('[WAITING] Showing payment screen for order:', shortId);
    
    const modal = document.getElementById('order-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
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
                <p style="color: #666; margin-bottom: 25px;"><strong>Amount:</strong> GHS ${(amount / 100).toFixed(2)}</p>
                
                <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; text-align: left;">
                    <p style="margin: 0; color: #856404;"><strong>⚠️ Important:</strong> Save your tracking ID <strong>${shortId}</strong> before proceeding to payment!</p>
                </div>
                
                <button 
                    onclick="proceedToPaystack('${shortId}', '${email}', ${amount})"
                    style="background-color: #007bff; color: white; padding: 15px 40px; border: none; border-radius: 5px; font-size: 1.1em; cursor: pointer; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-bottom: 15px; width: 100%;">
                    💳 Proceed to Payment
                </button>
                
                <p style="color: #999; margin: 20px 0; font-size: 0.9em;">
                    After completing payment, return here and click the button below to verify:
                </p>
                
                <button 
                    id="verify-payment-btn" 
                    onclick="verifyManualPayment('${shortId}', '${packageName}')"
                    style="background-color: #28a745; color: white; padding: 12px 30px; border: none; border-radius: 5px; font-size: 1em; cursor: pointer; font-weight: bold; width: 100%;">
                    ✓ I Have Paid - Verify Now
                </button>
                
                <button 
                    onclick="location.reload()" 
                    style="background-color: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; margin-top: 15px; cursor: pointer;">
                    ← Back to Store
                </button>
            </div>
        `;
    }
}

/**
 * Opens Paystack checkout in a NEW BROWSER TAB (avoids iframe blocking)
 */
async function proceedToPaystack(reference, email, amount) {
    console.log('[PAYSTACK] Initializing payment for:', reference);
    
    try {
        // Call backend to initialize Paystack transaction
        const response = await fetch('/api/initialize-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email,
                amount: amount,
                reference: reference
            })
        });
        
        const data = await response.json();
        
        if (data.success && data.authorization_url) {
            console.log('[PAYSTACK] ✓ Payment initialized. Opening checkout in new tab...');
            
            // Create and click a link for mobile compatibility (bypasses popup blockers)
            const paymentLink = document.createElement('a');
            paymentLink.href = data.authorization_url;
            paymentLink.target = '_blank';
            paymentLink.rel = 'noopener noreferrer';
            document.body.appendChild(paymentLink);
            paymentLink.click();
            document.body.removeChild(paymentLink);
            
            alert('Payment window opened in a new tab. Complete your payment there, then return here and click "I Have Paid - Verify Now".');
        } else {
            console.error('[PAYSTACK] Initialization failed:', data.error);
            alert('Failed to initialize payment: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('[PAYSTACK] Error:', error);
        alert('Error connecting to payment system. Please try again.');
    }
}

/**
 * Shows waiting screen with manual verification button
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
                <div style="font-size: 3em; margin-bottom: 20px;">⏳</div>
                <h2 style="color: #007bff; margin-bottom: 15px;">Payment Processing</h2>
                <p style="margin-bottom: 10px;">Your order has been created with tracking ID:</p>
                <div style="background: #f0f8ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <strong style="font-size: 2.5em; color: #007bff;">${shortId}</strong>
                </div>
                <p style="color: #666; margin-bottom: 25px;">
                    If you completed your payment, click the button below to confirm and verify your payment with Paystack.
                </p>
                <button 
                    id="verify-payment-btn" 
                    onclick="verifyManualPayment('${shortId}', '${packageName}')"
                    style="background-color: #28a745; color: white; padding: 15px 40px; border: none; border-radius: 5px; font-size: 1.1em; cursor: pointer; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                    ✓ I Have Paid - Verify Now
                </button>
                <p style="color: #999; margin-top: 20px; font-size: 0.9em;">
                    Note: Verification happens automatically via webhook, but you can use this button if needed.
                </p>
                <button 
                    onclick="location.reload()" 
                    style="background-color: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; margin-top: 15px; cursor: pointer;">
                    Cancel & Start Over
                </button>
            </div>
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
        
        const response = await fetch('/api/verify-payment', {
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
