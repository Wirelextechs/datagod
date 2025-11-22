# DataGod - MTN Data Vending Platform

## Project Overview
DataGod is a real-time data vending platform for MTN Ghana. It allows customers to purchase MTN data packages and administrators to manage orders and packages through a comprehensive dashboard.

**Purpose:** Facilitate internet data vending in Ghana with automated order tracking and management.

**Technology Stack:**
- Frontend: Pure HTML, CSS, JavaScript (no build process)
- Backend/Database: Supabase (external hosted service)
- Deployment: Static site hosting

## Project Structure

```
/
├── index.html          - Main customer storefront
├── admin.html          - Administrator dashboard
├── storefront.js       - Customer-facing logic and Supabase integration
├── admin.js            - Admin dashboard logic and order management
├── server.py           - Simple Python HTTP server with cache control
└── README.md           - Original project documentation
```

## Key Features

### Customer Storefront (index.html)
- Browse available MTN data packages
- **Secure Paystack payment integration** for real transactions
- Purchase data bundles with Mobile Money
- Track order status using a 4-digit Short ID
- WhatsApp support contact integration

### Admin Dashboard (admin.html)
- Secure token-based authentication
- Real-time order management with status updates
- Package CRUD operations (Create, Read, Update, Delete)
- Bulk order processing and CSV export for data loading
- Platform settings configuration (WhatsApp link)

## Database Schema (Supabase)

The application uses three main tables:

1. **orders** - Customer transactions
   - **short_id** (5-character tracking ID with alphabetic prefix: a0000-z9999) - UNIQUE customer-facing ID
   - **paystack_reference** (UUID) - UNIQUE Paystack transaction reference (prevents reference collisions)
   - customer_phone
   - package_gb
   - package_price
   - package_details
   - status (PAID, PROCESSING, FULFILLED, CANCELLED)
   - created_at, updated_at
   
   **⚠️ REQUIRED DATABASE UPDATE:** Run this SQL in Supabase SQL Editor to add the new column:
   ```sql
   ALTER TABLE orders ADD COLUMN IF NOT EXISTS paystack_reference TEXT;
   CREATE INDEX IF NOT EXISTS idx_orders_paystack_reference ON orders(paystack_reference);
   ```

2. **packages** - Data package configurations
   - id
   - package_name
   - data_value_gb
   - price_ghs
   - is_enabled (visibility on storefront)

3. **settings** - Platform configuration
   - id
   - admin_token (for dashboard access)
   - whats_app_link

## Important Setup Notes

### Supabase Configuration
⚠️ **Security Note:** The Supabase URL and anonymous key are currently hardcoded in both `storefront.js` and `admin.js`. For production use, these should be:
- Moved to environment variables
- Protected with Row Level Security (RLS) policies in Supabase
- Admin operations should use a service key, not the anonymous key

Current Supabase credentials are:
- URL: `https://sjvxlvsmjwpfxlkjjvod.supabase.co`
- Anon Key: (embedded in JS files)

### Development Server
The project uses a Python HTTP server configured to:
- Run on port 5000 (required for Replit webview)
- Bind to 0.0.0.0 to allow external access
- Send Cache-Control headers to prevent caching issues

### Deployment Configuration
- Deployment target: **Autoscale** (dynamic server deployment)
- Run command: `python server.py`
- Runs full Python backend with API endpoints
- Automatically scales based on traffic demand

## How to Use

### For Customers
1. Visit the main storefront (index.html)
2. Browse available data packages
3. Click "Buy Now" on desired package
4. Enter email and MTN Mobile Money number
5. Confirm purchase - automatically redirected to Paystack
6. Complete payment on Paystack checkout page
7. Return to site - payment automatically verified
8. Save the 5-character Tracking ID (e.g., a0001) for order status checks

### For Administrators
1. Visit admin.html
2. Enter the admin token (stored in Supabase settings table)
3. View and manage all orders
4. Update order statuses (PAID → PROCESSING → FULFILLED)
5. Create/edit/delete data packages
6. Export orders to CSV for bulk data loading
7. Configure WhatsApp support link

## Recent Changes

### November 22, 2025 - Critical Security Fixes & Payment Flow Improvements
- **🔒 SERVER-SIDE PRICE CALCULATION**: Prevents client-side price tampering
  - Server now derives amount from package database lookup instead of trusting client input
  - Client sends `package_id` only; server calculates total with 1.5% fee
  - Eliminates vulnerability where users could modify payment amounts in DevTools
- **🔒 PAYMENT AMOUNT VERIFICATION**: Validates every payment before marking as PAID
  - Both webhook and manual verification endpoints check payment amount matches expected price
  - Rejects payments if amount mismatch detected (0.02 GHS tolerance for rounding)
  - Logs security alerts when payment tampering is attempted
- **🔒 UNIQUE PAYSTACK REFERENCES**: Prevents duplicate reference errors
  - Generate UUID-based Paystack transaction references (separate from short IDs)
  - Extends order capacity from 10K to unlimited (no more reference collisions)
  - Short IDs now use alphabetic prefixes (a0000-z9999) for 260K unique customer IDs
- **📝 ALPHABETIC PREFIX SYSTEM**: Customer-facing tracking IDs with prefixes
  - Format: `a0000` to `z9999` (letter + 4 digits)
  - First 10K orders: a0000-a9999
  - Next 10K orders: b0000-b9999
  - Extends to 260K total orders (26 letters × 10K each)
  - Generated sequentially based on order count

### November 22, 2025 - Mobile-Optimized Payment Flow
- **✅ FULL-PAGE REDIRECT PAYMENT**: Complete redesign of payment flow for mobile compatibility
  - Switched from new-tab approach to full-page redirect (mobile-friendly)
  - User goes directly to Paystack checkout → completes payment → returns automatically
  - Eliminated iframe/popup blocking issues on mobile browsers
- **✅ AUTOMATIC PAYMENT VERIFICATION**: Auto-verify when returning from Paystack
  - Added `autoVerifyOnPageLoad()` function called on page load
  - Uses sessionStorage to track order reference across redirects
  - Automatically verifies and displays success screen without manual clicks
- **✅ DYNAMIC CALLBACK URL**: Server now uses correct domain dynamically
  - Reads Host header to construct proper return URL
  - Works across dev/prod environments automatically
- **✅ ABSOLUTE API URLS**: All fetch requests use absolute URLs
  - Changed from relative paths (`/api/...`) to absolute (`${window.location.origin}/api/...`)
  - Eliminates potential proxy/caching issues

### November 21, 2025 - Initial Setup
- Imported project from GitHub repository
- Set up Python HTTP server with cache control headers
- Configured workflow to run on port 5000 with webview output
- Configured static deployment settings
- Created project documentation
- Integrated Paystack payment gateway
- Updated storefront to use real Paystack payment popup instead of mock payment
- Added Paystack SDK and integrated payment flow with order creation
- **Switched to LIVE Paystack keys**: Using live public key pk_live_7e49a5058739c7db12015d0a8ca0c27917110ce0
- **Implemented Paystack webhook system**: Automatic payment verification via webhooks
  - Webhook endpoint: `/api/webhook/paystack`
  - HMAC SHA512 signature verification for security
  - Automatically updates orders from CANCELLED → PAID when payment confirmed
- **Updated order status flow**: 
  - Orders start as `CANCELLED` when created (awaiting payment confirmation)
  - Webhook automatically updates to `PAID` when Paystack confirms payment
  - Admin can then update to `PROCESSING` → `FULFILLED` when data is delivered
- **Added fallback "I Have Paid" button**: Manual payment verification if webhook fails
- **Added customer email collection**: Customers provide email for Paystack receipt
- **Improved UX**: 
  - Added waiting screen after payment with manual verification option
  - Shows tracking ID immediately
  - Clear instructions for payment confirmation
- **Fixed order duplication**: Disabled submit button after first click
- Added 1.5% checkout fee displayed in order breakdown
- **✅ SECURITY FIX: Enabled Supabase RLS policies**:
  - Public can INSERT/SELECT orders only
  - Backend service role can UPDATE order status
  - Prevents client-side fraud (customers can't mark orders as PAID)
- **✅ BACKEND FIX: Webhook and verification now use service role key**:
  - Added SUPABASE_SERVICE_ROLE_KEY to Replit Secrets
  - Both webhook and manual verification endpoints now properly update orders to PAID
- **✅ FRONTEND FIX: Payment confirmation screen now shows reliably**:
  - Removed unreliable Paystack `onSuccess` callback (doesn't work in iframes)
  - Waiting screen now shows after ANY payment modal close (success or cancel)
  - Users can always click "I Have Paid" to verify payment status
- **✅ IFRAME BLOCKING FIX: Switched to new-tab payment flow**:
  - Added `/api/initialize-payment` endpoint to initialize Paystack transactions
  - Payment now opens in a NEW BROWSER TAB instead of blocked iframe
  - Completely eliminates ERR_BLOCKED_BY_RESPONSE errors
  - Improved UX: Order confirmation screen shows immediately with tracking ID
  - Users click "Proceed to Payment" → Opens Paystack in new tab → Complete payment → Return and click "I Have Paid"
- **✅ MOBILE FIX: Bypasses popup blockers**:
  - Changed from `window.open()` to programmatic link click
  - Mobile browsers allow user-initiated link clicks but block JavaScript popups
  - Payment now works reliably on mobile devices (iOS/Android)

## User Preferences
- None specified yet

## Payment Integration

### Paystack Payment Gateway
The storefront uses **Paystack LIVE keys** for real payment processing:
- **Live Public Key**: Updated (stored in code via replit.md)
- **Live Secret Key**: Stored in Replit Secrets (PAYSTACK_SECRET_KEY) - **✅ Updated Nov 22, 2025**
- **Webhook URL**: `https://datagod.replit.app/api/webhook/paystack`
- **Webhook Security**: HMAC SHA512 signature verification

### Payment Flow:
1. Customer selects package and enters phone number + email
2. Order created in database with status = CANCELLED
3. Paystack popup opens for payment (1.5% fee added)
4. Customer completes payment
5. **Automatic webhook**: Paystack sends webhook → Server verifies → Order updated to PAID
6. **Fallback option**: Customer can click "I Have Paid" button to manually verify
7. Success screen shows 4-digit tracking ID

### Webhook Configuration Required:
To enable automatic payment confirmation, add this webhook URL in your Paystack Dashboard:
- URL: `https://workspace-wireextechs.replit.app/api/webhook/paystack`
- Events: `charge.success`

## Next Steps for Production
1. ✅ ~~Switch to live Paystack keys~~ - DONE
2. ✅ ~~Add webhook handler for payment verification~~ - DONE
3. **Configure webhook in Paystack Dashboard** - Add webhook URL (see Payment Integration section)
4. Move Supabase credentials to environment variables
5. Implement Supabase Row Level Security (RLS) policies
6. Set up proper admin authentication with service keys
7. Add error logging and monitoring
8. Implement rate limiting for API calls
9. Test complete payment flow with real money (small amount first)
