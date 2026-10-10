import { useEffect } from "react";
import { EVENTO_MERCADO } from "@/services/atualizacao-automatica-service";

/** Recarrega dados da página quando o ciclo de 10 min termina. */
export function useMercadoAtualizado(recarregar: () => void): void {
  useEffect(() => {
    const fn = () => recarregar();
    window.addEventListener(EVENTO_MERCADO, fn);
    return () => window.removeEventListener(EVENTO_MERCADO, fn);
  }, [recarregar]);
}
