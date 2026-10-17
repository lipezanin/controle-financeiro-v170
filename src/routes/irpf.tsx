import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { KpiCard } from "@/components/kpi-card";
import { PainelFiscal } from "@/components/painel-fiscal";
import { RelatorioIrpfPainel } from "@/components/relatorio-irpf";
import { SectionTitle } from "@/components/section-title";
import { formatBRL, formatPct } from "@/lib/financeiro/format";
import { cn } from "@/lib/utils";
import { usePeriodo } from "@/hooks/periodo-context";
import { useMercadoAtualizado } from "@/hooks/use-mercado-atualizado";
import { anoDoPeriodo } from "@/lib/financeiro/periodo";
import { calcularMotorMensal, type ResumoIrpf } from "@/services/irpf-service";

export const Route = createFileRoute("/irpf")({
  component: Pagina,
});

function Pagina() {
  const { periodo } = usePeriodo();
  const [r, setR] = useState<ResumoIrpf | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void calcularMotorMensal(anoDoPeriodo(periodo))
      .then(setR)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha no motor IRPFM"));
  }, [periodo]);

  const recarregar = useCallback(() => {
    void calcularMotorMensal(anoDoPeriodo(periodo)).then(setR).catch(() => undefined);
  }, [periodo]);
  useMercadoAtualizado(recarregar);

  const pisoPct = r ? Math.min(100, (r.baseComputavelAcum / r.isentoAte) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Módulo"
        title="02 — Imposto de renda · IRPFM e DARF"
        description="Lei 15.270/2025: piso de R$ 600 mil, rampa até 10% em R$ 1,2 milhão, escudo fiscal e DARF 6015. O motor lê rendimentos e vendas do SQLite local."
      />

      {erro ? <p className="mb-4 text-sm text-loss">{erro}</p> : null}

      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        02.1 / 02.8 — IRPFM {r ? `· ${r.ano}` : ""}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Base computável acumulada" value={formatBRL(r?.baseComputavelAcum)} />
        <KpiCard label="Crédito acumulado (IR)" value={formatBRL(r?.creditoAcumulado)} tom="gain" />
        <KpiCard
          label="Alíquota efetiva IRPFM"
          value={formatPct(r?.aliquotaEfetiva, 2)}
          hint="0% até o piso de R$ 600 mil"
        />
        <KpiCard label="Imposto teórico total" value={formatBRL(r?.impostoTeorico)} />
        <KpiCard label="Escudo fiscal — saldo" value={formatBRL(r?.escudoFiscal)} tom="gain" />
        <KpiCard label="Já distribuído — mês atual" value={formatBRL(r?.jaDistribuidoMes)} />
        <KpiCard
          label="Teto máximo adicional (mês)"
          value={formatBRL(r?.tetoAdicionalMes)}
          tom="accent"
        />
        <KpiCard label="Headroom até R$ 600 mil" value={formatBRL(r?.headroom)} />
      </div>

      <div className="mt-4 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            Distância até o piso anual
          </p>
          <p className="font-mono text-sm tabular text-fg">
            {formatBRL(r?.baseComputavelAcum)} / {formatBRL(r?.isentoAte)}
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn("h-full rounded-full", pisoPct >= 92 ? "bg-warn" : "bg-accent")}
            style={{ width: `${pisoPct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-subtle">
          {r
            ? `${formatPct(pisoPct / 100, 1)} da faixa isenta usada · rampa começa em ${formatBRL(r.isentoAte)} e chega a ${formatPct(r.aliqMax, 0)} em ${formatBRL(r.rampaAte)}`
            : "Carregando motor fiscal…"}
        </p>
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Limite mensal de distribuição até o fim do ano
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Limite mensal (até dez)"
          value={formatBRL(r?.limiteMensalDistribuicao)}
          hint="Headroom dividido pelos meses restantes, inclusive o atual"
          tom="accent"
        />
        <KpiCard label="Meses restantes (incl. atual)" value={r ? String(r.mesesRestantes) : "—"} />
        <KpiCard label="Headroom total até R$ 600 mil" value={formatBRL(r?.headroom)} />
        <KpiCard
          label="Possível distribuir agora (teto mês)"
          value={formatBRL(r?.tetoAdicionalMes)}
        />
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Rendimentos / aportes / DARF
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Rendimentos totais (ano)" value={formatBRL(r?.rendimentosTotais)} />
        <KpiCard label="Base computável (IRPFM)" value={formatBRL(r?.baseComputavelAcum)} />
        <KpiCard
          label="Não tributáveis (aprox.)"
          value={formatBRL(r?.naoTributaveis)}
          hint="Total de rendimentos menos a base (inclui GC de vendas na base)"
        />
        <KpiCard label="% computáveis / total" value={formatPct(r?.pctComputaveis, 1)} />
        <KpiCard label="Aportes investimento (ano)" value={formatBRL(r?.aportesAno)} />
        <KpiCard label="Resgates / vendas (ano)" value={formatBRL(r?.resgatesAno)} />
        <KpiCard label="GC nacional realizado" value={formatBRL(r?.gcNacionalAno)} />
        <KpiCard
          label="DARF pendente"
          value={formatBRL(r?.darfPendente)}
          tom={r && r.darfPendente > 0 ? "warn" : "default"}
        />
        <KpiCard label={`DARF gerado (ano) · ${r?.darfCodigo ?? "6015"}`} value={formatBRL(r?.darfGeradoAno)} />
        <KpiCard label="DARF pago (ano)" value={formatBRL(r?.darfPagoAno)} />
        <KpiCard label="GC internacional" value={formatBRL(r?.gcInternacionalAno)} />
        <KpiCard label="Limite anual IRPFM" value={formatBRL(r?.isentoAte)} />
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        02.8 — Motor mensal IRPFM
      </p>
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="zebra min-w-[1100px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <th className="sticky left-0 bg-surface-2 px-3 py-2.5">Mês</th>
              <th className="px-2 py-2.5 text-right">Distrib. lucros</th>
              <th className="px-2 py-2.5 text-right">Demais comp.</th>
              <th className="px-2 py-2.5 text-right">GC obrig.</th>
              <th className="px-2 py-2.5 text-right">Base mensal</th>
              <th className="px-2 py-2.5 text-right">Base acum.</th>
              <th className="px-2 py-2.5 text-right">Créd. mês</th>
              <th className="px-2 py-2.5 text-right">Créd. acum.</th>
              <th className="px-2 py-2.5 text-right">Alíq.</th>
              <th className="px-2 py-2.5 text-right">Imp. teórico</th>
              <th className="px-2 py-2.5 text-right">Escudo</th>
              <th className="px-2 py-2.5 text-right">Teto</th>
            </tr>
          </thead>
          <tbody>
            {(r?.motor ?? []).map((l) => {
              const atual = r?.mesAtual === l.mes;
              return (
                <tr key={l.mes} className={atual ? "bg-accent/10" : undefined}>
                  <td className={cn("sticky left-0 px-3 py-2 font-medium", atual ? "bg-accent/10 text-accent" : "bg-surface")}>
                    {l.nome}
                    {atual ? " · agora" : ""}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.distLucros)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.demaisComputaveis)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.gcObrigatorio)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular text-fg">{formatBRL(l.baseMensal)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular text-fg">{formatBRL(l.baseAcumulada)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.creditoMensal)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.creditoAcumulado)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatPct(l.aliquotaEfetiva, 2)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.impostoTeorico)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular text-gain">{formatBRL(l.escudoFiscal)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.tetoAdicional)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        02.6 — DARF mensal GC (cód. {r?.darfCodigo ?? "6015"})
      </p>
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="zebra min-w-[1100px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <th className="sticky left-0 bg-surface-2 px-3 py-2.5">Mês</th>
              <th className="px-2 py-2.5 text-right">GC nacional</th>
              <th className="px-2 py-2.5 text-right">Vendas nac.</th>
              <th className="px-2 py-2.5">Isento ≤20k?</th>
              <th className="px-2 py-2.5 text-right">DARF 15%</th>
              <th className="px-2 py-2.5 text-right">GC FIIs</th>
              <th className="px-2 py-2.5 text-right">DARF FII</th>
              <th className="px-2 py-2.5 text-right">GC intl</th>
              <th className="px-2 py-2.5 text-right">DARF gerado</th>
              <th className="px-2 py-2.5 text-right">Pago</th>
              <th className="px-2 py-2.5 text-right">A pagar</th>
              <th className="px-2 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {(r?.darf ?? []).map((l) => {
              const atual = r?.mesAtual === l.mes;
              return (
                <tr key={l.mes} className={atual ? "bg-accent/10" : undefined}>
                  <td className={cn("sticky left-0 px-3 py-2 font-medium", atual ? "bg-accent/10" : "bg-surface")}>
                    {l.nome}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.gcNacional)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.vendasNacionais)}</td>
                  <td className="px-2 py-2">{l.isento20k ? "Sim" : "Não"}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.darfNacional)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.gcFii)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.darfFii)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.gcInternacional)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.darfGerado)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.darfPago)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(l.aPagar)}</td>
                  <td
                    className={cn(
                      "px-2 py-2",
                      l.status === "Pendente" && "text-warn",
                      l.status === "Pago" && "text-gain",
                      l.status === "Não Aplicável" && "text-subtle",
                    )}
                  >
                    {l.status}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-subtle">
        Regra IRPFM — até R$ 600 mil → 0%. De R$ 600 mil a R$ 1,2 milhão → 0–10% linear sobre a base
        acumulada. Acima de R$ 1,2 milhão → 10%. Vendas nacionais de RV até R$ 20 mil/mês ficam isentas
        de DARF 15%. FIIs recolhem 20% sem isenção.
      </p>

      <PainelFiscal />
      <RelatorioIrpfPainel />
    </div>
  );
}
