#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import urllib.request
import urllib.error
import hmac
import hashlib
import uuid
from urllib.parse import urlparse

# Supabase config
SUPABASE_URL = 'https://sjvxlvsmjwpfxlkjjvod.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqdnhsdnNtandwZnhsa2pqdm9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MzM1NTksImV4cCI6MjA3OTAwOTU1OX0.VmrDs5I6zn9wY1VUAsk0f1IzcvjLI7oe_BT5o1CT8J0'
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

# Paystack secret key (from environment)
PAYSTACK_SECRET_KEY = os.environ.get('PAYSTACK_SECRET_KEY')

# Log startup info
if not PAYSTACK_SECRET_KEY:
    print('[ERROR] PAYSTACK_SECRET_KEY is not set in environment variables!')
else:
    print(f'[STARTUP] PAYSTACK_SECRET_KEY loaded (length: {len(PAYSTACK_SECRET_KEY)})')

if not SUPABASE_SERVICE_ROLE_KEY:
    print('[ERROR] SUPABASE_SERVICE_ROLE_KEY is not set!')
else:
    print(f'[STARTUP] SUPABASE_SERVICE_ROLE_KEY loaded (length: {len(SUPABASE_SERVICE_ROLE_KEY)})')


# --- Helper Functions ---

def generate_short_id_with_prefix():
    """
    Generate a unique short ID with alphabetic prefix (a0000-z9999).
    Extends unique reference space from 10K to 260K orders.
    Prefix logic: a=0-9999, b=10000-19999, c=20000-29999, etc.
    """
    try:
        # Query Supabase to count total orders (using HEAD request for accurate count)
        count_url = f'{SUPABASE_URL}/rest/v1/orders?select=count'
        headers = {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'count=exact'  # Request exact count
        }
        
        req = urllib.request.Request(count_url, headers=headers, method='HEAD')
        response = urllib.request.urlopen(req, timeout=5)
        
        # Get count from Content-Range header (format: "0-X/total")
        content_range = response.headers.get('Content-Range', '0-0/0')
        print(f'[SHORT-ID] Content-Range: {content_range}')
        
        # Parse total count from Content-Range (format: "0-9/10" or "*/0")
        if '/' in content_range:
            total_str = content_range.split('/')[-1]
            order_count = int(total_str) if total_str.isdigit() else 0
        else:
            order_count = 0
        
        print(f'[SHORT-ID] Total orders in database: {order_count}')
        
        # Calculate prefix (a-z) and number (0000-9999)
        prefix_index = order_count // 10000  # 0=a, 1=b, 2=c, etc.
        number_in_range = order_count % 10000  # 0-9999
        
        # Convert to letter (a-z, wrap around if > 25)
        prefix = chr(ord('a') + (prefix_index % 26))
        
        # Format as 4-digit number
        short_id = f'{prefix}{number_in_range:04d}'
        
        print(f'[SHORT-ID] Generated: {short_id} (order #{order_count})')
        return short_id
        
    except Exception as e:
        print(f'[SHORT-ID] Error generating short ID: {e}')
        import traceback
        traceback.print_exc()
        # Fallback: random ID with 'x' prefix
        import random
        return f'x{random.randint(0, 9999):04d}'


def get_package_by_id(package_id):
    """Fetch package details from Supabase by ID"""
    try:
        url = f'{SUPABASE_URL}/rest/v1/packages?id=eq.{package_id}&select=*'
        headers = {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': f'Bearer {SUPABASE_ANON_KEY}'
        }
        
        req = urllib.request.Request(url, headers=headers, method='GET')
        response = urllib.request.urlopen(req, timeout=5)
        data = json.loads(response.read().decode('utf-8'))
        
        if data and len(data) > 0:
            return data[0]
        return None
        
    except Exception as e:
        print(f'[PACKAGE] Error fetching package {package_id}: {e}')
        return None


def create_order_in_supabase(short_id, phone, package_data, paystack_reference):
    """Create order in Supabase database"""
    try:
        url = f'{SUPABASE_URL}/rest/v1/orders'
        headers = {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        }
        
        order_data = {
            'short_id': short_id,
            'customer_phone': phone,
            'package_gb': int(package_data['data_value_gb']),
            'package_price': float(package_data['price_ghs']),
            'package_details': package_data['package_name'],
            'paystack_reference': paystack_reference,
            'status': 'CANCELLED'  # Will be updated to PAID by webhook
        }
        
        print(f'[ORDER] Attempting to create order: {json.dumps(order_data, indent=2)}')
        
        body = json.dumps(order_data).encode('utf-8')
        req = urllib.request.Request(url, data=body, headers=headers, method='POST')
        response = urllib.request.urlopen(req, timeout=5)
        
        print(f'[ORDER] Created order {short_id} with Paystack reference {paystack_reference}')
        return True
        
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        print(f'[ORDER] HTTP Error {e.code}: {error_body}')
        return False
    except Exception as e:
        print(f'[ORDER] Error creating order: {e}')
        import traceback
        traceback.print_exc()
        return False


class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        # Parse URL
        parsed_path = urlparse(self.path)
        client_ip = self.client_address[0]
        user_agent = self.headers.get('User-Agent', 'Unknown')
        print(f'[REQUEST] POST {parsed_path.path} from {client_ip}')
        print(f'[REQUEST] User-Agent: {user_agent[:60]}...')
        
        # Paystack webhook endpoint
        if parsed_path.path == '/api/webhook/paystack':
            self.handle_paystack_webhook()
        # Payment verification endpoint
        elif parsed_path.path == '/api/verify-payment':
            self.handle_verify_payment()
        # Payment initialization endpoint
        elif parsed_path.path == '/api/initialize-payment':
            self.handle_initialize_payment()
        else:
            print(f'[REQUEST] ERROR: 404 - Path not recognized: {parsed_path.path}')
            self.send_response(404)
            self.end_headers()

    def handle_paystack_webhook(self):
        """Handle Paystack webhook for automatic payment confirmation"""
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            # Verify webhook signature
            paystack_signature = self.headers.get('x-paystack-signature', '')
            print(f'[WEBHOOK] Received webhook, signature present: {bool(paystack_signature)}')
            
            if not PAYSTACK_SECRET_KEY:
                print('[WEBHOOK] ERROR: PAYSTACK_SECRET_KEY is not set!')
                self.send_response(500)
                self.end_headers()
                return
            
            # Compute expected signature
            computed_signature = hmac.new(
                PAYSTACK_SECRET_KEY.encode('utf-8'),
                body,
                hashlib.sha512
            ).hexdigest()
            
            # Verify signature matches
            if not hmac.compare_digest(computed_signature, paystack_signature):
                print('[WEBHOOK] ERROR: Invalid signature - possible fraud attempt!')
                self.send_response(401)
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Invalid signature'}).encode())
                return
            
            print('[WEBHOOK] ✓ Signature verified successfully')
            
            # Parse webhook payload
            webhook_data = json.loads(body.decode('utf-8'))
            event = webhook_data.get('event')
            data = webhook_data.get('data', {})
            
            print(f'[WEBHOOK] Event: {event}, Status: {data.get("status")}')
            
            # Only process successful charge events
            if event == 'charge.success' and data.get('status') == 'success':
                paystack_reference = data.get('reference')  # This is the UUID
                paid_amount = data.get('amount', 0) / 100  # Convert pesewas to GHS
                print(f'[WEBHOOK] Processing successful payment. Ref: {paystack_reference}, Amount: GHS {paid_amount:.2f}')
                
                # SECURITY: Lookup order to verify amount before marking as PAID
                order_url = f'{SUPABASE_URL}/rest/v1/orders?paystack_reference=eq.{paystack_reference}&select=*'
                order_headers = {
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}'
                }
                order_req = urllib.request.Request(order_url, headers=order_headers, method='GET')
                order_response = urllib.request.urlopen(order_req, timeout=5)
                orders = json.loads(order_response.read().decode('utf-8'))
                
                if not orders or len(orders) == 0:
                    print(f'[WEBHOOK] ERROR: Order with paystack_reference {paystack_reference} not found')
                    self.send_response(404)
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'error', 'message': 'order not found'}).encode())
                    return
                
                order = orders[0]
                short_id = order.get('short_id')
                expected_price = float(order.get('package_price', 0))
                expected_total = expected_price * 1.015  # Include 1.5% fee
                
                print(f'[WEBHOOK] Order {short_id}: Expected GHS {expected_total:.2f}, Paid GHS {paid_amount:.2f}')
                
                # SECURITY: Verify amount matches (with 0.02 GHS tolerance)
                if abs(paid_amount - expected_total) > 0.02:
                    print(f'[WEBHOOK] SECURITY ALERT: Payment amount mismatch!')
                    print(f'[WEBHOOK] Expected GHS {expected_total:.2f}, but received GHS {paid_amount:.2f}')
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'error', 'message': 'amount mismatch'}).encode())
                    return
                
                # Update order status from CANCELLED to PAID using service role key
                update_url = f'{SUPABASE_URL}/rest/v1/orders?paystack_reference=eq.{paystack_reference}'
                update_headers = {
                    'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                }
                update_body = json.dumps({'status': 'PAID'}).encode('utf-8')
                
                update_req = urllib.request.Request(update_url, data=update_body, headers=update_headers, method='PATCH')
                update_response = urllib.request.urlopen(update_req, timeout=10)
                print(f'[WEBHOOK] ✓ Order {short_id} updated to PAID successfully')
                
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success'}).encode())
            else:
                print(f'[WEBHOOK] Event ignored: {event}')
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'ignored'}).encode())
                
        except Exception as e:
            print(f'[WEBHOOK] Error: {e}')
            import traceback
            traceback.print_exc()
            self.send_response(500)
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def handle_verify_payment(self):
        """
        Verify payment with Paystack and update order status.
        SECURITY: Validates payment amount matches expected package price.
        """
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            request_data = json.loads(body)
            
            short_id = request_data.get('reference')  # This is the short_id (e.g., a0001)
            print(f'[VERIFY] Received verification request for short_id: {short_id}')
            
            if not short_id:
                print('[VERIFY] Error: Missing reference')
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': 'Missing reference'}).encode())
                return
            
            # Check if secret key exists
            if not PAYSTACK_SECRET_KEY:
                print('[VERIFY] ERROR: PAYSTACK_SECRET_KEY is not set!')
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': 'Server configuration error: PAYSTACK_SECRET_KEY not set'
                }).encode())
                return
            
            # SECURITY: Lookup order in database to get paystack_reference and expected price
            order_url = f'{SUPABASE_URL}/rest/v1/orders?short_id=eq.{short_id}&select=*'
            order_headers = {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': f'Bearer {SUPABASE_ANON_KEY}'
            }
            order_req = urllib.request.Request(order_url, headers=order_headers, method='GET')
            order_response = urllib.request.urlopen(order_req, timeout=5)
            orders = json.loads(order_response.read().decode('utf-8'))
            
            if not orders or len(orders) == 0:
                print(f'[VERIFY] ERROR: Order {short_id} not found')
                self.send_response(404)
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': 'Order not found'
                }).encode())
                return
            
            order = orders[0]
            paystack_reference = order.get('paystack_reference')
            expected_price = float(order.get('package_price', 0))
            
            print(f'[VERIFY] Order found. Paystack ref: {paystack_reference}, Expected price: GHS {expected_price}')
            
            # Verify with Paystack API using the paystack_reference (UUID)
            print(f'[VERIFY] Calling Paystack API for paystack_reference: {paystack_reference}')
            verification_url = f'https://api.paystack.co/transaction/verify/{paystack_reference}'
            headers = {
                'Authorization': f'Bearer {PAYSTACK_SECRET_KEY}',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            
            req = urllib.request.Request(verification_url, headers=headers, method='GET')
            response = urllib.request.urlopen(req, timeout=10)
            paystack_response = json.loads(response.read().decode('utf-8'))
            
            print(f'[VERIFY] Paystack response status: {paystack_response.get("status")}, data status: {paystack_response.get("data", {}).get("status")}')
            
            if paystack_response.get('status') and paystack_response.get('data', {}).get('status') == 'success':
                # SECURITY: Verify amount paid matches expected amount (with 1.5% fee tolerance)
                paid_amount_pesewas = paystack_response.get('data', {}).get('amount', 0)
                paid_amount_ghs = paid_amount_pesewas / 100
                
                # Calculate expected total (package price + 1.5% fee)
                expected_total = expected_price * 1.015
                
                print(f'[VERIFY] Paid: GHS {paid_amount_ghs:.2f}, Expected: GHS {expected_total:.2f}')
                
                # Allow 0.02 GHS tolerance for rounding
                if abs(paid_amount_ghs - expected_total) > 0.02:
                    print(f'[VERIFY] SECURITY ALERT: Payment amount mismatch!')
                    print(f'[VERIFY] Expected GHS {expected_total:.2f}, but received GHS {paid_amount_ghs:.2f}')
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        'success': False,
                        'error': 'Payment amount mismatch'
                    }).encode())
                    return
                
                print(f'[VERIFY] ✓ Amount verified! Updating order {short_id} to PAID')
                
                # Payment verified! Update order status to PAID in Supabase using service role key
                update_url = f'{SUPABASE_URL}/rest/v1/orders?short_id=eq.{short_id}'
                update_headers = {
                    'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                }
                update_body = json.dumps({'status': 'PAID'}).encode('utf-8')
                
                update_req = urllib.request.Request(update_url, data=update_body, headers=update_headers, method='PATCH')
                update_response = urllib.request.urlopen(update_req, timeout=10)
                print(f'[VERIFY] Order updated successfully. Response status: {update_response.status}')
                
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': True,
                    'message': 'Payment verified and order updated to PAID',
                    'reference': short_id
                }).encode())
            else:
                print(f'[VERIFY] Payment not successful on Paystack')
                # Payment not successful
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': 'Payment not successful'
                }).encode())
                
        except urllib.error.HTTPError as e:
            print(f'[VERIFY] HTTP Error {e.code}: {e.reason}')
            print(f'[VERIFY] Error response: {e.read().decode("utf-8")}')
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': False,
                'error': f'Payment verification failed: HTTP {e.code}'
            }).encode())
        except Exception as e:
            print(f'[VERIFY] Unexpected error: {e}')
            import traceback
            traceback.print_exc()
            self.send_response(500)
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': False,
                'error': str(e)
            }).encode())

    def handle_initialize_payment(self):
        """
        Initialize Paystack payment with server-side price calculation.
        SECURITY: Server derives amount from package database lookup, not client input.
        """
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            request_data = json.loads(body)
            
            email = request_data.get('email')
            phone = request_data.get('phone')
            package_id = request_data.get('package_id')
            
            print(f'[INIT] Request for package {package_id}, phone: {phone}, email: {email}')
            
            # Validate required fields
            if not all([email, phone, package_id]):
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': 'Missing required fields (email, phone, package_id)'
                }).encode())
                return
            
            if not PAYSTACK_SECRET_KEY:
                print('[INIT] ERROR: PAYSTACK_SECRET_KEY is not set!')
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': 'Server configuration error'
                }).encode())
                return
            
            # SECURITY: Fetch package from database (server-side)
            package = get_package_by_id(package_id)
            if not package:
                print(f'[INIT] ERROR: Package {package_id} not found')
                self.send_response(404)
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': 'Package not found'
                }).encode())
                return
            
            # SECURITY: Calculate amount server-side (client cannot tamper)
            package_price = float(package['price_ghs'])
            checkout_fee = package_price * 0.015  # 1.5% processing fee
            total_price = package_price + checkout_fee
            amount_in_pesewas = int(total_price * 100)  # Convert to pesewas
            
            print(f'[INIT] Package: {package["package_name"]}, Price: GHS {package_price:.2f}, Total: GHS {total_price:.2f}')
            
            # Generate unique Paystack reference (UUID)
            paystack_reference = str(uuid.uuid4())
            
            # Generate alphabetic-prefix short ID (a0000-z9999)
            short_id = generate_short_id_with_prefix()
            
            print(f'[INIT] Short ID: {short_id}, Paystack Ref: {paystack_reference}')
            
            # Create order in database
            order_created = create_order_in_supabase(short_id, phone, package, paystack_reference)
            if not order_created:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': 'Failed to create order'
                }).encode())
                return
            
            # Call Paystack API to initialize transaction
            paystack_url = 'https://api.paystack.co/transaction/initialize'
            paystack_headers = {
                'Authorization': f'Bearer {PAYSTACK_SECRET_KEY}',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            # Get the correct return URL based on the request
            host_header = self.headers.get('Host', 'localhost:5000')
            scheme = 'https' if 'replit' in host_header else 'http'
            callback_url = f'{scheme}://{host_header}/?payment_ref={short_id}'
            print(f'[INIT] Callback URL: {callback_url}')
            
            paystack_body = json.dumps({
                'email': email,
                'amount': amount_in_pesewas,
                'reference': paystack_reference,
                'currency': 'GHS',
                'callback_url': callback_url,
                'metadata': {
                    'short_id': short_id,
                    'package_name': package['package_name'],
                    'phone': phone
                }
            }).encode('utf-8')
            
            print(f'[INIT] Sending request to Paystack...')
            
            req = urllib.request.Request(paystack_url, data=paystack_body, headers=paystack_headers, method='POST')
            
            try:
                response = urllib.request.urlopen(req, timeout=10)
                paystack_response = json.loads(response.read().decode('utf-8'))
                
                print(f'[INIT] Paystack response: {paystack_response.get("status")}')
                
                if paystack_response.get('status'):
                    authorization_url = paystack_response.get('data', {}).get('authorization_url')
                    print(f'[INIT] ✓ Payment initialized successfully')
                    
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        'success': True,
                        'authorization_url': authorization_url,
                        'short_id': short_id,
                        'paystack_reference': paystack_reference,
                        'amount': total_price
                    }).encode())
                else:
                    print(f'[INIT] Paystack initialization failed')
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        'success': False,
                        'error': 'Payment initialization failed'
                    }).encode())
            except urllib.error.HTTPError as http_err:
                error_body = http_err.read().decode('utf-8')
                print(f'[INIT] HTTP Error {http_err.code}: {http_err.reason}')
                print(f'[INIT] Paystack error response: {error_body}')
                
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': f'Paystack API error: {error_body}'
                }).encode())
                
        except Exception as e:
            print(f'[INIT] Unexpected error: {e}')
            import traceback
            traceback.print_exc()
            self.send_response(500)
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': False,
                'error': str(e)
            }).encode())

    def do_GET(self):
        # Serve static files
        if self.path == '/':
            self.path = '/index.html'
        return super().do_GET()

class ReusableHTTPServer(socketserver.TCPServer):
    allow_reuse_address = True

PORT = 5000
Handler = NoCacheHTTPRequestHandler

try:
    with ReusableHTTPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Server running at http://0.0.0.0:{PORT}/")
        httpd.serve_forever()
except OSError as e:
    print(f"Error: {e}")
    print("Port 5000 is still in use. Please try again in a moment.")
    exit(1)
