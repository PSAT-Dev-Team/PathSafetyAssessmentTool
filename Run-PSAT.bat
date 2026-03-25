@echo off
setlocal

cd /d "%~dp0"

set "BASE_DIR=%~dp0"
set "BACKEND=%BASE_DIR%backend"
set "FRONTEND=%BASE_DIR%frontend"
set "VENV=%BACKEND%\.venv"

echo  Path Safety Assessment Tool  --  Startup
echo.
echo  BASE_DIR = %BASE_DIR%
echo  BACKEND  = %BACKEND%
echo  FRONTEND = %FRONTEND%
echo.

:: ===== PRE-FLIGHT: check Node.js =====
where node >nul 2>&1
if errorlevel 1 (
    echo [Error] Node.js not found.
    echo         Install Node.js LTS from: https://nodejs.org/
    echo         After installing, close and reopen this window, then run again.
    pause
    exit /b 1
)
echo [Check] Node.js found.
echo.
:: ======================================

:: ===== BACKEND: Detect conda psat env vs venv =====
set "USE_CONDA=0"
set "CONDA_PYTHON="

:: Look for conda in common install locations
for %%C in (
    "%USERPROFILE%\miniconda3\Scripts\conda.exe"
    "%USERPROFILE%\anaconda3\Scripts\conda.exe"
    "C:\ProgramData\miniconda3\Scripts\conda.exe"
    "C:\ProgramData\anaconda3\Scripts\conda.exe"
) do (
    if exist %%C (
        set "CONDA_EXE=%%~C"
        goto :conda_found
    )
)
goto :no_conda

:conda_found
:: Check if the psat environment exists
for %%C in (
    "%USERPROFILE%\miniconda3\envs\psat\python.exe"
    "%USERPROFILE%\anaconda3\envs\psat\python.exe"
    "C:\ProgramData\miniconda3\envs\psat\python.exe"
    "C:\ProgramData\anaconda3\envs\psat\python.exe"
) do (
    if exist %%C (
        set "CONDA_PYTHON=%%~C"
        set "USE_CONDA=1"
        goto :env_decided
    )
)
echo [Warning] conda found but 'psat' environment not found.
echo           Run: conda create -n psat python=3.11 -y
echo           Then: conda install -c conda-forge gdal geopandas pyproj fiona rtree pyogrio -y
echo           Falling back to venv...

:no_conda
:env_decided

if "%USE_CONDA%"=="1" (
    echo [Backend] Using conda 'psat' environment: %CONDA_PYTHON%
    echo.
    :: Install pip requirements into the conda env (conda-forge packages assumed already installed)
    if exist "%BACKEND%\requirements.txt" (
        echo [Backend] Installing/updating pip requirements into conda env ...
        "%CONDA_PYTHON%" -m pip install -r "%BACKEND%\requirements.txt" --quiet >"%BACKEND%\backend_pip_install.log" 2>&1
        if errorlevel 1 echo [Warning] Some pip packages failed. See: %BACKEND%\backend_pip_install.log
        if not errorlevel 1 echo [Backend] Requirements installed.
    )
    :: Launch backend using conda python directly
    start "PSAT Backend" cmd /k "cd /d %BACKEND% && "%CONDA_PYTHON%" app.py"
    goto :backend_done
)

:: --- Fallback: venv path ---
echo [Backend] conda 'psat' env not available - using venv fallback.

where py >nul 2>&1
if errorlevel 1 (
    echo [Error] Python 3 not found.
    echo         Install Miniconda from: https://docs.conda.io/en/latest/miniconda.html
    echo         Then run: conda create -n psat python=3.11 -y
    echo         And: conda install -c conda-forge gdal geopandas pyproj fiona rtree pyogrio -y
    pause
    exit /b 1
)

if exist "%VENV%\Scripts\activate.bat" goto :venv_ready

echo [Backend] Creating Python virtual environment ...
py -3 -m venv "%VENV%"
if errorlevel 1 (
    echo [Error] Failed to create virtual environment.
    pause
    exit /b 1
)
echo [Backend] Virtual environment created.

:venv_ready
echo [Backend] Upgrading pip ...
"%VENV%\Scripts\python.exe" -m pip install --upgrade pip --quiet

echo [Backend] Installing CPU PyTorch (may take a while) ...
"%VENV%\Scripts\pip.exe" install torch torchvision --index-url https://download.pytorch.org/whl/cpu --quiet >"%BACKEND%\torch_install.log" 2>&1
if errorlevel 1 echo [Warning] PyTorch install may have failed. See: %BACKEND%\torch_install.log
if not errorlevel 1 echo [Backend] PyTorch ready.

if not exist "%BACKEND%\requirements.txt" goto :skip_requirements
echo [Backend] Installing Python requirements ...
"%VENV%\Scripts\pip.exe" install -r "%BACKEND%\requirements.txt" >"%BACKEND%\backend_pip_install.log" 2>&1
if errorlevel 1 (
    echo [Warning] Some pip packages failed. See: %BACKEND%\backend_pip_install.log
    echo           For geospatial packages, follow: %BACKEND%\ONBOARDING.md
)
if not errorlevel 1 echo [Backend] Requirements installed.

:skip_requirements
"%VENV%\Scripts\pip.exe" show ultralytics >nul 2>&1
if errorlevel 1 (
    echo [Backend] ultralytics not found - installing ...
    "%VENV%\Scripts\pip.exe" install ultralytics >"%BACKEND%\ultralytics_install.log" 2>&1
    if errorlevel 1 echo [Warning] ultralytics install failed. See: %BACKEND%\ultralytics_install.log
    if not errorlevel 1 echo [Backend] ultralytics installed.
) else (
    echo [Backend] ultralytics OK.
)

start "PSAT Backend" cmd /k "cd /d %BACKEND% && call .venv\Scripts\activate.bat && python app.py"

:backend_done

:: FRONTEND: Check prerequisites
echo.
if not exist "%FRONTEND%\package.json" goto :no_frontend

:: FRONTEND: Install node_modules if missing
if exist "%FRONTEND%\node_modules" goto :frontend_ready

echo [Frontend] Installing npm packages ...
if exist "%FRONTEND%\package-lock.json" (
    cmd /c "cd /d %FRONTEND% && npm ci"
) else (
    cmd /c "cd /d %FRONTEND% && npm install"
)

:frontend_ready
echo [Frontend] Starting dev server ...
start "PSAT Frontend" /D "%FRONTEND%" cmd /k "npm run dev"

timeout /t 4 >nul
start "" http://localhost:5173/

echo.
echo  Both servers are starting up.
echo.
echo    Backend  : http://localhost:8000
echo    Frontend : http://localhost:5173
echo.
echo  If something is wrong, check these log files:
echo    %BACKEND%\backend_log.txt
echo    %BACKEND%\backend_pip_install.log
echo    %BACKEND%\torch_install.log
echo    %BACKEND%\ultralytics_install.log
echo.
pause
goto :EOF

:no_frontend
echo [Error] No package.json found at: %FRONTEND%
pause
exit /b 1
