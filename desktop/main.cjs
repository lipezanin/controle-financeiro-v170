/**
 * Processo principal do app desktop (Windows).
 * Sobe o servidor Nitro local e abre a janela. Dados no SQLite/IndexedDB.
 */
const { app, BrowserWindow, shell, session, ipcMain, net } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const PORT = Number(process.env.CF_PORT || 47200);
const isDev = process.env.CF_DEV === "1";

let filho = null;
let janela = null;

app.commandLine.appendSwitch("disable-http-cache");

function caminhoServidor() {
  if (isDev) return null;
  return path.join(process.resourcesPath, "output", "server", "index.mjs");
}

function subirServidor() {
  const arquivo = caminhoServidor();
  if (!arquivo) return;
  filho = spawn(process.execPath, [arquivo], {
    cwd: path.join(process.resourcesPath, "output"),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(PORT),
      NITRO_PORT: String(PORT),
      NITRO_HOST: "127.0.0.1",
      HOST: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  filho.stdout?.on("data", (b) => process.stdout.write(b));
  filho.stderr?.on("data", (b) => process.stderr.write(b));
}

function esperarServidor(ms = 25000) {
  const alvo = isDev ? "http://127.0.0.1:8080/" : `http://127.0.0.1:${PORT}/`;
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tenta = () => {
      const req = http.get(alvo, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - t0 > ms) reject(new Error("O servidor local não respondeu a tempo."));
        else setTimeout(tenta, 300);
      });
    };
    tenta();
  });
}

function injetarCss(win) {
  try {
    const assets = path.join(process.resourcesPath, "output", "public", "assets");
    if (!fs.existsSync(assets)) return;
    const files = fs.readdirSync(assets).filter((f) => f.endsWith(".css"));
    for (const f of files) {
      const css = fs.readFileSync(path.join(assets, f), "utf8");
      win.webContents.insertCSS(css).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0f172a",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const url = isDev ? "http://127.0.0.1:8080/" : `http://127.0.0.1:${PORT}/`;
  janela.loadURL(url);
  janela.webContents.on("did-finish-load", () => injetarCss(janela));
  janela.webContents.setWindowOpenHandler(({ url: u }) => {
    shell.openExternal(u);
    return { action: "deny" };
  });
}

function hostPermitido(url) {
  try {
    const h = new URL(url).hostname;
    return (
      h === "github.com" ||
      h.endsWith(".githubusercontent.com") ||
      h.endsWith(".github.com")
    );
  } catch {
    return false;
  }
}

function baixarBinario(url, dest, tipo) {
  return new Promise((resolve, reject) => {
    if (!hostPermitido(url)) {
      reject(new Error("URL de atualização não permitida."));
      return;
    }
    const req = net.request({ url, redirect: "manual" });
    req.setHeader("User-Agent", "ControleFinanceiro");
    req.setHeader("Accept", "application/octet-stream");
    req.on("response", (res) => {
      const codigo = res.statusCode || 0;
      const locRaw = res.headers.location;
      const loc = Array.isArray(locRaw) ? locRaw[0] : locRaw;
      if (codigo >= 300 && codigo < 400 && loc) {
        res.resume();
        baixarBinario(new URL(loc, url).href, dest, tipo).then(resolve, reject);
        return;
      }
      if (codigo !== 200) {
        res.resume();
        reject(new Error(`Download HTTP ${codigo}`));
        return;
      }
      const arquivo = fs.createWriteStream(dest);
      res.pipe(arquivo);
      arquivo.on("finish", () =>
        arquivo.close(() => {
          try {
            const st = fs.statSync(dest);
            const cab = Buffer.alloc(8);
            const fd = fs.openSync(dest, "r");
            fs.readSync(fd, cab, 0, 8, 0);
            fs.closeSync(fd);
            const marca = cab.toString("ascii");
            const html = marca.trim().startsWith("<") || marca.trim().startsWith("{");
            const ok = !html && (tipo === "zip" ? marca.startsWith("PK") && st.size > 100 : marca.startsWith("MZ") && st.size > 1_000_000);
            if (!ok) {
              fs.rmSync(dest, { force: true });
              reject(new Error(tipo === "zip" ? "O arquivo baixado não é o pacote de atualização." : "O arquivo baixado não é o instalador."));
              return;
            }
            resolve(dest);
          } catch (e) {
            reject(e);
          }
        }),
      );
      arquivo.on("error", reject);
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

function baixarArquivo(url, dest) {
  return baixarBinario(url, dest, "exe");
}

const deltaZip = () => path.join(app.getPath("temp"), "ControleFinanceiro-delta.zip");

ipcMain.handle("cf-baixar-delta", async (_evt, url) => {
  if (typeof url !== "string" || !/^https:\/\//.test(url)) throw new Error("URL de delta ausente.");
  await baixarBinario(url, deltaZip(), "zip");
  return true;
});

ipcMain.handle("cf-aplicar-delta", async () => {
  const zip = deltaZip();
  if (!fs.existsSync(zip)) throw new Error("A atualização ainda não foi baixada.");
  const dest = path.dirname(process.execPath);
  const script = path.join(app.getPath("temp"), "cf-aplicar-delta.ps1");
  const stage = path.join(app.getPath("temp"), "cf-delta-stage");
  const ps = `
$ErrorActionPreference = 'Stop'
$zip = ${JSON.stringify(zip)}
$stage = ${JSON.stringify(stage)}
$dest = ${JSON.stringify(dest)}
for ($i = 0; $i -lt 40; $i++) {
  if (-not (Get-Process -Name 'ControleFinanceiro' -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Seconds 1
}
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null
Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force
Copy-Item -Path (Join-Path $stage '*') -Destination $dest -Recurse -Force
Start-Process -FilePath (Join-Path $dest 'ControleFinanceiro.exe')
`;
  fs.writeFileSync(script, ps, "utf8");
  const elev = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',${JSON.stringify(script)}`,
    ],
    { detached: true, stdio: "ignore" },
  );
  elev.unref();
  setTimeout(() => app.quit(), 600);
  return true;
});

ipcMain.handle("cf-atualizar", async (_evt, url) => {
  if (typeof url !== "string") throw new Error("URL ausente.");
  const dest = path.join(app.getPath("temp"), "ControleFinanceiro-Setup.exe");
  await baixarArquivo(url, dest);
  const instalador = spawn(dest, ["/S"], { detached: true, stdio: "ignore" });
  instalador.unref();
  setTimeout(() => app.quit(), 500);
  return true;
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });
}

app.whenReady().then(async () => {
  if (!gotLock) return;
  try {
    await session.defaultSession.clearCache();
  } catch {
    /* ignore */
  }
  if (!isDev) subirServidor();
  await esperarServidor();
  criarJanela();
});

app.on("window-all-closed", () => {
  if (filho) {
    filho.kill();
    filho = null;
  }
  app.quit();
});

app.on("before-quit", () => {
  if (filho) filho.kill();
});
