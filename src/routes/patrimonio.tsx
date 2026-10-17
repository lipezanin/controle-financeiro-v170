import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CardsClasse, GraficoDonut, GraficoEvolucaoPatrimonio } from "@/components/graficos-financeiro";
import { KpiCard } from "@/components/kpi-card";
import { SectionTitle } from "@/components/section-title";
import { formatBRL, formatPct } from "@/lib/financeiro/format";
import { CLASSES_INVESTIMENTO } from "@/lib/financeiro/theme";
import { usePeriodo } from "@/hooks/periodo-context";
import { useRecorteMercado } from "@/hooks/mercado-context";
import { classeNoRecorte } from "@/lib/financeiro/mercado";
import { useMercadoAtualizado } from "@/hooks/use-mercado-atualizado";
import { evolucaoPatrimonio, type PontoEvolucao } from "@/services/evolucao-patrimonio-service";
import { listarCarteira, type Carteira } from "@/services/investimento-service";
import { resumirPatrimonio, type ResumoPatrimonio } from "@/services/patrimonio-service";
import { resumirRentabilidade, type Rentabilidade } from "@/services/rentabilidade-service";

export const Route = createFileRoute("/patrimonio")({
  component: Pagina,
});

const selCls =
  "h-11 rounded-md border border-input-border bg-input px-3 text-sm text-fg";

function Pagina() {
  const { periodo: periodoGlobal } = usePeriodo();
  const { recorte } = useRecorteMercado();
  const [r, setR] = useState<ResumoPatrimonio | null>(null);
  const [rent, setRent] = useState<Rentabilidade | null>(null);
  const [evo, setEvo] = useState<PontoEvolucao[]>([]);
  const [carteira, setCarteira] = useState<Carteira | null>(null);
  const [grupo, setGrupo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    void Promise.all([
      resumirPatrimonio(periodoGlobal),
      resumirRentabilidade({
        grupo: grupo || undefined,
        periodo: periodoGlobal,
        recorte,
      }),
      evolucaoPatrimonio(periodoGlobal),
      listarCarteira(),
    ])
      .then(([p, rt, ev, cart]) => {
        setR(p);
        setRent(rt);
        setEvo(ev);
        setCarteira(cart);
        setErro(null);
      })
      .catch((e: unknown) => {
        setErro(e instanceof Error ? e.message : "Falha ao ler o patrimônio");
      });
  }, [grupo, periodoGlobal, recorte]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useMercadoAtualizado(carregar);

  const composicao = (carteira?.variacaoGrupos ?? [])
    .filter((g) => classeNoRecorte(recorte, g.grupo))
    .map((g) => ({
      classe: g.grupo,
      valor: g.valor,
      variacaoPct: g.variacaoPct,
      variacaoReais: g.variacaoReais,
    }));
  const totalComp = composicao.reduce((s, c) => s + c.valor, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Módulo"
        title="Patrimônio · Nacional, internacional e liquidez"
        description="Composição e faixas D+ com as mesmas regras da planilha. A carteira por ticker está em Investimentos."
      />
      {erro ? <p className="mb-4 text-sm text-loss">{erro}</p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Patrimônio nacional" value={formatBRL(r?.patrimonioNacional)} />
        <KpiCard label="Patrimônio internacional" value={formatBRL(r?.patrimonioInternacional)} />
        <KpiCard label="% Nacional" value={formatPct(r?.pctNacional)} />
        <KpiCard label="% Internacional" value={formatPct(r?.pctInternacional)} />
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Patrimônio a mercado e rentabilidade
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Classe
          <select className={selCls} value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="">Todas</option>
            {CLASSES_INVESTIMENTO.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted">
          O recorte de datas usa o filtro global do cabeçalho (ano / mês / dia).
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Custo investido (carteira ativa)" value={formatBRL(rent?.custo)} />
        <KpiCard label="Patrimônio a mercado" value={formatBRL(rent?.mercado)} tom="accent" />
        <KpiCard
          label="Δ vs preço médio"
          value={formatPct(rent?.rentPm, 2)}
          tom={(rent?.lucroPm ?? 0) >= 0 ? "gain" : "loss"}
          hint={formatBRL(rent?.lucroPm)}
        />
        <KpiCard
          label="Com proventos"
          value={formatPct(rent?.rentComProventos, 2)}
          tom="gain"
          hint={formatBRL(rent?.lucroComProventos)}
        />
        <KpiCard
          label="Total (inclui lucros de venda)"
          value={formatPct(rent?.rentTotal, 2)}
          hint={formatBRL(rent?.lucroTotal)}
        />
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Evolução do custo investido
      </p>
      <div className="mb-4 rounded-[16px] border border-border bg-surface p-3">
        <GraficoEvolucaoPatrimonio dados={evo} />
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Composição por classe
      </p>
      {r ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <GraficoDonut dados={composicao} titulo="Distribuição da carteira" />
          <CardsClasse dados={composicao} />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {composicao.map((c) => (
          <KpiCard key={c.classe} label={c.classe} value={formatBRL(c.valor)} />
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="zebra min-w-[520px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2.5">Classe</th>
              <th className="px-3 py-2.5 text-right">Valor</th>
              <th className="px-3 py-2.5 text-right">%</th>
              <th className="px-3 py-2.5">Peso</th>
            </tr>
          </thead>
          <tbody>
            {composicao.map((c) => {
              const pct = totalComp ? c.valor / totalComp : 0;
              return (
                <tr key={c.classe}>
                  <td className="px-3 py-2">{c.classe}</td>
                  <td className="px-3 py-2 text-right font-mono tabular">{formatBRL(c.valor)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular">{formatPct(pct)}</td>
                  <td className="px-3 py-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.min(100, pct * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Liquidez
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(r?.liquidez ?? []).map((l) => (
          <KpiCard key={l.faixa} label={l.faixa} value={formatBRL(l.valor)} />
        ))}
        <KpiCard label="Caixa físico" value={formatBRL(r?.caixaFisico)} />
        <KpiCard label="Liquidez rápida" value={formatBRL(r?.liquidezRapida)} tom="accent" />
      </div>
    </div>
  );
}
