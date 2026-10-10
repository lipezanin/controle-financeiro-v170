import { useEffect, useState } from "react";
import { usePeriodo } from "@/hooks/periodo-context";
import { anoDoPeriodo } from "@/lib/financeiro/periodo";
import { KpiCard } from "@/components/kpi-card";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/financeiro/format";
import {
  csvRelatorioIrpf,
  htmlRelatorioIrpf,
  montarRelatorioIrpf,
  type RelatorioIrpf,
} from "@/services/relatorio-irpf-service";
import { baixarTexto, imprimirHtml } from "@/utils/baixar";

export function RelatorioIrpfPainel() {
  const { periodo } = usePeriodo();
  const [r, setR] = useState<RelatorioIrpf | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void montarRelatorioIrpf(anoDoPeriodo(periodo))
      .then(setR)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha no relatório"));
  }, [periodo]);

  return (
    <section id="relatorio" className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
            Relatório IRPF · ano-base {r?.ano ?? ""}
          </p>
          <p className="mt-1 max-w-2xl text-sm text-subtle">
            Rendimentos, aquisições e patrimônio para a declaração. Caixa físico e recebimento em
            espécie ficam de fora. Distribuição de lucros do consultório entra.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={!r}
            onClick={() => r && baixarTexto(`irpf-${r.ano}.csv`, csvRelatorioIrpf(r), "text/csv;charset=utf-8")}
          >
            CSV
          </Button>
          <Button
            disabled={!r}
            onClick={() => r && imprimirHtml(`IRPF ${r.ano}`, htmlRelatorioIrpf(r))}
          >
            Imprimir / PDF
          </Button>
        </div>
      </div>
      {erro ? <p className="mb-3 text-sm text-loss">{erro}</p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Rendimentos (sem espécie)" value={formatBRL(r?.rendimentosTotais)} />
        <KpiCard label="Espécie excluída" value={formatBRL(r?.especieExcluida)} hint="Só dinheiro em espécie" />
        <KpiCard label="Aquisições / aportes" value={formatBRL(r?.aquisicoes)} />
        <KpiCard label="Vendas / resgates" value={formatBRL(r?.vendas)} />
        <KpiCard label="Proventos líquidos" value={formatBRL(r?.proventos)} tom="gain" />
        <KpiCard label="GC realizado" value={formatBRL(r?.gcRealizado)} />
        <KpiCard label="Patrimônio inicial" value={formatBRL(r?.patrimonioInicial)} />
        <KpiCard label="Patrimônio final" value={formatBRL(r?.patrimonioFinal)} tom="accent" />
      </div>
      {r?.porTipo.length ? (
        <div className="mt-4 overflow-x-auto rounded-[16px] border border-border">
          <table className="zebra min-w-[360px] w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                <th className="px-3 py-2.5">Tipo de rendimento</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {r.porTipo.map((t) => (
                <tr key={t.tipo}>
                  <td className="px-3 py-2">{t.tipo}</td>
                  <td className="px-3 py-2 text-right font-mono tabular">{formatBRL(t.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
