/**
 * Gera o zip só com os arquivos de resources/ que mudaram desde o manifest anterior.
 * O Electron baixa esse zip e copia por cima da pasta de instalação.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

function listar(raiz, dir, arquivos) {
  for (const nome of readdirSync(dir)) {
    const abs = join(dir, nome);
    const rel = relative(raiz, abs).replaceAll("\\", "/");
    if (rel.startsWith("resources/output/public/downloads")) continue;
    if (!rel.startsWith("resources/app") && !rel.startsWith("resources/output")) continue;
    const st = statSync(abs);
    if (st.isDirectory()) listar(raiz, abs, arquivos);
    else arquivos.push({ rel, abs, size: st.size });
  }
}

export function gerarDelta(outDir, versao, artifacts) {
  mkdirSync(artifacts, { recursive: true });
  const manifesto = join(artifacts, "manifest.json");
  let anterior = { version: null, files: {} };
  if (existsSync(manifesto)) {
    try {
      anterior = JSON.parse(readFileSync(manifesto, "utf8"));
    } catch {
      anterior = { version: null, files: {} };
    }
  }
  const achados = [];
  listar(outDir, join(outDir, "resources"), achados);
  const files = {};
  const mudou = [];
  for (const arq of achados) {
    const sha256 = createHash("sha256").update(readFileSync(arq.abs)).digest("hex");
    files[arq.rel] = { sha256, size: arq.size };
    if (anterior.files?.[arq.rel]?.sha256 !== sha256) mudou.push(arq.rel);
  }
  const nome = `ControleFinanceiro-delta-${versao}.zip`;
  const zip = join(artifacts, nome);
  if (mudou.length && anterior.version) {
    const lista = join(artifacts, "delta-lista.txt");
    writeFileSync(lista, mudou.join("\n"), "utf8");
    execFileSync("python3", ["-c", `
import sys, zipfile
root, lista, dest = sys.argv[1:]
with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for line in open(lista, encoding="utf-8"):
        rel = line.strip()
        if rel:
            z.write(root + "/" + rel, rel)
`, outDir, lista, zip], { stdio: "inherit" });
  }
  writeFileSync(manifesto, JSON.stringify({ version: versao, files }, null, 2));
  const bytes = existsSync(zip) ? statSync(zip).size : 0;
  console.log(`delta: ${mudou.length} arquivos, ${(bytes / 1024 / 1024).toFixed(1)} MB, a partir de ${anterior.version ?? "nenhuma"}`);
  return { from: anterior.version, nome, bytes, count: mudou.length, zip };
}
