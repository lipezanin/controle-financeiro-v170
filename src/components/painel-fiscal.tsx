import { useEffect, useState } from "react";
import { usePeriodo } from "@/hooks/periodo-context";
import { anoDoPeriodo } from "@/lib/financeiro/periodo";
import { GraficoRendimentosAportes } from "@/components/graficos-financeiro";
import { KpiCard } from "@/components/kpi-card";
import { Button } from "@/components/ui/button";
import { formatBRL, formatPct } from "@/lib/financeiro/format";
import { cn } from "@/lib/utils";
import {
  csvControleFiscal,
  gravarLimiarCobertura,
  resumirControleFiscal,
  type ResumoFiscal,
} from "@/services/controle-fiscal-service";

function baixarCsv(r: ResumoFiscal) {
  const blob = new Blob(["\uFEFF" + csvControleFiscal(r)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `controle-fiscal-${r.ano}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function PainelFiscal() {
  const { periodo } = usePeriodo();
  const [r, setR] = useState<ResumoFiscal | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [limiarPct, setLimiarPct] = useState("80");

  useEffect(() => {
    void resumirControleFiscal(anoDoPeriodo(periodo))
      .then((x) => {
        setR(x);
        setLimiarPct(String(Math.round(x.limiar * 100)));
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha no controle fiscal"));
  }, [periodo]);

  async function salvarLimiar() {
    const v = Number(limiarPct.replace(",", ".")) / 100;
    await gravarLimiarCobertura(v);
    setR(await resumirControleFiscal());
  }

  const tomAlerta = r?.alerta === "risco" ? "loss" : r?.alerta === "atencao" ? "warn" : "gain";

  return (
      <section id="fiscal" className="mt-10">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Controle fiscal de crescimento de patrimônio
      </p>
      <p className="mb-4 max-w-3xl text-sm text-subtle">
        Cruzamento preventivo no estilo da Receita: rendimentos + resgates deveriam cobrir as compras
        de ativos no ano. Resultado negativo ou cobertura baixa pede justificativa (poupança anterior,
        doação, herança, empréstimo).
      </p>
      {erro ? <p className="mb-3 text-sm text-loss">{erro}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Rendimentos financeiros (ano)"
          value={formatBRL(r?.rendimentosTotais)}
          hint="Inclui distribuição de lucros do consultório. Sem espécie em dinheiro."
        />
        <KpiCard
          label="Espécie excluída"
          value={formatBRL(r?.especieExcluida)}
          hint="Somente recebimento em espécie do consultório"
        />
        <KpiCard label="Aportes / compras (ano)" value={formatBRL(r?.aportesAno)} />
        <KpiCard label="Resgates / vendas (ano)" value={formatBRL(r?.resgatesAno)} />
        <KpiCard
          label="Variação do investido"
          value={formatBRL(r?.variacaoPatrimonio)}
          hint={r ? `Início ${formatBRL(r.patrimonioInicial)} → fim ${formatBRL(r.patrimonioFinal)}` : undefined}
        />
        <KpiCard
          label="Consistência (rend+resg − aportes)"
          value={formatBRL(r?.consistencia)}
          tom={(r?.consistencia ?? 0) >= 0 ? "gain" : "loss"}
          hint={(r?.consistencia ?? 0) >= 0 ? "Sobra de recursos" : "Origem a justificar"}
        />
        <KpiCard
          label="Cobertura dos aportes"
          value={formatPct(r?.cobertura, 1)}
          tom={tomAlerta}
          hint={r ? `Limiar ${formatPct(r.limiar, 0)}` : undefined}
        />
        <KpiCard label="Proventos no ano" value={formatBRL(r?.proventosAno)} />
        <KpiCard
          label="GC realizado (ano)"
          value={formatBRL(r?.gcRealizadoAno)}
          tom={(r?.gcRealizadoAno ?? 0) >= 0 ? "gain" : "loss"}
        />
      </div>

      {r?.alerta !== "ok" ? (
        <div
          className={cn(
            "mt-4 rounded-[16px] border p-4 text-sm",
            r?.alerta === "risco"
              ? "border-loss/40 bg-loss/10 text-loss"
              : "border-warn/40 bg-warn/10 text-warn",
          )}
        >
          {r?.alerta === "risco"
            ? "Risco: as compras do ano não estão cobertas por rendimentos e resgates (abaixo de 70%). Guarde extratos, doações ou saldo anterior."
            : "Atenção: cobertura abaixo do limiar configurado. Revise a origem dos aportes."}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Limiar de cobertura (%)
          <input
            value={limiarPct}
            onChange={(e) => setLimiarPct(e.target.value)}
            className="h-11 w-28 rounded-md border border-input-border bg-input px-3 font-mono text-sm text-fg"
          />
        </label>
        <Button type="button" variant="secondary" onClick={() => void salvarLimiar()}>
          Salvar limiar
        </Button>
        <Button type="button" variant="secondary" disabled={!r} onClick={() => r && baixarCsv(r)}>
          Exportar CSV
        </Button>
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          Imprimir / PDF
        </Button>
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Rendimentos × aportes no ano
      </p>
      <div className="rounded-[16px] border border-border bg-surface p-3">
        {r ? <GraficoRendimentosAportes dados={r.meses} /> : null}
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Detalhe mensal
      </p>
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="zebra min-w-[960px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2.5">Mês</th>
              <th className="px-2 py-2.5 text-right">Rendimentos</th>
              <th className="px-2 py-2.5 text-right">Aportes</th>
              <th className="px-2 py-2.5 text-right">Resgates</th>
              <th className="px-2 py-2.5 text-right">Proventos</th>
              <th className="px-2 py-2.5 text-right">GC</th>
              <th className="px-2 py-2.5 text-right">Consistência</th>
              <th className="px-2 py-2.5 text-right">Patrimônio acum.</th>
            </tr>
          </thead>
          <tbody>
            {(r?.meses ?? []).map((m) => (
              <tr key={m.mes}>
                <td className="px-3 py-2 font-medium">{m.nome}</td>
                <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(m.rendimentos)}</td>
                <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(m.aportes)}</td>
                <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(m.resgates)}</td>
                <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(m.proventos)}</td>
                <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(m.gcRealizado)}</td>
                <td
                  className={cn(
                    "px-2 py-2 text-right font-mono tabular",
                    m.consistencia < 0 ? "text-loss" : "text-gain",
                  )}
                >
                  {formatBRL(m.consistencia)}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(m.patrimonioAcum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
