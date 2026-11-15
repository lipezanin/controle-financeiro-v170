import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CampoValor } from "@/components/campo-valor";
import { SectionTitle } from "@/components/section-title";
import { Button } from "@/components/ui/button";
import { formatBRL, formatData } from "@/lib/financeiro/format";
import { operacaoDeImovel } from "@/lib/financeiro/imovel";
import { rotuloOrdem, useOrdenacao } from "@/hooks/use-ordenacao";
import {
  atualizarTransacao,
  excluirTransacoes,
  listarTransacoes,
  type LinhaTransacao,
} from "@/services/lancamento-service";
import { formatNumeroBR } from "@/utils/numeros-br";

export const Route = createFileRoute("/transacoes")({
  validateSearch: (s: Record<string, unknown>) => ({
    livro: s.livro === "imoveis" ? ("imoveis" as const) : ("bolsa" as const),
  }),
  component: Pagina,
});

function Pagina() {
  const { livro } = Route.useSearch();
  const [linhas, setLinhas] = useState<LinhaTransacao[]>([]);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<LinhaTransacao | null>(null);
  const [qtd, setQtd] = useState("");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLinhas(await listarTransacoes(5000));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const filtradas = useMemo(() => {
    const base = linhas.filter((l) => {
      const imovel = operacaoDeImovel(l.categoria, l.tipo);
      return livro === "imoveis" ? imovel : !imovel;
    });
    const t = q.trim().toUpperCase();
    if (!t) return base;
    return base.filter((l) =>
      [l.ticker, l.categoria, l.tipo, l.nota].some((c) => String(c ?? "").toUpperCase().includes(t)),
    );
  }, [linhas, q, livro]);
  const ordem = useOrdenacao<"data" | "tipo" | "categoria" | "ticker" | "qtd" | "total" | "nota">("data");
  const visiveis = ordem.ordenar(filtradas, (l, k) => {
    if (k === "data") return l.data;
    if (k === "tipo") return l.tipo;
    if (k === "categoria") return l.categoria ?? "";
    if (k === "ticker") return l.ticker ?? "";
    if (k === "qtd") return l.quantidade ?? 0;
    if (k === "nota") return l.nota ?? "";
    return l.valorBrl ?? 0;
  });

  function abrir(l: LinhaTransacao) {
    setEdit(l);
    setQtd(l.quantidade == null ? "" : formatNumeroBR(l.quantidade, 6));
    setValor(l.valorBrl == null ? "" : formatNumeroBR(l.valorBrl));
    setErro(null);
  }

  async function salvar() {
    if (!edit) return;
    setErro(null);
    try {
      await atualizarTransacao(edit.id, {
        data: edit.data,
        tipo: edit.tipo,
        categoria: edit.categoria ?? "",
        ticker: edit.ticker ?? "",
        quantidade: qtd,
        valorBrl: valor,
      });
      setEdit(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Investimentos"
        title={livro === "imoveis" ? "Transações de imóveis" : "Transações de bolsa"}
        description={
          livro === "imoveis"
            ? "Aquisição, impostos, corretagem e manutenção. Edite ou exclua; o custo do imóvel é recalculado na hora."
            : "Operações de bolsa. Imóveis ficam no livro do menu Imóveis."
        }
      />
      <input
        className="mb-4 h-9 w-full max-w-md rounded-md border border-input-border bg-input px-3 text-sm text-fg"
        placeholder="Filtrar ticker, categoria, tipo…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="min-w-[760px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2"><button type="button" onClick={() => ordem.toggle("data")}>Data{rotuloOrdem(ordem.chave === "data", ordem.dir)}</button></th>
              <th className="px-3 py-2"><button type="button" onClick={() => ordem.toggle("tipo")}>Tipo{rotuloOrdem(ordem.chave === "tipo", ordem.dir)}</button></th>
              <th className="px-3 py-2"><button type="button" onClick={() => ordem.toggle("categoria")}>Categoria{rotuloOrdem(ordem.chave === "categoria", ordem.dir)}</button></th>
              <th className="px-3 py-2"><button type="button" onClick={() => ordem.toggle("ticker")}>Ticker{rotuloOrdem(ordem.chave === "ticker", ordem.dir)}</button></th>
              <th className="px-3 py-2 text-right"><button type="button" onClick={() => ordem.toggle("qtd")}>Qtd{rotuloOrdem(ordem.chave === "qtd", ordem.dir)}</button></th>
              <th className="px-3 py-2 text-right"><button type="button" onClick={() => ordem.toggle("total")}>Total{rotuloOrdem(ordem.chave === "total", ordem.dir)}</button></th>
              <th className="px-3 py-2"><button type="button" onClick={() => ordem.toggle("nota")}>Nota{rotuloOrdem(ordem.chave === "nota", ordem.dir)}</button></th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.id} className="border-t border-border/70">
                <td className="px-3 py-2">{formatData(l.data)}</td>
                <td className="px-3 py-2">{l.tipo}</td>
                <td className="px-3 py-2">{l.categoria}</td>
                <td className="px-3 py-2 font-mono">{l.ticker}</td>
                <td className="px-3 py-2 text-right font-mono">{l.quantidade == null ? "—" : formatNumeroBR(l.quantidade, 4)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatBRL(l.valorBrl)}</td>
                <td className="px-3 py-2 text-muted">{l.nota}</td>
                <td className="px-3 py-2 text-right">
                  <button type="button" className="mr-2 text-accent" onClick={() => abrir(l)}>Editar</button>
                  <button
                    type="button"
                    className="text-loss"
                    onClick={() => void excluirTransacoes([l.id]).then(carregar)}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit ? (
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2">
          <p className="sm:col-span-2 text-sm text-fg">Editar #{edit.id} · {edit.ticker}</p>
          <label className="text-xs text-muted">Data
            <input type="date" className="mt-1 h-9 w-full rounded-md border border-input-border bg-input px-2 text-sm" value={edit.data.slice(0, 10)} onChange={(e) => setEdit({ ...edit, data: e.target.value })} />
          </label>
          <label className="text-xs text-muted">Ticker
            <input className="mt-1 h-9 w-full rounded-md border border-input-border bg-input px-2 text-sm" value={edit.ticker ?? ""} onChange={(e) => setEdit({ ...edit, ticker: e.target.value.toUpperCase() })} />
          </label>
          <label className="text-xs text-muted">Quantidade
            <CampoValor modo="qtd" value={qtd} onChange={setQtd} />
          </label>
          <label className="text-xs text-muted">Valor (R$)
            <CampoValor value={valor} onChange={setValor} />
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <Button type="button" onClick={() => void salvar()}>Salvar</Button>
            <Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button>
          </div>
          {erro ? <p className="sm:col-span-2 text-sm text-loss">{erro}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
