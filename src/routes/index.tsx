import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CardsClasse, GraficoAneis, GraficoDonut, GraficoEvolucaoPatrimonio } from "@/components/graficos-financeiro";
import { KpiCard } from "@/components/kpi-card";
import { SectionTitle } from "@/components/section-title";
import { TabelaMensal } from "@/components/tabela-mensal";
import { usePeriodo } from "@/hooks/periodo-context";
import { useRecorteMercado } from "@/hooks/mercado-context";
import { classeNoRecorte } from "@/lib/financeiro/mercado";
import { useMercadoAtualizado } from "@/hooks/use-mercado-atualizado";
import { anoDoPeriodo } from "@/lib/financeiro/periodo";
import { formatBRL, formatPct } from "@/lib/financeiro/format";
import { evolucaoPatrimonio, type PontoEvolucao } from "@/services/evolucao-patrimonio-service";
import { listarCarteira, type Carteira } from "@/services/investimento-service";
import { resumirPatrimonio, type ResumoPatrimonio } from "@/services/patrimonio-service";
import { resumirRentabilidade, type Rentabilidade } from "@/services/rentabilidade-service";
import { listarIndicadores, type Indicador } from "@/services/taxas-service";
import { garantirImportacaoInicial } from "@/utils/import-excel";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const { periodo } = usePeriodo();
  const { recorte } = useRecorteMercado();
  const [resumo, setResumo] = useState<ResumoPatrimonio | null>(null);
  const [rent, setRent] = useState<Rentabilidade | null>(null);
  const [inds, setInds] = useState<Indicador[]>([]);
  const [evo, setEvo] = useState<PontoEvolucao[]>([]);
  const [carteira, setCarteira] = useState<Carteira | null>(null);
  const [status, setStatus] = useState<"iniciando" | "pronto" | "erro">("iniciando");
  const [msg, setMsg] = useState("Preparando banco local");

  const carregar = useCallback(async () => {
    try {
      const [dados, rtb, ind, ev, cart] = await Promise.all([
        resumirPatrimonio(periodo),
        resumirRentabilidade({
          periodo: periodo.modo === "tudo" ? "tudo" : "ano",
          recorte,
        }).catch(() => null),
        listarIndicadores().catch(() => [] as Indicador[]),
        evolucaoPatrimonio(periodo).catch(() => [] as PontoEvolucao[]),
        listarCarteira().catch(() => null),
      ]);
      setResumo(dados);
      setRent(rtb);
      setInds(ind);
      setEvo(ev);
      setCarteira(cart);
      setStatus("pronto");
      setMsg(
        dados.contagens.transacoes
          ? `${dados.contagens.transacoes} transações · ${dados.contagens.rendimentos} rendimentos`
          : "Sem dados importados",
      );
    } catch (err) {
      setStatus("erro");
      setMsg(err instanceof Error ? err.message : "Falha ao montar o dashboard");
    }
  }, [periodo, recorte]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        await garantirImportacaoInicial();
        if (vivo) await carregar();
      } catch (err) {
        if (vivo) {
          setStatus("erro");
          setMsg(err instanceof Error ? err.message : "Falha ao abrir o banco");
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [carregar]);

  useMercadoAtualizado(() => {
    void carregar();
  });

  const r = resumo;
  const composicao = useMemo(
    () =>
      (carteira?.variacaoGrupos ?? [])
        .filter((g) => g.grupo !== "Imóveis" && classeNoRecorte(recorte, g.grupo))
        .map((g) => ({ classe: g.grupo, valor: g.valor })),
    [carteira, recorte],
  );

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Início"
        title="01 — Investimentos · Visão geral"
        description="Cards e composição da carteira. Importação e instalador ficam em Manutenção."
      />

      <div className="mb-6">
        <StatusChip
          ok={status === "pronto"}
          texto={status === "erro" ? msg : status === "pronto" ? msg : "Carregando…"}
        />
      </div>

      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        SESSÃO 1 — Cards
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Patrimônio investido" value={formatBRL(r?.patrimonioInvestido)} hint="Aportes acumulados" />
        <KpiCard
          label="Resultado GC nacional"
          value={formatBRL(r?.gcNacional)}
          tom={(r?.gcNacional ?? 0) >= 0 ? "gain" : "loss"}
        />
        <KpiCard label="Aportes no ano" value={formatBRL(r?.aportesNoAno)} />
        <KpiCard label="Resgates no ano" value={formatBRL(r?.resgatesNoAno)} tom="loss" />
        <KpiCard label="Saldo líquido aportes" value={formatBRL(r?.saldoLiquidoAportes)} tom="accent" />
        <KpiCard label="GC internacional" value={formatBRL(r?.gcInternacional)} />
        <KpiCard label="Ganho cambial" value={formatBRL(r?.ganhoCambial)} />
        <KpiCard label="Caixa físico" value={formatBRL(r?.caixaFisico)} />
      </div>

      {inds.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {inds.map((i) => (
            <span
              key={i.chave}
              className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs text-muted"
            >
              {i.chave} {i.valor == null ? "—" : i.valor.toLocaleString("pt-BR")} {i.unidade ?? ""}
            </span>
          ))}
        </div>
      ) : null}

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Rentabilidade da carteira ativa
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Custo (preço médio)" value={formatBRL(rent?.custo)} />
        <KpiCard
          label="Valor de mercado"
          value={formatBRL(rent?.mercado)}
          hint={rent ? `${rent.comCotacao} com cotação · ${rent.semCotacao} pendentes` : undefined}
          tom="accent"
        />
        <KpiCard
          label="Rentab. preço médio"
          value={formatPct(rent?.rentPm, 2)}
          tom={(rent?.lucroPm ?? 0) >= 0 ? "gain" : "loss"}
          hint={formatBRL(rent?.lucroPm)}
        />
        <KpiCard
          label="Rentab. + proventos"
          value={formatPct(rent?.rentComProventos, 2)}
          tom="gain"
          hint={formatBRL(rent?.lucroComProventos)}
        />
        <KpiCard
          label="Rentab. total (c/ vendas)"
          value={formatPct(rent?.rentTotal, 2)}
          hint={formatBRL(rent?.lucroTotal)}
        />
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Patrimônio nacional × internacional
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Patrimônio nacional" value={formatBRL(r?.patrimonioNacional)} />
        <KpiCard label="Patrimônio internacional" value={formatBRL(r?.patrimonioInternacional)} />
        <KpiCard label="% Nacional" value={formatPct(r?.pctNacional)} />
        <KpiCard label="% Internacional" value={formatPct(r?.pctInternacional)} />
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Evolução do patrimônio investido
      </p>
      <div className="mb-4 rounded-[16px] border border-border bg-surface p-3">
        <GraficoEvolucaoPatrimonio dados={evo} />
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        SESSÃO 1.3 — Composição por classe
      </p>
      {r ? (
        <div className="mb-4 rounded-[16px] border border-border bg-surface p-3">
          <GraficoDonut dados={composicao} titulo="Distribuição da carteira" />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {composicao.map((c) => (
          <KpiCard key={c.classe} label={c.classe} value={formatBRL(c.valor)} />
        ))}
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        SESSÃO 1.7 — Liquidez
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(r?.liquidez ?? []).map((l) => (
          <KpiCard key={l.faixa} label={l.faixa} value={formatBRL(l.valor)} />
        ))}
        <KpiCard label="Caixa físico (D+0 espécie)" value={formatBRL(r?.caixaFisico)} />
        <KpiCard
          label="Total liquidez rápida"
          value={formatBRL(r?.liquidezRapida)}
          hint="D+0 + D+1 + D+2 + caixa"
          tom="accent"
        />
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        SESSÃO 2 — Rendimentos mês a mês
      </p>
      {r ? <TabelaMensal linhas={r.rendimentosMensais} /> : null}
    </div>
  );
}

function StatusChip({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs " +
        (ok ? "border-gain/30 bg-gain/10 text-gain" : "border-border bg-surface text-muted")
      }
    >
      <span className={"size-1.5 rounded-full " + (ok ? "bg-gain" : "bg-warn")} />
      {texto}
    </span>
  );
}
