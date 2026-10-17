/**
 * Importação do .xlsm original para o SQLite local.
 * Seed da planilha 2.1 (embutido) ou arquivo enviado pelo usuário (SheetJS).
 */

import type { Database } from "sql.js";
import { consultar, executar, getDb, salvarDb } from "@/lib/financeiro/db";
import seedRaw from "@/lib/financeiro/seed.json?raw";

export type LoteImportacao = {
  origem?: string;
  transacoes: Record<string, unknown>[];
  renda_fixa: Record<string, unknown>[];
  rendimentos: Record<string, unknown>[];
  despesas: Record<string, unknown>[];
  caixa_fisico: Record<string, unknown>[];
  indicadores?: Record<string, number>;
};

export type ResultadoImportacao = {
  transacoes: number;
  rendaFixa: number;
  rendimentos: number;
  despesas: number;
  caixa: number;
};

const SEED = JSON.parse(seedRaw) as LoteImportacao;
export const SEED_VERSAO = "2.1-3";

const COLUNAS_TX = [
  "nota",
  "data",
  "tipo_operacao",
  "categoria",
  "ticker",
  "liquidez",
  "emissor",
  "instituicao",
  "instituicao_destino",
  "moeda",
  "origem",
  "quantidade",
  "proporcao_desdob",
  "fator_desdob",
  "valor_orig",
  "taxas_orig",
  "valor_liq_orig",
  "cotacao",
  "valor_brl",
  "classif_irpfm",
  "forma_recolhimento",
  "qtd_anterior",
  "custo_ant_brl",
  "qtd_acumulada",
  "custo_acum_brl",
  "preco_medio_brl",
  "ganho_capital_brl",
  "ganho_capital_orig",
  "ganho_cambial",
  "observacao",
] as const;

/** Parcelas do mesmo apartamento voltam a um único ativo. */
function tickerCanonico(ticker: unknown): unknown {
  const t = String(ticker ?? "").trim();
  if (/^Apto 901 - Ed Urbe \d+$/i.test(t)) return "Apto 901 - Ed Urbe";
  return ticker;
}

function val(v: unknown): string | number | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && Number.isNaN(v)) return null;
  if (typeof v === "string" || typeof v === "number") return v;
  return String(v);
}

function inserir(
  db: Database,
  tabela: string,
  colunas: readonly string[],
  linhas: Record<string, unknown>[],
): void {
  if (!linhas.length) return;
  const ph = colunas.map(() => "?").join(",");
  const sql = `INSERT INTO ${tabela} (${colunas.join(",")}) VALUES (${ph})`;
  for (const linha of linhas) {
    db.run(
      sql,
      colunas.map((c) => val(linha[c])),
    );
  }
}

export function reconstruirPosicoes(db: Database): void {
  executar(db, "DELETE FROM posicoes");
  db.run(`
    INSERT INTO posicoes (
      ticker, categoria, emissor, liquidez, quantidade, preco_medio,
      valor_investido, valor_atual, ativa
    )
    SELECT
      t.ticker,
      COALESCE(t.categoria, ''),
      t.emissor,
      t.liquidez,
      COALESCE(t.qtd_acumulada, 0),
      t.preco_medio_brl,
      t.custo_acum_brl,
      t.custo_acum_brl,
      CASE WHEN COALESCE(t.qtd_acumulada, 0) > 0 THEN 1 ELSE 0 END
    FROM transacoes t
    INNER JOIN (
      SELECT ticker, categoria, MAX(id) AS id
      FROM transacoes
      WHERE ticker IS NOT NULL
      GROUP BY ticker, categoria
    ) u ON u.id = t.id
  `);
  db.run(`
    INSERT OR IGNORE INTO posicoes (
      ticker, categoria, emissor, liquidez, quantidade, preco_medio,
      valor_investido, valor_atual, ativa
    )
    SELECT
      COALESCE(ticker, nome),
      'Renda Fixa',
      emissor,
      liquidez,
      1,
      valor_aplicado,
      valor_aplicado,
      valor_aplicado,
      1
    FROM renda_fixa
    WHERE COALESCE(status, 'Ativo') <> 'Resgatado'
      AND valor_aplicado IS NOT NULL
  `);
}

function aplicarLote(db: Database, lote: LoteImportacao): ResultadoImportacao {
  db.run("BEGIN");
  try {
    executar(db, "DELETE FROM transacoes");
    executar(db, "DELETE FROM renda_fixa");
    executar(db, "DELETE FROM rendimentos");
    executar(db, "DELETE FROM despesas");
    executar(db, "DELETE FROM caixa_fisico");
    executar(db, "DELETE FROM posicoes");

    const txs = lote.transacoes.filter((r) => r.tipo_operacao && r.ticker && r.data);
    const rfs = lote.renda_fixa.filter((r) => {
      const nome = String(r.nome ?? "").toUpperCase();
      if (nome.includes("TOTAIS") || nome.includes("EXTERIOR")) return false;
      return r.tipo_movimento === "Aplicação" && Number(r.valor_aplicado) > 0;
    });
    const rends = lote.rendimentos.filter((r) => r.data && r.tipo);
    const desps = lote.despesas.filter((r) => r.data_vencimento);
    const caixa = lote.caixa_fisico.filter(
      (r) => r.data && (r.tipo === "Depósito" || r.tipo === "Saque"),
    );

    inserir(db, "transacoes", COLUNAS_TX, txs);
    inserir(
      db,
      "renda_fixa",
      [
        "nome",
        "ticker",
        "tipo_movimento",
        "tipo_rf",
        "emissor",
        "instituicao",
        "indexador",
        "taxa",
        "data_aplicacao",
        "valor_aplicado",
        "prazo_dias",
        "data_vencimento",
        "liquidez",
        "amortizacao",
        "isencao_ir",
        "irpfm",
        "status",
        "data_resgate",
        "tipo_resgate",
        "valor_resgatado",
        "ir_pago",
        "valor_liq_recebido",
        "lancado_rendimentos",
      ],
      rfs,
    );
    inserir(
      db,
      "rendimentos",
      [
        "data",
        "tipo",
        "origem",
        "categoria",
        "tributacao",
        "forma_recolhimento",
        "classificacao_irpfm",
        "instituicao",
        "ticker",
        "descricao",
        "moeda",
        "valor_bruto_orig",
        "cotacao",
        "valor_bruto_brl",
        "ir_retido",
        "valor_liquido",
        "valor_computavel_irpfm",
        "observacao",
      ],
      rends,
    );
    inserir(
      db,
      "despesas",
      [
        "data_vencimento",
        "categoria",
        "descricao",
        "instituicao",
        "valor",
        "data_pagamento",
        "situacao",
        "observacao",
      ],
      desps,
    );
    inserir(db, "caixa_fisico", ["data", "tipo", "valor", "descricao", "observacao"], caixa);

    if (lote.indicadores) {
      const agora = new Date().toISOString();
      for (const [chave, valor] of Object.entries(lote.indicadores)) {
        db.run("INSERT OR REPLACE INTO indicadores (chave, valor, atualizado_em) VALUES (?, ?, ?)", [
          chave,
          valor,
          agora,
        ]);
      }
    }

    reconstruirPosicoes(db);
    db.run("INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('importado_em', ?)", [
      new Date().toISOString(),
    ]);
    db.run("COMMIT");
    return {
      transacoes: txs.length,
      rendaFixa: rfs.length,
      rendimentos: rends.length,
      despesas: desps.length,
      caixa: caixa.length,
    };
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }
}

/** Importa o seed da planilha 2.1-2 (primeira carga ou nova versão). */
export async function importarSeed(): Promise<ResultadoImportacao> {
  const db = await getDb();
  const r = aplicarLote(db, SEED);
  executar(db, `INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('seed_versao', ?)`, [
    SEED_VERSAO,
  ]);
  await salvarDb();
  return r;
}

/** Recarrega o seed quando o banco está vazio ou ainda está numa planilha anterior. */
export async function garantirImportacaoInicial(): Promise<boolean> {
  const db = await getDb();
  const n = Number(consultar(db, "SELECT COUNT(*) AS v FROM transacoes")[0]?.v ?? 0);
  const ver = String(
    consultar(db, "SELECT valor AS v FROM configuracoes WHERE chave = 'seed_versao'")[0]?.v ?? "",
  );
  if (n > 0 && ver === SEED_VERSAO) return false;
  await importarSeed();
  return true;
}

function cab(rec: Record<string, unknown>, ...nomes: string[]): unknown {
  for (const n of nomes) {
    if (rec[n] != null && rec[n] !== "") return rec[n];
  }
  return null;
}

function isoData(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(v));
    return epoch.toISOString().slice(0, 10);
  }
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return v.slice(0, 10);
  }
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

let xlsxMod: typeof import("xlsx") | null = null;

function linhasAba(
  wb: import("xlsx").WorkBook,
  nome: string,
  marca: string,
): Record<string, unknown>[] {
  const xlsx = xlsxMod;
  if (!xlsx) throw new Error("xlsx não carregado");
  const ws = wb.Sheets[nome];
  if (!ws) return [];
  const rows = xlsx.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  }) as unknown[][];
  const headerIdx = rows.findIndex(
    (row, i) => i < 15 && (row ?? []).some((c) => String(c ?? "").trim() === marca),
  );
  if (headerIdx < 0) return [];
  const headers = (rows[headerIdx] ?? []).map((h) => String(h ?? "").trim());
  const out: Record<string, unknown>[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rec: Record<string, unknown> = {};
    let vazio = true;
    headers.forEach((h, j) => {
      rec[h] = row[j] ?? null;
      if (row[j] != null && row[j] !== "") vazio = false;
    });
    if (!vazio) out.push(rec);
  }
  return out;
}

/** Lê um .xlsx/.xlsm enviado pelo usuário. */
export async function importarPlanilha(arquivo: File): Promise<ResultadoImportacao> {
  xlsxMod = await import("xlsx");
  const buf = await arquivo.arrayBuffer();
  const wb = xlsxMod.read(buf, { type: "array", cellDates: true });

  const transacoes = linhasAba(wb, "TRANSAÇÕES", "Ativo / Ticker").map((r) => ({
    nota: cab(r, "Nota"),
    data: isoData(cab(r, "Data")),
    tipo_operacao: cab(r, "Tipo de Operação *", "Tipo de Operação"),
    categoria: cab(r, "Categoria Investimento"),
    ticker: tickerCanonico(cab(r, "Ativo / Ticker")),
    liquidez: cab(r, "Liquidez"),
    emissor: cab(r, "Emissor"),
    instituicao: cab(r, "Instituição (Custódia)"),
    instituicao_destino: cab(r, "Instituição Destino"),
    moeda: cab(r, "Moeda") ?? "BRL",
    origem: cab(r, "Origem"),
    quantidade: num(cab(r, "Quantidade/Fator")),
    proporcao_desdob: num(cab(r, "Proporção Desdob.")),
    fator_desdob: num(cab(r, "Fator Desdob.")),
    valor_orig: num(cab(r, "Valor Total (moeda orig.)")),
    taxas_orig: num(cab(r, "Taxas/Custos (orig.)")) ?? 0,
    valor_liq_orig: num(cab(r, "Valor Líq. (moeda orig.)")),
    cotacao: num(cab(r, "Cotação do Dia")),
    valor_brl: num(cab(r, "Valor Total (R$)")),
    classif_irpfm: cab(r, "Classif. IRPFM (Ganho Cap.)"),
    forma_recolhimento: cab(r, "Forma Recolh. (Ganho Cap.)"),
    qtd_anterior: num(cab(r, "Qtd Anterior")),
    custo_ant_brl: num(cab(r, "Custo Ant. (R$)")),
    qtd_acumulada: num(cab(r, "Qtd Acumulada")),
    custo_acum_brl: num(cab(r, "Custo Acum. (R$)")),
    preco_medio_brl: num(cab(r, "Preço Médio (R$) / Custo Total Imóvel")),
    ganho_capital_brl: num(cab(r, "Ganho Capital (R$)")),
    ganho_capital_orig: num(cab(r, "Ganho Capital (Orig.)")),
    ganho_cambial: num(cab(r, "Ganho Cambial (R$)")),
    observacao: cab(r, "Observação"),
  }));

  const renda_fixa = linhasAba(wb, "RENDA FIXA", "Nome do Ativo").map((r) => ({
    nome: cab(r, "Nome do Ativo"),
    ticker: cab(r, "Ticker"),
    tipo_movimento: cab(r, "Tipo de Movimento"),
    tipo_rf: cab(r, "Tipo RF"),
    emissor: cab(r, "Emissor"),
    instituicao: cab(r, "Instituição"),
    indexador: cab(r, "Indexador"),
    taxa: num(cab(r, "Taxa (%)")),
    data_aplicacao: isoData(cab(r, "Data Aplicação")),
    valor_aplicado: num(cab(r, "Valor Aplicado (R$)")),
    prazo_dias: num(cab(r, "Prazo (dias)")),
    data_vencimento: isoData(cab(r, "Data Vencimento")),
    liquidez: cab(r, "Liquidez"),
    amortizacao: cab(r, "Amortização"),
    isencao_ir: String(cab(r, "Isenção IR") ?? "") === "Sim" ? 1 : 0,
    irpfm: cab(r, "IRPFM"),
    status: cab(r, "Status") ?? "Ativo",
    data_resgate: isoData(cab(r, "Data Resgate")),
    tipo_resgate: cab(r, "Tipo Resgate"),
    valor_resgatado: num(cab(r, "Vlr Resgatado (R$)")),
    ir_pago: num(cab(r, "IR Pago (R$)")),
    valor_liq_recebido: num(cab(r, "Vlr Líq. Recebido (R$)")),
    lancado_rendimentos: 0,
  }));

  const rendimentos = linhasAba(wb, "RENDIMENTOS", "Tipo de Rendimento").map((r) => ({
    data: isoData(cab(r, "Data")),
    tipo: cab(r, "Tipo de Rendimento"),
    origem: cab(r, "Origem"),
    categoria: cab(r, "Categoria"),
    tributacao: cab(r, "Tributação"),
    forma_recolhimento: cab(r, "Forma de Recolhimento"),
    classificacao_irpfm: cab(r, "Classificação IRPFM"),
    instituicao: cab(r, "Instituição / Corretora"),
    ticker: cab(r, "Ativo / Ticker"),
    descricao: cab(r, "Descrição"),
    moeda: cab(r, "Moeda") ?? "BRL",
    valor_bruto_orig: num(cab(r, "Valor Bruto (moeda orig.)")),
    cotacao: num(cab(r, "Cotação do Dia")),
    valor_bruto_brl: num(cab(r, "Valor Bruto (R$)")),
    ir_retido: num(cab(r, "IR Retido / Antecipação (R$)")) ?? 0,
    valor_liquido: num(cab(r, "Valor Líquido (R$)")),
    valor_computavel_irpfm: num(cab(r, "Valor Computável IRPFM (R$)")),
    observacao: cab(r, "Observação"),
  }));

  const despesas = linhasAba(wb, "CONTAS A PAGAR", "Data Vencimento").map((r) => ({
    data_vencimento: isoData(cab(r, "Data Vencimento")),
    categoria: cab(r, "Categoria"),
    descricao: cab(r, "Descrição"),
    instituicao: cab(r, "Instituição / Conta"),
    valor: num(cab(r, "Valor (R$)")) ?? 0,
    data_pagamento: isoData(cab(r, "Data Pagamento")),
    situacao: cab(r, "Situação"),
    observacao: cab(r, "Observação"),
  }));

  const caixa_fisico = linhasAba(wb, "CAIXA FÍSICO", "Tipo de Movimentação").map((r) => {
    let tipo = String(cab(r, "Tipo de Movimentação") ?? "");
    if (tipo === "Deposito") tipo = "Depósito";
    return {
      data: isoData(cab(r, "Data")),
      tipo,
      valor: num(cab(r, "Valor (R$)")) ?? 0,
      descricao: cab(r, "Descrição"),
      observacao: cab(r, "Observação"),
    };
  });

  const db = await getDb();
  const r = aplicarLote(db, {
    origem: arquivo.name,
    transacoes,
    renda_fixa,
    rendimentos,
    despesas,
    caixa_fisico,
  });
  await salvarDb();
  return r;
}
