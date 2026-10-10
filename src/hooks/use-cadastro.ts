import { useEffect, useState } from "react";
import { listarCadastro, listarNomes } from "@/services/cadastro-service";

/** Carrega nomes ativos de uma ou mais sessões da Base de Dados. */
export function useCadastroNomes(sessao: string): string[] {
  const [nomes, setNomes] = useState<string[]>([]);
  useEffect(() => {
    let vivo = true;
    void (sessao === "tipo_rendimento" ? listarCadastro(sessao) : listarNomes(sessao)).then((lista) => {
      if (vivo) setNomes(lista);
    });
    return () => {
      vivo = false;
    };
  }, [sessao]);
  return nomes;
}

export function useCadastros(sessoes: string[]): Record<string, string[]> {
  const chave = sessoes.join("|");
  const [map, setMap] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let vivo = true;
    const ids = chave.split("|").filter(Boolean);
    void Promise.all(ids.map(async (s) => [s, await listarCadastro(s)] as const)).then((pares) => {
      if (vivo) setMap(Object.fromEntries(pares));
    });
    return () => {
      vivo = false;
    };
  }, [chave]);
  return map;
}
