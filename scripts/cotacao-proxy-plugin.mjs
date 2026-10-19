import { lerLatest } from "../server/latest-release.mjs";
import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const TESOURO_CSV =
  "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv";

export function cotacaoProxyPlugin() {
  return {
    name: "cotacao-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const raw = req.url ?? "";
        const pathOnly = raw.split("?", 1)[0] ?? "";
        if (pathOnly === "/downloads/ControleFinanceiro-Setup.exe") {
          const exe = join(dirname(fileURLToPath(import.meta.url)), "..", "artifacts", "ControleFinanceiro-Setup.exe");
          if (!existsSync(exe)) {
            res.statusCode = 404;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("Instalador ainda não gerado.");
            return;
          }
          const st = statSync(exe);
          res.statusCode = 200;
          res.setHeader("content-type", "application/octet-stream");
          res.setHeader("content-disposition", 'attachment; filename="ControleFinanceiro-Setup.exe"');
          res.setHeader("content-length", String(st.size));
          res.setHeader("cache-control", "no-store");
          createReadStream(exe).pipe(res);
          return;
        }
        if (pathOnly === "/api/latest") {
          try {
            const j = await lerLatest();
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify(j));
          } catch (err) {
            res.statusCode = 502;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : "latest" }));
          }
          return;
        }
        if (pathOnly === "/proxy/tesouro") {
          try {
            const r = await fetch(TESOURO_CSV, {
              headers: {
                "User-Agent": "ControleFinanceiroLocal/1.0",
                Range: "bytes=0-16383",
              },
            });
            const buf = Buffer.from(await r.arrayBuffer()).subarray(0, 16384);
            res.statusCode = 200;
            res.setHeader("content-type", "text/plain; charset=latin1");
            res.setHeader("cache-control", "no-store");
            res.end(buf);
          } catch (err) {
            res.statusCode = 502;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : "tesouro falhou" }));
          }
          return;
        }
        if (pathOnly !== "/proxy/cotacao") {
          next();
          return;
        }
        try {
          const u = new URL(raw, "http://127.0.0.1");
          const symbol = (u.searchParams.get("symbol") ?? "").trim();
          if (!symbol) {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: "symbol obrigatório" }));
            return;
          }
          const modo = u.searchParams.get("modo");
          const period1 = u.searchParams.get("period1");
          const period2 = u.searchParams.get("period2");
          const range = u.searchParams.get("range") || "5d";
          const events = u.searchParams.get("events");
          const dest =
            modo === "resumo"
              ? `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,summaryDetail`
              : period1 && period2
                ? `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${encodeURIComponent(period1)}&period2=${encodeURIComponent(period2)}${events ? `&events=${encodeURIComponent(events)}` : ""}`
                : `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${encodeURIComponent(range)}${events ? `&events=${encodeURIComponent(events)}` : ""}`;
          const r = await fetch(dest, {
            headers: { "User-Agent": "ControleFinanceiroLocal/1.0" },
          });
          const text = await r.text();
          res.statusCode = r.status;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(text);
        } catch (err) {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : "proxy falhou" }));
        }
      });
    },
  };
}
