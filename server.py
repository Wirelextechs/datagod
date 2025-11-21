#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import urllib.request
import urllib.error
from urllib.parse import urlparse

# Supabase config
SUPABASE_URL = 'https://sjvxlvsmjwpfxlkjjvod.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqdnhsdnNtandwZnhsa2pqdm9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MzM1NTksImV4cCI6MjA3OTAwOTU1OX0.VmrDs5I6zn9wY1VUAsk0f1IzcvjLI7oe_BT5o1CT8J0'

# Paystack secret key (from environment)
PAYSTACK_SECRET_KEY = os.environ.get('PAYSTACK_SECRET_KEY')

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
        
        # Payment verification endpoint
        if parsed_path.path == '/api/verify-payment':
            self.handle_verify_payment()
        else:
            self.send_response(404)
            self.end_headers()

    def handle_verify_payment(self):
        """Verify payment with Paystack and update order status"""
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            request_data = json.loads(body)
            
            reference = request_data.get('reference')
            if not reference:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': 'Missing reference'}).encode())
                return
            
            # Verify with Paystack API
            verification_url = f'https://api.paystack.co/transaction/verify/{reference}'
            headers = {
                'Authorization': f'Bearer {PAYSTACK_SECRET_KEY}',
                'Content-Type': 'application/json'
            }
            
            req = urllib.request.Request(verification_url, headers=headers, method='GET')
            response = urllib.request.urlopen(req, timeout=10)
            paystack_response = json.loads(response.read().decode('utf-8'))
            
            if paystack_response.get('status') and paystack_response.get('data', {}).get('status') == 'success':
                # Payment verified! Update order status to PAID in Supabase
                update_url = f'{SUPABASE_URL}/rest/v1/orders?short_id=eq.{reference}'
                update_headers = {
                    'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                }
                update_body = json.dumps({'status': 'PAID'}).encode('utf-8')
                
                update_req = urllib.request.Request(update_url, data=update_body, headers=update_headers, method='PATCH')
                update_response = urllib.request.urlopen(update_req, timeout=10)
                
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': True,
                    'message': 'Payment verified and order updated to PAID',
                    'reference': reference
                }).encode())
            else:
                # Payment not successful
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': False,
                    'error': 'Payment not successful'
                }).encode())
                
        except urllib.error.HTTPError as e:
            print(f'Paystack API error: {e}')
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': False,
                'error': f'Payment verification failed: {str(e)}'
            }).encode())
        except Exception as e:
            print(f'Error: {e}')
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
