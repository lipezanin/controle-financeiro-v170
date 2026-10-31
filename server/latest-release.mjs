/**
 * Metadados da última release.
 * Primeiro o latest.json publicado no GitHub; se o repositório estiver
 * privado ou offline, cai no arquivo local public/downloads/latest.json.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "lipezanin/controle-financeiro-v170";
const REMOTO = `https://github.com/${REPO}/releases/latest/download/latest.json`;
const API = `https://api.github.com/repos/${REPO}/releases/latest`;

async function daApi() {
  const r = await fetch(API, {
    headers: {
      "User-Agent": "ControleFinanceiro",
      Accept: "application/vnd.github+json",
    },
  });
  if (!r.ok) return null;
  const j = await r.json();
  const version = String(j.tag_name ?? "").replace(/^v/, "");
  const assets = Array.isArray(j.assets) ? j.assets : [];
  const exe =
    assets.find((a) => a?.name === "ControleFinanceiro-Setup.exe") ??
    assets.find((a) => String(a?.name ?? "").toLowerCase().endsWith(".exe"));
  if (!version || !exe?.browser_download_url) return null;
  const notes = typeof j.body === "string" && j.body.trim() ? j.body.trim().slice(0, 180) : null;
  return { version, url: String(exe.browser_download_url), notes, fonte: "github" };
}

export async function lerLatest() {
  try {
    const r = await fetch(REMOTO, {
      redirect: "follow",
      headers: {
        "User-Agent": "ControleFinanceiro",
        Accept: "application/json",
      },
    });
    const texto = await r.text();
    if (r.ok) {
      try {
        const j = JSON.parse(texto);
        if (j && typeof j.version === "string" && typeof j.url === "string" && j.url.startsWith("https://")) {
          return { version: j.version, url: j.url, notes: j.notes ?? null, fonte: "github" };
        }
      } catch {
        /* corpo não é JSON */
      }
    }
  } catch {
    /* sem rede ou JSON inválido: tenta a API da Release */
  }
  try {
    const api = await daApi();
    if (api) return api;
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
