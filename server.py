#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import urllib.request
import urllib.error
import hmac
import hashlib
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
                reference = data.get('reference')
                print(f'[WEBHOOK] Processing successful payment for reference: {reference}')
                
                # Update order status from CANCELLED to PAID using service role key
                update_url = f'{SUPABASE_URL}/rest/v1/orders?short_id=eq.{reference}'
                update_headers = {
                    'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                }
                update_body = json.dumps({'status': 'PAID'}).encode('utf-8')
                
                update_req = urllib.request.Request(update_url, data=update_body, headers=update_headers, method='PATCH')
                update_response = urllib.request.urlopen(update_req, timeout=10)
                print(f'[WEBHOOK] ✓ Order {reference} updated to PAID successfully')
                
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
        """Verify payment with Paystack and update order status"""
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            request_data = json.loads(body)
            
            reference = request_data.get('reference')
            print(f'[VERIFY] Received verification request for reference: {reference}')
            
            if not reference:
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
            
            # Verify with Paystack API
            print(f'[VERIFY] Calling Paystack API for reference: {reference}')
            verification_url = f'https://api.paystack.co/transaction/verify/{reference}'
            headers = {
                'Authorization': f'Bearer {PAYSTACK_SECRET_KEY}',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            
            print(f'[VERIFY] Using URL: {verification_url}')
            print(f'[VERIFY] Auth header present: {bool(headers["Authorization"])}')
            
            req = urllib.request.Request(verification_url, headers=headers, method='GET')
            response = urllib.request.urlopen(req, timeout=10)
            paystack_response = json.loads(response.read().decode('utf-8'))
            
            print(f'[VERIFY] Paystack response status: {paystack_response.get("status")}, data status: {paystack_response.get("data", {}).get("status")}')
            
            if paystack_response.get('status') and paystack_response.get('data', {}).get('status') == 'success':
                print(f'[VERIFY] Payment verified! Updating order {reference} to PAID')
                
                # Payment verified! Update order status to PAID in Supabase using service role key
                update_url = f'{SUPABASE_URL}/rest/v1/orders?short_id=eq.{reference}'
                update_headers = {
                    'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
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
                    'reference': reference
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
        """Initialize Paystack payment and return checkout URL"""
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            request_data = json.loads(body)
            
            email = request_data.get('email')
            amount = request_data.get('amount')  # Amount in pesewas
            reference = request_data.get('reference')
            
            print(f'[INIT] Initializing payment for {email}, amount: {amount}, ref: {reference}')
            
            if not all([email, amount, reference]):
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': 'Missing required fields'
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
            
            # Call Paystack API to initialize transaction
            paystack_url = 'https://api.paystack.co/transaction/initialize'
            paystack_headers = {
                'Authorization': f'Bearer {PAYSTACK_SECRET_KEY}',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            paystack_body = json.dumps({
                'email': email,
                'amount': amount,
                'reference': reference,
                'currency': 'GHS',
                'callback_url': f'https://datagod.replit.app/?payment_ref={reference}'
            }).encode('utf-8')
            
            print(f'[INIT] Sending request to Paystack...')
            print(f'[INIT] Secret key starts with: {PAYSTACK_SECRET_KEY[:10]}...')
            
            req = urllib.request.Request(paystack_url, data=paystack_body, headers=paystack_headers, method='POST')
            
            try:
                response = urllib.request.urlopen(req, timeout=10)
                paystack_response = json.loads(response.read().decode('utf-8'))
                
                print(f'[INIT] Paystack response: {paystack_response.get("status")}')
                
                if paystack_response.get('status'):
                    authorization_url = paystack_response.get('data', {}).get('authorization_url')
                    print(f'[INIT] ✓ Payment initialized. Authorization URL ready.')
                    
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        'success': True,
                        'authorization_url': authorization_url,
                        'reference': reference
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
                # Read the error response from Paystack
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
