/** Short-lived cache for the heavy read-only summaries. Any write clears it, so edits show up at once. */
const store = new Map();
const TTL_MS = 15000;
const MAX_ENTRIES = 500;
const CACHEABLE = /^\/api\/(voters\/stats|booths(\/\d+)?|households|outreach\/stats|dashboard.*|reports.*|election-day.*|map\/booths)$/;

function responseCache(req, res, next) {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400) store.clear();
    });
    return next();
  }
  if (!CACHEABLE.test(req.path)) return next();
  const key = req.originalUrl;
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) {
    res.setHeader('X-Cache', 'HIT');
    return res.type('application/json').send(hit.body);
  }
  const send = res.send.bind(res);
  res.send = (body) => {
    if (res.statusCode === 200 && typeof body === 'string') {
      if (store.size >= MAX_ENTRIES) store.clear();
      store.set(key, { body, expires: Date.now() + TTL_MS });
    }
    return send(body);
  };
  return next();
}

module.exports = { responseCache };
