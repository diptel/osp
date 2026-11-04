"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, isOfficeRole, type AppUser } from "@/lib/pocketbase";
import { BriixMark } from "@/components/BriixLogo";
import { InstallAppButton } from "@/components/InstallAppButton";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await login(email.trim(), password);
      const u = res.record as unknown as AppUser;
      router.replace(isOfficeRole(u.role) ? "/admin" : "/teknisi");
    } catch {
      setErr("Email atau sandi salah.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-6 py-10 max-w-sm mx-auto w-full gap-8">
        <div className="flex flex-col gap-2 text-white">
          <BriixMark size={44} tone="dark" />
          <h1 className="text-2xl font-semibold mt-2">
            BRIIX <span className="text-accent">OSP</span>
          </h1>
          <p className="text-line2 text-sm">Aplikasi lapangan proyek FTTH</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-line2">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="font-mono text-base rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-white placeholder:text-faint outline-none focus:border-accent"
              placeholder="nama@briix.co.id"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-line2">
            Kata sandi
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="font-mono text-base rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-white placeholder:text-faint outline-none focus:border-accent"
              placeholder="••••••••"
            />
          </label>
          {err && <p className="text-sm text-[#F2A490]">{err}</p>}
          <button
            type="submit"
            disabled={busy}
            className="min-h-[50px] rounded-xl bg-white text-ink font-semibold text-[15px] disabled:opacity-60"
          >
            {busy ? "Masuk..." : "Masuk"}
          </button>
          <p className="text-xs text-faint leading-relaxed">
            Login kode WhatsApp menyusul — untuk sekarang pakai email &amp; sandi
            dari admin.
          </p>
        </form>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-5">
          <p className="text-xs text-faint leading-relaxed">Bisa dipasang ke layar utama HP · tetap jalan saat offline</p>
          <InstallAppButton tone="dark" />
        </div>
      </div>
    </div>
  );
}
