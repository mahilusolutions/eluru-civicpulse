const STYLES = {
  info: 'border-[var(--line)] bg-[var(--bg-muted)] text-[var(--ink-soft)]',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  danger: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
};

export default function AlertBanner({ children, tone = 'info', className = '' }) {
  if (!children) return null;
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-sm break-words ${STYLES[tone] || STYLES.info} ${className}`}
    >
      {children}
    </div>
  );
}
