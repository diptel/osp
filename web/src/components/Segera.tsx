export function Segera({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-2">
      <h1 className="font-semibold text-lg">{title}</h1>
      <p className="text-sm text-muted">{note || "Fitur ini belum tersedia, segera menyusul."}</p>
    </div>
  );
}
