"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type Client = RecordModel & { name: string };

export default function ProyekBaruPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    client: "",
    code: "",
    name: "",
    region: "",
    cluster_name: "",
    cluster_id: "",
    olt: "",
    fdt_input_dbm: "",
    gps_tolerance_m: "50",
  });

  useEffect(() => {
    pb()
      .collection("clients")
      .getFullList<Client>({ sort: "name" })
      .then(setClients)
      .catch(() => void 0);
  }, []);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const rec = await pb().collection("projects").create({
        client: form.client,
        code: form.code,
        name: form.name || form.cluster_name,
        region: form.region,
        cluster_name: form.cluster_name,
        cluster_id: form.cluster_id,
        olt: form.olt,
        fdt_input_dbm: form.fdt_input_dbm ? Number(form.fdt_input_dbm) : undefined,
        design_source: "briix",
        status: "draft",
        gps_tolerance_m: Number(form.gps_tolerance_m) || 50,
      });
      router.replace(`/admin/proyek/${rec.id}/kmz`);
    } catch {
      setErr("Gagal membuat proyek. Cek kelengkapan data.");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-line2 px-3 py-2.5 text-sm outline-none focus:border-accent bg-card";
  const label = "flex flex-col gap-1.5 text-sm font-medium text-subtle";

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold mb-1">Proyek baru</h1>
      <p className="text-sm text-muted mb-6">
        Isi data dasar proyek. Desain FDT/FAT bisa diimpor dari KMZ setelah proyek dibuat.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className={label}>
          Klien
          <select required className={input} value={form.client} onChange={(e) => set("client", e.target.value)}>
            <option value="">— pilih klien —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Kode proyek klien
            <input className={input} value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="BJN000814" />
          </label>
          <label className={label}>
            Kode cluster
            <input className={input} value={form.cluster_id} onChange={(e) => set("cluster_id", e.target.value)} placeholder="TMU123.035" />
          </label>
        </div>
        <label className={label}>
          Nama cluster
          <input
            required
            className={input}
            value={form.cluster_name}
            onChange={(e) => set("cluster_name", e.target.value)}
            placeholder="Temu RW 1,2,3 Bojonegoro"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Wilayah
            <input className={input} value={form.region} onChange={(e) => set("region", e.target.value)} placeholder="Bojonegoro" />
          </label>
          <label className={label}>
            OLT
            <input className={input} value={form.olt} onChange={(e) => set("olt", e.target.value)} placeholder="Buorno" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Input FDT (dBm)
            <input
              type="number"
              step="0.01"
              className={input}
              value={form.fdt_input_dbm}
              onChange={(e) => set("fdt_input_dbm", e.target.value)}
              placeholder="-9.84"
            />
          </label>
          <label className={label}>
            Toleransi GPS (m)
            <input
              type="number"
              className={input}
              value={form.gps_tolerance_m}
              onChange={(e) => set("gps_tolerance_m", e.target.value)}
            />
          </label>
        </div>
        {err && <p className="text-sm text-warn">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 min-h-[46px] rounded-xl bg-ink text-white font-semibold text-sm disabled:opacity-60"
        >
          {busy ? "Menyimpan..." : "Buat proyek"}
        </button>
      </form>
    </div>
  );
}
