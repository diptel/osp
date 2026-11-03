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
    const u = currentUser();
    if (!u || !pb().authStore.isValid) {
      router.replace("/login");
      return;
    }
    if (require === "office" && !isOfficeRole(u.role)) {
      router.replace("/app");
      return;
    }
    if (require === "field" && isOfficeRole(u.role)) {
      router.replace("/admin");
      return;
    }
    setRole(u.role);
    setReady(true);
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
