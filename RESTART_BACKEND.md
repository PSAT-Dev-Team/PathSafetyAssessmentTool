# How to Restart the Backend Server

## Issue

The new `/width/visualize` endpoint was added but the Flask backend server needs to be restarted to register the new route.

## Solution

### Option 1: Using Terminal

1. **Find the running Flask process**:
   ```bash
   ps aux | grep flask
   # or
   ps aux | grep python | grep app
   ```

2. **Kill the process**:
   ```bash
   kill <PID>
   # or if it doesn't stop:
   kill -9 <PID>
   ```

3. **Restart the backend**:
   ```bash
   cd "/Users/xh/Final Year/cyclerap/PathSafetyAssessmentTool/backend"
   python3 app.py
   # or however you normally start it
   ```

### Option 2: Using IDE/Terminal Window

If you started the backend in a terminal window:

1. Press `Ctrl+C` to stop the server
2. Run the start command again:
   ```bash
   python3 app.py
   ```

### Option 3: Quick Restart Script

Create a restart script:

```bash
#!/bin/bash
cd "/Users/xh/Final Year/cyclerap/PathSafetyAssessmentTool/backend"

# Kill existing Flask process
pkill -f "python.*app.py"

# Wait a moment
sleep 2

# Restart
python3 app.py
```

Save as `restart_backend.sh`, make executable (`chmod +x restart_backend.sh`), then run it.

## Verification

After restarting, verify the endpoint works:

```bash
curl -X POST http://localhost:5000/api/projects/MARINA%20BOULEVARD/width/visualize \
  -H "Content-Type: application/json" \
  -d '{"coords": [[103.8608, 1.2820]]}'
```

You should get a JSON response with `"ok": true` instead of a 404 error.

## Why This Happened

Flask doesn't hot-reload new routes automatically. When you:
1. Add a new `@bp.post()` decorator
2. Add a new function to `routes.py`

The server must be restarted to register these new routes.

## Frontend Will Work After Restart

Once the backend is restarted:
- The CORS error will disappear
- The width visualization will load correctly
- You'll see the interactive map and diagnostics

## Alternative: Use Auto-Reload Mode

To avoid manual restarts during development, start Flask with:

```bash
FLASK_ENV=development FLASK_DEBUG=1 python3 app.py
```

Or set in your code:
```python
app.run(debug=True, host='0.0.0.0', port=5000)
```

This enables auto-reload on file changes (though sometimes new routes still need a manual restart).
