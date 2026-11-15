import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BackupLocal } from "@/components/backup-local";
import { SectionTitle } from "@/components/section-title";
import { Button } from "@/components/ui/button";
import { importarCotahist } from "@/services/cotacao-ativos-service";
import { checarUpdate, onStatusUpdate, type StatusUpdate } from "@/services/update-service";
import { importarPlanilha, importarSeed } from "@/utils/import-excel";

export const Route = createFileRoute("/manutencao")({
  component: Pagina,
});

function Pagina() {
  const fileRef = useRef<HTMLInputElement>(null);
  const cotahistRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("Ferramentas de arquivo e instalação. Não alteram a tela do dia a dia.");
  const [instalador, setInstalador] = useState({
    href: "/downloads/ControleFinanceiro-Setup.exe",
    rotulo: "Baixar última versão",
  });

  useEffect(() => {
    const aplicar = (s: StatusUpdate) => {
      if (!s.url || !s.remota || !s.url.startsWith("https://")) return;
      setInstalador({ href: s.url, rotulo: `Baixar instalador ${s.remota}` });
    };
    void checarUpdate().then(aplicar);
    return onStatusUpdate(aplicar);
  }, []);

  async function recarregarSeed() {
    setMsg("Importando planilha 2.1…");
    try {
      await importarSeed();
      setMsg("Planilha 2.1 recarregada.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha na importação");
    }
  }

  async function onArquivo(f: File | undefined) {
    if (!f) return;
    setMsg(`Lendo ${f.name}…`);
    try {
      await importarPlanilha(f);
      setMsg(`${f.name} importado.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha ao ler o arquivo");
    }
  }

  async function onCotahist(f: File | undefined) {
    if (!f) return;
    setMsg("Lendo COTAHIST…");
    try {
      const r = await importarCotahist(f);
      setMsg(`COTAHIST: ${r.gravados} tickers`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha no COTAHIST");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        kicker="Sistema"
        title="Manutenção"
        description="Instalador, importação e cópia de segurança. O uso diário não passa por aqui."
      />
      <p className="mb-4 text-sm text-muted">{msg}</p>
      <div className="mb-6 rounded-[10px] border border-accent/40 bg-card p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">Instalador Windows</p>
        <p className="mt-1 text-sm text-muted">
          A atualização automática baixa só o que mudou. Este botão é a instalação manual, se precisar.
        </p>
        <a
          href={instalador.href}
          download="ControleFinanceiro-Setup.exe"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex h-10 items-center rounded-[8px] bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
        >
          {instalador.rotulo}
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => void recarregarSeed()}>
          Recarregar 2.1
        </Button>
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="size-3.5" />
          Importar Excel
        </Button>
        <Button variant="secondary" size="sm" onClick={() => cotahistRef.current?.click()}>
          COTAHIST B3
        </Button>
        <BackupLocal />
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={(e) => void onArquivo(e.target.files?.[0])} />
        <input ref={cotahistRef} type="file" accept=".txt,.TXT,.zip,.ZIP" className="hidden" onChange={(e) => void onCotahist(e.target.files?.[0])} />
      </div>
    </div>
  );
}
