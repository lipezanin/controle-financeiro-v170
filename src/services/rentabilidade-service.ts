/**
 * Rentabilidade da carteira e evolução do yield on cost.
 * Não altera as contas de custo da planilha — só lê custo, proventos, GC e cotações.
 */

import { consultar, getDb } from "@/lib/financeiro/db";
import { prefixoSql, type Periodo } from "@/lib/financeiro/periodo";
import { passaRecorte, type RecorteMercado } from "@/lib/financeiro/mercado";
import { listarCarteira, type Posicao } from "@/services/investimento-service";

export type PontoYoc = {
  data: string;
  proventosAcum: number;
  custo: number;
  yoc: number | null;
};

export type Rentabilidade = {
  custo: number;
  mercado: number;
  proventos: number;
  gcRealizado: number;
  rentPm: number | null;
  rentComProventos: number | null;
  rentTotal: number | null;
  lucroPm: number;
  lucroComProventos: number;
  lucroTotal: number;
  comCotacao: number;
  semCotacao: number;
};

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

function mercadoDe(p: Posicao): number {
  if (p.valorMercado != null && p.valorMercado > 0) return p.valorMercado;
  return p.valorInvestido;
}

export type FiltroRentabilidade = {
  grupo?: string;
  periodo?: "tudo" | "ano" | Periodo;
  recorte?: RecorteMercado;
};

export async function resumirRentabilidade(filtro: FiltroRentabilidade = {}): Promise<Rentabilidade> {
  const carteira = await listarCarteira();
  const db = await getDb();
  const ativas = carteira.ativas.flatMap((g) =>
    !filtro.grupo || g.grupo === filtro.grupo ? g.posicoes : [],
  ).filter((p) => passaRecorte(filtro.recorte ?? "tudo", p.categoria));
  const custo = ativas.reduce((s, p) => s + p.valorInvestido, 0);
  const mercado = ativas.reduce((s, p) => s + mercadoDe(p), 0);
  const tickers = ativas.map((p) => p.ticker).filter(Boolean);
  const ano = new Date().getFullYear();
  const recorte: Periodo | null =
    filtro.periodo && typeof filtro.periodo === "object"
      ? filtro.periodo
      : filtro.periodo === "ano"
        ? { modo: "ano", ano, mes: 1, data: `${ano}-01-01` }
        : null;
  let proventos = ativas.reduce((s, p) => s + p.proventosLiq, 0);
  let gcRealizado = num(
    consultar(db, `SELECT COALESCE(SUM(ganho_capital_brl), 0) AS v FROM transacoes`)[0]?.v,
  );
  if (recorte || tickers.length) {
    const ph = tickers.map(() => "?").join(",") || "''";
    if (recorte && recorte.modo !== "tudo") {
      const pr = prefixoSql(recorte, "data");
      proventos = num(
        consultar(
          db,
          `SELECT COALESCE(SUM(COALESCE(valor_liquido, valor_bruto_brl)), 0) AS v
           FROM rendimentos
           WHERE ticker IN (${ph}) AND ${pr.sql}`,
          [...tickers, ...pr.params],
        )[0]?.v,
      );
      gcRealizado = num(
        consultar(
          db,
          `SELECT COALESCE(SUM(ganho_capital_brl), 0) AS v FROM transacoes
           WHERE ticker IN (${ph}) AND ${pr.sql}`,
          [...tickers, ...pr.params],
        )[0]?.v,
      );
    } else if (filtro.grupo) {
      gcRealizado = num(
        consultar(
          db,
          `SELECT COALESCE(SUM(ganho_capital_brl), 0) AS v FROM transacoes WHERE ticker IN (${ph})`,
          tickers,
        )[0]?.v,
      );
    }
  }
  const lucroPm = mercado - custo;
  const lucroComProventos = lucroPm + proventos;
  const lucroTotal = lucroComProventos + gcRealizado;
  return {
    custo,
    mercado,
    proventos,
    gcRealizado,
    rentPm: custo ? lucroPm / custo : null,
    rentComProventos: custo ? lucroComProventos / custo : null,
    rentTotal: custo ? lucroTotal / custo : null,
    lucroPm,
    lucroComProventos,
    lucroTotal,
    comCotacao: ativas.filter((p) => p.precoAtual != null).length,
    semCotacao: ativas.filter((p) => p.precoAtual == null && p.grupo !== "Renda Fixa").length,
  };
}

/** YoC acumulado em cada data de provento: Σ proventos / custo à época. */
export async function evolucaoYoc(ticker: string): Promise<PontoYoc[]> {
  const t = ticker.trim().toUpperCase();
  if (!t) return [];
  const db = await getDb();
  const txs = consultar(
    db,
    `SELECT data, custo_acum_brl AS custo FROM transacoes
     WHERE UPPER(ticker) = ? ORDER BY data ASC, id ASC`,
    [t],
  );
  const rends = consultar(
    db,
    `SELECT data, COALESCE(valor_liquido, valor_bruto_brl) AS v FROM rendimentos
     WHERE UPPER(ticker) = ? ORDER BY data ASC, id ASC`,
    [t],
  );
  const pontos: PontoYoc[] = [];
  let acum = 0;
  for (const r of rends) {
    const data = String(r.data ?? "");
    acum += num(r.v);
    let custo = 0;
    for (const tx of txs) {
      if (String(tx.data ?? "") <= data) custo = num(tx.custo);
    }
    pontos.push({
      data,
      proventosAcum: acum,
      custo,
      yoc: custo > 0 ? acum / custo : null,
    });
  }
  return pontos;
}
