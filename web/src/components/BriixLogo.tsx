// Lambang BRIIX OSP: satu jalur masuk bercabang ke dua titik keluar —
// menggambarkan topologi distribusi FTTH (FDT -> beberapa FAT).

type MarkProps = { size?: number; className?: string; tone?: "dark" | "light" };

/** Lambang saja (tanpa latar kotak), untuk ditempel di atas warna apa pun. */
export function BriixMark({ size = 28, className, tone = "dark" }: MarkProps) {
  const line = tone === "dark" ? "#FFFFFF" : "#16181D";
  const dot = "#2B5FB8";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Lambang BRIIX OSP"
    >
      <line x1="50" y1="88" x2="50" y2="55" stroke={line} strokeWidth="7" strokeLinecap="round" />
      <line x1="50" y1="55" x2="26" y2="20" stroke={line} strokeWidth="7" strokeLinecap="round" />
      <line x1="50" y1="55" x2="74" y2="20" stroke={line} strokeWidth="7" strokeLinecap="round" />
      <circle cx="50" cy="55" r="9" fill={dot} />
      <circle cx="50" cy="88" r="6" fill={line} />
      <circle cx="26" cy="20" r="6" fill={dot} />
      <circle cx="74" cy="20" r="6" fill={dot} />
    </svg>
  );
}

/** Lambang di dalam kotak ber-latar — untuk app icon / avatar di area terang. */
export function BriixIcon({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: "#16181D",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <BriixMark size={size * 0.56} tone="dark" />
    </div>
  );
}

/** Lockup horizontal: lambang + "BRIIX" + badge "OSP". */
export function BriixWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={compact ? "text-sm font-bold" : "text-base font-bold"}>BRIIX</span>
      <span
        className="font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5"
        style={{ fontSize: compact ? 9 : 10, background: "#2B5FB8", color: "#FFFFFF", lineHeight: 1 }}
      >
        OSP
      </span>
    </span>
  );
}
