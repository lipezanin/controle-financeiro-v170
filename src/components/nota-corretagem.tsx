/**
 * Lançamento de Nota de Negociação — espelha LANC. NOTA CORRETAGEM do Excel.
 * Cabeçalho + até 25 ordens; taxas distribuídas proporcionalmente; um único confirmar.
 * Instituição, moeda, tipo, categoria e liquidez vêm da Base de Dados.
 */
import { useMemo, useState } from "react";
import { CampoValor } from "@/components/campo-valor";
import { SelectCadastro } from "@/components/select-cadastro";
import { Button } from "@/components/ui/button";
import { useCadastros } from "@/hooks/use-cadastro";
import { lancarNotaCorretagem } from "@/services/lancamento-service";
import { formatNumeroBR, parseNumeroBR } from "@/utils/numeros-br";

const MAX = 25;

type Linha = {
  tipo: string;
  categoria: string;
  ticker: string;
  liquidez: string;
  quantidade: string;
  valorTotal: string;
};

const campo =
  "h-9 w-full rounded-md border border-input-border bg-input px-2 text-[12px] text-fg";

export function NotaCorretagem({ onOk }: { onOk?: () => void }) {
  const listas = useCadastros([
    "instituicao",
    "moeda",
    "tipo_movimentacao",
    "categoria_investimento",
    "liquidez",
  ]);
  const tipos = listas.tipo_movimentacao?.length ? listas.tipo_movimentacao : ["Compra", "Venda"];
  const cats = listas.categoria_investimento?.length
    ? listas.categoria_investimento
    : ["Ações", "Fundos Imobiliários", "ETF Brasil", "BDR"];
  const liqs = listas.liquidez?.length ? listas.liquidez : ["D+2"];

  const vazia = (): Linha => ({
    tipo: tipos.includes("Compra") ? "Compra" : (tipos[0] ?? "Compra"),
    categoria: cats.includes("Ações") ? "Ações" : (cats[0] ?? "Ações"),
    ticker: "",
    liquidez: liqs.includes("D+2") ? "D+2" : (liqs[0] ?? "D+2"),
    quantidade: "",
    valorTotal: "",
  });

  const [numeroNota, setNumeroNota] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [instituicao, setInstituicao] = useState("XP Inc");
  const [moeda, setMoeda] = useState("BRL");
  const [taxaLiq, setTaxaLiq] = useState("0");
  const [bovespa, setBovespa] = useState("0");
  const [corretagem, setCorretagem] = useState("0");
  const [taxasTotais, setTaxasTotais] = useState("0");
  const [linhas, setLinhas] = useState<Linha[]>(() => Array.from({ length: MAX }, vazia));
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => {
    const ordens = linhas
      .filter((l) => l.ticker.trim())
      .map((l) => ({
        ticker: l.ticker.trim().toUpperCase(),
        qtd: parseNumeroBR(l.quantidade),
        valor: parseNumeroBR(l.valorTotal),
      }))
      .filter((o) => o.ticker && o.qtd > 0 && o.valor > 0);
    const soma = ordens.reduce((a, o) => a + o.valor, 0);
    if (!ordens.length || soma <= 0) return null;
    const taxas =
      parseNumeroBR(taxasTotais) ||
      parseNumeroBR(taxaLiq) + parseNumeroBR(bovespa) + parseNumeroBR(corretagem);
    return ordens.map((o) => ({
      ...o,
      taxaProp: taxas * (o.valor / soma),
      pct: (o.valor / soma) * 100,
    }));
  }, [linhas, taxasTotais, taxaLiq, bovespa, corretagem]);

  function setLinha(i: number, patch: Partial<Linha>) {
    setLinhas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function confirmar() {
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      const n = await lancarNotaCorretagem(
        {
          numeroNota,
          data,
          instituicao,
          moeda,
          taxaLiquidacao: taxaLiq,
          totalBovespa: bovespa,
          totalCorretagem: corretagem,
          taxasTotais:
            parseNumeroBR(taxasTotais) ||
            parseNumeroBR(taxaLiq) + parseNumeroBR(bovespa) + parseNumeroBR(corretagem),
        },
        linhas.filter((l) => l.ticker.trim()),
      );
      setMsg(`Nota ${numeroNota || "(sem número)"} lançada: ${n} ordem(ns) em um único lançamento.`);
      setLinhas(Array.from({ length: MAX }, vazia));
      onOk?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao lançar nota");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[16px] border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-fg">
        Nota de Negociação — Renda Variável (até {MAX} ordens)
      </h3>
      <p className="text-[12px] text-muted">
        Instituição, tipo, categoria e liquidez vêm da Base de Dados. Um único confirmar grava todas
        as ordens. Valores: 1.234,56
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-muted">
          Nº da Nota
          <input className={campo} value={numeroNota} onChange={(e) => setNumeroNota(e.target.value)} />
        </label>
        <label className="text-xs text-muted">
          Data da Nota
          <input className={campo} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="text-xs text-muted">
          Instituição / corretora
          <SelectCadastro
            sessao="instituicao"
            opcoes={listas.instituicao}
            value={instituicao}
            onChange={setInstituicao}
            required
          />
        </label>
        <label className="text-xs text-muted">
          Moeda
          <SelectCadastro sessao="moeda" opcoes={listas.moeda} value={moeda} onChange={setMoeda} required />
        </label>
        <label className="text-xs text-muted">
          Taxa liquidação (R$)
          <CampoValor className="h-9" value={taxaLiq} onChange={setTaxaLiq} />
        </label>
        <label className="text-xs text-muted">
          Total Bovespa (R$)
          <CampoValor className="h-9" value={bovespa} onChange={setBovespa} />
        </label>
        <label className="text-xs text-muted">
          Total corretagem (R$)
          <CampoValor className="h-9" value={corretagem} onChange={setCorretagem} />
        </label>
        <label className="text-xs text-muted">
          Taxas totais (opcional)
          <CampoValor className="h-9" value={taxasTotais} onChange={setTaxasTotais} />
        </label>
      </div>
      <div className="overflow-x-auto rounded-[12px] border border-border">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-bg text-muted">
            <tr>
              {["#", "Tipo", "Categoria", "Ticker", "Liquidez", "Qtd", "Valor total", "Taxas prop.", "%"].map(
                (h) => (
                  <th key={h} className="px-2 py-2">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {linhas.map((ln, idx) => {
              const prev = preview?.find(
                (p) =>
                  p.ticker === ln.ticker.trim().toUpperCase() &&
                  Math.abs(p.valor - parseNumeroBR(ln.valorTotal)) < 1e-6,
              );
              return (
                <tr key={idx} className="border-t border-border/60">
                  <td className="px-2 py-1 text-subtle">{idx + 1}</td>
                  <td className="px-1 py-1">
                    <SelectCadastro
                      opcoes={tipos}
                      value={ln.tipo}
                      onChange={(tipo) => setLinha(idx, { tipo })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <SelectCadastro
                      opcoes={cats}
                      value={ln.categoria}
                      onChange={(categoria) => setLinha(idx, { categoria })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      className={campo}
                      value={ln.ticker}
                      onChange={(e) => setLinha(idx, { ticker: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <SelectCadastro
                      opcoes={liqs}
                      value={ln.liquidez}
                      onChange={(liquidez) => setLinha(idx, { liquidez })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <CampoValor
                      className="h-9"
                      modo="qtd"
                      value={ln.quantidade}
                      onChange={(quantidade) => setLinha(idx, { quantidade })}
                      placeholder="100"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <CampoValor
                      className="h-9"
                      value={ln.valorTotal}
                      onChange={(valorTotal) => setLinha(idx, { valorTotal })}
                      placeholder="1.234,56"
                    />
                  </td>
                  <td className="px-2 py-1 text-muted">{prev ? formatNumeroBR(prev.taxaProp) : "—"}</td>
                  <td className="px-2 py-1 text-muted">{prev ? `${formatNumeroBR(prev.pct, 1)}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void confirmar()}>
          {busy ? "Lançando…" : "Confirmar e lançar nota"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setLinhas(Array.from({ length: MAX }, vazia))}>
          Limpar painel
        </Button>
      </div>
      {msg ? <p className="text-[12px] text-gain">{msg}</p> : null}
      {erro ? <p className="text-[12px] text-loss">{erro}</p> : null}
    </div>
  );
}
