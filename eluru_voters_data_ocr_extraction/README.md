# Eluru voters OCR extraction

Standalone web app: upload any PDF, queue **one file at a time**, OCR **every page** (Tesseract), save **full text** to `extracted_ocr_data/<pdf-name>.json` + `.txt`. If the PDF looks like an ECI roll, voter fields are also parsed as a bonus. Live progress via SSE.

## Folders

| Path | Purpose |
|------|---------|
| `uploaded_files/` | Incoming PDFs |
| `extracted_ocr_data/` | JSON per completed part |
| `code/` | Express app (port **2000**) |

## Local run

Needs Poppler (`pdftoppm`) + Tesseract on PATH.

```bash
cd eluru_voters_data_ocr_extraction/code
npm install
npm start
```

Open http://localhost:2000

## VPS (PM2)

```bash
# app root
/var/www/eluru_voters_data_ocr_extraction

cd /var/www/eluru_voters_data_ocr_extraction/code
npm install --omit=dev
mkdir -p /var/log/civicpulse
cd ..
pm2 start ecosystem.config.cjs
pm2 save
ufw allow 2000/tcp
```

Open `http://SERVER_IP:2000`

## Behaviour

- Upload → immediate queue (does not wait for OCR)
- PDF queue: serial (`pdfWorkers = 1`)
- Page OCR: parallel (`OCR_PAGE_WORKERS`, default 3), **all pages from page 1**
- Per PDF: `<original-name>.json` (pages[].text + full_text + optional voters) and `<original-name>.txt`
