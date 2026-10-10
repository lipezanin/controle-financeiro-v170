#!/usr/bin/env node
/**
 * Empacota o build Nitro com Electron win32-x64 e gera o Setup.exe (NSIS).
 * Tudo é montado em /tmp (o FS de artifacts rejeita nomes com @).
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  writeFileSync,
  statSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync, execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ELECTRON_VERSION = "34.5.8";
const WORK = "/tmp/cf-windows";
const OUT_DIR = join(WORK, "ControleFinanceiro");
const SETUP_TMP = join(WORK, "ControleFinanceiro-Setup.exe");
const SETUP_PATH = join(ROOT, "artifacts", "ControleFinanceiro-Setup.exe");
const CACHE = join(ROOT, ".cache", "electron");
const ZIP_E = join(CACHE, `electron-v${ELECTRON_VERSION}-win32-x64.zip`);
const URL_E = `https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-win32-x64.zip`;
const NSI = join(ROOT, "scripts", "instalador-windows.nsi");
const VERSAO = JSON.parse(readFileSync(join(ROOT, "desktop", "package.json"), "utf8")).version;

function acharOutput() {
  const c = join(ROOT, ".output");
  if (existsSync(join(c, "server", "index.mjs"))) return c;
  throw new Error("Build desktop não encontrado (.output/server/index.mjs). Rode CF_DESKTOP=1 vite build.");
}

function acharMakensis() {
  for (const p of ["/tmp/nsis/usr/bin/makensis", "makensis"]) {
    try {
      execFileSync(p === "makensis" ? "makensis" : p, ["-VERSION"], {
        env: { ...process.env, NSISDIR: "/tmp/nsis/usr/share/nsis" },
        stdio: "pipe",
      });
      return p;
    } catch {
      /* tenta o próximo */
    }
  }
  throw new Error("makensis não encontrado. Extraia o pacote nsis Debian em /tmp/nsis.");
}

async function baixar(url, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest) && statSync(dest).size > 1_000_000) return;
  console.log("baixando Electron Windows…");
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok || !r.body) throw new Error(`download Electron HTTP ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(dest));
}

function garantirCssEVersao(output) {
  const dir = join(output, "public", "assets");
  if (!existsSync(dir)) throw new Error("assets ausentes no build");
  const css = readdirSync(dir).filter((f) => f.endsWith(".css") && f.includes("styles"));
  if (!css.length) throw new Error("CSS hashed ausente — abortando empacote");
  cpSync(join(dir, css[0]), join(dir, "app.css"));
  console.log("app.css <-", css[0], statSync(join(dir, css[0])).size, "bytes");

  let okVersao = false;
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    const t = readFileSync(join(dir, f), "utf8");
    if (t.includes("login obrigat")) {
      throw new Error(`${f} ainda contém 'login obrigatório' — abortando`);
    }
    if (t.includes(VERSAO) && t.includes("local") && t.includes("SQLite")) okVersao = true;
  }
  if (!okVersao) throw new Error(`Build não contém v${VERSAO} · local · SQLite — abortando`);
  console.log("versão no JS:", VERSAO);
}

function montarApp(output) {
  garantirCssEVersao(output);
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  execFileSync("python3", ["-m", "zipfile", "-e", ZIP_E, OUT_DIR], { stdio: "inherit" });

  const exeOrig = join(OUT_DIR, "electron.exe");
  const exeDest = join(OUT_DIR, "ControleFinanceiro.exe");
  if (!existsSync(exeOrig)) throw new Error("electron.exe ausente no zip");
  execFileSync("mv", [exeOrig, exeDest]);

  const resApp = join(OUT_DIR, "resources", "app");
  mkdirSync(resApp, { recursive: true });
  cpSync(join(ROOT, "desktop", "main.cjs"), join(resApp, "main.cjs"));
  cpSync(join(ROOT, "desktop", "preload.cjs"), join(resApp, "preload.cjs"));
  cpSync(join(ROOT, "desktop", "package.json"), join(resApp, "package.json"));

  const destOut = join(OUT_DIR, "resources", "output");
  mkdirSync(destOut, { recursive: true });
  execSync(`tar -C ${JSON.stringify(output)} -cf - . | tar -C ${JSON.stringify(destOut)} -xf -`, {
    stdio: "inherit",
  });

  writeFileSync(
    join(OUT_DIR, "LEIA-ME.txt"),
    [
      `Controle Financeiro ${VERSAO} — Windows (100% local)`,
      "",
      "Use o instalador ControleFinanceiro-Setup.exe (administrador).",
      "Ele instala em C:\\Arquivos de Programas\\Controle Financeiro,",
      "cria atalho na Área de trabalho e no Menu Iniciar.",
      "Para remover: Painel de Controle → Programas, ou Desinstalar.exe na pasta.",
      "",
      "O banco SQLite fica neste computador (Chromium / IndexedDB).",
      "Windows pode avisar 'Windows protegeu o seu PC' (app sem assinatura).",
      "Use 'Mais informações' → Executar assim mesmo.",
      "",
      "Desinstale qualquer versão anterior antes de instalar esta.",
      "",
    ].join("\r\n"),
  );
}

function copiarInstaladores() {
  const versaoPath = join(ROOT, "artifacts", `ControleFinanceiro-Setup-${VERSAO}.exe`);
  cpSync(SETUP_PATH, versaoPath);
  const pub = join(ROOT, "public", "downloads", "ControleFinanceiro-Setup.exe");
  mkdirSync(dirname(pub), { recursive: true });
  cpSync(SETUP_PATH, pub);
  console.log("cópia:", versaoPath);
  console.log("cópia:", pub);
}

function compilarSetup() {
  const makensis = acharMakensis();
  console.log("NSIS:", makensis, "versão app:", VERSAO);
  execFileSync(
    makensis,
    [`-DSRC=${OUT_DIR}`, `-DOUT=${SETUP_TMP}`, NSI],
    {
      stdio: "inherit",
      env: { ...process.env, NSISDIR: process.env.NSISDIR || "/tmp/nsis/usr/share/nsis" },
    },
  );
  if (!existsSync(SETUP_TMP)) throw new Error("Setup.exe não foi gerado");
  mkdirSync(dirname(SETUP_PATH), { recursive: true });
  cpSync(SETUP_TMP, SETUP_PATH);
  const mb = (statSync(SETUP_PATH).size / 1024 / 1024).toFixed(1);
  console.log("instalador:", SETUP_PATH, mb, "MB");
  copiarInstaladores();
}

async function main() {
  const soSetup = process.argv.includes("--so-setup") && existsSync(join(OUT_DIR, "ControleFinanceiro.exe"));
  if (soSetup) {
    console.log("reusando app já montado em", OUT_DIR);
    compilarSetup();
    return;
  }
  const output = acharOutput();
  console.log("nitro output:", output);
  await baixar(URL_E, ZIP_E);
  montarApp(output);
  compilarSetup();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
