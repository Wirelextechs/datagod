#!/usr/bin/env python3
import http.server
import socketserver

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

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
