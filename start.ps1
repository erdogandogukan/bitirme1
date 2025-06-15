# check .venv folder
if (Test-Path -Path ".venv") {
	Write-Host "Virtual environment already exists."
} else {
	Write-Host "Creating virtual environment..."
	python -m venv .venv
}

# Activate the virtual environment
if (Test-Path -Path ".venv\Scripts\Activate.ps1") {
	& ".venv\Scripts\Activate.ps1"
} else {
	Write-Host "Virtual environment not found."
}

# Install dependencies
if (Test-Path -Path "requirements.txt") {
	Write-Host "Installing dependencies..."
	python -m pip install --upgrade pip
	pip install -r requirements.txt
} else {
	Write-Host "No requirements.txt found."
}

# Run the main script
python main.py

# Deactivate the virtual environment
if (Test-Path -Path ".venv\Scripts\Deactivate.ps1") {
	& ".venv\Scripts\Deactivate.ps1"
} else {
	Write-Host "Virtual environment not found."
}
