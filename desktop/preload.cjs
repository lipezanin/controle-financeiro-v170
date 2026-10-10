const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("cfDesktop", {
  ativo: true,
  versao: "1.1.0",
});
