/**
 * Câmbio — PTAX oficial do Banco Central (Olinda).
 * Cotação de venda (cotacaoVenda) é a referência para transações internacionais.
 */

import { consultar, executar, getDb, salvarDb } from "@/lib/financeiro/db";

const PTAX_PERIODO =
  "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)";

function isoParaPtax(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}-${d}-${y}`;
}

function somaDias(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export type CotacaoDolar = {
  data: string;
  compra: number;
  venda: number;
  fonte: string;
};

async function buscarPeriodo(inicioIso: string, fimIso: string): Promise<CotacaoDolar[]> {
  const url =
    `${PTAX_PERIODO}?@dataInicial='${isoParaPtax(inicioIso)}'` +
    `&@dataFinalCotacao='${isoParaPtax(fimIso)}'&$format=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`PTAX HTTP ${r.status}`);
  const json = (await r.json()) as {
    value?: { cotacaoCompra: number; cotacaoVenda: number; dataHoraCotacao: string }[];
  };
  return (json.value ?? []).map((v) => ({
    data: String(v.dataHoraCotacao).slice(0, 10),
    compra: Number(v.cotacaoCompra),
    venda: Number(v.cotacaoVenda),
    fonte: "BCB PTAX",
  }));
}

export async function atualizarDolar(): Promise<CotacaoDolar> {
  const hoje = new Date().toISOString().slice(0, 10);
  const inicio = somaDias(hoje, -10);
  const serie = await buscarPeriodo(inicio, hoje);
  if (!serie.length) throw new Error("PTAX não devolveu cotações no período.");
  const ultima = serie[serie.length - 1];
  const db = await getDb();
  for (const c of serie) {
    executar(
      db,
      `INSERT OR REPLACE INTO cotacoes_cambio (data, moeda, cotacao_compra, cotacao_venda, fonte)
       VALUES (?, 'USD', ?, ?, ?)`,
      [c.data, c.compra, c.venda, c.fonte],
    );
  }
  executar(
    db,
    `INSERT OR REPLACE INTO indicadores (chave, valor, unidade, atualizado_em)
     VALUES ('USD_BRL', ?, 'USD/BRL', ?)`,
    [ultima.venda, new Date().toISOString()],
  );
  await salvarDb();
  return ultima;
}

/** Última PTAX salva, ou busca na rede se o banco estiver vazio. */
export async function dolarAtual(): Promise<CotacaoDolar | null> {
  const db = await getDb();
  const row = consultar(
    db,
    `SELECT data, cotacao_compra AS compra, cotacao_venda AS venda, fonte
     FROM cotacoes_cambio WHERE moeda = 'USD' ORDER BY data DESC LIMIT 1`,
  )[0];
  if (row) {
    return {
      data: String(row.data),
      compra: Number(row.compra) || 0,
      venda: Number(row.venda) || 0,
      fonte: String(row.fonte ?? "BCB PTAX"),
    };
  }
  try {
    return await atualizarDolar();
  } catch {
    const ind = consultar(db, `SELECT valor, atualizado_em FROM indicadores WHERE chave = 'USD_BRL'`)[0];
    if (!ind) return null;
    return {
      data: String(ind.atualizado_em ?? "").slice(0, 10),
      compra: Number(ind.valor) || 0,
      venda: Number(ind.valor) || 0,
      fonte: "indicadores",
    };
  }
}

/** PTAX da data (ou o último dia útil anterior). */
export async function dolarNaData(iso: string): Promise<CotacaoDolar | null> {
  const db = await getDb();
  const local = consultar(
    db,
    `SELECT data, cotacao_compra AS compra, cotacao_venda AS venda, fonte
     FROM cotacoes_cambio
     WHERE moeda = 'USD' AND substr(data,1,10) <= ?
     ORDER BY data DESC LIMIT 1`,
    [iso],
  )[0];
  if (local && String(local.data).slice(0, 10) === iso) {
    return {
      data: String(local.data).slice(0, 10),
      compra: Number(local.compra) || 0,
      venda: Number(local.venda) || 0,
      fonte: String(local.fonte ?? "BCB PTAX"),
    };
  }
  try {
    const serie = await buscarPeriodo(somaDias(iso, -12), iso);
    if (serie.length) {
      for (const c of serie) {
        executar(
          db,
          `INSERT OR REPLACE INTO cotacoes_cambio (data, moeda, cotacao_compra, cotacao_venda, fonte)
           VALUES (?, 'USD', ?, ?, ?)`,
          [c.data, c.compra, c.venda, c.fonte],
        );
      }
      await salvarDb();
      return serie[serie.length - 1];
    }
  } catch {
    /* offline */
  }
  if (local) {
    return {
      data: String(local.data).slice(0, 10),
      compra: Number(local.compra) || 0,
      venda: Number(local.venda) || 0,
      fonte: String(local.fonte ?? "BCB PTAX"),
    };
  }
  return dolarAtual();
}
