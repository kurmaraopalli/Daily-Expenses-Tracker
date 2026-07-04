import http.server
import socketserver
import webbrowser
import os

PORT = 8080
Handler = http.server.SimpleHTTPRequestHandler

# Ensure we are serving from the directory containing this script
script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)

print(f"Starting SpendWise server at http://localhost:{PORT}...")
print("Press Ctrl+C in the terminal to stop the server.")

# Automatically open the web browser
webbrowser.open(f"http://localhost:{PORT}")

# Start serving files
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down SpendWise server.")
        httpd.server_close()
