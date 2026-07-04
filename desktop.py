import os
import threading
import http.server
import socketserver
import webview
import ctypes

# Tell Windows to treat this as a standalone application on the taskbar
try:
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("spendwise.expenses.tracker")
except Exception:
    pass

PORT = 8181
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
        
    def log_message(self, format, *args):
        # Silence console logs for cleaner terminal output
        pass

def run_server():
    handler = MyHTTPRequestHandler
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"SpendWise Desktop background engine serving on port {PORT}")
        httpd.serve_forever()

if __name__ == "__main__":
    # Start the HTTP server in a background daemon thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    print("Launching SpendWise Desktop Application...")
    
    # Open native window
    webview.create_window(
        title="SpendWise - Expenses Tracker",
        url=f"http://localhost:{PORT}?env=desktop",
        width=1200,
        height=800,
        resizable=True,
        min_size=(900, 600)
    )
    webview.start()
