#!/usr/bin/env bash

# check any .venv folder in the current directory
if [ -d ".venv" ]; then
	echo "Found .venv folder, activating it..."
else
	echo "No .venv folder found, creating a new one..."
	python3.12 -m venv .venv
fi

# shellcheck disable=SC1091
source ".venv/bin/activate"

# check if requirements.txt exists
if [ -f "requirements.txt" ]; then
	echo "Found requirements.txt, installing dependencies..."
else
	echo "No requirements.txt found, creating a new one..."
	all_deps=(
		"customtkinter"
		"pillow"
		"opencv-python"
		"pandas"
		"matplotlib"
		"seaborn"
		"imutils"
		"ultralytics"
		"pygubu"
		"eel"
		"lap"
	)
	# Create requirements.txt with all dependencies
	printf "%s\n" "${all_deps[@]}" > requirements.txt
	echo "Created requirements.txt"
fi

pip install -r requirements.txt

python main.py
