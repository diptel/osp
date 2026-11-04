"use client";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Tombol "Pasang App" — muncul kalau browser mendukung install PWA
 * (Android/Chrome/Edge lewat event beforeinstallprompt). Di iOS Safari
 * tidak ada prompt otomatis, jadi tampilkan instruksi manual (Share ->
 * Add to Home Screen). Tidak tampil sama sekali kalau sudah ter-install
 * (dibuka dalam mode standalone).
 */
export function InstallAppButton({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [standalone, setStandalone] = useState(true); // default true = sembunyikan sampai dicek
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    setStandalone(isStandalone);
    setIsIOS(/iphone|ipad|ipod/i.test(window.navigator.userAgent));

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", () => setStandalone(true));
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (standalone) return null;
  if (!deferred && !isIOS) return null;

  const cls =
    tone === "dark"
      ? "px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/10 text-white"
      : "px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card";

  async function onClick() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      return;
    }
    setShowIOSHelp(true);
  }

  return (
    <>
      <button onClick={onClick} className={cls}>
        ⬇ Pasang App
      </button>
      {showIOSHelp && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowIOSHelp(false)}
        >
          <div className="bg-card rounded-2xl p-5 max-w-sm w-full flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Pasang BRIIX OSP di iPhone</h3>
            <ol className="text-sm text-muted list-decimal list-inside flex flex-col gap-1.5">
              <li>
                Ketuk tombol <strong>Share</strong> (kotak dengan panah ke atas) di bar Safari
              </li>
              <li>
                Gulir lalu pilih <strong>Add to Home Screen</strong> (Tambah ke Layar Utama)
              </li>
              <li>
                Ketuk <strong>Add</strong>
              </li>
            </ol>
            <button
              onClick={() => setShowIOSHelp(false)}
              className="mt-1 min-h-[44px] rounded-xl bg-ink text-white font-semibold text-sm"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
}
