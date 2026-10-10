import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GraficoDonut, GraficoProventosMes, GraficoAneis } from "@/components/graficos-financeiro";
import { KpiCard } from "@/components/kpi-card";
import { SectionTitle } from "@/components/section-title";
import { formatBRL } from "@/lib/financeiro/format";
import { consultar, getDb } from "@/lib/financeiro/db";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type Painel = {
  barras: { rotulo: string; valor: number }[];
  categorias: { classe: string; valor: number }[];
  mesAtual: number;
  mesAnterior: number;
  total12m: number;
};

export const Route = createFileRoute("/proventos")({
  component: Pagina,
});

function Pagina() {
  const [p, setP] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const db = await getDb();
        const linhas = consultar(
          db,
          `SELECT substr(data, 1, 7) AS mes, COALESCE(tipo, 'Outros') AS tipo,
                  SUM(COALESCE(valor_liquido, valor_bruto_brl, 0)) AS v
           FROM rendimentos
           WHERE data IS NOT NULL AND length(data) >= 7
           GROUP BY mes, tipo
           ORDER BY mes`,
        );
        const porMes = new Map<string, number>();
        const porTipo = new Map<string, number>();
        const agora = new Date();
        const chaveAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
        const ant = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
        const chaveAnt = `${ant.getFullYear()}-${String(ant.getMonth() + 1).padStart(2, "0")}`;
        const corte = new Date(agora.getFullYear(), agora.getMonth() - 11, 1);
        const corteChave = `${corte.getFullYear()}-${String(corte.getMonth() + 1).padStart(2, "0")}`;
        let total12 = 0;
        for (const r of linhas) {
          const mes = String(r.mes);
          const v = Number(r.v) || 0;
          porMes.set(mes, (porMes.get(mes) ?? 0) + v);
          if (mes >= corteChave) {
            total12 += v;
            const tipo = String(r.tipo ?? "Outros");
            porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + v);
          }
        }
        const barras: { rotulo: string; valor: number }[] = [];
        const cursor = new Date(corte);
        for (let i = 0; i < 12; i++) {
          const chave = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
          barras.push({
            rotulo: `${MESES[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`,
            valor: porMes.get(chave) ?? 0,
          });
          cursor.setMonth(cursor.getMonth() + 1);
        }
        setP({
          barras,
          categorias: [...porTipo.entries()].map(([classe, valor]) => ({ classe, valor })),
          mesAtual: porMes.get(chaveAtual) ?? 0,
          mesAnterior: porMes.get(chaveAnt) ?? 0,
          total12m: total12,
        });
        setErro(null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao ler proventos");
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Investimentos"
        title="Proventos recebidos"
        description="Dividendos, JCP, rendimentos e aluguéis lançados no livro. O gráfico mensal cobre os últimos 12 meses."
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
    </div>
  );
}
