import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { RecorteMercado } from "@/lib/financeiro/mercado";

const CHAVE = "cf-recorte-mercado";

function ler(): RecorteMercado {
  try {
    const v = localStorage.getItem(CHAVE);
    if (v === "nacional" || v === "internacional" || v === "tudo") return v;
  } catch {
    /* ignore */
  }
  return "tudo";
}

const Ctx = createContext<{
  recorte: RecorteMercado;
  setRecorte: (r: RecorteMercado) => void;
} | null>(null);

export function MercadoProvider({ children }: { children: ReactNode }) {
  const [recorte, setEstado] = useState<RecorteMercado>(() =>
    typeof window === "undefined" ? "tudo" : ler(),
  );
  const setRecorte = (r: RecorteMercado) => {
    setEstado(r);
    try {
      localStorage.setItem(CHAVE, r);
    } catch {
      /* ignore */
    }
  };
  const valor = useMemo(() => ({ recorte, setRecorte }), [recorte]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useRecorteMercado(): {
  recorte: RecorteMercado;
  setRecorte: (r: RecorteMercado) => void;
} {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRecorteMercado fora do MercadoProvider");
  return ctx;
}
