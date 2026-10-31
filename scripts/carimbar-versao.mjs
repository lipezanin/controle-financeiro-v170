#!/usr/bin/env node
/**
 * Grava a versão da tag no app antes do build do instalador.
 * Uso: node scripts/carimbar-versao.mjs 2.0.1
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const versao = (process.argv[2] ?? "").replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(versao)) {
  console.error("uso: node scripts/carimbar-versao.mjs 2.0.1");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const app = join(root, "src/lib/app-version.ts");
writeFileSync(
  app,
  readFileSync(app, "utf8").replace(/APP_VERSAO = "[^"]+"/, `APP_VERSAO = "${versao}"`),
);

const desk = join(root, "desktop/package.json");
const pkg = JSON.parse(readFileSync(desk, "utf8"));
pkg.version = versao;
writeFileSync(desk, `${JSON.stringify(pkg, null, 2)}\n`);

const fb = join(root, "server/latest.fallback.json");
const j = JSON.parse(readFileSync(fb, "utf8"));
j.version = versao;
j.notes = `Instalador Windows ${versao}`;
writeFileSync(fb, `${JSON.stringify(j, null, 2)}\n`);

console.log("versão carimbada", versao);
