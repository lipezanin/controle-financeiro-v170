import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { KpiCard } from "@/components/kpi-card";
import { SectionTitle } from "@/components/section-title";
import { GraficoCategoriasMes, GraficoSerieMedia } from "@/components/graficos-financeiro";
import { formatBRL, formatData, formatPct } from "@/lib/financeiro/format";
import { anoDoPeriodo } from "@/lib/financeiro/periodo";
import { usePeriodo } from "@/hooks/periodo-context";
import { useMercadoAtualizado } from "@/hooks/use-mercado-atualizado";
import { rotuloOrdem, useOrdenacao } from "@/hooks/use-ordenacao";
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
  const ordemProj = useOrdenacao<"mes" | "rend" | "comp" | "nao" | "desp" | "saldo" | "escudo" | "darf" | "acum">("mes");
  const ordemVar = useOrdenacao<"mes" | "desp" | "delta" | "pct">("mes");
  const ordemDesp = useOrdenacao<"venc" | "cat" | "desc" | "valor" | "pag" | "sit">("venc");
  const projecao = ordemProj.ordenar(r?.projecao ?? [], (l, k) => {
    if (k === "mes") return l.mes;
    if (k === "rend") return l.totalRendimentos;
    if (k === "comp") return l.computaveis;
    if (k === "nao") return l.naoTributaveis;
    if (k === "desp") return l.despesasPagas;
    if (k === "saldo") return l.saldoMensal;
    if (k === "escudo") return l.escudoFiscal;
    if (k === "darf") return l.darf;
    return l.saldoAcumulado;
  });
  const variacao = ordemVar.ordenar(r?.comparativo ?? [], (l, k) => {
    if (k === "mes") return l.mes;
    if (k === "desp") return l.despesasPagas;
    if (k === "delta") return l.deltaReais ?? 0;
    return l.deltaPct ?? 0;
  });
  const despesas = ordemDesp.ordenar(r?.despesas ?? [], (d, k) => {
    if (k === "venc") return d.vencimento;
    if (k === "cat") return d.categoria ?? "";
    if (k === "desc") return d.descricao ?? "";
    if (k === "valor") return d.valor;
    if (k === "pag") return d.pagamento ?? "";
    return d.situacao;
  });

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
        Acumulado mês a mês
      </p>
      <div className="mb-6 rounded-[16px] border border-border bg-surface p-3">
        <GraficoSerieMedia
          dados={(r?.projecao ?? []).map((l) => ({ rotulo: l.nome, valor: l.saldoAcumulado }))}
          nome="Saldo acumulado"
        />
      </div>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Rendimentos do mês e média
      </p>
      <div className="mb-6 rounded-[16px] border border-border bg-surface p-3">
        <GraficoSerieMedia
          dados={(r?.projecao ?? []).map((l) => ({ rotulo: l.nome, valor: l.totalRendimentos }))}
          nome="Rendimentos"
          cor="#22c55e"
        />
      </div>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Rendimentos por categoria
      </p>
      <div className="mb-8 rounded-[16px] border border-border bg-surface p-3">
        <GraficoCategoriasMes
          meses={(r?.projecao ?? []).map((l) => l.nome)}
          categorias={r?.rendimentosPorCategoria ?? []}
        />
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Projeção mês a mês
      </p>
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="zebra min-w-[1100px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <th className="sticky left-0 bg-surface-2 px-3 py-2.5">
                <button type="button" onClick={() => ordemProj.toggle("mes")}>Mês{rotuloOrdem(ordemProj.chave === "mes", ordemProj.dir)}</button>
              </th>
              <th className="px-2 py-2.5 text-right"><button type="button" onClick={() => ordemProj.toggle("rend")}>Total rend.{rotuloOrdem(ordemProj.chave === "rend", ordemProj.dir)}</button></th>
              <th className="px-2 py-2.5 text-right"><button type="button" onClick={() => ordemProj.toggle("comp")}>Computáveis{rotuloOrdem(ordemProj.chave === "comp", ordemProj.dir)}</button></th>
              <th className="px-2 py-2.5 text-right"><button type="button" onClick={() => ordemProj.toggle("nao")}>Não trib.{rotuloOrdem(ordemProj.chave === "nao", ordemProj.dir)}</button></th>
              <th className="px-2 py-2.5 text-right"><button type="button" onClick={() => ordemProj.toggle("desp")}>Desp. pagas{rotuloOrdem(ordemProj.chave === "desp", ordemProj.dir)}</button></th>
              <th className="px-2 py-2.5 text-right"><button type="button" onClick={() => ordemProj.toggle("saldo")}>Saldo mês{rotuloOrdem(ordemProj.chave === "saldo", ordemProj.dir)}</button></th>
              <th className="px-2 py-2.5 text-right"><button type="button" onClick={() => ordemProj.toggle("escudo")}>Escudo{rotuloOrdem(ordemProj.chave === "escudo", ordemProj.dir)}</button></th>
              <th className="px-2 py-2.5 text-right"><button type="button" onClick={() => ordemProj.toggle("darf")}>DARF{rotuloOrdem(ordemProj.chave === "darf", ordemProj.dir)}</button></th>
              <th className="px-2 py-2.5 text-right"><button type="button" onClick={() => ordemProj.toggle("acum")}>Acum. saldo{rotuloOrdem(ordemProj.chave === "acum", ordemProj.dir)}</button></th>
            </tr>
          </thead>
          <tbody>
            {projecao.map((l) => {
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
              <th className="px-3 py-2.5"><button type="button" onClick={() => ordemVar.toggle("mes")}>Mês{rotuloOrdem(ordemVar.chave === "mes", ordemVar.dir)}</button></th>
              <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordemVar.toggle("desp")}>Despesas pagas{rotuloOrdem(ordemVar.chave === "desp", ordemVar.dir)}</button></th>
              <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordemVar.toggle("delta")}>Δ R$ vs ant.{rotuloOrdem(ordemVar.chave === "delta", ordemVar.dir)}</button></th>
              <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordemVar.toggle("pct")}>Δ % vs ant.{rotuloOrdem(ordemVar.chave === "pct", ordemVar.dir)}</button></th>
            </tr>
          </thead>
          <tbody>
            {variacao.map((l) => (
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
              <th className="px-3 py-2.5"><button type="button" onClick={() => ordemDesp.toggle("venc")}>Vencimento{rotuloOrdem(ordemDesp.chave === "venc", ordemDesp.dir)}</button></th>
              <th className="px-3 py-2.5"><button type="button" onClick={() => ordemDesp.toggle("cat")}>Categoria{rotuloOrdem(ordemDesp.chave === "cat", ordemDesp.dir)}</button></th>
              <th className="px-3 py-2.5"><button type="button" onClick={() => ordemDesp.toggle("desc")}>Descrição{rotuloOrdem(ordemDesp.chave === "desc", ordemDesp.dir)}</button></th>
              <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordemDesp.toggle("valor")}>Valor{rotuloOrdem(ordemDesp.chave === "valor", ordemDesp.dir)}</button></th>
              <th className="px-3 py-2.5"><button type="button" onClick={() => ordemDesp.toggle("pag")}>Pagamento{rotuloOrdem(ordemDesp.chave === "pag", ordemDesp.dir)}</button></th>
              <th className="px-3 py-2.5"><button type="button" onClick={() => ordemDesp.toggle("sit")}>Situação{rotuloOrdem(ordemDesp.chave === "sit", ordemDesp.dir)}</button></th>
            </tr>
          </thead>
          <tbody>
            {despesas.map((d, i) => (
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
