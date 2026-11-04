"use client";
import { useEffect, useRef, useState } from "react";

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const HARI_PENDEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]; // mulai Senin
const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function todayIso() {
  return toIso(new Date());
}
function toIso(d: Date) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function fromIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function formatTanggalId(iso: string) {
  const d = fromIso(iso);
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Pemilih tanggal berbahasa Indonesia (kalender bawaan browser ikut bahasa
 * sistem, tidak bisa diatur). Tampil "Rabu, 4 November 2026", tombol hari
 * sebelumnya/berikutnya, dan kalender bulan dengan nama hari Sen–Min.
 */
export function DatePickerId({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const sel = fromIso(value);
  const [view, setView] = useState({ y: sel.getFullYear(), m: sel.getMonth() });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = fromIso(value);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function shift(days: number) {
    const d = fromIso(value);
    d.setDate(d.getDate() + days);
    onChange(toIso(d));
  }
  function shiftMonth(n: number) {
    const m = view.m + n;
    setView({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  }

  // grid kalender: mulai Senin
  const first = new Date(view.y, view.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = todayIso();

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => shift(-1)} className="w-9 h-9 rounded-lg border border-border bg-card text-sm" title="Hari sebelumnya">
          ‹
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-border bg-card text-sm font-semibold text-left truncate"
        >
          {formatTanggalId(value)}
        </button>
        <button type="button" onClick={() => shift(1)} className="w-9 h-9 rounded-lg border border-border bg-card text-sm" title="Hari berikutnya">
          ›
        </button>
      </div>

      {open && (
        <div className="absolute z-20 mt-1 left-0 right-0 sm:right-auto sm:w-72 bg-card border border-border rounded-xl shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-md text-sm text-subtle">
              ‹
            </button>
            <span className="text-sm font-semibold">
              {BULAN[view.m]} {view.y}
            </span>
            <button type="button" onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-md text-sm text-subtle">
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {HARI_PENDEK.map((h, i) => (
              <span key={h} className={`text-[11px] font-semibold py-1 ${i === 6 ? "text-warn" : "text-muted"}`}>
                {h}
              </span>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <span key={i} />;
              const iso = toIso(new Date(view.y, view.m, d));
              const isSel = iso === value;
              const isToday = iso === today;
              const isMinggu = i % 7 === 6;
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={`h-9 rounded-md text-sm ${
                    isSel
                      ? "bg-ink text-white font-semibold"
                      : isToday
                        ? "border border-ink font-semibold"
                        : isMinggu
                          ? "text-warn"
                          : ""
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between mt-2">
            <button type="button" onClick={() => { onChange(today); setOpen(false); }} className="text-xs text-accent underline">
              Hari ini
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-subtle">
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
