import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { GraficoDonut, GraficoProventosMes, GraficoAneis } from "@/components/graficos-financeiro";
import { KpiCard } from "@/components/kpi-card";
import { SectionTitle } from "@/components/section-title";
import { formatBRL, formatPct } from "@/lib/financeiro/format";
import { dataNoPeriodo } from "@/lib/financeiro/periodo";
import { usePeriodo } from "@/hooks/periodo-context";
import { useMercadoAtualizado } from "@/hooks/use-mercado-atualizado";
import { consultar, getDb } from "@/lib/financeiro/db";
import { listarCarteira, type Posicao } from "@/services/investimento-service";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type Painel = {
  barras: { rotulo: string; valor: number }[];
  categorias: { classe: string; valor: number }[];
  mesAtual: number;
  mesAnterior: number;
  total12m: number;
  classes: { grupo: string; itens: Posicao[] }[];
};

export const Route = createFileRoute("/proventos")({
  component: Pagina,
});

function Pagina() {
  const { periodo } = usePeriodo();
  const [p, setP] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    void (async () => {
      try {
        const db = await getDb();
        const linhas = consultar(
          db,
          `SELECT substr(data, 1, 7) AS mes, COALESCE(tipo, 'Outros') AS tipo,
                  SUM(COALESCE(valor_liquido, valor_bruto_brl, 0)) AS v
           FROM rendimentos
           WHERE data IS NOT NULL AND length(data) >= 7
             AND COALESCE(tipo, '') NOT IN (
               'Espécie',
               'Distribuição de Lucros - Consultório Médico',
               'Pró Labore',
               'Planos de Saúde'
             )
             AND COALESCE(categoria, '') NOT LIKE '%Consultório%'
             AND COALESCE(categoria, '') NOT IN ('Imóveis', 'Renda Fixa', 'Previdência Privada')
             AND COALESCE(tipo, '') NOT LIKE '%Ganho de Capital%'
             AND (
               COALESCE(tipo, '') LIKE '%Dividendo%'
               OR COALESCE(tipo, '') LIKE '%JCP%'
               OR COALESCE(tipo, '') LIKE '%Aluguel%'
               OR COALESCE(categoria, '') LIKE '%Fundo%'
               OR COALESCE(categoria, '') LIKE '%Aç%'
               OR COALESCE(categoria, '') LIKE '%ETF%'
               OR COALESCE(categoria, '') LIKE '%BDR%'
               OR COALESCE(categoria, '') LIKE '%Stock%'
               OR COALESCE(categoria, '') LIKE '%Reit%'
             )
           GROUP BY mes, tipo
           ORDER BY mes`,
        );
        const porMes = new Map<string, number>();
        const porTipo = new Map<string, number>();
        const carteira = await listarCarteira();
        const fora = new Set(["Imóveis", "Renda Fixa", "Previdência Privada", "Bonds - Renda Fixa", "Treasuries - Renda Fixa"]);
        const mapaClasses = new Map<string, Posicao[]>();
        for (const bloco of [...carteira.ativas, ...carteira.inativas]) {
          if (fora.has(bloco.grupo)) continue;
          const itens = bloco.posicoes.filter((pos) => pos.proventosLiq > 0);
          if (!itens.length) continue;
          mapaClasses.set(bloco.grupo, [...(mapaClasses.get(bloco.grupo) ?? []), ...itens]);
        }
        const classes = [...mapaClasses.entries()].map(([grupo, itens]) => ({ grupo, itens }));
        const agora = new Date();
        const chaveAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
        const ant = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
        const chaveAnt = `${ant.getFullYear()}-${String(ant.getMonth() + 1).padStart(2, "0")}`;
        const corte = new Date(agora.getFullYear(), agora.getMonth() - 11, 1);
        let total = 0;
        for (const r of linhas) {
          const mes = String(r.mes);
          const v = Number(r.v) || 0;
          const dia = `${mes}-01`;
          if (!dataNoPeriodo(dia, periodo) && periodo.modo !== "tudo") continue;
          porMes.set(mes, (porMes.get(mes) ?? 0) + v);
          total += v;
          const tipo = String(r.tipo ?? "Outros");
          porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + v);
        }
        const barras: { rotulo: string; valor: number }[] = [];
        if (periodo.modo === "tudo") {
          const cursor = new Date(corte);
          for (let i = 0; i < 12; i++) {
            const chave = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
            barras.push({
              rotulo: `${MESES[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`,
              valor: porMes.get(chave) ?? 0,
            });
            cursor.setMonth(cursor.getMonth() + 1);
          }
        } else {
          for (const [mes, valor] of [...porMes.entries()].sort()) {
            const m = Number(mes.slice(5, 7));
            barras.push({ rotulo: `${MESES[m - 1]}/${mes.slice(2, 4)}`, valor });
          }
        }
        setP({
          barras,
          categorias: [...porTipo.entries()].map(([classe, valor]) => ({ classe, valor })),
          mesAtual: porMes.get(chaveAtual) ?? 0,
          mesAnterior: porMes.get(chaveAnt) ?? 0,
          total12m: total,
          classes,
        });
        setErro(null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao ler proventos");
      }
    })();
  }, [periodo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useMercadoAtualizado(carregar);

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Investimentos"
        title="Proventos recebidos"
        description="Dividendos, JCP e rendimentos de bolsa, no Brasil e no exterior. Consultório, espécie, imóveis e renda fixa ficam de fora."
      />
      {erro ? <p className="mb-4 text-sm text-loss">{erro}</p> : null}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Últimos 12 meses" value={formatBRL(p?.total12m)} />
        <KpiCard label="Mês anterior" value={formatBRL(p?.mesAnterior)} />
        <KpiCard label="Mês atual" value={formatBRL(p?.mesAtual)} tom="gain" />
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <GraficoAneis atual={p?.mesAtual ?? 0} anterior={p?.mesAnterior ?? 0} />
        <div className="rounded-[16px] border border-border bg-surface p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Mês a mês</p>
          <GraficoProventosMes dados={p?.barras ?? []} />
        </div>
      </div>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Por tipo</p>
      <GraficoDonut dados={p?.categorias ?? []} titulo="Proventos por categoria (12 meses)" />
      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Por classe · recolhido
      </p>
      {(p?.classes ?? []).map((g) => (
        <ListaClasse key={g.grupo} grupo={g.grupo} itens={g.itens} />
      ))}
    </div>
  );
}

function ListaClasse({ grupo, itens }: { grupo: string; itens: Posicao[] }) {
  const [aberto, setAberto] = useState(false);
  const total = itens.reduce((s, p) => s + p.proventosLiq, 0);
  return (
    <section className="mb-3">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-left"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
          {aberto ? "▾" : "▸"} {grupo}
        </span>
        <span className="font-mono text-xs tabular text-subtle">{formatBRL(total)}</span>
      </button>
      {aberto ? (
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="zebra w-full min-w-[520px] text-left text-xs">
            <thead>
              <tr className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="px-3 py-2">Ativo</th>
                <th className="px-3 py-2 text-right">Proventos</th>
                <th className="px-3 py-2 text-right">YoC</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((p) => (
                <tr key={p.chave}>
                  <td className="px-3 py-2 font-medium">{p.ticker}</td>
                  <td className="px-3 py-2 text-right font-mono tabular">{formatBRL(p.proventosLiq)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular">{formatPct(p.yieldOnCost, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
