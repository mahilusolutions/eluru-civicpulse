/** Prisma → API JSON (snake_case, BigInt/Decimal safe). */
function serialize(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const snake = k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      let next = serialize(v);
      if (snake === 'status' && next === 'In_progress') next = 'In progress';
      // Alias for Data page / voters UI
      if (snake === 'elector_id') out.voter_id = next;
      out[snake] = next;
    }
    return out;
  }
  return value;
}

module.exports = { serialize };
