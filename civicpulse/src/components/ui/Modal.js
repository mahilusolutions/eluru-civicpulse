import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-4xl',
};

/**
 * Popup shell used by every page: light backdrop (no blur, no black), centred on desktop,
 * bottom sheet on phones. Rendered on <body> because the page has a transform animation,
 * which would otherwise make "fixed" mean "fixed to the scrolling page".
 */
export default function Modal({ title, subtitle, badge, onClose, size = 'md', children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-[var(--ink)]/10" onClick={onClose} />

      <div
        className={`relative flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[0_12px_40px_-12px_rgba(15,27,45,0.35)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl ${SIZES[size] || SIZES.md}`}
      >
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          {badge ? (
            <span className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] px-2 text-sm font-extrabold text-white">
              {badge}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-extrabold leading-tight text-[var(--ink)]">{title}</h2>
            {subtitle ? <div className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4">{children}</div>

        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] bg-[var(--bg-muted)]/40 px-4 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
