/**
 * Carteira e consulta de ativo — mesmas regras da aba INVESTIMENTOS / CONSULTAR ATIVO.
 */

import type { Database } from "sql.js";
import { consultar, getDb } from "@/lib/financeiro/db";
import { CLASSES_INVESTIMENTO } from "@/lib/financeiro/theme";
import { resumirPatrimonio } from "@/services/patrimonio-service";
import { garantirImportacaoInicial } from "@/utils/import-excel";

const EPS = 1e-8;

const GRUPO_DA_CATEGORIA: Record<string, string> = {
  Ações: "Ações",
  "Fundos Imobiliários": "Fundos Imobiliários",
  "ETF Brasil": "ETF's Nacionais",
  BDR: "BDR",
  Imóvel: "Imóveis",
  "Previdência Privada": "Previdência Privada",
  Stocks: "Stocks",
  "ETF USA": "ETF's USA",
  Reits: "Reits",
  Bonds: "Bonds - Renda Fixa",
  Treasuries: "Treasuries - Renda Fixa",
  "Renda Fixa": "Renda Fixa",
};

export type Posicao = {
  chave: string;
  ticker: string;
  categoria: string;
  grupo: string;
  emissor: string | null;
  liquidez: string | null;
  quantidade: number;
  precoMedio: number | null;
  valorInvestido: number;
  proventosLiq: number;
  yieldOnCost: number | null;
  lucroProventos: number;
  qtdOperacoes: number;
  ultimaVendaPm: number | null;
  ativa: boolean;
  precoAtual: number | null;
  valorMercado: number | null;
  dividendYield: number | null;
};

export type HistoricoOp = {
  data: string;
  tipo: string;
  quantidade: number | null;
  preco: number | null;
  valor: number | null;
};

export type ResumoAtivo = Posicao & {
  pctCarteira: number;
  pctCategoria: number;
  historico: HistoricoOp[];
  cotacaoCompra: number | null;
  ptaxAtual: number | null;
};

export type Carteira = {
  ativas: { grupo: string; posicoes: Posicao[] }[];
  inativas: { grupo: string; posicoes: Posicao[] }[];
  patrimonioNacional: number;
  tickers: string[];
  variacaoGrupos: { grupo: string; valor: number; variacaoPct: number | null; variacaoReais: number | null }[];
};

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

function str(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

function grupoDe(categoria: string | null): string {
  if (!categoria) return "Outros";
  return GRUPO_DA_CATEGORIA[categoria] ?? categoria;
}

function liquidezFallback(categoria: string | null, liquidez: string | null): string | null {
  if (liquidez) return liquidez;
  if (categoria === "Imóvel") return "Baixa liquidez";
  if (
    categoria === "Ações" ||
    categoria === "Fundos Imobiliários" ||
    categoria === "ETF Brasil" ||
    categoria === "BDR"
  ) {
    return "D+2";
  }
  return null;
}

function chaveTicker(row: Record<string, unknown>): string {
  const bruto = row.ticker ?? row.TICKER ?? Object.values(row)[0];
  return String(bruto ?? "").trim().toUpperCase();
}

function mapaProventos(db: Database): Map<string, number> {
  const linhas = consultar(
    db,
    `SELECT ticker, valor_liquido, valor_bruto_brl FROM rendimentos WHERE ticker IS NOT NULL`,
  );
  const m = new Map<string, number>();
  for (const r of linhas) {
    const k = chaveTicker(r);
    if (!k) continue;
    const liq = r.valor_liquido ?? r.VALOR_LIQUIDO;
    const bruto = r.valor_bruto_brl ?? r.VALOR_BRUTO_BRL;
    const v = liq != null ? num(liq) : num(bruto);
    m.set(k, (m.get(k) ?? 0) + v);
  }
  return m;
}

function mapaOperacoes(db: Database): Map<string, number> {
  const linhas = consultar(db, `SELECT ticker FROM transacoes WHERE ticker IS NOT NULL`);
  const m = new Map<string, number>();
  for (const r of linhas) {
    const k = chaveTicker(r);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function mapaUltimaVenda(db: Database): Map<string, number> {
  const linhas = consultar(
    db,
    `SELECT id, ticker, quantidade, valor_brl FROM transacoes
     WHERE tipo_operacao = 'Venda' AND ticker IS NOT NULL
     ORDER BY id ASC`,
  );
  const m = new Map<string, number>();
  for (const r of linhas) {
    const k = chaveTicker(r);
    const qtd = num(r.quantidade ?? r.QUANTIDADE);
    const valor = num(r.valor_brl ?? r.VALOR_BRL);
    if (!k || !qtd) continue;
    m.set(k, valor / qtd);
  }
  return m;
}

function montarPosicao(args: {
  chave: string;
  ticker: string;
  categoria: string;
  emissor: string | null;
  liquidez: string | null;
  quantidade: number;
  precoMedio: number | null;
  valorInvestido: number;
  custoAportado?: number;
  proventos: Map<string, number>;
  operacoes: Map<string, number>;
  vendas: Map<string, number>;
}): Posicao {
  const key = args.ticker.toUpperCase();
  const proventosLiq = args.proventos.get(key) ?? 0;
  const baseYoc =
    args.valorInvestido > EPS ? args.valorInvestido : (args.custoAportado ?? 0);
  const yoc = baseYoc > EPS ? proventosLiq / baseYoc : null;
  return {
    chave: args.chave,
    ticker: args.ticker,
    categoria: args.categoria,
    grupo: grupoDe(args.categoria),
    emissor: args.emissor,
    liquidez: liquidezFallback(args.categoria, args.liquidez),
    quantidade: args.quantidade,
    precoMedio: args.precoMedio,
    valorInvestido: args.valorInvestido,
    proventosLiq,
    yieldOnCost: yoc,
    lucroProventos: proventosLiq,
    qtdOperacoes: args.operacoes.get(key) ?? 0,
    ultimaVendaPm: args.vendas.get(key) ?? null,
    ativa: args.quantidade > EPS,
    precoAtual: null,
    valorMercado: null,
    dividendYield: null,
  };
}

function agrupar(posicoes: Posicao[]): { grupo: string; posicoes: Posicao[] }[] {
  const mapa = new Map<string, Posicao[]>();
  for (const p of posicoes) {
    const arr = mapa.get(p.grupo) ?? [];
    arr.push(p);
    mapa.set(p.grupo, arr);
  }
  const ordem = [...CLASSES_INVESTIMENTO];
  return ordem
    .filter((g) => (mapa.get(g) ?? []).length > 0)
    .map((grupo) => ({
      grupo,
      posicoes: (mapa.get(grupo) ?? []).sort((a, b) =>
        a.ticker.localeCompare(b.ticker, "pt-BR"),
      ),
    }));
}

function posicoesDoLivro(
  db: Database,
  proventos: Map<string, number>,
  operacoes: Map<string, number>,
  vendas: Map<string, number>,
): Posicao[] {
  const linhas = consultar(
    db,
    `SELECT ticker, categoria, tipo_operacao AS tipo, emissor, liquidez,
            quantidade, valor_brl AS valor, qtd_acumulada AS qtd_acum, custo_acum_brl AS custo_acum
     FROM transacoes
     WHERE ticker IS NOT NULL AND TRIM(ticker) <> ''
     ORDER BY data, id`,
  );
  type Acc = {
    ticker: string;
    categoria: string;
    emissor: string;
    liquidez: string;
    qtd: number;
    custo: number;
    aportes: number;
    snapQtd: number;
    snapCusto: number;
    movimentos: number;
  };
  const mapa = new Map<string, Acc>();
  for (const r of linhas) {
    const categoria = String(r.categoria ?? "");
    if (grupoDe(categoria) === "Renda Fixa") continue;
    const ticker = String(r.ticker);
    const key = `${categoria}|${ticker.toUpperCase()}`;
    let a = mapa.get(key);
    if (!a) {
      a = {
        ticker,
        categoria,
        emissor: "",
        liquidez: "",
        qtd: 0,
        custo: 0,
        aportes: 0,
        snapQtd: 0,
        snapCusto: 0,
        movimentos: 0,
      };
      mapa.set(key, a);
    }
    if (str(r.emissor)) a.emissor = String(r.emissor);
    if (str(r.liquidez)) a.liquidez = String(r.liquidez);
    const tipo = str(r.tipo);
    const qtd = Math.abs(num(r.quantidade));
    const valor = Math.abs(num(r.valor));
    const compra = tipo === "Compra" || tipo === "Parcela Imóvel" || tipo === "ITBI / Cartório";
    if (compra || tipo === "Venda") a.movimentos += 1;
    if (compra) {
      a.qtd += qtd;
      a.custo += valor;
      a.aportes += valor;
    } else if (tipo === "Venda" && a.qtd > EPS) {
      const sai = Math.min(qtd > EPS ? qtd : a.qtd, a.qtd);
      a.custo *= (a.qtd - sai) / a.qtd;
      a.qtd -= sai;
    }
    if (r.qtd_acum != null && r.qtd_acum !== "") {
      a.snapQtd = num(r.qtd_acum);
      a.snapCusto = num(r.custo_acum);
    }
  }
  return [...mapa.values()].map((a) => {
    const fechou = a.movimentos > 0 && a.qtd <= EPS;
    const qtd = fechou ? 0 : a.qtd > EPS ? a.qtd : a.snapQtd;
    const custo = qtd > EPS ? (a.qtd > EPS ? a.custo : a.snapCusto) : 0;
    return montarPosicao({
      chave: `tx:${a.categoria}:${a.ticker}`,
      ticker: a.ticker,
      categoria: a.categoria,
      emissor: a.emissor,
      liquidez: a.liquidez,
      quantidade: qtd,
      precoMedio: qtd > EPS ? custo / qtd : null,
      valorInvestido: custo,
      custoAportado: a.aportes,
      proventos,
      operacoes,
      vendas,
    });
  });
}

function posicoesRf(
  db: Database,
  proventos: Map<string, number>,
  operacoes: Map<string, number>,
  vendas: Map<string, number>,
): Posicao[] {
  const linhas = consultar(
    db,
    `SELECT id, ticker, nome, emissor, liquidez, valor_aplicado, status, valor_mercado
     FROM renda_fixa
     WHERE tipo_movimento = 'Aplicação' AND COALESCE(valor_aplicado, 0) > 0`,
  );
  return linhas.map((r) => {
    const ticker = String(r.ticker || r.nome);
    const resgatado = String(r.status ?? "") === "Resgatado";
    const p = montarPosicao({
      chave: `rf:${r.id}`,
      ticker,
      categoria: "Renda Fixa",
      emissor: str(r.nome) ?? str(r.emissor),
      liquidez: str(r.liquidez),
      quantidade: resgatado ? 0 : 1,
      precoMedio: num(r.valor_aplicado),
      valorInvestido: resgatado ? 0 : num(r.valor_aplicado),
      custoAportado: num(r.valor_aplicado),
      proventos,
      operacoes,
      vendas,
    });
    const mercado = num(r.valor_mercado);
    if (mercado > 0 && !resgatado) {
      p.precoAtual = mercado;
      p.valorMercado = mercado;
    }
    return p;
  });
}

export async function listarCarteira(): Promise<Carteira> {
  await garantirImportacaoInicial();
  const db = await getDb();
  const proventos = mapaProventos(db);
  const operacoes = mapaOperacoes(db);
  const vendas = mapaUltimaVenda(db);
  const todas = [
    ...posicoesRf(db, proventos, operacoes, vendas),
    ...posicoesDoLivro(db, proventos, operacoes, vendas),
  ];
  const ativas = todas.filter((p) => p.ativa);
  const inativas = todas.filter((p) => !p.ativa);

  try {
    const temDy = consultar(db, `PRAGMA table_info(cotacoes_ativos)`).some(
      (c) => String(c.name) === "dividend_yield",
    );
    const cotacoes = consultar(
      db,
      temDy
        ? `SELECT ticker, preco, dividend_yield FROM cotacoes_ativos`
        : `SELECT ticker, preco FROM cotacoes_ativos`,
    );
    const mapaPreco = new Map<string, number>();
    const mapaDy = new Map<string, number>();
    for (const r of cotacoes) {
      const k = String(r.ticker ?? "").toUpperCase();
      const preco = num(r.preco);
      if (k && preco > 0) mapaPreco.set(k, preco);
      if (k && r.dividend_yield != null && num(r.dividend_yield) > 0) {
        mapaDy.set(k, num(r.dividend_yield));
      }
    }
    const corte12 = new Date();
    corte12.setFullYear(corte12.getFullYear() - 1);
    const prov12 = new Map<string, number>();
    for (const r of consultar(
      db,
      `SELECT UPPER(COALESCE(ticker, '')) AS t, SUM(COALESCE(valor_liquido, valor_bruto_brl, 0)) AS v
       FROM rendimentos WHERE data >= ? GROUP BY UPPER(COALESCE(ticker, ''))`,
      [corte12.toISOString().slice(0, 10)],
    )) {
      if (r.t) prov12.set(String(r.t), num(r.v));
    }
    for (const p of todas) {
      const preco = mapaPreco.get(p.ticker.toUpperCase());
      if (preco && p.quantidade > EPS) {
        p.precoAtual = preco;
        p.valorMercado = p.quantidade * preco;
      }
      const baseMercado = p.valorMercado != null && p.valorMercado > 0 ? p.valorMercado : p.valorInvestido;
      const pnl = baseMercado - p.valorInvestido;
      p.lucroProventos = p.proventosLiq + pnl;
      const dyGuardado = mapaDy.get(p.ticker.toUpperCase());
      const provAno = prov12.get(p.ticker.toUpperCase()) ?? 0;
      if (dyGuardado != null && dyGuardado > 0) p.dividendYield = dyGuardado;
      else if (baseMercado > EPS && provAno > 0) p.dividendYield = provAno / baseMercado;
      else p.dividendYield = null;
    }
  } catch {
    /* cotação é opcional — quantidade e custo já estão na lista */
  }

  let patrimonioNacional = 0;
  try {
    patrimonioNacional = (await resumirPatrimonio()).patrimonioNacional;
  } catch {
    patrimonioNacional = ativas.reduce((s, p) => s + p.valorInvestido, 0);
  }

  const tickers = [...new Set(todas.map((p) => p.ticker))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const pares = new Map<string, [number, number | null]>();
  try {
    for (const r of consultar(
      db,
      `SELECT UPPER(ticker) AS t, preco FROM historico_cotacoes ORDER BY ticker, data DESC`,
    )) {
      const k = String(r.t ?? "");
      const atual = pares.get(k);
      if (!atual) pares.set(k, [num(r.preco), null]);
      else if (atual[1] == null) atual[1] = num(r.preco);
    }
  } catch {
    /* histórico ainda vazio */
  }
  const variacaoGrupos = agrupar(ativas).map((g) => {
    let valor = 0;
    let hoje = 0;
    let baseOntem = 0;
    for (const p of g.posicoes) {
      const mercado = p.valorMercado ?? p.valorInvestido;
      valor += mercado;
      const par = pares.get(p.ticker.toUpperCase());
      if (par && par[1] != null && par[1] > 0 && p.quantidade > EPS) {
        hoje += p.quantidade * (par[0] - par[1]);
        baseOntem += p.quantidade * par[1];
      }
    }
    return {
      grupo: g.grupo,
      valor,
      variacaoReais: baseOntem > 0 ? hoje : null,
      variacaoPct: baseOntem > 0 ? hoje / baseOntem : null,
    };
  });
  return {
    ativas: agrupar(ativas),
    inativas: agrupar(inativas),
    patrimonioNacional,
    tickers,
    variacaoGrupos,
  };
}

function historicoTicker(db: Database, ticker: string): HistoricoOp[] {
  const linhas = consultar(
    db,
    `SELECT data, tipo_operacao AS tipo, quantidade, valor_brl AS valor
     FROM transacoes
     WHERE UPPER(ticker) = UPPER(?)
     ORDER BY data DESC, id DESC
     LIMIT 40`,
    [ticker],
  );
  if (linhas.length) {
    return linhas.map((r) => {
      const qtd = r.quantidade == null ? null : num(r.quantidade);
      const valor = r.valor == null ? null : num(r.valor);
      const preco = qtd && qtd !== 0 && valor != null ? valor / qtd : null;
      return {
        data: String(r.data ?? ""),
        tipo: String(r.tipo ?? ""),
        quantidade: qtd,
        preco,
        valor,
      };
    });
  }
  const rf = consultar(
    db,
    `SELECT data_aplicacao AS data, tipo_movimento AS tipo,
            1 AS quantidade, valor_aplicado AS valor
     FROM renda_fixa
     WHERE UPPER(COALESCE(ticker, nome)) = UPPER(?)
       AND tipo_movimento = 'Aplicação'
     ORDER BY data_aplicacao DESC, id DESC
     LIMIT 40`,
    [ticker],
  );
  return rf.map((r) => ({
    data: String(r.data ?? ""),
    tipo: String(r.tipo ?? "Aplicação"),
    quantidade: 1,
    preco: r.valor == null ? null : num(r.valor),
    valor: r.valor == null ? null : num(r.valor),
  }));
}

/** Espelha a aba CONSULTAR ATIVO (ticker mestre + histórico). */
export async function consultarAtivo(ticker: string): Promise<ResumoAtivo | null> {
  const t = ticker.trim();
  if (!t) return null;
  const carteira = await listarCarteira();
  const db = await getDb();
  const candidatas = [...carteira.ativas, ...carteira.inativas]
    .flatMap((g) => g.posicoes)
    .filter((p) => p.ticker.toUpperCase() === t.toUpperCase());
  if (!candidatas.length) return null;
  const ativas = candidatas.filter((p) => p.ativa);
  const base = ativas.length
    ? ativas.reduce((acc, p) => ({
        ...p,
        quantidade: acc.quantidade + p.quantidade,
        valorInvestido: acc.valorInvestido + p.valorInvestido,
        proventosLiq: p.proventosLiq,
        lucroProventos: p.lucroProventos,
      }))
    : candidatas[0];
  const somaGrupo =
    [...carteira.ativas, ...carteira.inativas]
      .find((g) => g.grupo === base.grupo)
      ?.posicoes.reduce((s, p) => s + p.valorInvestido, 0) ?? base.valorInvestido;
  return {
    ...base,
    yieldOnCost: base.valorInvestido > EPS ? base.proventosLiq / base.valorInvestido : null,
    pctCarteira: carteira.patrimonioNacional
      ? base.valorInvestido / carteira.patrimonioNacional
      : 0,
    pctCategoria: somaGrupo ? base.valorInvestido / somaGrupo : 0,
    historico: historicoTicker(db, t),
    cotacaoCompra: (() => {
      const fx = consultar(
        db,
        `SELECT AVG(cotacao_efetiva) AS fx FROM transacoes
         WHERE UPPER(ticker) = UPPER(?) AND cotacao_efetiva IS NOT NULL AND cotacao_efetiva > 0`,
        [t],
      )[0];
      return fx?.fx == null ? null : num(fx.fx);
    })(),
    ptaxAtual: (() => {
      const ptax = consultar(
        db,
        `SELECT cotacao_venda AS v FROM cotacoes_cambio WHERE moeda = 'USD' ORDER BY data DESC LIMIT 1`,
      )[0];
      return ptax?.v == null ? null : num(ptax.v);
    })(),
  };
}
