import { formatBRL } from "@/lib/financeiro/format";
import { rotuloOrdem, useOrdenacao } from "@/hooks/use-ordenacao";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function TabelaMensal({
  linhas,
}: {
  linhas: { categoria: string; meses: number[]; total: number }[];
}) {
  const ordem = useOrdenacao<string>("categoria");
  const ordenadas = ordem.ordenar(linhas, (l, k) => {
    if (k === "categoria") return l.categoria;
    if (k === "total") return l.total;
    if (k.startsWith("m")) return l.meses[Number(k.slice(1))] ?? 0;
    return l.categoria;
  });
  const totais = Array.from({ length: 12 }, (_, i) => linhas.reduce((a, l) => a + (l.meses[i] ?? 0), 0));
  const granTotal = totais.reduce((a, b) => a + b, 0);

  return (
    <div className="overflow-x-auto rounded-[16px] border border-border">
      <table className="zebra min-w-[920px] w-full border-collapse text-left text-xs">
        <thead>
          <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            <th className="sticky left-0 bg-surface-2 px-3 py-2.5">
              <button type="button" onClick={() => ordem.toggle("categoria")}>
                Categoria{rotuloOrdem(ordem.chave === "categoria", ordem.dir)}
              </button>
            </th>
            {MESES.map((m, i) => (
              <th key={m} className="px-2 py-2.5 text-right">
                <button type="button" onClick={() => ordem.toggle(`m${i}`)}>
                  {m}
                  {rotuloOrdem(ordem.chave === `m${i}`, ordem.dir)}
                </button>
              </th>
            ))}
            <th className="px-3 py-2.5 text-right">
              <button type="button" onClick={() => ordem.toggle("total")}>
                Total{rotuloOrdem(ordem.chave === "total", ordem.dir)}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((l) => (
            <tr key={l.categoria}>
              <td className="sticky left-0 bg-surface px-3 py-2 text-fg">{l.categoria}</td>
              {l.meses.map((v, i) => (
                <td key={i} className="px-2 py-2 text-right font-mono tabular text-muted">
                  {v ? formatBRL(v) : "—"}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-mono tabular text-fg">{formatBRL(l.total)}</td>
            </tr>
          ))}
          <tr className="bg-surface-2 font-medium">
            <td className="sticky left-0 bg-surface-2 px-3 py-2 text-fg">TOTAL</td>
            {totais.map((v, i) => (
              <td key={i} className="px-2 py-2 text-right font-mono tabular text-fg">
                {v ? formatBRL(v) : "—"}
              </td>
            ))}
            <td className="px-3 py-2 text-right font-mono tabular text-gain">{formatBRL(granTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
