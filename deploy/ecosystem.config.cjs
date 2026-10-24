/**
 * PM2 processes — CivicPulse API + OCR extract
 *
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save && pm2 startup
 */
const path = require('path');

const APP_ROOT = process.env.CIVICPULSE_ROOT || '/var/www/eluru-civicpulse';

module.exports = {
  apps: [
    {
      name: 'civicpulse-api',
      cwd: path.join(APP_ROOT, 'civicpulse-backend'),
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        OCR_EXTRACT_URL: 'http://127.0.0.1:2000',
        OCR_UPLOAD_DIR: path.join(
          APP_ROOT,
          'eluru_voters_data_ocr_extraction',
          'uploaded_files'
        ),
      },
      error_file: '/var/log/civicpulse/api-error.log',
      out_file: '/var/log/civicpulse/api-out.log',
      time: true,
    },
    {
      name: 'eluru-ocr',
      cwd: path.join(APP_ROOT, 'eluru_voters_data_ocr_extraction', 'code'),
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1024M',
      env: {
        NODE_ENV: 'production',
        PORT: 2000,
        OCR_PAGE_WORKERS: '2', // = number of processors on the server
        OMP_THREAD_LIMIT: '1', // one thread per tesseract: more threads than processors only slows everything down
        OCR_DPI: '160',
        OCR_SAVE_DISK: '0',
        OCR_PUBLIC_BASE: '/ocr',
      },
      error_file: '/var/log/civicpulse/ocr-error.log',
      out_file: '/var/log/civicpulse/ocr-out.log',
      time: true,
    },
  ],
};
