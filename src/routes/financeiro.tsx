import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { KpiCard } from "@/components/kpi-card";
import { SectionTitle } from "@/components/section-title";
import { formatBRL, formatData, formatPct } from "@/lib/financeiro/format";
import { anoDoPeriodo } from "@/lib/financeiro/periodo";
import { usePeriodo } from "@/hooks/periodo-context";
import { useMercadoAtualizado } from "@/hooks/use-mercado-atualizado";
import { cn } from "@/lib/utils";
import { resumoAnual, type ResumoFinanceiro } from "@/services/financeiro-service";

export const Route = createFileRoute("/financeiro")({
  component: Pagina,
});

function Pagina() {
  const { periodo } = usePeriodo();
  const [r, setR] = useState<ResumoFinanceiro | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void resumoAnual(anoDoPeriodo(periodo))
      .then(setR)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha no módulo financeiro"));
  }, [periodo]);

  const recarregar = useCallback(() => {
    void resumoAnual(anoDoPeriodo(periodo)).then(setR).catch(() => undefined);
  }, [periodo]);
  useMercadoAtualizado(recarregar);

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Módulo"
        title="03 — Financeiro · Fluxo, despesas e projeção"
        description="Mesmas contas da aba FINANCEIRO: rendimentos × despesas pagas, caixa físico, taxa de poupança e projeção mês a mês com escudo fiscal e DARF."
      />

      {erro ? <p className="mb-4 text-sm text-loss">{erro}</p> : null}

      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        03.1 — Resumo {r ? `· ${r.ano}` : ""}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total rendimentos (ano)" value={formatBRL(r?.rendimentosTotais)} />
        <KpiCard label="Despesas pagas (ano)" value={formatBRL(r?.despesasPagas)} tom="loss" />
        <KpiCard label="Despesas a pagar" value={formatBRL(r?.despesasAPagar)} tom="warn" />
        <KpiCard label="Saldo acumulado (ano)" value={formatBRL(r?.saldoAcumulado)} tom="gain" />
        <KpiCard label="Caixa físico" value={formatBRL(r?.caixaFisico)} tom="accent" />
        <KpiCard
          label="Média mensal despesas"
          value={formatBRL(r?.mediaMensalDespesas)}
          hint="Despesas pagas ÷ 12, como na planilha"
        />
        <KpiCard label="Taxa de poupança" value={formatPct(r?.taxaPoupanca, 1)} tom="gain" />
        <KpiCard label="Despesas / rendimentos" value={formatPct(r?.despSobreRend, 1)} />
        <KpiCard label="Aportes invest. (ano)" value={formatBRL(r?.aportesAno)} />
        <KpiCard label="Resgates (ano)" value={formatBRL(r?.resgatesAno)} />
        <KpiCard label="GC nacional (ano)" value={formatBRL(r?.gcNacionalAno)} />
        <KpiCard label="Saldo líquido aportes" value={formatBRL(r?.saldoLiquidoAportes)} />
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Projeção mês a mês
      </p>
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="zebra min-w-[1100px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <th className="sticky left-0 bg-surface-2 px-3 py-2.5">Mês</th>
              <th className="px-2 py-2.5 text-right">Total rend.</th>
              <th className="px-2 py-2.5 text-right">Computáveis</th>
              <th className="px-2 py-2.5 text-right">Não trib.</th>
              <th className="px-2 py-2.5 text-right">Desp. pagas</th>
              <th className="px-2 py-2.5 text-right">Saldo mês</th>
              <th className="px-2 py-2.5 text-right">Escudo</th>
              <th className="px-2 py-2.5 text-right">DARF</th>
              <th className="px-2 py-2.5 text-right">Acum. saldo</th>
            </tr>
          </thead>
          <tbody>
            {(r?.projecao ?? []).map((l) => {
              const atual = r?.mesAtual === l.mes;
              return (
                <tr key={l.mes} className={atual ? "bg-accent/10" : undefined}>
                  <td className={cn("sticky left-0 px-3 py-2 font-medium", atual ? "bg-accent/10" : "bg-surface")}>
                    {l.nome}
                    {atual ? " · agora" : ""}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.totalRendimentos)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.computaveis)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.naoTributaveis)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular text-loss">{formatBRL(l.despesasPagas)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular text-fg">{formatBRL(l.saldoMensal)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular text-gain">{formatBRL(l.escudoFiscal)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.darf)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular text-fg">{formatBRL(l.saldoAcumulado)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        03.5 — Comparativo mensal (variação de despesas)
      </p>
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="zebra min-w-[480px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2.5">Mês</th>
              <th className="px-3 py-2.5 text-right">Despesas pagas</th>
              <th className="px-3 py-2.5 text-right">Δ R$ vs ant.</th>
              <th className="px-3 py-2.5 text-right">Δ % vs ant.</th>
            </tr>
          </thead>
          <tbody>
            {(r?.comparativo ?? []).map((l) => (
              <tr key={l.mes}>
                <td className="px-3 py-2 font-medium">{l.nome}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{formatBRL(l.despesasPagas)}</td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-mono tabular",
                    (l.deltaReais ?? 0) > 0 && "text-loss",
                    (l.deltaReais ?? 0) < 0 && "text-gain",
                  )}
                >
                  {l.deltaReais == null ? "—" : formatBRL(l.deltaReais)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-mono tabular",
                    (l.deltaPct ?? 0) > 0 && "text-loss",
                    (l.deltaPct ?? 0) < 0 && "text-gain",
                  )}
                >
                  {l.deltaPct == null ? "—" : formatPct(l.deltaPct, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Contas a pagar
      </p>
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="zebra min-w-[720px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2.5">Vencimento</th>
              <th className="px-3 py-2.5">Categoria</th>
              <th className="px-3 py-2.5">Descrição</th>
              <th className="px-3 py-2.5 text-right">Valor</th>
              <th className="px-3 py-2.5">Pagamento</th>
              <th className="px-3 py-2.5">Situação</th>
            </tr>
          </thead>
          <tbody>
            {(r?.despesas ?? []).map((d, i) => (
              <tr key={`${d.vencimento}-${i}`}>
                <td className="px-3 py-2 font-mono tabular">{formatData(d.vencimento)}</td>
                <td className="px-3 py-2">{d.categoria ?? "—"}</td>
                <td className="px-3 py-2 text-muted">{d.descricao ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{formatBRL(d.valor)}</td>
                <td className="px-3 py-2 font-mono tabular">{formatData(d.pagamento)}</td>
                <td
                  className={cn(
                    "px-3 py-2",
                    d.situacao === "Pago" && "text-gain",
                    d.situacao === "Atrasado" && "text-loss",
                    d.situacao === "Aberto" && "text-warn",
                  )}
                >
                  {d.situacao}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
