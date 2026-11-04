"use client";
// Pelacak proses generate laporan di level modul (bukan state komponen) —
// supaya kalau admin pindah halaman lalu balik lagi ke Laporan, statusnya
// "masih diproses" tetap kelihatan (tidak generate ulang dobel), selama
// tab/app browser-nya belum ditutup. Juga menyediakan cara membatalkan.

export type JobState = { generating: boolean; cancelled: boolean; error?: string };

const jobs = new Map<string, JobState>();
const listeners = new Map<string, Set<() => void>>();

export function jobKey(projectId: string, kind: string) {
  return `${projectId}:${kind}`;
}

export function getJob(key: string): JobState | undefined {
  return jobs.get(key);
}

export function isGenerating(key: string): boolean {
  return jobs.get(key)?.generating === true;
}

export function isCancelled(key: string): boolean {
  return jobs.get(key)?.cancelled === true;
}

export function startJob(key: string) {
  jobs.set(key, { generating: true, cancelled: false });
  notify(key);
}

export function cancelJob(key: string) {
  const j = jobs.get(key);
  if (j && j.generating) {
    j.cancelled = true;
    notify(key);
  }
}

export function finishJob(key: string, error?: string) {
  jobs.set(key, { generating: false, cancelled: false, error });
  notify(key);
}

export function subscribe(key: string, cb: () => void) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(cb);
  return () => {
    listeners.get(key)?.delete(cb);
  };
}

function notify(key: string) {
  listeners.get(key)?.forEach((cb) => cb());
}
