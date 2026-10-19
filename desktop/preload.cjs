const { contextBridge, ipcRenderer } = require("electron");
const { version } = require("./package.json");

contextBridge.exposeInMainWorld("cfDesktop", {
  ativo: true,
  versao: version,
  aplicarAtualizacao: (url) => ipcRenderer.invoke("cf-atualizar", url),
});
