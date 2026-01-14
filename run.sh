#!/bin/bash

echo "========================================"
echo "      ShopeeHunter Startup Script"
echo "========================================"
echo ""

# Check if Python virtual environment exists
if [ ! -d "backend/venv" ]; then
    echo "[1/4] Creating Python virtual environment..."
    cd backend
    python3 -m venv venv
    cd ..
fi

# Activate virtual environment and install dependencies
echo "[2/4] Installing backend dependencies..."
cd backend
source venv/bin/activate
pip install -r requirements.txt -q
playwright install chromium
cd ..

# Install frontend dependencies
if [ ! -d "frontend/node_modules" ]; then
    echo "[3/4] Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
else
    echo "[3/4] Frontend dependencies already installed."
fi

echo "[4/4] Starting servers..."
echo ""
echo "----------------------------------------"
echo " Backend: http://localhost:8000"
echo " Frontend: http://localhost:5173"
echo " API Docs: http://localhost:8000/docs"
echo "----------------------------------------"
echo ""

# Function to cleanup on exit
cleanup() {
    echo "Shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start backend
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 3

# Start frontend
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "Both servers are running! Press Ctrl+C to stop."

# Wait for background processes
wait
