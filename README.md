# Eluru CivicPulse

Campaign operations platform for **Eluru Mayor** — booth/ward voter outreach, issues, surveys, and electoral roll ingest.

## What’s in this repo

| Folder | Role |
|--------|------|
| `civicpulse/` | React frontend (CRA + Tailwind) |
| `civicpulse-backend/` | Express API + SQLite + PDF/OCR ingest |
| `voter_data_eluru/` | Eluru AC draft roll PDFs (parts 1–247) |
| `deploy/` | Nginx config + PM2 + deploy shell scripts |

## Stack

- **Frontend:** React, React Router, Axios, Lucide, Tailwind
- **Backend:** Node.js, Express, better-sqlite3, Multer
- **OCR (optional):** Poppler (`pdftoppm`) + Tesseract

## Quick start

### 1. Backend API

```bash
cd civicpulse-backend
npm install
npm start
```

API: `http://localhost:4000/api`  
Health: `GET /api/health`

### 2. Frontend

Create `civicpulse/.env`:

```env
REACT_APP_API_URL=http://localhost:4000/api
```

```bash
cd civicpulse
npm install
npm start
```

UI: `http://localhost:3000`

Run **both** processes. The frontend has no local server — it only calls the backend.

## Electoral roll data

PDFs live in `voter_data_eluru/`.

From the backend:

```bash
cd civicpulse-backend
npm run ingest:pdfs          # register PDFs in SQLite
npm run ocr:all              # OCR parts that still need electors (slow)
npm run ocr:part -- --part=1 # OCR one part
npm run db:show              # counts
```

OCR needs Poppler + Tesseract installed on the machine. Prefer OCR **one part at a time** on smaller VPS plans.

## Useful backend scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Run API (port 4000) |
| `npm run dev` | API with nodemon |
| `npm run ingest:pdfs` | Register PDFs from `../voter_data_eluru` |
| `npm run ocr:all` | OCR remaining rolls |
| `npm run ocr:clear-demo` | Clear demo voters |
| `npm run db:show` | Print DB counts |

## Deploy (VPS + Nginx + PM2)

Files live in `deploy/`:

| File | Purpose |
|------|---------|
| `deploy/nginx/civicpulse.conf` | Nginx site (SPA + `/api` proxy) |
| `deploy/ecosystem.config.cjs` | PM2 process for the API |
| `deploy/setup-nginx.sh` | Install Nginx site |
| `deploy/deploy.sh` | Install deps, build frontend, reload PM2 |
| `deploy/pm2-start.sh` | Start/restart API only |

On the server (clone to `/var/www/eluru-civicpulse`):

```bash
cd /var/www/eluru-civicpulse
sudo bash deploy/setup-nginx.sh
bash deploy/deploy.sh
```

- **Frontend build** → `civicpulse/build` (Nginx root)
- **API** → PM2 `civicpulse-api` on `127.0.0.1:4000`
- **Production API URL** → same-origin `/api` (set in `deploy.sh`)
- **SQLite** → stays under `civicpulse-backend/data/`
- **Secrets:** never commit `.env` or server passwords

## Local secrets (not in git)

- `civicpulse/.env` — `REACT_APP_API_URL`
- `server_credentails.txt` — VPS login (gitignored)

## License / use

Internal campaign ops tool for Eluru. Keep the repository **private** if it includes voter roll PDFs.
