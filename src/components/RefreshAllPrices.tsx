"use client";

import { useTransition } from "react";
import { refreshScanPricesAction } from "@/app/actions";

/** Bouton « Actualiser tous les prix » d'un scan. */
export function RefreshAllPrices({ scanId, label, pendingLabel }: { scanId: string; label: string; pendingLabel: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-outline text-sm" disabled={pending} onClick={() => start(() => refreshScanPricesAction(scanId))}>
      🔄 {pending ? pendingLabel : label}
    </button>
  );
}
