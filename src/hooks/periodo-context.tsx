import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { periodoPadrao, type Periodo } from "@/lib/financeiro/periodo";

const CHAVE = "cf-periodo";

function ler(): Periodo {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return periodoPadrao();
    const p = JSON.parse(bruto) as Periodo;
    if (!p?.modo) return periodoPadrao();
    return { ...periodoPadrao(), ...p };
  } catch {
    return periodoPadrao();
  }
}

const Ctx = createContext<{ periodo: Periodo; setPeriodo: (p: Periodo) => void } | null>(null);

export function PeriodoProvider({ children }: { children: ReactNode }) {
  const [periodo, setPeriodoEstado] = useState<Periodo>(() =>
    typeof window === "undefined" ? periodoPadrao() : ler(),
  );
  const setPeriodo = (p: Periodo) => {
    setPeriodoEstado(p);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  };
  const valor = useMemo(() => ({ periodo, setPeriodo }), [periodo]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function usePeriodo(): { periodo: Periodo; setPeriodo: (p: Periodo) => void } {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePeriodo fora do PeriodoProvider");
  return ctx;
}
