"use client";
import PocketBase, { type RecordModel } from "pocketbase";

// Base URL PocketBase — satu domain dengan backend (osp.briix.co.id),
// diset lewat env saat build. Fallback ke domain produksi.
export const PB_URL =
  process.env.NEXT_PUBLIC_PB_URL || "https://osp.briix.co.id";

let client: PocketBase | null = null;

/** Satu instance PocketBase per browser tab, auto-load sesi dari localStorage. */
export function pb(): PocketBase {
  if (typeof window === "undefined") {
    // SSR/build-time: instance sekali pakai, tanpa auth store browser.
    return new PocketBase(PB_URL);
  }
  if (!client) {
    client = new PocketBase(PB_URL);
  }
  return client;
}

export type Role =
  | "admin"
  | "qc"
  | "drafter"
  | "surveyor"
  | "mandor"
  | "splicer"
  | "pemborong";

export interface AppUser extends RecordModel {
  email: string;
  phone?: string;
  role: Role;
  projects?: string[];
  active?: boolean;
  name?: string;
  avatar?: string;
}

export function currentUser(): AppUser | null {
  const client = pb();
  if (!client.authStore.isValid) return null;
  return client.authStore.record as AppUser | null;
}

export function isOfficeRole(role?: Role) {
  return role === "admin" || role === "qc" || role === "drafter";
}

export async function login(email: string, password: string) {
  return pb().collection("users").authWithPassword(email, password);
}

export function logout() {
  pb().authStore.clear();
}

/** URL file PocketBase (foto, logo, dokumen, dsb). */
export function fileUrl(record: RecordModel, filename?: string | null, thumb?: string) {
  if (!filename) return "";
  return pb().files.getURL(record, filename, thumb ? { thumb } : undefined);
}
