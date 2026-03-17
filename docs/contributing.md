# Contributing

> This is a placeholder. Branch conventions, code style guidelines, and PR process will be documented here.

---

## Getting Started for Development

See [Installation](installation.md) for setup instructions.

For local development without Docker, you can run the backend and frontend separately:

### Backend (Flask)

```bash
cd backend
pip install -r requirements.txt
python app.py
```

The backend will start on `http://localhost:8000`.

### Frontend (Vite dev server)

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server starts on `http://localhost:5173` and proxies `/api/*` to `localhost:8000`.

---

*Full contributing guidelines TBD.*
