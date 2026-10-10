/**
 * Processo principal do app desktop (Windows).
 * Sobe o servidor Nitro local e abre a janela. Dados no SQLite/IndexedDB.
 */
const { app, BrowserWindow, shell, session } = require("electron");
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
