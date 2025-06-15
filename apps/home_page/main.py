import eel
import subprocess
import sys
from pathlib import Path
import socket

# Initialize eel with web files directory
eel.init(str(Path(__file__).parent / 'web'))
root_dir = Path(__file__).parent.parent

# Expose functions to JavaScript
@eel.expose
def launch_car_counter():
    subprocess.Popen([sys.executable, str(root_dir / 'car_counter' / 'main.py')])

@eel.expose
def launch_park_area():
    subprocess.Popen([sys.executable, str(root_dir / 'park_area' / 'main.py')])

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

############################################
# Start the application with a free port
############################################

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
