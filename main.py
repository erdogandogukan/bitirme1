import socket
import eel
import sys
import subprocess
from pathlib import Path

# Get the root directory using Path
root_dir = Path(__file__).parent
login_page_path = root_dir / 'apps' / 'login_page' / 'web'

# Initialize Eel with absolute path
eel.init(str(login_page_path))

@eel.expose
def start_home_page():
    root_dir = Path(__file__).parent
    home_page_path = root_dir / 'apps' / 'home_page' / 'main.py'
    subprocess.Popen([sys.executable, str(home_page_path)])
    return True

def find_free_port():
    """Find a free port starting from 8000"""
    port = 8000
    while port < 9000:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('localhost', port))
                return port
        except OSError:
            port += 1
    raise RuntimeError("No free ports found between 8000-9000")

try:
    # Get a free port
    port = find_free_port()
    print(f"Starting application on port {port}")
    
    # Start eel with the free port
    eel.start('index.html', size=(1280, 800), position=(50, 50), port=port, host='localhost', block=True)
except (SystemExit, MemoryError, KeyboardInterrupt):
    print("Uygulama kapatılıyor.")
except Exception as e:
    print("Uygulama başlatılırken bir hata oluştu:")
    print(e)
    input("Çıkmak için Enter'a basın...")
