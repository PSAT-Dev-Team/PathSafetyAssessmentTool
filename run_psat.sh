# Add common macOS paths
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Get the script directory
BASE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND="$BASE_DIR/backend"
FRONTEND="$BASE_DIR/frontend"

echo "BASE_DIR=$BASE_DIR"
echo "BACKEND=$BACKEND"
echo "FRONTEND=$FRONTEND"

# === Backend Setup ===
echo "[Backend] Checking virtual environment..."
if [ ! -d "$BACKEND/venv" ]; then
    echo "[Backend] Creating venv..."
    python3 -m venv "$BACKEND/venv"
fi

echo "[Backend] Ensuring Python dependencies..."
source "$BACKEND/venv/bin/activate"
pip install --upgrade pip >/dev/null 2>&1

if [ -f "$BACKEND/requirements.txt" ]; then
    pip install -r "$BACKEND/requirements.txt"
else
    pip install flask exifread
fi

echo "[Backend] Starting server in background..."
# Run backend in background and log to file
cd "$BACKEND"
python app.py > backend_log.txt 2>&1 &
BACKEND_PID=$!

# === Frontend Setup ===
echo "[Frontend] Using dir: $FRONTEND"
if [ ! -f "$FRONTEND/package.json" ]; then
    echo "[Error] FRONTEND path wrong or package.json missing"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "[Error] Node.js not found in PATH"
    exit 1
fi

echo "[Frontend] Installing dependencies if needed..."
cd "$FRONTEND"
if [ ! -d "node_modules" ]; then
    if [ -f "package-lock.json" ]; then
        npm ci
    else
        npm install
    fi
fi

echo "[Frontend] Starting dev server in background..."
npm run dev > frontend_log.txt 2>&1 &
FRONTEND_PID=$!

# Wait a few seconds for servers to start
echo "Waiting for servers to warm up..."
sleep 5

# Open the browser
echo "Opening PSAT in browser..."
open http://localhost:5173/

echo "PSAT is running!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "To stop them, run: kill $BACKEND_PID $FRONTEND_PID"

# Keep the script running to catch Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT TERM
wait
