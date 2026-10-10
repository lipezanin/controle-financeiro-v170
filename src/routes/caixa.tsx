import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GraficoCaixa } from "@/components/graficos-financeiro";
import { KpiCard } from "@/components/kpi-card";
import { SectionTitle } from "@/components/section-title";
import { formatBRL, formatData } from "@/lib/financeiro/format";
import { cn } from "@/lib/utils";
import { usePeriodo } from "@/hooks/periodo-context";
import { anoDoPeriodo } from "@/lib/financeiro/periodo";
import { resumirCaixa, type ResumoCaixa } from "@/services/caixa-service";
import { ConferenciaCaixaPainel } from "@/components/conferencia-caixa";

export const Route = createFileRoute("/caixa")({
  component: Pagina,
});

function Pagina() {
  const { periodo } = usePeriodo();
  const [r, setR] = useState<ResumoCaixa | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setR(await resumirCaixa(anoDoPeriodo(periodo)));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler o caixa");
    }
  }, [periodo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const serieCaixa = useMemo(() => {
    const movs = r?.movimentos ?? [];
    let saldo = 0;
    const porMes = new Map<string, number>();
    for (const m of movs) {
      saldo += m.tipo === "Saque" ? -m.valor : m.valor;
      const chave = String(m.data).slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(chave)) porMes.set(chave, saldo);
    }
    return [...porMes.entries()].map(([data, s]) => ({
      rotulo: data.slice(5) + "/" + data.slice(2, 4),
      saldo: s,
    }));
  }, [r]);

  const mesAtual = new Date().getMonth() + 1;

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Módulo"
        title="Caixa físico · Depósito e saque em espécie"
        description="Saldo = depósitos − saques, na ordem do livro. O resumo mensal usa só datas válidas, como o SUMIFS da planilha. Rendimentos do tipo Espécie (consultório) aparecem ao lado para conferência."
      />

      {erro ? <p className="mb-4 text-sm text-loss">{erro}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Saldo atual em espécie" value={formatBRL(r?.saldoAtual)} tom="accent" />
        <KpiCard label="Depósitos" value={formatBRL(r?.depositosTotal)} tom="gain" />
        <KpiCard label="Saques" value={formatBRL(r?.saquesTotal)} tom="loss" />
        <KpiCard
          label="Espécie · consultório (ano)"
          value={formatBRL(r?.especieConsultorio)}
          hint="Rendimentos tipo Espécie no ano corrente — não entram no saldo até haver depósito"
        />
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Análise do caixa
      </p>
      <p className="mb-4 text-sm text-subtle">
        Depósitos e saques são lançados em Lançamentos → Caixa físico. Esta tela mostra o extrato e a
        conferência.
      </p>
      <Link
        to="/lancamentos"
        search={{ tipo: "caixa" }}
        className="mb-8 inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
      >
        Lançar depósito ou saque
      </Link>

      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Evolução do saldo em espécie
      </p>
      <div className="mb-8 rounded-[16px] border border-border bg-surface p-3">
        {serieCaixa.length ? (
          <GraficoCaixa dados={serieCaixa} />
        ) : (
          <p className="px-2 py-6 text-sm text-subtle">Sem movimentos para desenhar a evolução.</p>
        )}
      </div>

      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Resumo mensal {r ? `· ${r.ano}` : ""}
      </p>
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="zebra min-w-[520px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2.5">Mês</th>
              <th className="px-3 py-2.5 text-right">Entradas</th>
              <th className="px-3 py-2.5 text-right">Saídas</th>
              <th className="px-3 py-2.5 text-right">Saldo do mês</th>
            </tr>
          </thead>
          <tbody>
            {(r?.meses ?? []).map((l) => (
              <tr key={l.mes} className={l.mes === mesAtual ? "bg-accent/10" : undefined}>
                <td className="px-3 py-2 font-medium">{l.nome}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-gain">{formatBRL(l.entradas)}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-loss">{formatBRL(l.saidas)}</td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-mono tabular",
                    l.saldoMes < 0 ? "text-loss" : "text-fg",
                  )}
                >
                  {formatBRL(l.saldoMes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Livro de movimentações
      </p>
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="zebra min-w-[640px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2.5">Data</th>
              <th className="px-3 py-2.5">Tipo</th>
              <th className="px-3 py-2.5">Descrição</th>
              <th className="px-3 py-2.5 text-right">Valor</th>
              <th className="px-3 py-2.5 text-right">Saldo acum.</th>
            </tr>
          </thead>
          <tbody>
            {(r?.movimentos ?? []).map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2 font-mono tabular">{formatData(m.data)}</td>
                <td className={cn("px-3 py-2", m.tipo === "Saque" ? "text-loss" : "text-gain")}>{m.tipo}</td>
                <td className="px-3 py-2 text-muted">{m.descricao ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{formatBRL(m.valor)}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-fg">{formatBRL(m.saldoAcumulado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConferenciaCaixaPainel modo="analise" />
    </div>
  );
}
