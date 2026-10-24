import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { inputClass } from '../ui/Panel';

/** A password box with a show/hide eye. */
export default function PasswordField({ id, value, onChange, autoComplete = 'current-password', placeholder, invalid = false, autoFocus = false }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        spellCheck={false}
        autoCapitalize="none"
        className={`${inputClass} !pr-11 ${invalid ? '!border-red-500' : ''}`}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]"
        aria-label={shown ? 'Hide password' : 'Show password'}
        title={shown ? 'Hide password' : 'Show password'}
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
