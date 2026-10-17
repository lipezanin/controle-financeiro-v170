/**
 * Proxies de cotação também no build (web e desktop).
 * No dev o Vite já faz isso; aqui cobre produção/Nitro.
 */

const TESOURO_CSV =
  "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv";

type Evt = { url: URL; req: { method: string } };

export default async function cotacaoProxy(
  event: Evt,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method !== "GET") return next();
  const path = event.url.pathname;

  if (path === "/proxy/tesouro") {
    try {
      const r = await fetch(TESOURO_CSV, {
        headers: { "User-Agent": "ControleFinanceiroLocal/1.0", Range: "bytes=0-16383" },
      });
      const buf = Buffer.from(await r.arrayBuffer()).subarray(0, 16384);
      return new Response(buf, {
        headers: { "content-type": "text/plain; charset=latin1", "cache-control": "no-store" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "tesouro" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }
  }

  if (path === "/proxy/cotacao") {
    const symbol = (event.url.searchParams.get("symbol") ?? "").trim();
    if (!symbol) {
      return new Response(JSON.stringify({ error: "symbol obrigatório" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    try {
      const modo = event.url.searchParams.get("modo");
      const period1 = event.url.searchParams.get("period1");
      const period2 = event.url.searchParams.get("period2");
      const range = event.url.searchParams.get("range") || "5d";
      const events = event.url.searchParams.get("events");
      const dest =
        modo === "resumo"
          ? `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,summaryDetail`
          : period1 && period2
            ? `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${encodeURIComponent(period1)}&period2=${encodeURIComponent(period2)}${events ? `&events=${encodeURIComponent(events)}` : ""}`
            : `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${encodeURIComponent(range)}${events ? `&events=${encodeURIComponent(events)}` : ""}`;
      const r = await fetch(dest, { headers: { "User-Agent": "ControleFinanceiroLocal/1.0" } });
      const text = await r.text();
      return new Response(text, {
        status: r.status,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "proxy" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }
  }

  return next();
}
