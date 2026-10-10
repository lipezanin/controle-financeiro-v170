/**
 * Preços de ativos.
 * Ordem: 1) arquivo COTAHIST da B3 (oficial)  2) brapi.dev se houver token
 * 3) Yahoo Finance via proxy local (fallback, fonte não oficial).
 */

import type { Database } from "sql.js";
import { consultar, executar, getDb, salvarDb } from "@/lib/financeiro/db";

export type CotacaoAtivo = {
  ticker: string;
  preco: number;
  moeda: string;
  fonte: string;
  dataPreco: string | null;
  dividendYield: number | null;
};

export const B3 = new Set(["Ações", "Fundos Imobiliários", "ETF Brasil", "BDR"]);

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

function tickersAtivos(db: Database) {
  const linhas = consultar(
    db,
    `SELECT ticker, categoria, qtd_acumulada AS qtd FROM transacoes t
     INNER JOIN (
       SELECT ticker AS tk, categoria AS cat, MAX(id) AS id FROM transacoes
       WHERE ticker IS NOT NULL GROUP BY ticker, categoria
     ) u ON u.id = t.id
     WHERE COALESCE(t.qtd_acumulada, 0) > 1e-8`,
  );
  return linhas
    .map((r) => ({
      ticker: String(r.ticker ?? "").trim().toUpperCase(),
      categoria: String(r.categoria ?? ""),
      qtd: num(r.qtd),
    }))
    .filter((r) => r.ticker && r.categoria !== "Renda Fixa" && r.categoria !== "Imóvel");
}

/** Janela de histórico: da primeira compra até zerar (ou hoje, se ainda ativo). */
export function tickersJanela(db: Database): { ticker: string; categoria: string; inicio: string; fim: string }[] {
  const linhas = consultar(
    db,
    `SELECT t.ticker AS ticker, t.categoria AS categoria,
            t.qtd_acumulada AS qtd, t.data AS data_fim,
            (SELECT MIN(data) FROM transacoes x
              WHERE UPPER(x.ticker) = UPPER(t.ticker) AND x.categoria = t.categoria) AS inicio
     FROM transacoes t
     INNER JOIN (
       SELECT ticker AS tk, categoria AS cat, MAX(id) AS id FROM transacoes
       WHERE ticker IS NOT NULL GROUP BY ticker, categoria
     ) u ON u.id = t.id`,
  );
  const hoje = new Date().toISOString().slice(0, 10);
  const out: { ticker: string; categoria: string; inicio: string; fim: string }[] = [];
  for (const r of linhas) {
    const ticker = String(r.ticker ?? "").trim().toUpperCase();
    if (!ticker || r.categoria === "Renda Fixa" || r.categoria === "Imóvel") continue;
    const inicio = String(r.inicio ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) continue;
    const qtd = num(r.qtd);
    const fim = qtd > 1e-8 ? hoje : String(r.data_fim ?? hoje).slice(0, 10);
    out.push({ ticker, categoria: String(r.categoria ?? ""), inicio, fim });
  }
  return out;
}

function normalizarDy(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1 ? n / 100 : n;
}

function gravar(db: Database, c: CotacaoAtivo): void {
  executar(
    db,
    `INSERT OR REPLACE INTO cotacoes_ativos (ticker, preco, moeda, fonte, data_preco, atualizado_em, dividend_yield)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [c.ticker, c.preco, c.moeda, c.fonte, c.dataPreco, new Date().toISOString(), c.dividendYield],
  );
}

function aplicarNasPosicoes(db: Database): void {
  db.run(`
    UPDATE posicoes SET
      preco_atual = (SELECT preco FROM cotacoes_ativos c WHERE c.ticker = posicoes.ticker),
      valor_atual = CASE
        WHEN quantidade IS NOT NULL AND quantidade > 0
          THEN quantidade * (SELECT preco FROM cotacoes_ativos c WHERE c.ticker = posicoes.ticker)
        ELSE valor_atual
      END
    WHERE ticker IN (SELECT ticker FROM cotacoes_ativos)
  `);
}

/** Layout oficial B3 COTAHIST (245 colunas, registro tipo 01). */
export function parsearCotahist(texto: string): CotacaoAtivo[] {
  const hoje = new Date().toISOString().slice(0, 10);
  const mapa = new Map<string, CotacaoAtivo>();
  for (const linha of texto.split(/\r?\n/)) {
    if (linha.length < 121) continue;
    if (linha.slice(0, 2) !== "01") continue;
    const ticker = linha.slice(12, 24).trim().toUpperCase();
    const preco = Number(linha.slice(108, 121)) / 100;
    const dataRaw = linha.slice(2, 10);
    const dataPreco =
      dataRaw.length === 8 ? `${dataRaw.slice(0, 4)}-${dataRaw.slice(4, 6)}-${dataRaw.slice(6, 8)}` : hoje;
    if (!ticker || !Number.isFinite(preco) || preco <= 0) continue;
    mapa.set(ticker, { ticker, preco, moeda: "BRL", fonte: "B3 COTAHIST", dataPreco, dividendYield: null });
  }
  return [...mapa.values()];
}

export async function importarCotahist(arquivo: File): Promise<{ gravados: number }> {
  const texto = await arquivo.text();
  const lista = parsearCotahist(texto);
  if (!lista.length) throw new Error("Nenhum registro 01 encontrado no COTAHIST.");
  const db = await getDb();
  for (const c of lista) gravar(db, c);
  aplicarNasPosicoes(db);
  await salvarDb();
  return { gravados: lista.length };
}

async function viaBrapi(tickers: string[], token: string): Promise<CotacaoAtivo[]> {
  const url = `https://brapi.dev/api/quote/${encodeURIComponent(tickers.join(","))}?token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`brapi HTTP ${r.status}`);
  const json = (await r.json()) as {
    results?: {
      symbol?: string;
      regularMarketPrice?: number;
      currency?: string;
      dividendYield?: number;
    }[];
  };
  const hoje = new Date().toISOString().slice(0, 10);
  return (json.results ?? [])
    .map((x) => ({
      ticker: String(x.symbol ?? "").toUpperCase(),
      preco: Number(x.regularMarketPrice),
      moeda: x.currency ?? "BRL",
      fonte: "brapi.dev",
      dataPreco: hoje,
      dividendYield: normalizarDy(x.dividendYield),
    }))
    .filter((c) => c.ticker && c.preco > 0);
}

async function viaYahoo(ticker: string, categoria: string): Promise<CotacaoAtivo | null> {
  const symbol = B3.has(categoria) ? `${ticker}.SA` : ticker;
  const r = await fetch(`/proxy/cotacao?symbol=${encodeURIComponent(symbol)}`);
  if (!r.ok) return null;
  const json = (await r.json()) as {
    chart?: {
      result?: {
        meta?: {
          regularMarketPrice?: number;
          currency?: string;
          trailingAnnualDividendYield?: number;
          dividendYield?: number;
        };
      }[];
    };
  };
  const meta = json.chart?.result?.[0]?.meta;
  const preco = Number(meta?.regularMarketPrice);
  if (!Number.isFinite(preco) || preco <= 0) return null;
  return {
    ticker,
    preco,
    moeda: meta?.currency ?? "BRL",
    fonte: "Yahoo Finance (fallback)",
    dataPreco: new Date().toISOString().slice(0, 10),
    dividendYield: normalizarDy(meta?.trailingAnnualDividendYield ?? meta?.dividendYield),
  };
}

export async function atualizarPosicoes(): Promise<{
  ok: number;
  falhas: string[];
  fonte: string;
}> {
  const db = await getDb();
  const lista = tickersAtivos(db);
  const unicos = new Map<string, string>();
  for (const t of lista) unicos.set(t.ticker, t.categoria);

  const tokenRow = consultar(db, `SELECT valor FROM configuracoes WHERE chave = 'brapi_token'`)[0];
  const token = tokenRow?.valor ? String(tokenRow.valor) : "";

  const obtidos = new Map<string, CotacaoAtivo>();
  let fonte = "Yahoo Finance (fallback)";

  if (token && unicos.size) {
    try {
      const br = await viaBrapi([...unicos.keys()], token);
      for (const c of br) obtidos.set(c.ticker, c);
      if (br.length) fonte = "brapi.dev";
    } catch {
      /* cai no Yahoo */
    }
  }

  const falhas: string[] = [];
  for (const [ticker, categoria] of unicos) {
    if (obtidos.has(ticker)) continue;
    try {
      const c = await viaYahoo(ticker, categoria);
      if (c) obtidos.set(ticker, c);
      else falhas.push(ticker);
    } catch {
      falhas.push(ticker);
    }
  }

  for (const c of obtidos.values()) gravar(db, c);
  aplicarNasPosicoes(db);
  await salvarDb();
  return { ok: obtidos.size, falhas, fonte };
}

export async function mapaCotacoes(): Promise<Map<string, CotacaoAtivo>> {
  const db = await getDb();
  const m = new Map<string, CotacaoAtivo>();
  for (const r of consultar(db, `SELECT ticker, preco, moeda, fonte, data_preco, dividend_yield FROM cotacoes_ativos`)) {
    const ticker = String(r.ticker ?? "").toUpperCase();
    if (!ticker) continue;
    m.set(ticker, {
      ticker,
      preco: num(r.preco),
      moeda: String(r.moeda ?? "BRL"),
      fonte: String(r.fonte ?? ""),
      dataPreco: r.data_preco ? String(r.data_preco) : null,
      dividendYield: r.dividend_yield == null ? null : num(r.dividend_yield),
    });
  }
  return m;
}
