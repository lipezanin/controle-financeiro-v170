/**
 * Evolução do patrimônio investido.
 * Série mensal reconstruída das transações (custo) + snapshots diários a mercado.
 */

import { consultar, executar, getDb, salvarDb } from "@/lib/financeiro/db";
import { type Periodo } from "@/lib/financeiro/periodo";
import { resumirPatrimonio } from "@/services/patrimonio-service";
import { resumirRentabilidade } from "@/services/rentabilidade-service";

export type PontoEvolucao = {
  data: string;
  rotulo: string;
  custo: number;
  mercado: number | null;
};

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export async function gravarSnapshotPatrimonio(): Promise<void> {
  const [rent, pat] = await Promise.all([resumirRentabilidade(), resumirPatrimonio()]);
  const db = await getDb();
  const dia = new Date().toISOString().slice(0, 10);
  executar(
    db,
    `INSERT OR REPLACE INTO snapshots_patrimonio (data, custo, mercado, caixa)
     VALUES (?, ?, ?, ?)`,
    [dia, rent.custo, rent.mercado, pat.caixaFisico],
  );
  await salvarDb();
}

export async function evolucaoPatrimonio(periodo?: Periodo): Promise<PontoEvolucao[]> {
  const db = await getDb();
  const fluxos = consultar(
    db,
    `SELECT substr(data,1,7) AS mes, SUM(valor_brl) AS v
     FROM transacoes
     WHERE tipo_operacao IN ('Compra','Parcela Imóvel','ITBI / Cartório')
     GROUP BY mes
     UNION ALL
     SELECT substr(data,1,7) AS mes, -SUM(valor_brl) AS v
     FROM transacoes WHERE tipo_operacao = 'Venda'
     GROUP BY mes
     UNION ALL
     SELECT substr(data_aplicacao,1,7) AS mes, SUM(valor_aplicado) AS v
     FROM renda_fixa
     WHERE tipo_movimento = 'Aplicação' AND COALESCE(valor_aplicado, 0) > 0
     GROUP BY mes`,
  );
  const porMes = new Map<string, number>();
  for (const r of fluxos) {
    const mes = String(r.mes ?? "");
    if (!/^\d{4}-\d{2}$/.test(mes)) continue;
    porMes.set(mes, (porMes.get(mes) ?? 0) + num(r.v));
  }
  const snaps = consultar(db, `SELECT data, mercado FROM snapshots_patrimonio ORDER BY data`);
  const mercadoPorMes = new Map<string, number>();
  for (const s of snaps) {
    const mes = String(s.data ?? "").slice(0, 7);
    mercadoPorMes.set(mes, num(s.mercado));
  }
  const meses = [...porMes.keys()].sort();
  if (!meses.length) return [];
  const [y0, m0] = meses[0].split("-").map(Number);
  const hoje = new Date();
  const y1 = hoje.getFullYear();
  const m1 = hoje.getMonth() + 1;
  const out: PontoEvolucao[] = [];
  let custo = 0;
  let y = y0;
  let m = m0;
  while (y < y1 || (y === y1 && m <= m1)) {
    const chave = `${y}-${String(m).padStart(2, "0")}`;
    custo += porMes.get(chave) ?? 0;
    out.push({
      data: chave,
      rotulo: `${MESES[m - 1]}/${String(y).slice(2)}`,
      custo,
      mercado: mercadoPorMes.get(chave) ?? null,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  let ultimoMercado: number | null = null;
  for (const p of out) {
    if (p.mercado != null && p.mercado > 0) ultimoMercado = p.mercado;
    else p.mercado = ultimoMercado ?? p.custo;
  }
  if (out.length) {
    const cotado = num(
      consultar(
        db,
        `SELECT COALESCE(SUM(
            CASE WHEN c.preco > 0 AND COALESCE(t.qtd_acumulada, 0) > 0
              THEN t.qtd_acumulada * c.preco
              ELSE COALESCE(t.custo_acum_brl, 0) END
          ), 0) AS v
         FROM transacoes t
         INNER JOIN (
           SELECT ticker, categoria, MAX(id) AS id FROM transacoes
           WHERE ticker IS NOT NULL GROUP BY ticker, categoria
         ) u ON u.id = t.id
         LEFT JOIN cotacoes_ativos c ON UPPER(c.ticker) = UPPER(t.ticker)`,
      )[0]?.v,
    );
    if (cotado > 0) out[out.length - 1].mercado = cotado;
  }
  if (periodo && periodo.modo !== "tudo") {
    return out.filter((p) => {
      if (periodo.modo === "ano") return p.data.startsWith(String(periodo.ano));
      if (periodo.modo === "mes") {
        return p.data === `${periodo.ano}-${String(periodo.mes).padStart(2, "0")}`;
      }
      return p.data === String(periodo.data).slice(0, 7);
    });
  }
  return out;
}
