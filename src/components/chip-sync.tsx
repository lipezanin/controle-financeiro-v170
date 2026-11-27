import { useEffect, useState } from "react";
import { erroHumano } from "@/lib/financeiro/erro";
import { onStatusSync, type StatusSync } from "@/services/sync-service";

function texto(s: StatusSync): string {
  if (s.estado === "sincronizando") {
    const passo = s.passo && s.passos ? `${s.passo} de ${s.passos} · ` : "";
    return `Sync · ${passo}${s.detalhe}`;
  }
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
    <div className="px-3 pt-1">
      <p className="text-[11px] text-subtle" title={s.detalhe}>
        {texto(s)}
        {s.estado === "erro" ? <span className="mt-1 block text-warn">{erroHumano(s.detalhe)}</span> : null}
      </p>
      {s.estado === "sincronizando" && s.passos ? (
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full bg-accent"
            style={{ width: `${Math.min(100, Math.round(((s.passo ?? 0) / s.passos) * 100))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
