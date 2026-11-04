"use client";
import { useEffect, useState } from "react";

/**
 * Tombol dua langkah pengganti confirm() browser (Chrome bisa membisukan
 * dialog bawaan setelah beberapa kali, jadi klik seolah tidak merespons).
 * Klik pertama → tampil "Yakin? Ya / Tidak"; otomatis batal setelah 6 detik.
 */
export function ConfirmButton({
  label,
  question = "Yakin?",
  onConfirm,
  className = "",
  disabled = false,
  yesClassName = "bg-warn text-white",
}: {
  label: React.ReactNode;
  question?: string;
  onConfirm: () => void | Promise<void>;
  className?: string;
  disabled?: boolean;
  yesClassName?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);

  if (armed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
        <span>{question}</span>
        <button
          type="button"
          onClick={async () => {
            setArmed(false);
            await onConfirm();
          }}
          className={`font-semibold px-2 py-1 rounded-md ${yesClassName}`}
        >
          Ya
        </button>
        <button type="button" onClick={() => setArmed(false)} className="text-subtle px-1 py-1">
          Tidak
        </button>
      </span>
    );
  }
  return (
    <button type="button" onClick={() => setArmed(true)} disabled={disabled} className={className}>
      {label}
    </button>
  );
}
