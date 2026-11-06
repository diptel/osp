// Generate laporan PDF (OPM / Rekap Finish FAT) di SERVER, bukan di browser.
//
// Kenapa: generate di browser berarti upload file PDF jadi (bisa puluhan MB
// untuk proyek dengan ratusan foto) harus lewat proxy publik (nginx 1Panel)
// yang batas ukurannya kecil — gampang gagal dengan error generik. Di sini,
// data diambil & PDF dibangun di proses Node (container web), lalu disimpan
// ke PocketBase lewat jaringan docker INTERNAL (http://briixosp:8090),
// sama sekali tidak lewat proxy publik — jadi tidak ada batas ukuran upload
// dari sisi itu, dan jauh lebih cepat/hemat kuota untuk admin yang generate.
//
// Izin: tetap pakai token login admin yang mengirim request (diteruskan dari
// header Authorization browser), bukan akun service terpisah — supaya aturan
// akses PocketBase (createRule: harus role admin) & audit "generated_by"
// tetap berlaku persis seperti sebelumnya.
import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import {
  buildOpmReportPdf,
  fetchOpmReportData,
  buildFatFinishReportPdf,
  fetchFatFinishReportData,
} from "@/lib/opmReportPdf";
import type { AppUser } from "@/lib/pocketbase";
import { fetchManajemenData, buildManajemenReportPdf } from "@/lib/manajemenReportPdf";

export const runtime = "nodejs";

const PB_INTERNAL_URL = process.env.PB_INTERNAL_URL || "http://briixosp:8090";

const KIND_LABEL: Record<string, string> = {
  opm: "Laporan OPM",
  fat_finish: "Rekap Finish FAT",
  manajemen: "Laporan Manajemen Proyek",
};

export async function POST(req: NextRequest) {
  const authToken = req.headers.get("authorization");
  if (!authToken) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  let body: { projectId?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body request tidak valid." }, { status: 400 });
  }
  const { projectId } = body;
  const kind = body.kind === "fat_finish" ? "fat_finish" : body.kind === "manajemen" ? "manajemen" : "opm";
  if (!projectId) {
    return NextResponse.json({ error: "projectId wajib diisi." }, { status: 400 });
  }

  const client = new PocketBase(PB_INTERNAL_URL);
  client.authStore.save(authToken, null);

  try {
    const auth = await client.collection("users").authRefresh<AppUser>();
    const user = auth.record;
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Hanya akun admin yang bisa generate laporan." }, { status: 403 });
    }
    // authRefresh menyegarkan token di authStore — pakai itu (bukan header
    // mentah yang masuk) saat fetch foto, biar konsisten dengan token yang
    // dipakai client untuk request-request lain.
    const liveToken = client.authStore.token;

    const stamp = new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
    let bytes: ArrayBuffer;
    let label: string;
    let clusterName = "";

    if (kind === "manajemen") {
      const data = await fetchManajemenData(projectId, client);
      const doc = buildManajemenReportPdf(data, user.name || user.email || "admin");
      bytes = doc.output("arraybuffer") as ArrayBuffer;
      label = `${KIND_LABEL[kind]} — ${stamp}`;
      clusterName = data.project.cluster_name;
    } else if (kind === "fat_finish") {
      const data = await fetchFatFinishReportData(projectId, client);
      if (data.entries.length === 0) {
        return NextResponse.json(
          { error: "Belum ada foto Finish FAT yang diunggah untuk direkap." },
          { status: 400 }
        );
      }
      const doc = await buildFatFinishReportPdf({
        project: data.project,
        entries: data.entries,
        clientLogoUrl: data.clientLogoUrl,
        authToken: liveToken,
      });
      bytes = doc.output("arraybuffer") as ArrayBuffer;
      label = `${KIND_LABEL[kind]} — ${stamp}`;
      clusterName = data.clusterName;
    } else {
      const data = await fetchOpmReportData(projectId, client);
      if (data.fats.length === 0) {
        return NextResponse.json(
          { error: "Belum ada hasil uji OPM yang disetujui untuk dilaporkan." },
          { status: 400 }
        );
      }
      const doc = await buildOpmReportPdf({
        project: data.project,
        fats: data.fats,
        clientLogoUrl: data.clientLogoUrl,
        authToken: liveToken,
      });
      bytes = doc.output("arraybuffer") as ArrayBuffer;
      label = `${KIND_LABEL[kind]} — ${stamp}`;
      clusterName = data.clusterName;
    }

    // Diagnostik sementara: pastikan buffer PDF yang dihasilkan jsPDF di
    // Node benar-benar valid (header "%PDF-" di awal, ukuran wajar) —
    // kalau jsPDF diam-diam gagal di lingkungan server, baru kelihatan di sini.
    const byteArr: Uint8Array = new Uint8Array(bytes);
    const prefix = Array.from(byteArr.slice(0, 8))
      .map((b) => String.fromCharCode(b))
      .join("");
    console.log(`PDF dibuat: ${byteArr.byteLength} bytes, prefix="${prefix}"`);

    const form = new FormData();
    form.append("project", projectId);
    form.append("kind", kind);
    form.append("label", label);
    form.append(
      "file",
      new Blob([byteArr], { type: "application/pdf" }),
      `${KIND_LABEL[kind]}-${clusterName || projectId}-${Date.now()}.pdf`
    );
    form.append("generated_by", user.id);

    try {
      const record = await client.collection("reports").create(form);
      return NextResponse.json({ ok: true, id: record.id });
    } catch (createErr) {
      // Debug sementara: tampilkan detail mentah dari PocketBase (status,
      // data per-field, dan nilai yang dikirim) supaya kalau masih gagal,
      // penyebabnya langsung kelihatan tanpa coba-coba lagi.
      console.error("reports.create gagal:", createErr);
      const anyE = createErr as {
        status?: number;
        response?: { message?: string; data?: Record<string, { message?: string }> };
        message?: string;
      };
      const data = anyE?.response?.data;
      let detail: string;
      if (data && Object.keys(data).length > 0) {
        detail = Object.entries(data)
          .map(([field, info]) => `${field}: ${info?.message || "tidak valid"}`)
          .join("; ");
      } else {
        detail = anyE?.response?.message || (createErr instanceof Error ? createErr.message : String(createErr));
      }
      return NextResponse.json(
        {
          error: `${detail} [status=${anyE?.status}, role=${user.role}, uid=${user.id}, pid=${projectId}, pdfBytes=${byteArr.byteLength}, pdfPrefix="${prefix}"]`,
        },
        { status: 500 }
      );
    }
  } catch (e) {
    const anyE = e as { response?: { message?: string; data?: Record<string, { message?: string }> }; message?: string };
    const data = anyE?.response?.data;
    let msg: string;
    if (data && Object.keys(data).length > 0) {
      msg = Object.entries(data)
        .map(([field, info]) => `${field}: ${info?.message || "tidak valid"}`)
        .join("; ");
    } else {
      msg = anyE?.response?.message || (e instanceof Error ? e.message : String(e));
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
