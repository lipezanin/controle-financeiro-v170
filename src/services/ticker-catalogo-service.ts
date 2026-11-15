import { consultar, executar, getDb, salvarDb } from "@/lib/financeiro/db";

export type HitTicker = { symbol: string; nome: string; categoria: string };

function categoriaDe(symbol: string, quoteType: string): string {
  const s = symbol.toUpperCase();
  const br = s.endsWith(".SA");
  const base = s.replace(/\.SA$/, "");
  if (quoteType === "ETF") return br ? "ETF Brasil" : "ETF USA";
  if (br && /11$/.test(base)) return "Fundos Imobiliários";
  if (br && /(32|33|34|35|39)$/.test(base)) return "BDR";
  if (quoteType === "MUTUALFUND" || quoteType === "FUND") return "Fundos de Investimento";
  if (/REIT/i.test(quoteType)) return "Reits";
  if (br) return "Ações";
  return "Stocks";
}

export async function buscarTickers(q: string): Promise<HitTicker[]> {
  const termo = q.trim();
  if (termo.length < 2) return [];
  const db = await getDb();
  const like = `${termo.toUpperCase()}%`;
  const locais = consultar(
    db,
    `SELECT simbolo, nome, categoria FROM tickers_catalogo
     WHERE simbolo LIKE ? OR UPPER(nome) LIKE ?
     ORDER BY simbolo LIMIT 8`,
    [like, `%${termo.toUpperCase()}%`],
  ).map((r) => ({
    symbol: String(r.simbolo),
    nome: String(r.nome ?? r.simbolo),
    categoria: String(r.categoria),
  }));

  let remotos: HitTicker[] = [];
  try {
    const r = await fetch(`/proxy/busca?q=${encodeURIComponent(termo)}`);
    const j = (await r.json()) as {
      quotes?: { symbol?: string; shortname?: string; longname?: string; quoteType?: string }[];
    };
    remotos = (j.quotes ?? [])
      .filter((x) => x.symbol)
      .slice(0, 12)
      .map((x) => ({
        symbol: String(x.symbol).replace(/\.SA$/i, ""),
        nome: String(x.shortname || x.longname || x.symbol),
        categoria: categoriaDe(String(x.symbol), String(x.quoteType ?? "")),
      }));
    for (const h of remotos) {
      executar(
        db,
        `INSERT INTO tickers_catalogo (simbolo, nome, categoria, atualizado_em)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(simbolo) DO UPDATE SET nome = excluded.nome, categoria = excluded.categoria, atualizado_em = excluded.atualizado_em`,
        [h.symbol, h.nome, h.categoria, new Date().toISOString()],
      );
    }
    if (remotos.length) await salvarDb();
  } catch {
    /* catálogo local continua */
  }

  const visto = new Set<string>();
  const out: HitTicker[] = [];
  for (const h of [...remotos, ...locais]) {
    const k = h.symbol.toUpperCase();
    if (visto.has(k)) continue;
    visto.add(k);
    out.push(h);
    if (out.length >= 8) break;
  }
  return out;
}
