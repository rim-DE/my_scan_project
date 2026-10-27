"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Interroge le statut du scan toutes les 3 s et rafraîchit la page quand il évolue. */
export function AutoRefresh({ scanId, status, detections }: { scanId: string; status: string; detections: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(async () => {
      const res = await fetch(`/api/scans/${scanId}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.status !== status || json.detections !== detections) router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [scanId, status, detections, router]);
  return null;
}

/** Rafraîchit la page toutes les 20 s pendant que les prix manquants arrivent (20 min au plus). */
export function PricesAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 20 * 60_000) clearInterval(timer);
      else router.refresh();
    }, 20_000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
