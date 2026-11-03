"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { currentUser, logout } from "@/lib/pocketbase";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/proyek-baru", label: "Proyek baru" },
  { href: "/admin/qc", label: "Antrian QC" },
  { href: "/admin/tim", label: "Tim" },
  { href: "/admin/laporan-opm", label: "Laporan OPM" },
  { href: "/admin/opname", label: "Opname" },
  { href: "/admin/material", label: "Material" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <AuthGate require="office">
      {() => (
        <div className="min-h-screen flex bg-surface">
          <aside className="hidden md:flex w-56 flex-col bg-ink text-white shrink-0">
            <div className="px-5 py-5 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center font-mono font-bold text-sm">
                B
              </div>
              <span className="font-semibold">BRIIX OSP</span>
            </div>
            <nav className="flex flex-col gap-0.5 px-3 flex-1">
              {NAV.map((n) => {
                const active = pathname === n.href;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium ${
                      active ? "bg-white text-ink" : "text-line2 hover:bg-white/10"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <button
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="mx-3 mb-5 px-3 py-2.5 rounded-lg text-sm font-medium text-line2 hover:bg-white/10 text-left"
            >
              Keluar
            </button>
          </aside>
          <div className="flex-1 flex flex-col min-w-0">
            <header className="md:hidden flex items-center justify-between px-4 py-3 bg-ink text-white">
              <span className="font-semibold">BRIIX OSP</span>
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
            <nav className="md:hidden flex gap-1 px-3 py-2 overflow-x-auto bg-white border-b border-border">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${
                    pathname === n.href ? "bg-ink text-white" : "border border-border"
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <main className="flex-1 p-4 md:p-8 min-w-0">{children}</main>
          </div>
        </div>
      )}
    </AuthGate>
  );
}
