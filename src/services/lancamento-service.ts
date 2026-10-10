/**
 * Lançamentos — transação, despesa, rendimento, nota de corretagem, extrato e imóvel.
 * Números no padrão BR (1.234,56).
 */

import { consultar, executar, getDb, salvarDb } from "@/lib/financeiro/db";
import { reconstruirPosicoes } from "@/utils/import-excel";
import { parseNumeroBR } from "@/utils/numeros-br";

function num(v: unknown): number {
  return parseNumeroBR(v);
}

export type TxInput = {
  data: string;
  tipo: string;
  categoria: string;
  ticker: string;
  quantidade: number | string;
  valorBrl: number | string;
  nota?: string;
  origem?: string;
  moeda?: string;
  taxas?: number | string;
  instituicao?: string;
  liquidez?: string;
  valorUsd?: number | string;
  cotacaoEfetiva?: number | string;
  cotacaoPtax?: number | string;
  iofBrl?: number | string;
  spreadBrl?: number | string;
  _adiar?: boolean;
};

export async function lancarTransacao(input: TxInput): Promise<void> {
  const db = await getDb();
  const ticker = input.ticker.trim().toUpperCase();
  const qtd = Math.abs(parseNumeroBR(input.quantidade));
  const valor = Math.abs(parseNumeroBR(input.valorBrl));
  const taxas = Math.abs(parseNumeroBR(input.taxas ?? 0));
  if (!input.data || !ticker || !qtd || !valor) {
    throw new Error("Informe data, ticker, quantidade e valor (aceita 1.234,56).");
  }
  const last = consultar(
    db,
    `SELECT qtd_acumulada AS qtd, custo_acum_brl AS custo, custo_acum_usd AS custo_usd
     FROM transacoes
     WHERE UPPER(ticker) = ? AND categoria = ? ORDER BY id DESC LIMIT 1`,
    [ticker, input.categoria],
  )[0];
  const qtdAnt = num(last?.qtd);
  const custoAnt = num(last?.custo);
  const custoUsdAnt = num(last?.custo_usd);
  const compra =
    input.tipo === "Compra" || input.tipo === "Parcela Imóvel" || input.tipo === "ITBI / Cartório";
  const venda = input.tipo === "Venda";
  const valorCusto = compra ? valor + taxas : valor;
  const usd = Math.abs(parseNumeroBR(input.valorUsd ?? 0));
  const iof = Math.abs(parseNumeroBR(input.iofBrl ?? 0));
  const spread = Math.abs(parseNumeroBR(input.spreadBrl ?? 0));
  const fx = parseNumeroBR(input.cotacaoEfetiva ?? 0);
  const ptax = parseNumeroBR(input.cotacaoPtax ?? 0);
  const qtdNova = compra ? qtdAnt + qtd : venda ? qtdAnt - qtd : qtdAnt;
  const custoNovo = compra
    ? custoAnt + valorCusto
    : venda && qtdAnt
      ? custoAnt * (qtdNova / qtdAnt)
      : custoAnt;
  const custoUsdNovo = compra
    ? custoUsdAnt + usd
    : venda && qtdAnt
      ? custoUsdAnt * (qtdNova / qtdAnt)
      : custoUsdAnt;
  const pm = qtdNova > 0 ? custoNovo / qtdNova : null;
  const pmUsd = qtdNova > 0 && custoUsdNovo > 0 ? custoUsdNovo / qtdNova : null;
  const gc = venda && qtdAnt ? valor - taxas - (custoAnt / qtdAnt) * qtd : null;
  const gcOrig = venda && qtdAnt && usd > 0 ? usd - (custoUsdAnt / qtdAnt) * qtd : null;
  const gcCambial =
    gc != null && gcOrig != null && fx > 0 ? gc - gcOrig * fx : null;
  executar(
    db,
    `INSERT INTO transacoes (
        data, tipo_operacao, categoria, ticker, quantidade, valor_brl, moeda, origem, nota,
        instituicao, liquidez, taxas_orig,
        qtd_anterior, custo_ant_brl, qtd_acumulada, custo_acum_brl, preco_medio_brl, ganho_capital_brl,
        ganho_capital_orig, ganho_cambial,
        valor_usd, cotacao_efetiva, cotacao_ptax, iof_brl, spread_brl,
        custo_acum_usd, preco_medio_usd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.data,
      input.tipo,
      input.categoria,
      ticker,
      qtd,
      compra ? valorCusto : valor,
      input.moeda ?? (usd > 0 ? "USD" : "BRL"),
      input.origem ?? (usd > 0 ? "Internacional" : "Nacional"),
      input.nota?.trim() || null,
      input.instituicao?.trim() || null,
      input.liquidez?.trim() || null,
      taxas,
      qtdAnt,
      custoAnt,
      qtdNova,
      custoNovo,
      pm,
      gc,
      gcOrig,
      gcCambial,
      usd || null,
      fx || null,
      ptax || null,
      iof || null,
      spread || null,
      custoUsdNovo || null,
      pmUsd,
    ],
  );
  if (!input._adiar) {
    reconstruirPosicoes(db);
    await salvarDb();
  }
}

export type OrdemNota = {
  tipo: string;
  categoria: string;
  ticker: string;
  liquidez?: string;
  quantidade: number | string;
  valorTotal: number | string;
};

export type CabecalhoNota = {
  numeroNota: string;
  data: string;
  instituicao?: string;
  moeda?: string;
  taxaLiquidacao?: number | string;
  totalBovespa?: number | string;
  totalCorretagem?: number | string;
  taxasTotais?: number | string;
};

/** Nota de corretagem: N ordens + taxas rateadas, um único rebuild. */
export async function lancarNotaCorretagem(cab: CabecalhoNota, ordens: OrdemNota[]): Promise<number> {
  if (!cab.data) throw new Error("Informe a data da nota.");
  let taxas = parseNumeroBR(cab.taxasTotais);
  if (taxas <= 0) {
    taxas =
      parseNumeroBR(cab.taxaLiquidacao) +
      parseNumeroBR(cab.totalBovespa) +
      parseNumeroBR(cab.totalCorretagem);
  }
  const lista = ordens
    .map((o) => ({
      tipo: o.tipo || "Compra",
      categoria: o.categoria || "Ações",
      ticker: String(o.ticker ?? "").trim().toUpperCase(),
      qtd: parseNumeroBR(o.quantidade),
      valor: parseNumeroBR(o.valorTotal),
      liquidez: o.liquidez,
    }))
    .filter((o) => o.ticker && o.qtd > 0 && o.valor > 0);
  if (!lista.length) throw new Error("Informe ao menos uma ordem válida (ticker, qtd e valor).");
  const soma = lista.reduce((a, o) => a + o.valor, 0);
  for (const o of lista) {
    const taxaProp = taxas * (o.valor / soma);
    await lancarTransacao({
      data: cab.data,
      tipo: o.tipo,
      categoria: o.categoria,
      ticker: o.ticker,
      quantidade: o.qtd,
      valorBrl: o.valor,
      taxas: taxaProp,
      nota: cab.numeroNota || undefined,
      moeda: cab.moeda,
      instituicao: cab.instituicao,
      liquidez: o.liquidez,
      _adiar: true,
    });
  }
  const db = await getDb();
  reconstruirPosicoes(db);
  await salvarDb();
  return lista.length;
}

export type CabecalhoNotaIntl = {
  numeroNota: string;
  data: string;
  instituicao?: string;
  valorInvestidoBrl: number | string;
  iofBrl?: number | string;
  spreadBrl?: number | string;
  cotacaoPtax?: number | string;
};

export type OrdemNotaIntl = {
  tipo: string;
  categoria: string;
  ticker: string;
  liquidez?: string;
  quantidade: number | string;
  valorUsd: number | string;
};

/** Nota internacional: USD nas ordens; R$, IOF e spread no cabeçalho → cotação efetiva. */
export async function lancarNotaInternacional(
  cab: CabecalhoNotaIntl,
  ordens: OrdemNotaIntl[],
): Promise<{ n: number; cotacaoEfetiva: number; custoTotalBrl: number }> {
  if (!cab.data) throw new Error("Informe a data da nota.");
  const brl = parseNumeroBR(cab.valorInvestidoBrl);
  const iof = parseNumeroBR(cab.iofBrl);
  const spread = parseNumeroBR(cab.spreadBrl);
  const ptax = parseNumeroBR(cab.cotacaoPtax);
  const lista = ordens
    .map((o) => ({
      tipo: o.tipo || "Compra",
      categoria: o.categoria || "Stocks",
      ticker: String(o.ticker ?? "").trim().toUpperCase(),
      qtd: parseNumeroBR(o.quantidade),
      usd: parseNumeroBR(o.valorUsd),
      liquidez: o.liquidez || "D+2",
    }))
    .filter((o) => o.ticker && o.qtd > 0 && o.usd > 0);
  if (!lista.length) throw new Error("Informe ao menos uma ordem (ticker, quantidade e valor em USD).");
  if (brl <= 0) throw new Error("Informe o valor investido em R$ da conversão.");
  const somaUsd = lista.reduce((a, o) => a + o.usd, 0);
  if (somaUsd <= 0) throw new Error("A soma em USD das ordens precisa ser maior que zero.");
  const cotacaoEfetiva = brl / somaUsd;
  const custoTotalBrl = brl + iof + spread;
  for (const o of lista) {
    const peso = o.usd / somaUsd;
    await lancarTransacao({
      data: cab.data,
      tipo: o.tipo,
      categoria: o.categoria,
      ticker: o.ticker,
      quantidade: o.qtd,
      valorBrl: custoTotalBrl * peso,
      valorUsd: o.usd,
      taxas: 0,
      nota: cab.numeroNota || undefined,
      moeda: "USD",
      origem: "Internacional",
      instituicao: cab.instituicao,
      liquidez: o.liquidez,
      cotacaoEfetiva,
      cotacaoPtax: ptax,
      iofBrl: iof * peso,
      spreadBrl: spread * peso,
      _adiar: true,
    });
  }
  const db = await getDb();
  reconstruirPosicoes(db);
  await salvarDb();
  return { n: lista.length, cotacaoEfetiva, custoTotalBrl };
}

export async function lancarExtratoInternacional(
  meta: { instituicao?: string; cotacao?: number | string },
  linhas: {
    data: string;
    descricao?: string;
    valorUsd: number | string;
    tipoRendimento: string;
    ticker?: string;
    withholding?: number | string;
  }[],
): Promise<number> {
  const fxCab = parseNumeroBR(meta.cotacao);
  const lista = linhas
    .map((l) => ({
      data: String(l.data || "").trim(),
      tipo: String(l.tipoRendimento || "").trim(),
      usd: parseNumeroBR(l.valorUsd),
      wh: parseNumeroBR(l.withholding),
      ticker: String(l.ticker || "").trim().toUpperCase() || null,
      descricao: String(l.descricao || "").trim() || null,
    }))
    .filter((l) => l.data && l.usd > 0 && l.tipo);
  if (!lista.length) throw new Error("Preencha ao menos uma linha com data, valor USD e tipo.");
  const db = await getDb();
  const { dolarNaData } = await import("@/services/cambio-service");
  for (const l of lista) {
    let fx = fxCab;
    if (fx <= 0) {
      const p = await dolarNaData(l.data);
      fx = p?.venda ?? 0;
    }
    if (fx <= 0) throw new Error(`Sem cotação USD para ${l.data}. Informe a cotação no cabeçalho.`);
    const brutoBrl = l.usd * fx;
    const ir = l.wh * fx;
    const liquido = Math.max(0, brutoBrl - ir);
    executar(
      db,
      `INSERT INTO rendimentos (
          data, tipo, origem, moeda, valor_bruto_orig, valor_bruto_brl, valor_liquido,
          valor_computavel_irpfm, ir_retido, ticker, instituicao, descricao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        l.data,
        l.tipo,
        "Internacional",
        "USD",
        l.usd,
        brutoBrl,
        liquido,
        liquido,
        ir,
        l.ticker,
        meta.instituicao?.trim() || null,
        l.descricao,
      ],
    );
  }
  await salvarDb();
  return lista.length;
}

export async function lancarAplicacaoRfIntl(input: {
  data: string;
  nome: string;
  ticker?: string;
  tipoRf: string;
  emissor?: string;
  instituicao?: string;
  indexador?: string;
  taxa?: number | string;
  valorUsd: number | string;
  valorInvestidoBrl: number | string;
  iofBrl?: number | string;
  spreadBrl?: number | string;
  vencimento?: string;
  liquidez?: string;
  amortizacao?: string;
}): Promise<void> {
  const usd = parseNumeroBR(input.valorUsd);
  const brl = parseNumeroBR(input.valorInvestidoBrl);
  if (!input.data || !input.nome.trim() || usd <= 0 || brl <= 0) {
    throw new Error("Informe data, nome, valor USD e valor em R$.");
  }
  const iof = parseNumeroBR(input.iofBrl);
  const spread = parseNumeroBR(input.spreadBrl);
  const custo = brl + iof + spread;
  const fx = brl / usd;
  const taxa = parseNumeroBR(input.taxa);
  const db = await getDb();
  executar(
    db,
    `INSERT INTO renda_fixa (
        nome, ticker, tipo_movimento, tipo_rf, emissor, instituicao, indexador, taxa,
        data_aplicacao, valor_aplicado, data_vencimento, liquidez, amortizacao, status,
        moeda, origem, valor_usd, cotacao_efetiva, iof_brl, spread_brl
      ) VALUES (?, ?, 'Aplicação', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Ativo', 'USD', 'Internacional', ?, ?, ?, ?)`,
    [
      input.nome.trim(),
      input.ticker?.trim().toUpperCase() || null,
      input.tipoRf,
      input.emissor?.trim() || null,
      input.instituicao?.trim() || null,
      input.indexador?.trim() || null,
      taxa || null,
      input.data,
      custo,
      input.vencimento || null,
      input.liquidez || "No Vencimento",
      input.amortizacao || "No Vencimento",
      usd,
      fx,
      iof,
      spread,
    ],
  );
  await salvarDb();
}

export async function lancarExtratoBancario(
  meta: { instituicao?: string; origem?: string; moeda?: string },
  linhas: {
    data: string;
    descricao?: string;
    valorBruto: number | string;
    tipoRendimento: string;
    ticker?: string;
    irRetido?: number | string;
  }[],
): Promise<number> {
  const lista = linhas
    .map((l) => ({
      data: String(l.data || "").trim(),
      tipo: String(l.tipoRendimento || "").trim(),
      valor: parseNumeroBR(l.valorBruto),
      ticker: String(l.ticker || "").trim().toUpperCase() || null,
      ir: parseNumeroBR(l.irRetido),
      descricao: String(l.descricao || "").trim() || null,
    }))
    .filter((l) => l.data && l.valor > 0 && l.tipo);
  if (!lista.length) throw new Error("Preencha ao menos uma linha com data, valor e tipo.");
  const db = await getDb();
  const origem = meta.origem || "Nacional";
  const moeda = meta.moeda || "BRL";
  for (const l of lista) {
    const liquido = Math.max(0, l.valor - l.ir);
    executar(
      db,
      `INSERT INTO rendimentos (
          data, tipo, origem, moeda, valor_bruto_orig, valor_bruto_brl, valor_liquido,
          valor_computavel_irpfm, ir_retido, ticker, instituicao, descricao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        l.data,
        l.tipo,
        origem,
        moeda,
        l.valor,
        l.valor,
        liquido,
        liquido,
        l.ir,
        l.ticker,
        meta.instituicao?.trim() || null,
        l.descricao ?? null,
      ],
    );
  }
  await salvarDb();
  return lista.length;
}

export async function lancarImovel(input: {
  data: string;
  ticker: string;
  quantidade: number | string;
  valor: number | string;
  itbi?: number | string;
  cartorio?: number | string;
  observacao?: string;
  instituicao?: string;
}): Promise<void> {
  await lancarTransacao({
    data: input.data,
    tipo: "Parcela Imóvel",
    categoria: "Imóveis",
    ticker: input.ticker,
    quantidade: input.quantidade,
    valorBrl: input.valor,
    nota: input.observacao,
    instituicao: input.instituicao,
    _adiar: true,
  });
  const itbi = parseNumeroBR(input.itbi);
  const cart = parseNumeroBR(input.cartorio);
  if (itbi > 0) {
    await lancarTransacao({
      data: input.data,
      tipo: "ITBI / Cartório",
      categoria: "Imóveis",
      ticker: input.ticker,
      quantidade: 1,
      valorBrl: itbi,
      nota: "ITBI",
      instituicao: input.instituicao,
      _adiar: true,
    });
  }
  if (cart > 0) {
    await lancarTransacao({
      data: input.data,
      tipo: "ITBI / Cartório",
      categoria: "Imóveis",
      ticker: input.ticker,
      quantidade: 1,
      valorBrl: cart,
      nota: "Cartório",
      instituicao: input.instituicao,
      _adiar: true,
    });
  }
  const db = await getDb();
  reconstruirPosicoes(db);
  await salvarDb();
}

export async function lancarDespesa(input: {
  vencimento: string;
  categoria: string;
  descricao: string;
  valor: number | string;
  pagamento?: string;
  instituicao?: string;
}): Promise<void> {
  const db = await getDb();
  const valor = Math.abs(parseNumeroBR(input.valor));
  if (!input.vencimento || !valor) throw new Error("Informe vencimento e valor.");
  const pagto = input.pagamento?.trim() || null;
  executar(
    db,
    `INSERT INTO despesas (data_vencimento, categoria, descricao, valor, data_pagamento, situacao, instituicao)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.vencimento,
      input.categoria || null,
      input.descricao || null,
      valor,
      pagto,
      pagto ? "Pago" : "Aberto",
      input.instituicao?.trim() || null,
    ],
  );
  await salvarDb();
}

export async function lancarRendimento(input: {
  data: string;
  tipo: string;
  ticker?: string;
  valor: number | string;
  origem?: string;
  instituicao?: string;
}): Promise<void> {
  const db = await getDb();
  const valor = Math.abs(parseNumeroBR(input.valor));
  if (!input.data || !input.tipo || !valor) throw new Error("Informe data, tipo e valor.");
  executar(
    db,
    `INSERT INTO rendimentos (
        data, tipo, origem, moeda, valor_bruto_orig, valor_bruto_brl, valor_liquido,
        valor_computavel_irpfm, ir_retido, ticker, instituicao
      ) VALUES (?, ?, ?, 'BRL', ?, ?, ?, ?, 0, ?, ?)`,
    [
      input.data,
      input.tipo,
      input.origem || "Nacional",
      valor,
      valor,
      valor,
      valor,
      input.ticker?.trim().toUpperCase() || null,
      input.instituicao?.trim() || null,
    ],
  );
  await salvarDb();
}

export type LinhaTransacao = {
  id: number;
  data: string;
  tipo: string;
  categoria: string | null;
  ticker: string | null;
  quantidade: number | null;
  valorBrl: number | null;
  nota: string | null;
};

export type LinhaDespesa = {
  id: number;
  vencimento: string;
  categoria: string | null;
  descricao: string | null;
  valor: number;
  pagamento: string | null;
  situacao: string | null;
};

export type LinhaRendimento = {
  id: number;
  data: string;
  tipo: string | null;
  ticker: string | null;
  valor: number;
};

export async function listarTransacoes(limite = 400): Promise<LinhaTransacao[]> {
  const db = await getDb();
  return consultar(
    db,
    `SELECT id, data, tipo_operacao AS tipo, categoria, ticker, quantidade, valor_brl AS valorBrl, nota
     FROM transacoes ORDER BY data DESC, id DESC LIMIT ?`,
    [limite],
  ).map((r) => ({
    id: num(r.id),
    data: String(r.data ?? ""),
    tipo: String(r.tipo ?? ""),
    categoria: r.categoria == null ? null : String(r.categoria),
    ticker: r.ticker == null ? null : String(r.ticker),
    quantidade: r.quantidade == null ? null : num(r.quantidade),
    valorBrl: r.valorBrl == null ? null : num(r.valorBrl),
    nota: r.nota == null ? null : String(r.nota),
  }));
}

export async function listarDespesas(limite = 400): Promise<LinhaDespesa[]> {
  const db = await getDb();
  return consultar(
    db,
    `SELECT id, data_vencimento AS vencimento, categoria, descricao, valor, data_pagamento AS pagamento, situacao
     FROM despesas ORDER BY data_vencimento DESC, id DESC LIMIT ?`,
    [limite],
  ).map((r) => ({
    id: num(r.id),
    vencimento: String(r.vencimento ?? ""),
    categoria: r.categoria == null ? null : String(r.categoria),
    descricao: r.descricao == null ? null : String(r.descricao),
    valor: num(r.valor),
    pagamento: r.pagamento == null ? null : String(r.pagamento),
    situacao: r.situacao == null ? null : String(r.situacao),
  }));
}

export async function listarRendimentos(limite = 400): Promise<LinhaRendimento[]> {
  const db = await getDb();
  return consultar(
    db,
    `SELECT id, data, tipo, ticker, COALESCE(valor_bruto_brl, valor_liquido, 0) AS valor
     FROM rendimentos ORDER BY data DESC, id DESC LIMIT ?`,
    [limite],
  ).map((r) => ({
    id: num(r.id),
    data: String(r.data ?? ""),
    tipo: r.tipo == null ? null : String(r.tipo),
    ticker: r.ticker == null ? null : String(r.ticker),
    valor: num(r.valor),
  }));
}

export async function atualizarTransacao(
  id: number,
  input: {
    data: string;
    tipo: string;
    categoria: string;
    ticker: string;
    quantidade: number | string;
    valorBrl: number | string;
  },
): Promise<void> {
  const db = await getDb();
  executar(
    db,
    `UPDATE transacoes SET data=?, tipo_operacao=?, categoria=?, ticker=?, quantidade=?, valor_brl=? WHERE id=?`,
    [
      input.data,
      input.tipo,
      input.categoria,
      input.ticker.trim().toUpperCase(),
      parseNumeroBR(input.quantidade),
      parseNumeroBR(input.valorBrl),
      id,
    ],
  );
  reconstruirPosicoes(db);
  await salvarDb();
}

export async function excluirTransacoes(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  executar(db, `DELETE FROM transacoes WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
  reconstruirPosicoes(db);
  await salvarDb();
}

export async function excluirTodasTransacoes(): Promise<void> {
  const db = await getDb();
  executar(db, `DELETE FROM transacoes`);
  reconstruirPosicoes(db);
  await salvarDb();
}

export async function atualizarDespesa(
  id: number,
  input: {
    vencimento: string;
    categoria: string;
    descricao: string;
    valor: number | string;
    pagamento?: string;
  },
): Promise<void> {
  const db = await getDb();
  const pagto = input.pagamento?.trim() || null;
  executar(
    db,
    `UPDATE despesas SET data_vencimento=?, categoria=?, descricao=?, valor=?, data_pagamento=?, situacao=? WHERE id=?`,
    [
      input.vencimento,
      input.categoria,
      input.descricao,
      parseNumeroBR(input.valor),
      pagto,
      pagto ? "Pago" : "Aberto",
      id,
    ],
  );
  await salvarDb();
}

export async function excluirDespesas(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  executar(db, `DELETE FROM despesas WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
  await salvarDb();
}

export async function excluirTodasDespesas(): Promise<void> {
  const db = await getDb();
  executar(db, `DELETE FROM despesas`);
  await salvarDb();
}

export async function atualizarRendimento(
  id: number,
  input: { data: string; tipo: string; ticker: string; valor: number | string },
): Promise<void> {
  const db = await getDb();
  const valor = parseNumeroBR(input.valor);
  executar(
    db,
    `UPDATE rendimentos SET data=?, tipo=?, ticker=?, valor_bruto_brl=?, valor_liquido=?, valor_bruto_orig=? WHERE id=?`,
    [input.data, input.tipo, input.ticker.trim().toUpperCase() || null, valor, valor, valor, id],
  );
  await salvarDb();
}

export async function excluirRendimentos(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  executar(db, `DELETE FROM rendimentos WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
  await salvarDb();
}

export async function excluirTodosRendimentos(): Promise<void> {
  const db = await getDb();
  executar(db, `DELETE FROM rendimentos`);
  await salvarDb();
}

export async function lancarTransacoesLote(texto: string): Promise<number> {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let n = 0;
  for (const ln of linhas) {
    if (ln.toLowerCase().startsWith("data")) continue;
    const p = ln.split(";").map((x) => x.trim());
    if (p.length < 6) throw new Error(`Linha inválida: ${ln}`);
    await lancarTransacao({
      data: p[0],
      tipo: p[1],
      categoria: p[2],
      ticker: p[3],
      quantidade: p[4],
      valorBrl: p[5],
      nota: p[6] || "",
      _adiar: true,
    });
    n += 1;
  }
  if (n) {
    const db = await getDb();
    reconstruirPosicoes(db);
    await salvarDb();
  }
  return n;
}

export async function lancarDespesasLote(texto: string): Promise<number> {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let n = 0;
  for (const ln of linhas) {
    if (ln.toLowerCase().startsWith("venc")) continue;
    const p = ln.split(";").map((x) => x.trim());
    if (p.length < 4) continue;
    await lancarDespesa({
      vencimento: p[0],
      categoria: p[1],
      descricao: p[2],
      valor: p[3],
      pagamento: p[4] || "",
    });
    n += 1;
  }
  return n;
}

export async function lancarRendimentosLote(texto: string): Promise<number> {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let n = 0;
  for (const ln of linhas) {
    if (ln.toLowerCase().startsWith("data")) continue;
    const p = ln.split(";").map((x) => x.trim());
    if (p.length < 3) continue;
    await lancarRendimento({ data: p[0], tipo: p[1], valor: p[2], ticker: p[3] || "" });
    n += 1;
  }
  return n;
}
