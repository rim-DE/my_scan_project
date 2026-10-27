"use client";

import { useTransition } from "react";

/** Bouton d'action sur tout un scan (« Actualiser tous les prix », « Réessayer les non identifiés »). */
export function ScanActionButton({
  action,
  scanId,
  label,
  pendingLabel,
}: {
  action: (scanId: string) => Promise<void>;
  scanId: string;
  label: string;
  pendingLabel: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-outline text-sm" disabled={pending} onClick={() => start(() => action(scanId))}>
      {pending ? pendingLabel : label}
    </button>
  );
}
