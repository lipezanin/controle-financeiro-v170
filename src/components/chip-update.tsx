import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  checarUpdate,
  confirmarAtualizacao,
  dispensarUpdate,
  onStatusUpdate,
  type StatusUpdate,
} from "@/services/update-service";

export function ChipUpdate() {
  const [s, setS] = useState<StatusUpdate | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => onStatusUpdate(setS), []);
  if (!s) return null;

  async function atualizar() {
    setErro(null);
    try {
      await confirmarAtualizacao();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar");
    }
  }

  if (s.estado === "disponivel" || s.estado === "baixando") {
    return (
      <div className="fixed inset-x-0 bottom-4 z-50 mx-auto w-[min(100%-2rem,420px)] rounded-[14px] border border-accent/40 bg-card p-4 shadow-lg">
        <p className="text-sm font-medium text-fg">Uma nova versão está disponível. Deseja atualizar agora?</p>
        <p className="mt-1 text-[12px] text-muted">
          {s.detalhe}
          {s.notas ? ` · ${s.notas}` : ""}
        </p>
        {erro ? <p className="mt-1 text-[12px] text-warn">{erro}</p> : null}
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={s.estado === "baixando" || !s.url} onClick={() => void atualizar()}>
            {s.estado === "baixando" ? "Instalando…" : "Confirmar atualização"}
          </Button>
          {s.estado === "disponivel" && s.remota ? (
            <Button size="sm" variant="secondary" onClick={() => dispensarUpdate(s.remota!)}>
              Agora não
            </Button>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="px-3 pt-1 text-left text-[11px] text-subtle"
      title="Checar de novo"
      onClick={() => void checarUpdate()}
    >
      {s.detalhe}
    </button>
  );
}
