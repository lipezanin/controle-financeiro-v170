import { useMemo, useState } from "react";

export type DirOrdem = "asc" | "desc";

export function useOrdenacao<K extends string>(inicial: K) {
  const [chave, setChave] = useState<K>(inicial);
  const [dir, setDir] = useState<DirOrdem>("asc");

  function toggle(k: K) {
    if (k === chave) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setChave(k);
      setDir("asc");
    }
  }

  function ordenar<T>(lista: T[], getter: (item: T, k: K) => string | number | null | undefined): T[] {
    const copia = [...lista];
    const sinal = dir === "asc" ? 1 : -1;
    copia.sort((a, b) => {
      const va = getter(a, chave);
      const vb = getter(b, chave);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * sinal;
      return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * sinal;
    });
    return copia;
  }

  return { chave, dir, toggle, ordenar };
}

export function rotuloOrdem(ativa: boolean, dir: DirOrdem): string {
  if (!ativa) return "";
  return dir === "asc" ? " ↑" : " ↓";
}
