const TONES = {
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-800 dark:text-amber-300',
  danger: 'bg-red-500/10 text-red-600 dark:text-red-400',
  info: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  neutral: 'bg-[var(--bg-muted)] text-[var(--ink-soft)]',
  brand: 'bg-[var(--bg-muted)] text-[var(--brand)]',
};

const LABELS = {
  needs_import: 'Needs CSV',
  ready: 'Ready',
  done: 'Done',
  failed: 'Failed',
  error: 'Error',
  queued: 'Waiting',
  ocr: 'Reading…',
  processing: 'Processing',
  pending: 'Waiting',
  active: 'Active',
  resolved: 'Resolved',
  'in progress': 'In progress',
};

export default function StatusBadge({ children, tone = 'neutral', className = '' }) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight ${
        TONES[tone] || TONES.neutral
      } ${className}`}
      title={typeof children === 'string' ? children : undefined}
    >
      {children}
    </span>
  );
}

export function labelForStatus(status = '') {
  const key = String(status).toLowerCase();
  if (LABELS[key]) return LABELS[key];
  return String(status)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function toneForStatus(status = '') {
  const s = String(status).toLowerCase();
  if (['ready', 'done', 'resolved', 'active', 'online'].includes(s)) return 'success';
  if (['needs_import', 'pending', 'queued', 'callback', 'in progress'].includes(s)) {
    return 'warning';
  }
  if (['failed', 'error', 'high', 'opposed'].includes(s)) return 'danger';
  if (['ocr', 'processing', 'visited'].includes(s)) return 'info';
  return 'brand';
}
