"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { logout } from "@/lib/pocketbase";
import { BriixMark, BriixWordmark } from "@/components/BriixLogo";

export default function TeknisiLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const m = pathname.match(/^\/teknisi\/proyek\/([^/]+)/);
  const pid = m?.[1];
  const showNav = !!pid;

  const NAV = pid
    ? [
        { href: `/teknisi/proyek/${pid}`, label: "Daftar" },
        { href: `/teknisi/proyek/${pid}/peta`, label: "Peta" },
        { href: `/teknisi/proyek/${pid}/kabel`, label: "Kabel" },
        { href: `/teknisi/proyek/${pid}/tiang`, label: "Tiang" },
        { href: `/teknisi/proyek/${pid}/odp-finish`, label: "Finish" },
      ]
    : [];

  return (
    <AuthGate require="field">
      {() => (
        <div className="h-dvh flex flex-col bg-surface max-w-[480px] mx-auto overflow-hidden">
          {!pid && (
            <header className="flex items-center justify-between px-4 py-3 bg-ink text-white">
              <span className="flex items-center gap-2">
                <BriixMark size={22} tone="dark" />
                <BriixWordmark compact />
              </span>
              <button
                onClick={() => {
                  logout();
                  router.replace("/login");
                }}
                className="text-xs text-line2"
              >
                Keluar
              </button>
            </header>
          )}
          <main className="flex-1 flex flex-col min-h-0">{children}</main>
          {showNav && (
            <nav className="grid grid-cols-5 bg-card border-t border-border px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 shrink-0 sticky bottom-0 z-10">
              {NAV.map((n) => {
                const active = pathname === n.href;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`flex flex-col items-center justify-center gap-0.5 min-h-11 text-[11px] font-semibold ${
                      active ? "text-ink" : "text-muted font-medium"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      )}
    </AuthGate>
  );
}
