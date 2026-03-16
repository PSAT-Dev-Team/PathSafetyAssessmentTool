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

:: ===== PRE-FLIGHT: check dependencies before doing any work =====
where py >nul 2>&1
if errorlevel 1 (
    echo [Error] Python 3 not found.
    echo         Install Python 3.10 or newer from: https://www.python.org/downloads/
    echo         Tick "Add Python to PATH" and "Install launcher for all users" during setup.
    pause
    exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
    echo [Error] Node.js not found.
    echo         Install Node.js LTS from: https://nodejs.org/
    echo         After installing, close and reopen this window, then run again.
    pause
    exit /b 1
)
echo [Check] Python and Node.js found.
echo.
:: =================================================================

:: BACKEND: Create virtual environment if missing
if exist "%VENV%\Scripts\activate.bat" goto :venv_ready

echo [Backend] Creating Python virtual environment ...
py -3 -m venv "%VENV%"
if errorlevel 1 goto :venv_error
echo [Backend] Virtual environment created.
goto :venv_ready

:venv_error
echo [Error] Failed to create virtual environment.
echo         Make sure Python 3 is installed: https://www.python.org/downloads/
pause
exit /b 1

:venv_ready
echo [Backend] Upgrading pip ...
"%VENV%\Scripts\python.exe" -m pip install --upgrade pip --quiet

:: BACKEND: Install CPU PyTorch
echo [Backend] Installing CPU PyTorch (skipped if already present, may take a while) ...
"%VENV%\Scripts\pip.exe" install torch torchvision --index-url https://download.pytorch.org/whl/cpu --quiet >"%BACKEND%\torch_install.log" 2>&1
if errorlevel 1 echo [Warning] PyTorch install may have failed. See: %BACKEND%\torch_install.log
if not errorlevel 1 echo [Backend] PyTorch ready.

:: BACKEND: Install requirements.txt
if not exist "%BACKEND%\requirements.txt" goto :skip_requirements

echo [Backend] Installing Python requirements ...
"%VENV%\Scripts\pip.exe" install -r "%BACKEND%\requirements.txt" >"%BACKEND%\backend_pip_install.log" 2>&1
if errorlevel 1 goto :pip_failed
echo [Backend] Requirements installed.
goto :skip_requirements

:pip_failed
echo [Warning] Some pip packages failed. See: %BACKEND%\backend_pip_install.log
echo           For geospatial packages that need system libs, see: %BACKEND%\ONBOARDING.md

:skip_requirements

:: BACKEND: Ensure ultralytics (use pip show - avoids hanging torch DLL load)
"%VENV%\Scripts\pip.exe" show ultralytics >nul 2>&1
if errorlevel 1 goto :install_ultralytics
echo [Backend] ultralytics OK.
goto :ultralytics_done

:install_ultralytics
echo [Backend] ultralytics not found - installing ...
"%VENV%\Scripts\pip.exe" install ultralytics >"%BACKEND%\ultralytics_install.log" 2>&1
if errorlevel 1 echo [Warning] ultralytics install failed. See: %BACKEND%\ultralytics_install.log
if not errorlevel 1 echo [Backend] ultralytics installed.

:ultralytics_done

:: BACKEND: Launch server in its own window
echo [Backend] Starting server ...
start "PSAT Backend" cmd /k "cd /d %BACKEND% && call .venv\Scripts\activate.bat && python app.py"

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
