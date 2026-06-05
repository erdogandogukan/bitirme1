# Vehicle Counting & Parking Occupancy Detection System

A desktop computer vision application that performs real-time vehicle counting (YOLOv8) and parking-occupancy detection (pixel analysis) from a user-selected source (video, image, or IP camera).

## Features

### CarCounter (Vehicle Counting)
- Detects vehicles in each frame using YOLOv8
- Assigns a unique ID to each vehicle and tracks it
- When a vehicle's center enters a virtual polygon zone, the counter increments by 1 if that ID has not been counted before (prevents double counting)
- Outputs results to the interface and to an Excel report

### ParkArea (Parking Occupancy)
- The corner coordinates of each parking space are saved once to a JSON file
- The image is preprocessed with grayscale conversion and Gaussian blur
- Pixel intensity is compared against an empirical threshold → OCCUPIED / EMPTY

## Technologies Used
- Python — main language
- YOLOv8 (Ultralytics) — vehicle detection
- OpenCV — image processing, pixel analysis
- lap — vehicle tracking (ID assignment)
- Eel — desktop interface (Python + HTML/JS/CSS)
- CustomTkinter / pygubu — GUI components
- pandas — Excel reporting
- matplotlib / seaborn — visualization

## Setup & Run

```bash
# Create virtual environment
python -m venv .venv

# Activate (Windows PowerShell)
.venv\Scripts\Activate.ps1

# Activate (Linux/Mac)
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the application
python main.py
```

## Results

### CarCounter
| Method | Counted Vehicles | Difference | Accuracy |
| --- | --- | --- | --- |
| Manual Count | 152 | - | 100% |
| CarCounter | 148 | 4 | 97.3% |

### ParkArea
| Condition | Tested | Correct Detections | Success Rate |
| --- | --- | --- | --- |
| Sunny (no shade) | 50 | 48 | 98% |
| Partial shade | 50 | 45 | 90% |
| Average | 100 | 93 | 93% |
