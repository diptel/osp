export default function PortalKlienPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-lg">Portal klien</h1>
        <p className="text-sm text-muted max-w-sm">
          Halaman ringkasan proyek untuk klien (progres, peta, foto) sedang disiapkan — perlu
          endpoint publik khusus di backend agar aman dibuka tanpa login.
        </p>
      </div>
    </div>
  );
}
