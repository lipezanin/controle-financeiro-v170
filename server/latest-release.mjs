/**
 * Metadados da última release.
 * Primeiro o latest.json publicado no GitHub; se o repositório estiver
 * privado ou offline, cai no arquivo local public/downloads/latest.json.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REMOTO =
  "https://github.com/lipezanin/controle-financeiro-v170/releases/latest/download/latest.json";

export async function lerLatest() {
  try {
    const r = await fetch(REMOTO, {
      redirect: "follow",
      headers: {
        "User-Agent": "ControleFinanceiro",
        Accept: "application/json",
      },
    });
    const tipo = r.headers.get("content-type") ?? "";
    if (r.ok && tipo.includes("json")) {
      const j = await r.json();
      if (j && typeof j.version === "string" && typeof j.url === "string") {
        return { version: j.version, url: j.url, notes: j.notes ?? null, fonte: "github" };
      }
    }
  } catch {
    /* sem rede: usa o arquivo que veio com este build */
  }
  const local = join(dirname(fileURLToPath(import.meta.url)), "latest.fallback.json");
  if (existsSync(local)) {
    const j = JSON.parse(readFileSync(local, "utf8"));
    return { version: String(j.version), url: String(j.url), notes: j.notes ?? null, fonte: "local" };
  }
  return {
    version: "0.0.0",
    url: "/downloads/ControleFinanceiro-Setup.exe",
    notes: null,
    fonte: "embutido",
  };
}
