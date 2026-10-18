# Eluru CivicPulse

Campaign operations platform for **Eluru Mayor** — booth/ward voter outreach, issues, surveys, and electoral roll ingest.

## What’s in this repo

| Folder | Role |
|--------|------|
| `civicpulse/` | React frontend (CRA + Tailwind) |
| `civicpulse-backend/` | Express API + SQLite + PDF/OCR ingest |
| `voter_data_eluru/` | Eluru AC draft roll PDFs (parts 1–247) |

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

## Deploy notes

- **Frontend:** static build (`npm run build`) → Nginx / Vercel / Hostinger
- **Backend:** Node on a VPS (e.g. Hostinger KVM 2: 8 GB RAM) with PM2
- **SQLite:** keep on persistent disk on the VPS; do not use ephemeral free PaaS disks
- **Secrets:** never commit `.env` or server passwords

## Local secrets (not in git)

- `civicpulse/.env` — `REACT_APP_API_URL`
- `server_credentails.txt` — VPS login (gitignored)

## License / use

Internal campaign ops tool for Eluru. Keep the repository **private** if it includes voter roll PDFs.
