@echo off
setlocal enabledelayedexpansion

:: Navigate to script directory
cd /d "%~dp0"

:: Set paths
set "BASE_DIR=%~dp0"
set "BACKEND=%BASE_DIR%backend"
set "FRONTEND=%BASE_DIR%frontend"

echo ============================================
echo Path Safety Assessment Tool - Setup
echo ============================================
echo BASE_DIR=%BASE_DIR%
echo BACKEND=%BACKEND%
echo FRONTEND=%FRONTEND%
echo.

:: Check if conda is available
where conda >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Conda not found in PATH!
  echo Please install Miniconda or Anaconda:
  echo https://docs.conda.io/projects/miniconda/en/latest/
  echo.
  echo After installation, make sure to check:
  echo - "Add Miniconda3 to my PATH"
  echo - "Register Miniconda3 as my default Python"
  echo.
  pause
  goto :END
)

echo [INFO] Conda found!
conda --version
echo.

:: Create or activate conda environment
echo [Backend] Setting up Python environment...
conda env list | findstr /r "^psat " >nul 2>&1
if errorlevel 1 (
  echo [Backend] Creating conda environment 'psat' with Python 3.11...
  call conda create -n psat python=3.11 gdal geopandas fiona shapely pyproj pandas numpy opencv flask pillow matplotlib requests streamlit geopy rtree nodejs -y
  if errorlevel 1 (
    echo [ERROR] Failed to create conda environment!
    pause
    goto :END
  )
)

echo [Backend] Installing Python dependencies...
call conda run -n psat pip install openpyxl flask-cors exifread

if errorlevel 1 (
  echo [WARNING] Some pip packages failed to install, but continuing...
)

:: Start backend in new window
echo [Backend] Starting Flask server (port 8000)...
start "PSAT Backend" cmd /k ^
 "cd /d %BACKEND% && call conda activate psat && python app.py 2>%BASE_DIR%backend_log.txt"

:: Wait for backend to start
echo [INFO] Waiting for backend to initialize...
timeout /t 3 >nul

:: Check frontend requirements
if not exist "%FRONTEND%\package.json" (
  echo [ERROR] Frontend package.json not found at %FRONTEND%
  pause
  goto :END
)

:: Install frontend dependencies
echo [Frontend] Installing npm dependencies...
call conda run -n psat npm --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found in conda environment!
  pause
  goto :END
)

if not exist "%FRONTEND%\node_modules" (
  cd /d "%FRONTEND%"
  echo [Frontend] Running npm install...
  call conda run -n psat npm install
  if errorlevel 1 (
    echo [WARNING] npm install completed with warnings
  )
  cd /d "%BASE_DIR%"
) else (
  echo [Frontend] npm packages already installed
)

:: Start frontend in new window
echo [Frontend] Starting development server (port 5173)...
start "PSAT Frontend" cmd /k ^
 "cd /d %FRONTEND% && call conda activate psat && npm run dev 1>%BASE_DIR%frontend_log.txt 2>&1"

:: Wait for frontend to start
echo [INFO] Waiting for frontend to initialize...
timeout /t 5 >nul

:: Open browser
echo.
echo ============================================
echo PSAT is starting!
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo ============================================
echo.
start "" http://localhost:5173/

goto :END

:END
echo.
pause
