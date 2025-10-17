@echo off
setlocal

:: 1) 切到脚本所在目录（/d 兼容不同盘符）
cd /d "%~dp0"

:: 2) 以脚本所在目录为根目录
set "BASE_DIR=%~dp0"
set "BACKEND=%BASE_DIR%backend"
set "FRONTEND=%BASE_DIR%frontend"

echo BASE_DIR=%BASE_DIR%
echo BACKEND =%BACKEND%
echo FRONTEND=%FRONTEND%

:: === 2) 后端：创建/启用虚拟环境，安装依赖，然后启动 ===
if not exist "%BACKEND%\venv" (
  echo [Backend] Creating venv ...
  py -3 -m venv "%BACKEND%\venv"
)

echo [Backend] Ensuring Python deps ...
call "%BACKEND%\venv\Scripts\pip.exe" install --upgrade pip >nul 2>&1
if exist "%BACKEND%\requirements.txt" (
  call "%BACKEND%\venv\Scripts\pip.exe" install -r "%BACKEND%\requirements.txt"
) else (
  :: 没有 requirements.txt 的情况下，至少补你遇到过的依赖
  call "%BACKEND%\venv\Scripts\pip.exe" install flask exifread
)

echo [Backend] Starting server ...
:: 用新的窗口启动后端；失败日志写到 backend_log.txt 方便排错
start "PSAT Backend" cmd /k ^
 "cd /d %BACKEND% && call venv\Scripts\activate && python app.py 2>backend_log.txt"

 echo [Frontend] Using dir: %FRONTEND%
if not exist "%FRONTEND%\package.json" (
  echo [Error] FRONTEND path wrong or package.json missing
  pause
  goto :END
)

where node >nul 2>&1 || ( echo [Error] Node.js not found in PATH & pause & goto :END )
where npm  >nul 2>&1 || ( echo [Error] npm not found in PATH    & pause & goto :END )

echo [Frontend] Installing deps if needed ...
if not exist "%FRONTEND%\node_modules" (
  if exist "%FRONTEND%\package-lock.json" (
    cmd /c "cd /d %FRONTEND% && npm ci"
  ) else (
    cmd /c "cd /d %FRONTEND% && npm install"
  )
)

echo [Frontend] Starting dev server ...
:: 用 /D 指定当前目录；把输出写到前端目录下的日志
start "PSAT Frontend" /D "%FRONTEND%" cmd /k "npm run dev 1>frontend_log.txt 2>&1"

:: 给 Vite 一点时间热身，再开页面；若首启慢可改成 4~6 秒
timeout /t 4 >nul
start "" http://localhost:5173/
