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
   - short_id (4-digit tracking ID)
   - customer_phone
   - package_gb
   - package_price
   - package_details
   - status (PAID, PROCESSING, FULFILLED, CANCELLED)
   - created_at, updated_at

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
- Deployment target: **Static** (no server-side rendering)
- Public directory: `.` (root directory)
- All files are served as static assets

## How to Use

### For Customers
1. Visit the main storefront (index.html)
2. Browse available data packages
3. Click "Buy Now" on desired package
4. Enter MTN Mobile Money number
5. Confirm purchase
6. Save the 4-digit Short ID for tracking
7. Check order status using the Short ID lookup

### For Administrators
1. Visit admin.html
2. Enter the admin token (stored in Supabase settings table)
3. View and manage all orders
4. Update order statuses (PAID → PROCESSING → FULFILLED)
5. Create/edit/delete data packages
6. Export orders to CSV for bulk data loading
7. Configure WhatsApp support link

## Recent Changes (November 21, 2025)
- Imported project from GitHub repository
- Set up Python HTTP server with cache control headers
- Configured workflow to run on port 5000 with webview output
- Configured static deployment settings
- Created project documentation
- Integrated Paystack payment gateway (pk_test_af33df7aad299f46565a2f5fc2adb221e22122d6)
- Updated storefront to use real Paystack payment popup instead of mock payment
- Added Paystack SDK and integrated payment flow with order creation

## User Preferences
- None specified yet

## Payment Integration

### Paystack Payment Gateway
The storefront now uses **Paystack** for real payment processing:
- **Test Public Key**: pk_test_af33df7aad299f46565a2f5fc2adb221e22122d6
- **Test Secret Key**: Stored in Replit Secrets (PAYSTACK_SECRET_KEY)
- **Payment Flow**: Customer fills form → Paystack popup opens → Payment processed → Order created

### Payment Flow:
1. Customer enters MTN Mobile Money number
2. Clicks "Confirm Order & Pay"
3. Paystack inline popup opens for payment
4. After successful payment, order is created in Supabase
5. Customer receives 4-digit Short ID for tracking

## Next Steps for Production
1. Move Supabase credentials to environment variables
2. Implement Supabase Row Level Security (RLS) policies
3. Switch from test keys to live Paystack keys
4. Set up proper admin authentication with service keys
5. Add webhook handler for Paystack payment verification
6. Add error logging and monitoring
7. Implement rate limiting for API calls
