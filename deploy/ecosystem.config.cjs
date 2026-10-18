/**
 * PM2 process file for CivicPulse API
 *
 * Usage (from repo root on the VPS):
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup
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
      },
      error_file: '/var/log/civicpulse/api-error.log',
      out_file: '/var/log/civicpulse/api-out.log',
      time: true,
    },
  ],
};
