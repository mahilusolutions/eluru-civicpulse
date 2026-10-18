export default function Logo({
  size = 'nav',
  showWordmark = true,
  showByline = false,
  variant = 'auto',
}) {
  const markSize =
    size === 'hero'
      ? 'h-[72px] w-[72px] rounded-[18px]'
      : size === 'footer'
        ? 'h-8 w-8 rounded-[10px]'
        : 'h-8 w-8 rounded-[10px]';
  const wordSize =
    size === 'hero'
      ? 'text-[clamp(2.1rem,5vw,3.3rem)]'
      : size === 'footer'
        ? 'text-base'
        : 'text-[15px]';

  return (
    <div
      className={`inline-flex items-center gap-2.5 ${
        variant === 'light' ? 'text-white' : 'text-[var(--ink)]'
      }`}
    >
      <img
        className={`${markSize} object-cover`}
        src="/images/civicpulse-mark.jpg"
        alt=""
        width={size === 'hero' ? 72 : 32}
        height={size === 'hero' ? 72 : 32}
      />
      {showWordmark ? (
        <div className="flex flex-col gap-0.5">
          <span className={`font-bold leading-none tracking-tight ${wordSize}`}>
            CivicPulse
          </span>
          {showByline ? (
            <span
              className={`text-[0.72rem] font-bold uppercase tracking-[0.08em] ${
                variant === 'light' ? 'text-white/70' : 'text-[var(--muted)]'
              }`}
            >
              by Mahilu Solutions · Eluru
            </span>
          ) : null}
        </div>
      ) : (
        <span className="sr-only">CivicPulse</span>
      )}
    </div>
  );
}
