import { rotuloPeriodo, type ModoPeriodo, type Periodo } from "@/lib/financeiro/periodo";
import { usePeriodo } from "@/hooks/periodo-context";
import { useRecorteMercado } from "@/hooks/mercado-context";
import type { RecorteMercado } from "@/lib/financeiro/mercado";

const ANOS = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - 5 + i);
const MESES = [
  [1, "Jan"],
  [2, "Fev"],
  [3, "Mar"],
  [4, "Abr"],
  [5, "Mai"],
  [6, "Jun"],
  [7, "Jul"],
  [8, "Ago"],
  [9, "Set"],
  [10, "Out"],
  [11, "Nov"],
  [12, "Dez"],
] as const;

const sel = "h-10 rounded-md border border-input-border bg-input px-2 text-sm text-fg";

export function FiltroPeriodo() {
  const { periodo, setPeriodo } = usePeriodo();
  const { recorte, setRecorte } = useRecorteMercado();

  function patch(parcial: Partial<Periodo>) {
    setPeriodo({ ...periodo, ...parcial });
  }

  return (
    <div className="mb-6 flex flex-wrap items-end gap-2 rounded-[16px] border border-border bg-surface px-3 py-3">
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.12em] text-muted">
        Período
        <select
          className={sel}
          value={periodo.modo}
          onChange={(e) => patch({ modo: e.target.value as ModoPeriodo })}
        >
          <option value="tudo">Todo o histórico</option>
          <option value="ano">Ano</option>
          <option value="mes">Mês</option>
          <option value="dia">Data</option>
        </select>
      </label>
      {periodo.modo === "ano" || periodo.modo === "mes" ? (
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.12em] text-muted">
          Ano
          <select
            className={sel}
            value={periodo.ano}
            onChange={(e) => patch({ ano: Number(e.target.value) })}
          >
            {ANOS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {periodo.modo === "mes" ? (
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.12em] text-muted">
          Mês
          <select
            className={sel}
            value={periodo.mes}
            onChange={(e) => patch({ mes: Number(e.target.value) })}
          >
            {MESES.map(([n, nome]) => (
              <option key={n} value={n}>
                {nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {periodo.modo === "dia" ? (
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.12em] text-muted">
          Data
          <input
            type="date"
            className={sel}
            value={periodo.data}
            onChange={(e) => patch({ data: e.target.value })}
          />
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.12em] text-muted">
        Praça
        <select
          className={sel}
          value={recorte}
          onChange={(e) => setRecorte(e.target.value as RecorteMercado)}
        >
          <option value="tudo">Tudo</option>
          <option value="nacional">Nacional</option>
          <option value="internacional">Internacional</option>
        </select>
      </label>
      <p className="pb-2 text-xs text-subtle">Exibindo: {rotuloPeriodo(periodo)}</p>
    </div>
  );
}
