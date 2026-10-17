import { useEffect } from "react";
import { EVENTO_MERCADO } from "@/services/atualizacao-automatica-service";

/** Recarrega a tela quando um lançamento é salvo ou a cotação termina. */
export function useMercadoAtualizado(recarregar: () => void): void {
  useEffect(() => {
    let timer = 0;
    const fn = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => recarregar(), 30);
    };
    window.addEventListener(EVENTO_MERCADO, fn);
    window.addEventListener("cf-dados", fn);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(EVENTO_MERCADO, fn);
      window.removeEventListener("cf-dados", fn);
    };
  }, [recarregar]);
}
