import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { baixarBackup, restaurarBackup } from "@/services/backup-service";

export function BackupLocal({ onRestaurado }: { onRestaurado?: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportar() {
    setBusy(true);
    setMsg(null);
    try {
      const n = await baixarBackup();
      setMsg(`${n} registros no arquivo`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha no backup");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (!window.confirm("Restaurar este backup substitui os dados atuais neste aparelho. Continuar?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await restaurarBackup(await f.text());
      setMsg(`Restaurado: ${r.linhas} linhas em ${r.tabelas} tabelas`);
      onRestaurado?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao restaurar");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => void exportar()}>
        <Download className="size-3.5" />
        Backup JSON
      </Button>
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
        <Upload className="size-3.5" />
        Restaurar
      </Button>
      <input
        ref={ref}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {msg ? <span className="text-[11px] text-subtle">{msg}</span> : null}
    </div>
  );
}
