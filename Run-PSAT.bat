@echo off
setlocal enabledelayedexpansion

<<<<<<< Updated upstream
:: Navigate to script directory
cd /d "%~dp0"

:: Set paths
=======
REM Navigate to script directory
cd /d "%~dp0" || (echo [ERROR] Failed to navigate to script directory & pause & exit /b 1)

REM Set paths
>>>>>>> Stashed changes
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

:: Create required directories if they don't exist
echo [INFO] Ensuring required directories exist...
if not exist "%BASE_DIR%..\data" mkdir "%BASE_DIR%..\data"
if not exist "%BASE_DIR%..\in" mkdir "%BASE_DIR%..\in"
if not exist "%BACKEND%\shapefiles" mkdir "%BACKEND%\shapefiles"
if not exist "%BACKEND%\models" mkdir "%BACKEND%\models"

:: Check if conda is available
where conda >nul 2>&1
if errorlevel 1 (
<<<<<<< Updated upstream
  echo [ERROR] Conda not found in PATH!
  echo Please install Miniconda or Anaconda:
  echo https://docs.conda.io/projects/miniconda/en/latest/
  echo.
  echo After installation, make sure to check:
  echo - "Add Miniconda3 to my PATH"
  echo - "Register Miniconda3 as my default Python"
  echo.
=======
  REM Try default Miniconda location
  if exist "%USERPROFILE%\miniconda3\condabin\conda.bat" (
    call "%USERPROFILE%\miniconda3\condabin\conda.bat" --version >nul 2>&1
    if errorlevel 1 (
      echo [ERROR] Conda found at default location but failed to initialize!
      pause
      goto :END
    )
    REM Set conda path for this session
    set "CONDA_PATH=%USERPROFILE%\miniconda3\condabin\conda.bat"
  ) else (
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
) else (
  REM Conda found in PATH, use it directly
  set "CONDA_PATH=conda"
)

echo [INFO] Conda found!
call %CONDA_PATH% --version
echo.

:: Create or activate conda environment
echo [Backend] Setting up Python environment...
call %CONDA_PATH% env list | findstr /r "^psat " >nul 2>&1
if errorlevel 1 (
  echo [Backend] Creating conda environment 'psat' with Python 3.11...
  call %CONDA_PATH% create -n psat python=3.11 gdal geopandas fiona shapely pyproj pandas numpy opencv flask pillow matplotlib requests streamlit geopy rtree nodejs -y
  if errorlevel 1 (
    echo [ERROR] Failed to create conda environment!
    pause
    goto :END
  )
)

echo [Backend] Installing Python dependencies...
call %CONDA_PATH% run -n psat pip install -r backend/requirements.txt

if errorlevel 1 (
  echo [WARNING] Some pip packages failed to install, but continuing...
)

:: Start backend in new window
echo [Backend] Starting Flask server (port 8000)...
start "PSAT Backend" cmd /k ^
 "cd /d %BACKEND% && call %CONDA_PATH% activate psat && python app.py 2>%BASE_DIR%backend_log.txt"

:: Wait for backend to start
echo [INFO] Waiting for backend to initialize...
timeout /t 3 >nul

:: Check frontend requirements
if not exist "%FRONTEND%\package.json" (
  echo [ERROR] Frontend package.json not found at %FRONTEND%
>>>>>>> Stashed changes
  pause
  goto :END
)

<<<<<<< Updated upstream
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
=======
:: Install frontend dependencies
echo [Frontend] Installing npm dependencies...
call %CONDA_PATH% run -n psat npm --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found in conda environment!
  pause
  goto :END
)

if not exist "%FRONTEND%\node_modules" (
  cd /d "%FRONTEND%"
  echo [Frontend] Running npm install...
  call %CONDA_PATH% run -n psat npm install
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
 "cd /d %FRONTEND% && call %CONDA_PATH% activate psat && npm run dev 1>%BASE_DIR%frontend_log.txt 2>&1"
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream

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
=======
>>>>>>> Stashed changes
