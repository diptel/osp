"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pb, currentUser, isOfficeRole, type Role } from "@/lib/pocketbase";

/**
 * Bungkus setiap shell (admin/teknisi) dengan ini.
 * `require`: "office" hanya admin/qc/drafter, "field" hanya role lapangan, undefined = siapa saja yang login.
 */
export function AuthGate({
  children,
  require,
}: {
  children: (role: Role) => React.ReactNode;
  require?: "office" | "field";
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const u = currentUser();
      if (!u || !pb().authStore.isValid) {
        router.replace("/login");
        return;
      }
      // Sesi yang sudah login menyimpan data akun (termasuk daftar `projects`)
      // di HP sejak login pertama kali. Tarik ulang dari server tiap buka app,
      // supaya proyek yang baru di-assign admin langsung muncul tanpa perlu
      // logout/login manual.
      try {
        await pb().collection("users").authRefresh();
      } catch {
        // offline atau token kedaluwarsa — lanjut pakai data cache yang ada
      }
      if (cancelled) return;
      const fresh = currentUser();
      if (!fresh || !pb().authStore.isValid) {
        router.replace("/login");
        return;
      }
      if (require === "office" && !isOfficeRole(fresh.role)) {
        router.replace("/teknisi");
        return;
      }
      if (require === "field" && isOfficeRole(fresh.role)) {
        router.replace("/admin");
        return;
      }
      setRole(fresh.role);
      setReady(true);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [router, require]);

  if (!ready || !role) {
    return (
      <div className="min-h-screen flex items-center justify-center text-faint text-sm">
        Memuat...
      </div>
    );
  }
  return <>{children(role)}</>;
}
