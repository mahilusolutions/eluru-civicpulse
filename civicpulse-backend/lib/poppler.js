const fs = require('fs');
const path = require('path');

/** Find pdftoppm: env override, common Windows installs, WinGet package folder, then PATH. */
function findPdftoppm() {
  if (process.env.PDFTOPPM_PATH) return process.env.PDFTOPPM_PATH;
  const fixed = 'C:\\Program Files\\poppler\\Library\\bin\\pdftoppm.exe';
  if (fs.existsSync(fixed)) return fixed;

  const winget = path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\WinGet\\Packages');
  if (process.env.LOCALAPPDATA && fs.existsSync(winget)) {
    const walk = (dir, depth = 0) => {
      if (depth > 6) return null;
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return null;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isFile() && e.name.toLowerCase() === 'pdftoppm.exe') return full;
        if (e.isDirectory() && !e.name.startsWith('.')) {
          const found = walk(full, depth + 1);
          if (found) return found;
        }
      }
      return null;
    };
    const found = walk(winget);
    if (found) return found;
  }
  return 'pdftoppm';
}

module.exports = { findPdftoppm };
