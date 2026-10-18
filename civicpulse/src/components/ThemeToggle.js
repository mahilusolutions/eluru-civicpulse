import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';

export default function ThemeToggle({ className = '', compact = false }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={`inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--brand)] ${className}`}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-eluru-gold" strokeWidth={2.25} />
      ) : (
        <Moon className="h-4 w-4 text-[var(--brand)]" strokeWidth={2.25} />
      )}
      {!compact ? (
        <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
      ) : null}
    </button>
  );
}
