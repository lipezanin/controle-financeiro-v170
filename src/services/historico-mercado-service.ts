/**
 * Série diária local: PTAX, índices (CDI/SELIC/IPCA) e fechamento de cada ticker
 * da data de inclusão até zerar a posição. Evita bater na API todo dia pelo mesmo ponto.
 */

import { consultar, executar, getDb, salvarDb } from "@/lib/financeiro/db";
import { B3, tickersJanela } from "@/services/cotacao-ativos-service";
import { buscarSerieSgs } from "@/services/taxas-service";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function unix(iso: string): number {
  return Math.floor(Date.parse(`${iso}T12:00:00Z`) / 1000);
}

function fatorCdi(valor: number): number {
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  if (valor > 2) return (1 + valor / 100) ** (1 / 252) - 1;
  return valor / 100;
}

export type PontoHistorico = { data: string; valor: number };

export async function gravarIndice(
  indice: string,
  data: string,
  valor: number,
  unidade: string,
  fonte: string,
  fator?: number | null,
): Promise<void> {
  const db = await getDb();
  executar(
    db,
    `INSERT OR REPLACE INTO historico_indices (indice, data, valor, fator, unidade, fonte)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [indice, data, valor, fator ?? null, unidade, fonte],
  );
}

export async function serieIndice(indice: string, de?: string, ate?: string): Promise<PontoHistorico[]> {
  const db = await getDb();
  const linhas = consultar(
    db,
    `SELECT data, valor FROM historico_indices
     WHERE indice = ? AND (? IS NULL OR data >= ?) AND (? IS NULL OR data <= ?)
     ORDER BY data`,
    [indice, de ?? null, de ?? null, ate ?? null, ate ?? null],
  );
  return linhas.map((r) => ({ data: String(r.data), valor: Number(r.valor) || 0 }));
}

export async function serieCotacao(ticker: string): Promise<PontoHistorico[]> {
  const db = await getDb();
  return consultar(
    db,
    `SELECT data, preco AS valor FROM historico_cotacoes WHERE ticker = ? ORDER BY data`,
    [ticker.toUpperCase()],
  ).map((r) => ({ data: String(r.data), valor: Number(r.valor) || 0 }));
}

async function yahooHistorico(
  ticker: string,
  categoria: string,
  de: string,
  ate: string,
): Promise<{ data: string; preco: number; moeda: string }[]> {
  const symbol = B3.has(categoria) ? `${ticker}.SA` : ticker;
  const url =
    `/proxy/cotacao?symbol=${encodeURIComponent(symbol)}` +
    `&period1=${unix(de)}&period2=${unix(ate) + 86400}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const json = (await r.json()) as {
    chart?: {
      result?: {
        timestamp?: number[];
        meta?: { currency?: string };
        indicators?: { quote?: { close?: (number | null)[] }[] };
      }[];
    };
  };
  const res = json.chart?.result?.[0];
  const ts = res?.timestamp ?? [];
  const close = res?.indicators?.quote?.[0]?.close ?? [];
  const moeda = res?.meta?.currency ?? (B3.has(categoria) ? "BRL" : "USD");
  const out: { data: string; preco: number; moeda: string }[] = [];
  for (let i = 0; i < ts.length; i++) {
    const p = Number(close[i]);
    if (!Number.isFinite(p) || p <= 0) continue;
    const d = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    out.push({ data: d, preco: p, moeda });
  }
  return out;
}

async function preencherPtax(inicio: string, fim: string): Promise<number> {
  const { dolarNaData } = await import("@/services/cambio-service");
  const db = await getDb();
  const ja = new Set(
    consultar(db, `SELECT data FROM cotacoes_cambio WHERE moeda = 'USD'`).map((r) => String(r.data).slice(0, 10)),
  );
  let n = 0;
  let cursor = inicio;
  while (cursor <= fim) {
    const trechoFim = cursor.slice(0, 4) + "-12-31";
    const ate = trechoFim < fim ? trechoFim : fim;
    if (!ja.has(ate) || !ja.has(cursor)) {
      const c = await dolarNaData(ate).catch(() => null);
      if (c) n += 1;
    }
    const y = Number(cursor.slice(0, 4)) + 1;
    cursor = `${y}-01-01`;
  }
  const db2 = await getDb();
  for (const r of consultar(
    db2,
    `SELECT data, cotacao_venda AS v FROM cotacoes_cambio WHERE moeda = 'USD'`,
  )) {
    executar(
      db2,
      `INSERT OR REPLACE INTO historico_indices (indice, data, valor, fator, unidade, fonte)
       VALUES ('PTAX_VENDA', ?, ?, NULL, 'USD/BRL', 'BCB PTAX')`,
      [String(r.data).slice(0, 10), Number(r.v) || 0],
    );
    n += 1;
  }
  return n;
}

async function preencherSgs(): Promise<number> {
  const db = await getDb();
  const minRf = consultar(db, `SELECT MIN(data_aplicacao) AS d FROM renda_fixa`)[0]?.d;
  const minTx = consultar(db, `SELECT MIN(data) AS d FROM transacoes`)[0]?.d;
  const inicio = String(minRf || minTx || "2020-01-01").slice(0, 10);
  const fim = hojeIso();
  const series: { indice: string; codigo: number; unidade: string; cdi?: boolean }[] = [
    { indice: "CDI", codigo: 12, unidade: "%", cdi: true },
    { indice: "SELIC", codigo: 11, unidade: "%", cdi: true },
    { indice: "IPCA_MENSAL", codigo: 433, unidade: "% mês" },
  ];
  let n = 0;
  for (const s of series) {
    try {
      const pts = await buscarSerieSgs(s.codigo, inicio, fim);
      for (const p of pts) {
        executar(
          db,
          `INSERT OR REPLACE INTO historico_indices (indice, data, valor, fator, unidade, fonte)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            s.indice,
            p.iso,
            p.valor,
            s.cdi ? fatorCdi(p.valor) : p.valor / 100,
            s.unidade,
            `BCB SGS ${s.codigo}`,
          ],
        );
        n += 1;
      }
    } catch {
      /* fonte gratuita pode falhar; o que já está no SQLite permanece */
    }
  }
  return n;
}

async function preencherTickers(): Promise<number> {
  const janelas = tickersJanela(await getDb());
  const db = await getDb();
  let n = 0;
  for (const j of janelas) {
    const tem = consultar(
      db,
      `SELECT COUNT(*) AS v FROM historico_cotacoes WHERE ticker = ? AND data >= ? AND data <= ?`,
      [j.ticker, j.inicio, j.fim],
    )[0];
    const qtd = Number(tem?.v) || 0;
    const span =
      (Date.parse(`${j.fim}T12:00:00`) - Date.parse(`${j.inicio}T12:00:00`)) / 86_400_000;
    if (qtd > span * 0.4) continue;
    try {
      const pts = await yahooHistorico(j.ticker, j.categoria, j.inicio, j.fim);
      for (const p of pts) {
        executar(
          db,
          `INSERT OR REPLACE INTO historico_cotacoes (ticker, data, preco, moeda, fonte)
           VALUES (?, ?, ?, ?, 'Yahoo fechamento')`,
          [j.ticker, p.data, p.preco, p.moeda],
        );
        n += 1;
      }
    } catch {
      /* segue o próximo ticker */
    }
  }
  return n;
}

/** API 1 — 21h: fecha o dia (PTAX, CDI/SELIC/IPCA, fechamento de cada ativo da janela). */
export async function cicloHistoricoNoturno(): Promise<string> {
  const nPtax = await preencherPtax("2020-01-01", hojeIso());
  const nSgs = await preencherSgs();
  const nTk = await preencherTickers();
  await salvarDb();
  const db = await getDb();
  const iso = new Date().toISOString();
  executar(db, `INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('historico_noturno_em', ?)`, [iso]);
  await salvarDb();
  return `histórico · PTAX ${nPtax} · índices ${nSgs} · cotações ${nTk}`;
}

export async function ultimoHistoricoNoturno(): Promise<string | null> {
  const db = await getDb();
  const v = consultar(db, `SELECT valor FROM configuracoes WHERE chave = 'historico_noturno_em'`)[0]?.valor;
  return v ? String(v) : null;
}
