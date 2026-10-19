/**
 * One-shot production deploy over SSH (password from env or server_credentails.txt).
 * Usage: node deploy/remote-deploy.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require(path.join(
  process.env.TEMP || '/tmp',
  'cp-deploy-tools',
  'node_modules',
  'ssh2'
));

const ROOT = path.resolve(__dirname, '..');
const HOST = process.env.DEPLOY_HOST || '200.234.33.126';
const USER = process.env.DEPLOY_USER || 'root';
const REMOTE = process.env.DEPLOY_PATH || '/var/www/eluru-civicpulse';

function loadCreds() {
  const cred = path.join(ROOT, 'server_credentails.txt');
  const text = fs.readFileSync(cred, 'utf8');
  const get = (key, fallback = '') => {
    const m = text.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return m ? m[1].trim() : fallback;
  };
  return {
    password: process.env.DEPLOY_PASSWORD || get('PASSWORD'),
    pgUrl:
      process.env.DATABASE_URL ||
      get('PG_URL') ||
      `postgresql://${get('PG_USER', 'civicpulse')}:${get('PG_PASSWORD')}@127.0.0.1:5432/${get('PG_DB', 'civicpulse')}`,
  };
}

function exec(conn, cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    console.log(`$ ${cmd}`);
    conn.exec(cmd, { pty: opts.pty !== false }, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      let errOut = '';
      stream.on('data', (d) => {
        const s = d.toString();
        out += s;
        process.stdout.write(s);
      });
      stream.stderr.on('data', (d) => {
        const s = d.toString();
        errOut += s;
        process.stderr.write(s);
      });
      stream.on('close', (code) => {
        if (code !== 0 && !opts.allowFail) {
          reject(new Error(`Exit ${code}: ${cmd}\n${errOut || out}`));
        } else {
          resolve({ code, out, errOut });
        }
      });
    });
  });
}

function ensureRemoteDir(sftp, remotePath) {
  return new Promise((resolve) => {
    const parts = remotePath.split('/').filter(Boolean);
    let cur = remotePath.startsWith('/') ? '' : '';
    let i = 0;
    function step() {
      if (i >= parts.length) return resolve();
      cur += `/${parts[i++]}`;
      sftp.mkdir(cur, { mode: 0o755 }, () => step());
    }
    step();
  });
}

function uploadDir(sftp, localDir, remoteDir, filter) {
  return new Promise((resolve, reject) => {
    const entries = [];
    function walk(dir, rel = '') {
      for (const name of fs.readdirSync(dir)) {
        if (name === 'node_modules' || name === '.git' || name === 'build' || name === 'data') continue;
        if (name.endsWith('.sqlite') || name === 'extracted_ocr_data') continue;
        const full = path.join(dir, name);
        const r = rel ? `${rel}/${name}` : name;
        if (filter && !filter(r, full)) continue;
        let st;
        try {
          st = fs.statSync(full);
        } catch {
          continue;
        }
        if (st.isDirectory()) walk(full, r);
        else entries.push({ full, remote: `${remoteDir}/${r.replace(/\\/g, '/')}`, size: st.size });
      }
    }
    walk(localDir);
    let i = 0;
    async function next() {
      if (i >= entries.length) return resolve(entries.length);
      const e = entries[i++];
      try {
        // Force OneDrive hydrate, then stream via buffer (more reliable than fastPut)
        const buf = fs.readFileSync(e.full);
        await ensureRemoteDir(sftp, path.posix.dirname(e.remote));
        await new Promise((res, rej) => {
          sftp.writeFile(e.remote, buf, (err) => (err ? rej(err) : res()));
        });
        if (i % 25 === 0 || i === entries.length) {
          process.stdout.write(`  uploaded ${i}/${entries.length}\n`);
        }
        next();
      } catch (err) {
        reject(new Error(`Upload ${e.full}: ${err.message}`));
      }
    }
    ensureRemoteDir(sftp, remoteDir).then(() => next());
  });
}

async function main() {
  const { password, pgUrl } = loadCreds();
  if (!password) throw new Error('DEPLOY_PASSWORD / server_credentails PASSWORD missing');
  // On the VPS, Postgres listens locally
  const localDbUrl = pgUrl.replace(/@[^/]+:5432\//, '@127.0.0.1:5432/');
  const conn = new Client();

  await new Promise((resolve, reject) => {
    conn
      .on('ready', resolve)
      .on('error', reject)
      .connect({
        host: HOST,
        port: 22,
        username: USER,
        password,
        readyTimeout: 30000,
      });
  });

  console.log(`Connected to ${USER}@${HOST}`);

  await exec(conn, `mkdir -p ${REMOTE} /var/log/civicpulse ${REMOTE}/eluru_voters_data_ocr_extraction/uploaded_files ${REMOTE}/eluru_voters_data_ocr_extraction/extracted_ocr_data`);

  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, s) => (err ? reject(err) : resolve(s)));
  });

  console.log('Uploading deploy/ …');
  await uploadDir(sftp, path.join(ROOT, 'deploy'), `${REMOTE}/deploy`);

  console.log('Uploading civicpulse-backend/ …');
  await uploadDir(sftp, path.join(ROOT, 'civicpulse-backend'), `${REMOTE}/civicpulse-backend`);

  console.log('Uploading OCR code/ …');
  await uploadDir(
    sftp,
    path.join(ROOT, 'eluru_voters_data_ocr_extraction', 'code'),
    `${REMOTE}/eluru_voters_data_ocr_extraction/code`
  );

  console.log('Uploading civicpulse/src + public + package files …');
  await uploadDir(sftp, path.join(ROOT, 'civicpulse'), `${REMOTE}/civicpulse`, (rel) => {
    if (rel.startsWith('node_modules')) return false;
    if (rel.startsWith('build')) return false;
    return true;
  });

  const apiEnv = `PORT=4000
NODE_ENV=production
DATABASE_URL=${localDbUrl}
OCR_EXTRACT_URL=http://127.0.0.1:2000
OCR_UPLOAD_DIR=${REMOTE}/eluru_voters_data_ocr_extraction/uploaded_files
`;
  const ocrEnv = `PORT=2000
NODE_ENV=production
OCR_PAGE_WORKERS=3
OCR_DPI=160
OCR_SAVE_DISK=0
OCR_PUBLIC_BASE=/ocr
DATABASE_URL=${localDbUrl}
`;
  await new Promise((resolve, reject) => {
    sftp.writeFile(`${REMOTE}/civicpulse-backend/.env`, apiEnv, (err) => (err ? reject(err) : resolve()));
  });
  await new Promise((resolve, reject) => {
    sftp.writeFile(`${REMOTE}/eluru_voters_data_ocr_extraction/code/.env`, ocrEnv, (err) =>
      err ? reject(err) : resolve()
    );
  });

  console.log('Running remote deploy.sh …');
  await exec(
    conn,
    `cd ${REMOTE} && chmod +x deploy/*.sh && bash deploy/deploy.sh`,
    { pty: true }
  );

  console.log('Smoke checks …');
  await exec(conn, `curl -sS http://127.0.0.1:4000/api/health; echo; curl -sS http://127.0.0.1:2000/api/health; echo; curl -sS -o /dev/null -w "nginx_ocr=%{http_code}\\n" http://127.0.0.1/ocr/; curl -sS -o /dev/null -w "nginx_api=%{http_code}\\n" http://127.0.0.1/api/health`, {
    allowFail: true,
  });

  conn.end();
  console.log('Done. Public OCR: http://' + HOST + '/ocr/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
