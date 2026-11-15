/**
 * Agregações de patrimônio — mesmas regras da aba INVESTIMENTOS do Excel.
 */

import type { Database } from "sql.js";
import { consultar, getDb } from "@/lib/financeiro/db";
import { prefixoSql, prefixoSqlAte, type Periodo } from "@/lib/financeiro/periodo";
import { CLASSES_INVESTIMENTO, FAIXAS_LIQUIDEZ } from "@/lib/financeiro/theme";
import { SQL_COMPRAS } from "@/lib/financeiro/imovel";
import { garantirImportacaoInicial } from "@/utils/import-excel";

const COMPRAS = SQL_COMPRAS;
const RF_ATIVA =
  "tipo_movimento = 'Aplicação' AND COALESCE(valor_aplicado, 0) > 0 AND COALESCE(status, 'Ativo') <> 'Resgatado'";

const REND_MENSAL: { label: string; categoria: string }[] = [
  { label: "Renda Fixa", categoria: "Renda Fixa" },
  { label: "Fundos Imobiliários", categoria: "Fundos Imobiliários - Renda Variável" },
  { label: "Ações", categoria: "Ações - Renda Variável" },
  { label: "ETF's Nacionais", categoria: "ETF's - Renda Variável" },
  { label: "Imóveis - Aluguel", categoria: "Imóveis" },
  { label: "Previdência Privada", categoria: "Previdência Privada" },
  { label: "Stocks", categoria: "Stocks - Renda Variável" },
  { label: "ETF's USA", categoria: "ETF's USA - Renda Variável" },
  { label: "Reits", categoria: "Reits - Renda Variável" },
  { label: "Bonds - Renda Fixa", categoria: "Bonds - Renda Fixa" },
  { label: "Treasuries - Renda Fixa", categoria: "Treasuries - Renda Fixa" },
];

export type ResumoPatrimonio = {
  patrimonioInvestido: number;
  gcNacional: number;
  aportesNoAno: number;
  resgatesNoAno: number;
  saldoLiquidoAportes: number;
  gcInternacional: number;
  ganhoCambial: number;
  caixaFisico: number;
  patrimonioNacional: number;
  patrimonioInternacional: number;
  pctNacional: number;
  pctInternacional: number;
  composicao: { classe: string; valor: number }[];
  liquidez: { faixa: string; valor: number }[];
  liquidezRapida: number;
  rendimentosMensais: { categoria: string; meses: number[]; total: number }[];
  contagens: {
    transacoes: number;
    rendaFixa: number;
    rendimentos: number;
    despesas: number;
    caixa: number;
  };
};

function num(db: Database, sql: string, params: (string | number | null)[] = []): number {
  const v = consultar(db, sql, params)[0]?.v;
  return typeof v === "number" ? v : Number(v) || 0;
}

function comprasCat(db: Database, categoria: string, ate: { sql: string; params: string[] }): number {
  return num(
    db,
    `SELECT COALESCE(SUM(valor_brl), 0) AS v FROM transacoes
     WHERE tipo_operacao = 'Compra' AND categoria = ? AND ${ate.sql}`,
    [categoria, ...ate.params],
  );
}

function vendasCat(db: Database, categoria: string, ate: { sql: string; params: string[] }): number {
  return num(
    db,
    `SELECT COALESCE(SUM(valor_brl), 0) AS v FROM transacoes
     WHERE tipo_operacao = 'Venda' AND categoria = ? AND ${ate.sql}`,
    [categoria, ...ate.params],
  );
}

function rfFaixa(db: Database, faixa: string, ate: { sql: string; params: string[] }): number {
  return num(
    db,
    `SELECT COALESCE(SUM(valor_aplicado), 0) AS v FROM renda_fixa
     WHERE liquidez = ? AND ${RF_ATIVA} AND ${ate.sql.replace(/\bdata\b/g, "data_aplicacao")}`,
    [faixa, ...ate.params],
  );
}

export async function resumirPatrimonio(periodo?: Periodo): Promise<ResumoPatrimonio> {
  await garantirImportacaoInicial();
  const db = await getDb();
  const recorte: Periodo = periodo ?? { modo: "tudo", ano: new Date().getFullYear(), mes: 1, data: "2000-01-01" };
  const fluxo = prefixoSql(recorte, "data");
  const ate = prefixoSqlAte(recorte, "data");
  const ateRf = prefixoSqlAte(recorte, "data_aplicacao");

  const patrimonioInvestido = num(
    db,
    `SELECT COALESCE(SUM(valor_brl), 0) AS v FROM transacoes
     WHERE tipo_operacao IN ${COMPRAS} AND ${ate.sql}`,
    ate.params,
  );
  const aportesNoAno = num(
    db,
    `SELECT COALESCE(SUM(valor_brl), 0) AS v FROM transacoes
     WHERE tipo_operacao IN ${COMPRAS} AND ${fluxo.sql}`,
    fluxo.params,
  );
  const resgatesNoAno = num(
    db,
    `SELECT COALESCE(SUM(valor_brl), 0) AS v FROM transacoes WHERE tipo_operacao = 'Venda' AND ${fluxo.sql}`,
    fluxo.params,
  );
  const gcNacional = num(
    db,
    `SELECT COALESCE(SUM(ganho_capital_brl), 0) AS v FROM transacoes WHERE ${fluxo.sql}`,
    fluxo.params,
  );
  const gcInternacional = num(
    db,
    `SELECT COALESCE(SUM(ganho_capital_orig), 0) AS v FROM transacoes WHERE ${fluxo.sql}`,
    fluxo.params,
  );
  const ganhoCambial = num(
    db,
    `SELECT COALESCE(SUM(ganho_cambial), 0) AS v FROM transacoes WHERE ${fluxo.sql}`,
    fluxo.params,
  );
  const caixaFisico = num(
    db,
    `SELECT COALESCE(SUM(CASE
        WHEN lower(replace(replace(replace(tipo,'ó','o'),'Ó','o'),'á','a')) IN ('saque','retirada','saida')
        THEN -ABS(valor) ELSE ABS(valor) END), 0) AS v
     FROM caixa_fisico
     WHERE (deleted_at IS NULL OR TRIM(CAST(deleted_at AS TEXT)) = '') AND ${ate.sql}`,
    ate.params,
  );
  const rfTotal = num(
    db,
    `SELECT COALESCE(SUM(valor_aplicado), 0) AS v FROM renda_fixa WHERE ${RF_ATIVA} AND ${ateRf.sql}`,
    ateRf.params,
  );

  const acoes = comprasCat(db, "Ações", ate);
  const fiis = comprasCat(db, "Fundos Imobiliários", ate);
  const etfBr = comprasCat(db, "ETF Brasil", ate);
  const bdr = comprasCat(db, "BDR", ate);
  const imoveis = num(
    db,
    `SELECT COALESCE(SUM(valor_brl), 0) AS v FROM transacoes WHERE categoria = 'Imóvel' AND ${ate.sql}`,
    ate.params,
  );
  const prev = comprasCat(db, "Previdência Privada", ate);
  const stocks = comprasCat(db, "Stocks", ate);
  const etfUsa = comprasCat(db, "ETF USA", ate);
  const reits = comprasCat(db, "Reits", ate);
  const bonds = comprasCat(db, "Bonds", ate);
  const treas = comprasCat(db, "Treasuries", ate);

  const patrimonioNacional = rfTotal + acoes + fiis + etfBr + bdr + imoveis + prev;
  const patrimonioInternacional = stocks + etfUsa + reits + bonds + treas;
  const totNI = patrimonioNacional + patrimonioInternacional;

  const mapaClasse: Record<string, number> = {
    "Renda Fixa": rfTotal,
    "Fundos Imobiliários": fiis,
    Ações: acoes,
    "ETF's Nacionais": etfBr,
    Imóveis: imoveis,
    "Previdência Privada": prev,
    Stocks: stocks,
    "ETF's USA": etfUsa,
    Reits: reits,
    "Bonds - Renda Fixa": bonds,
    "Treasuries - Renda Fixa": treas,
    BDR: bdr,
  };

  const posicoes = consultar(
    db,
    `SELECT categoria, liquidez, COALESCE(valor_atual, valor_investido, 0) AS v
     FROM posicoes
     WHERE COALESCE(ativa, 1) = 1 AND ABS(COALESCE(quantidade, 0)) > 0.0000001`,
  );
  const mapaLiq: Record<string, number> = {
    "D+0": 0,
    "D+1": 0,
    "D+2": 0,
    "D+30": 0,
    "D+360": 0,
    "No Vencimento": 0,
  };
  const bolsa = new Set(["Ações", "Fundos Imobiliários", "ETF Brasil", "BDR", "Stocks", "ETF USA", "Reits"]);
  if (posicoes.length) {
    for (const r of posicoes) {
      const categoria = String(r.categoria ?? "");
      if (categoria === "Imóvel" || categoria === "Imóveis") continue;
      const marcada = String(r.liquidez ?? "");
      const faixa = (FAIXAS_LIQUIDEZ as readonly string[]).includes(marcada)
        ? marcada
        : bolsa.has(categoria)
          ? "D+2"
          : "No Vencimento";
      mapaLiq[faixa] = (mapaLiq[faixa] ?? 0) + (Number(r.v) || 0);
    }
  } else {
    mapaLiq["D+0"] = rfFaixa(db, "D+0", ateRf);
    mapaLiq["D+1"] = rfFaixa(db, "D+1", ateRf);
    mapaLiq["D+2"] =
      acoes +
      fiis +
      etfBr +
      bdr -
      vendasCat(db, "Ações", ate) -
      vendasCat(db, "Fundos Imobiliários", ate) -
      vendasCat(db, "ETF Brasil", ate) -
      vendasCat(db, "BDR", ate) +
      rfFaixa(db, "D+2", ateRf);
    mapaLiq["D+30"] = rfFaixa(db, "D+30", ateRf);
    mapaLiq["D+360"] = rfFaixa(db, "D+360", ateRf);
    mapaLiq["No Vencimento"] = rfFaixa(db, "No Vencimento", ateRf);
  }

  const porCatMes = consultar(
    db,
    `SELECT categoria AS c,
            CAST(strftime('%m', data) AS INTEGER) AS mes,
            COALESCE(SUM(valor_bruto_brl), 0) AS total
     FROM rendimentos
     WHERE categoria IS NOT NULL
     GROUP BY categoria, mes`,
  );
  const lookup = new Map<string, number>();
  for (const r of porCatMes) {
    lookup.set(`${r.c}|${r.mes}`, Number(r.total) || 0);
  }

  const rendimentosMensais = REND_MENSAL.map(({ label, categoria }) => {
    const meses = Array.from({ length: 12 }, (_, i) => lookup.get(`${categoria}|${i + 1}`) ?? 0);
    return { categoria: label, meses, total: meses.reduce((a, b) => a + b, 0) };
  });

  return {
    patrimonioInvestido,
    gcNacional,
    aportesNoAno: patrimonioInvestido,
    resgatesNoAno,
    saldoLiquidoAportes: patrimonioInvestido - resgatesNoAno,
    gcInternacional,
    ganhoCambial,
    caixaFisico,
    patrimonioNacional,
    patrimonioInternacional,
    pctNacional: totNI ? patrimonioNacional / totNI : 0,
    pctInternacional: totNI ? patrimonioInternacional / totNI : 0,
    composicao: CLASSES_INVESTIMENTO.map((classe) => ({
      classe,
      valor: mapaClasse[classe] ?? 0,
    })),
    liquidez: FAIXAS_LIQUIDEZ.map((faixa) => ({ faixa, valor: mapaLiq[faixa] ?? 0 })),
    liquidezRapida: (mapaLiq["D+0"] ?? 0) + (mapaLiq["D+1"] ?? 0) + (mapaLiq["D+2"] ?? 0) + caixaFisico,
    rendimentosMensais,
    contagens: {
      transacoes: num(db, "SELECT COUNT(*) AS v FROM transacoes"),
      rendaFixa: num(db, "SELECT COUNT(*) AS v FROM renda_fixa"),
      rendimentos: num(db, "SELECT COUNT(*) AS v FROM rendimentos"),
      despesas: num(db, "SELECT COUNT(*) AS v FROM despesas WHERE deleted_at IS NULL OR TRIM(deleted_at) = ''"),
      caixa: num(db, "SELECT COUNT(*) AS v FROM caixa_fisico"),
    },
  };
}
