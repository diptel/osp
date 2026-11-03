"use client";
import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" }).catch(() => {});
    }
  }, []);
  return null;
}
