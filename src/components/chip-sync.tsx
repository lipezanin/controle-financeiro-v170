import { useEffect, useState } from "react";
import { onStatusSync, type StatusSync } from "@/services/sync-service";

function texto(s: StatusSync): string {
  if (s.estado === "sincronizando") return "Sync · enviando…";
  if (s.estado === "offline") return `Sync · offline (${s.pending} na fila)`;
  if (s.estado === "sem_login") return s.pending ? `Sync · ${s.pending} pending (login)` : "Sync · local";
  if (s.estado === "conflito") return `Sync · ${s.conflitos} conflito(s)`;
  if (s.estado === "erro") return "Sync · erro";
  if (s.estado === "pending") return `Sync · ${s.pending} pending`;
  if (s.estado === "ok") return "Sync · nuvem ok";
  return "Sync · local-first";
}

export function ChipSync() {
  const [s, setS] = useState<StatusSync | null>(null);
  useEffect(() => onStatusSync(setS), []);
  if (!s) return null;
  return (
    <p className="px-3 pt-1 text-[11px] text-subtle" title={s.detalhe}>
      {texto(s)}
      {s.estado === "erro" ? <span className="mt-1 block text-warn">{s.detalhe}</span> : null}
    </p>
  );
}
