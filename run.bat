@echo off
echo ========================================
echo       ShopeeHunter Startup Script
echo ========================================
echo.

:: Check if Python virtual environment exists
if not exist "backend\venv" (
    echo [1/4] Creating Python virtual environment...
    cd backend
    python -m venv venv
    cd ..
)

:: Activate virtual environment and install dependencies
echo [2/4] Installing backend dependencies...
cd backend
call venv\Scripts\activate.bat
pip install -r requirements.txt -q
playwright install chromium
cd ..

:: Install frontend dependencies
if not exist "frontend\node_modules" (
    echo [3/4] Installing frontend dependencies...
    cd frontend
    npm install
    cd ..
) else (
    echo [3/4] Frontend dependencies already installed.
)

echo [4/4] Starting servers...
echo.
echo ----------------------------------------
echo  Backend: http://localhost:8000
echo  Frontend: http://localhost:5173
echo  API Docs: http://localhost:8000/docs
echo ----------------------------------------
echo.

:: Start backend in new window
start "ShopeeHunter Backend" cmd /k "cd backend && venv\Scripts\activate.bat && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

:: Wait a moment for backend to start
timeout /t 3 /nobreak > nul

:: Start frontend in new window
start "ShopeeHunter Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Both servers are starting! Check the new windows.
echo Press any key to exit this window...
pause > nul
