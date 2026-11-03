"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { currentUser, isOfficeRole } from "@/lib/pocketbase";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const u = currentUser();
    if (!u) router.replace("/login");
    else router.replace(isOfficeRole(u.role) ? "/admin" : "/app");
  }, [router]);
  return null;
}
