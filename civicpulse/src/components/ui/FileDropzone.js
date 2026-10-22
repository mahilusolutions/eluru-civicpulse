import { useCallback, useState } from 'react';
import { FileUp, Upload } from 'lucide-react';

export default function FileDropzone({
  accept,
  multiple = false,
  disabled,
  onFiles,
  icon = 'upload',
  title,
  hint,
  busy = false,
}) {
  const [dragOver, setDragOver] = useState(false);
  const Icon = icon === 'csv' ? FileUp : Upload;

  const handleFiles = useCallback(
    (list) => {
      if (!list?.length || disabled || busy) return;
      onFiles(list);
    },
    [disabled, busy, onFiles]
  );

  return (
    <label
      onDragEnter={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`relative flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-center shadow-soft transition ${
        dragOver
          ? 'border-[var(--brand)] bg-[var(--brand)]/5'
          : 'border-[var(--line)] bg-[var(--bg-elevated)] hover:border-[var(--brand)]/50'
      } ${disabled || busy ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="absolute inset-0 cursor-pointer opacity-0"
        disabled={disabled || busy}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <Icon className="mb-2 h-5 w-5 text-[var(--brand)]" />
      <p className="text-sm font-semibold text-[var(--ink)]">
        {busy ? 'Working…' : title}
      </p>
      {hint ? <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p> : null}
    </label>
  );
}
