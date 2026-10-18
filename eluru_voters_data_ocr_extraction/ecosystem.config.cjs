const path = require('path');

const APP_ROOT = process.env.ELURU_OCR_ROOT || path.join(__dirname);

module.exports = {
  apps: [
    {
      name: 'eluru-ocr-extract',
      cwd: path.join(APP_ROOT, 'code'),
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 2000,
        OCR_PAGE_WORKERS: 3,
        OCR_DPI: 160,
      },
      error_file: '/var/log/civicpulse/ocr-extract-error.log',
      out_file: '/var/log/civicpulse/ocr-extract-out.log',
      time: true,
    },
  ],
};
