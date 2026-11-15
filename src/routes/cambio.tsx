import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CampoValor } from "@/components/campo-valor";
import { KpiCard } from "@/components/kpi-card";
import { SectionTitle } from "@/components/section-title";
import { Button } from "@/components/ui/button";
import { useOrdenacao, rotuloOrdem } from "@/hooks/use-ordenacao";
import { formatBRL } from "@/lib/financeiro/format";
import {
  excluirMovimentoCambio,
  lancarCompraMoeda,
  lancarVendaMoeda,
  listarCambio,
  saldoCambio,
  type MovimentoCambio,
  type SaldoCambio,
} from "@/services/caixa-cambio-service";
import { formatNumeroBR, parseNumeroBR } from "@/utils/numeros-br";

export const Route = createFileRoute("/cambio")({
  component: Pagina,
});

function Pagina() {
  const [saldo, setSaldo] = useState<SaldoCambio | null>(null);
  const [lista, setLista] = useState<MovimentoCambio[]>([]);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [qtd, setQtd] = useState("");
  const [brl, setBrl] = useState("");
  const [iof, setIof] = useState("");
  const [spread, setSpread] = useState("");
  const [dataVenda, setDataVenda] = useState(new Date().toISOString().slice(0, 10));
  const [qtdVenda, setQtdVenda] = useState("");
  const [brlVenda, setBrlVenda] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ordem = useOrdenacao<"data" | "tipo" | "qtd" | "custo" | "cotacao">("data");

  const carregar = useCallback(async () => {
    const [s, rows] = await Promise.all([saldoCambio("USD"), listarCambio("USD")]);
    setSaldo(s);
    setLista(rows);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const linhas = ordem.ordenar(lista, (m, k) => {
    if (k === "data") return m.data;
    if (k === "tipo") return m.tipo;
    if (k === "qtd") return m.quantidade;
    if (k === "custo") return m.custoBrl;
    return m.cotacao;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <SectionTitle
        kicker="Investimentos"
        title="Câmbio"
        description="O dólar fica numa conta separada do ativo. Você compra a moeda quando quiser e só depois investe, pelo custo médio."
      />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Dólar na conta" value={saldo ? `US$ ${formatNumeroBR(saldo.quantidade, 2)}` : "—"} />
        <KpiCard label="Custo em reais" value={formatBRL(saldo?.custoBrl)} />
        <KpiCard
          label="Custo médio"
          value={saldo && saldo.precoMedio > 0 ? `R$ ${formatNumeroBR(saldo.precoMedio, 4)}` : "—"}
          hint="IOF e spread já entram neste preço"
        />
      </div>

      <form
        className="mb-4 grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          void lancarCompraMoeda({
            data,
            quantidade: parseNumeroBR(qtd),
            valorBrl: parseNumeroBR(brl),
            iofBrl: parseNumeroBR(iof),
            spreadBrl: parseNumeroBR(spread),
          })
            .then(async () => {
              setMsg("Compra de dólar lançada no caixa de câmbio.");
              setQtd("");
              setBrl("");
              setIof("");
              setSpread("");
              await carregar();
            })
            .catch((err: unknown) => setErro(err instanceof Error ? err.message : "Falha ao comprar moeda"));
        }}
      >
        <p className="sm:col-span-2 lg:col-span-6 text-sm text-muted">Comprar dólar. O ativo ainda não entra aqui.</p>
        <label className="text-xs text-muted">
          Data
          <input type="date" required value={data} onChange={(e) => setData(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-input-border bg-input px-3 text-sm text-fg" />
        </label>
        <label className="text-xs text-muted">
          Quantidade (US$)
          <CampoValor modo="qtd" value={qtd} onChange={setQtd} />
        </label>
        <label className="text-xs text-muted">
          Valor pago (R$)
          <CampoValor value={brl} onChange={setBrl} />
        </label>
        <label className="text-xs text-muted">
          IOF (R$)
          <CampoValor value={iof} onChange={setIof} />
        </label>
        <label className="text-xs text-muted">
          Spread (R$)
          <CampoValor value={spread} onChange={setSpread} />
        </label>
        <div className="flex items-end">
          <Button type="submit">Lançar compra</Button>
        </div>
      </form>

      <form
        className="mb-6 grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          void lancarVendaMoeda({
            data: dataVenda,
            quantidade: parseNumeroBR(qtdVenda),
            valorBrl: parseNumeroBR(brlVenda),
          })
            .then(async (r) => {
              setMsg(`Dólar vendido. Resultado cambial ${formatBRL(r.resultado)}.`);
              setQtdVenda("");
              setBrlVenda("");
              await carregar();
            })
            .catch((err: unknown) => setErro(err instanceof Error ? err.message : "Falha ao vender moeda"));
        }}
      >
        <p className="sm:col-span-2 lg:col-span-5 text-sm text-muted">
          Trazer dólar de volta para reais. O resultado é a diferença entre o valor recebido e o custo médio.
        </p>
        <label className="text-xs text-muted">
          Data
          <input type="date" required value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} className="mt-1 h-11 w-full rounded-md border border-input-border bg-input px-3 text-sm text-fg" />
        </label>
        <label className="text-xs text-muted">
          Quantidade (US$)
          <CampoValor modo="qtd" value={qtdVenda} onChange={setQtdVenda} />
        </label>
        <label className="text-xs text-muted">
          Valor recebido (R$)
          <CampoValor value={brlVenda} onChange={setBrlVenda} />
        </label>
        <div className="flex items-end lg:col-span-2">
          <Button type="submit" variant="secondary">Lançar venda</Button>
        </div>
      </form>

      {erro ? <p className="mb-3 text-sm text-loss">{erro}</p> : null}
      {msg ? <p className="mb-3 text-sm text-muted">{msg}</p> : null}

      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-bg text-muted">
            <tr>
              {(
                [
                  ["data", "Data"],
                  ["tipo", "Tipo"],
                  ["qtd", "US$"],
                  ["custo", "Custo R$"],
                  ["cotacao", "Cotação"],
                ] as const
              ).map(([k, label]) => (
                <th key={k} className="px-2 py-2">
                  <button type="button" onClick={() => ordem.toggle(k)}>
                    {label}
                    {rotuloOrdem(ordem.chave === k, ordem.dir)}
                  </button>
                </th>
              ))}
              <th className="px-2 py-2">Descrição</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((m) => (
              <tr key={m.id} className="border-t border-border/60">
                <td className="px-2 py-2">{m.data.split("-").reverse().join("/")}</td>
                <td className="px-2 py-2">{m.tipo}</td>
                <td className="px-2 py-2 font-mono tabular">{formatNumeroBR(m.quantidade, 2)}</td>
                <td className="px-2 py-2 font-mono tabular">{formatBRL(m.custoBrl)}</td>
                <td className="px-2 py-2 font-mono tabular">{m.cotacao ? formatNumeroBR(m.cotacao, 4) : "—"}</td>
                <td className="px-2 py-2 text-muted">{m.descricao ?? "—"}</td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    className="text-loss"
                    onClick={() =>
                      void excluirMovimentoCambio(m.id)
                        .then(carregar)
                        .catch((err: unknown) => setErro(err instanceof Error ? err.message : "Falha ao excluir"))
                    }
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-muted">
                  Nenhuma compra de dólar lançada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
