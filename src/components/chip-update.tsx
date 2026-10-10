import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { checarUpdate, dispensarUpdate, onStatusUpdate, type StatusUpdate } from "@/services/update-service";

export function ChipUpdate() {
  const [s, setS] = useState<StatusUpdate | null>(null);
  useEffect(() => onStatusUpdate(setS), []);
  if (!s) return null;
  if (s.estado === "disponivel" || s.estado === "obrigatoria") {
    return (
      <div className="mt-2 rounded-[12px] border border-accent/40 bg-accent/10 px-3 py-2 text-[11px]">
        <p className="font-medium text-fg">{s.detalhe}</p>
        {s.notas ? <p className="mt-1 text-muted">{s.notas}</p> : null}
        <div className="mt-2 flex gap-1">
          {s.url ? (
            <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex">
              <Button size="sm" className="h-8 text-[11px]">
                Baixar
              </Button>
            </a>
          ) : null}
          {s.estado === "disponivel" && s.remota ? (
            <Button size="sm" variant="secondary" className="h-8 text-[11px]" onClick={() => dispensarUpdate(s.remota!)}>
              Depois
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
