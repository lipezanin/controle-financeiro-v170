const { contextBridge, ipcRenderer } = require("electron");
const { version } = require("./package.json");

contextBridge.exposeInMainWorld("cfDesktop", {
  ativo: true,
  versao: version,
  aplicarAtualizacao: (url) => ipcRenderer.invoke("cf-atualizar", url),
  baixarDelta: (url) => ipcRenderer.invoke("cf-baixar-delta", url),
  aplicarDelta: () => ipcRenderer.invoke("cf-aplicar-delta"),
});
