# CivicPulse Backend

Standalone Node.js API for CivicPulse (Eluru Mayor campaign ops).

## Stack

- Express
- SQLite (`better-sqlite3`)
- Multer PDF uploads
- Optional OCR via Poppler + Tesseract

## Setup

```bash
cd civicpulse-backend
npm install
npm start
```

API: `http://localhost:4000/api`

## Scripts

| Command | What it does |
|---------|----------------|
| `npm start` | Run API |
| `npm run dev` | API with nodemon |
| `npm run ingest:pdfs` | Register PDFs from `../voter_data_eluru` |
| `npm run ocr:all` | OCR parts that need electors |
| `npm run ocr:clear-demo` | Clear demo voters |
| `npm run db:show` | Print DB counts |

## Frontend

In `../civicpulse`:

```env
REACT_APP_API_URL=http://localhost:4000/api
```

```bash
cd ../civicpulse
npm start
```
