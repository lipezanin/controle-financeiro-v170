/**
 * Nota de corretagem única: origem nacional ou internacional.
 * Começa com uma ordem. O botão adiciona até 100. Taxas nacionais rateadas;
 * na origem internacional, R$, IOF e spread definem a cotação efetiva.
 */
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CampoValor } from "@/components/campo-valor";
import { SelectCadastro } from "@/components/select-cadastro";
import { TickerCampo } from "@/components/ticker-campo";
import { Button } from "@/components/ui/button";
import { useCadastros } from "@/hooks/use-cadastro";
import { dolarNaData } from "@/services/cambio-service";
import { saldoCambio, type SaldoCambio } from "@/services/caixa-cambio-service";
import { lancarNotaCorretagem, lancarNotaInternacional } from "@/services/lancamento-service";
import { formatNumeroBR, parseNumeroBR } from "@/utils/numeros-br";

const MAX = 100;

type Origem = "Nacional" | "Internacional";

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

function linhaVazia(origem: Origem, tipos: string[], cats: string[], liqs: string[]): Linha {
  const intl = origem === "Internacional";
  return {
    tipo: tipos.includes("Compra") ? "Compra" : (tipos[0] ?? "Compra"),
    categoria: intl
      ? cats.includes("Stocks")
        ? "Stocks"
        : (cats[0] ?? "Stocks")
      : cats.includes("Ações")
        ? "Ações"
        : (cats[0] ?? "Ações"),
    ticker: "",
    liquidez: liqs.includes("D+2") ? "D+2" : (liqs[0] ?? "D+2"),
    quantidade: "",
    valorTotal: "",
  };
}

export function NotaCorretagem({
  onOk,
  origemInicial = "Nacional",
}: {
  onOk?: () => void;
  origemInicial?: Origem;
}) {
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
    : ["Ações", "Fundos Imobiliários", "ETF Brasil", "BDR", "Stocks", "ETF USA", "Reits"];
  const liqs = listas.liquidez?.length ? listas.liquidez : ["D+2"];

  const [origem, setOrigem] = useState<Origem>(origemInicial);
  const [numeroNota, setNumeroNota] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [instituicao, setInstituicao] = useState("XP Inc");
  const [moeda, setMoeda] = useState(origemInicial === "Internacional" ? "USD" : "BRL");
  const [taxaLiq, setTaxaLiq] = useState("0");
  const [bovespa, setBovespa] = useState("0");
  const [corretagem, setCorretagem] = useState("0");
  const [taxasTotais, setTaxasTotais] = useState("0");
  const [valorBrl, setValorBrl] = useState("");
  const [iof, setIof] = useState("");
  const [spread, setSpread] = useState("");
  const [fonteUsd, setFonteUsd] = useState<"caixa" | "nota">("caixa");
  const [saldoUsd, setSaldoUsd] = useState<SaldoCambio | null>(null);
  const [ptax, setPtax] = useState<number | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>(() => [linhaVazia(origemInicial, tipos, cats, liqs)]);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [geracao, setGeracao] = useState(0);

  const intl = origem === "Internacional";

  useEffect(() => {
    if (!intl) {
      setPtax(null);
      return;
    }
    void dolarNaData(data)
      .then((c) => setPtax(c?.venda ?? null))
      .catch(() => setPtax(null));
    void saldoCambio("USD")
      .then(setSaldoUsd)
      .catch(() => setSaldoUsd(null));
  }, [data, intl, geracao]);

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
    if (intl) {
      if (fonteUsd === "caixa") {
        const pm = saldoUsd?.precoMedio ?? 0;
        if (pm <= 0) return null;
        return {
          fx: pm,
          linhas: ordens.map((o) => ({ ...o, taxaProp: 0, pct: (o.valor / soma) * 100 })),
        };
      }
      const brl = parseNumeroBR(valorBrl);
      if (brl <= 0) return null;
      return {
        fx: brl / soma,
        linhas: ordens.map((o) => ({ ...o, taxaProp: 0, pct: (o.valor / soma) * 100 })),
      };
    }
    const taxas =
      parseNumeroBR(taxasTotais) ||
      parseNumeroBR(taxaLiq) + parseNumeroBR(bovespa) + parseNumeroBR(corretagem);
    return {
      fx: null as number | null,
      linhas: ordens.map((o) => ({
        ...o,
        taxaProp: taxas * (o.valor / soma),
        pct: (o.valor / soma) * 100,
      })),
    };
  }, [linhas, taxasTotais, taxaLiq, bovespa, corretagem, intl, valorBrl, fonteUsd, saldoUsd]);

  function limparPainel() {
    setNumeroNota("");
    setData(new Date().toISOString().slice(0, 10));
    setTaxaLiq("0");
    setBovespa("0");
    setCorretagem("0");
    setTaxasTotais("0");
    setValorBrl("");
    setIof("");
    setSpread("");
    setLinhas([linhaVazia(origem, tipos, cats, liqs)]);
    setMsg(null);
    setErro(null);
    setGeracao((g) => g + 1);
  }

  function setLinha(i: number, patch: Partial<Linha>) {
    setLinhas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function adicionar() {
    setLinhas((prev) => (prev.length >= MAX ? prev : [...prev, linhaVazia(origem, tipos, cats, liqs)]));
  }

  async function confirmar() {
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      const preenchidas = linhas.filter((l) => l.ticker.trim());
      if (intl) {
        const r = await lancarNotaInternacional(
          {
            numeroNota,
            data,
            instituicao,
            valorInvestidoBrl: valorBrl,
            iofBrl: iof,
            spreadBrl: spread,
            cotacaoPtax: ptax ?? undefined,
            fonte: fonteUsd,
          },
          preenchidas.map((l) => ({ ...l, valorUsd: l.valorTotal })),
        );
        setMsg(
          `Nota internacional lançada: ${r.n} ordem(ns). Cotação efetiva ${formatNumeroBR(r.cotacaoEfetiva, 4)}.`,
        );
      } else {
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
          preenchidas,
        );
        setMsg(`Nota ${numeroNota || "(sem número)"} lançada: ${n} ordem(ns).`);
      }
      onOk?.();
      if (window.confirm("Nota lançada. Limpar o painel e iniciar uma nova nota?")) limparPainel();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao lançar nota");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[16px] border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-fg">Nota de negociação — até {MAX} ordens</h3>
      <p className="text-[12px] text-muted">
        Começa com uma ordem. Adicione as próximas abaixo. Uma nota nacional rateia as taxas. No exterior, o padrão
        é usar o dólar que já está no câmbio. Se a compra da moeda foi nesta mesma nota, informe R$, IOF e spread.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-muted">
          Origem
          <select
            className={campo}
            value={origem}
            onChange={(e) => {
              const nova = e.target.value === "Internacional" ? "Internacional" : "Nacional";
              setOrigem(nova);
              setMoeda(nova === "Internacional" ? "USD" : "BRL");
            }}
          >
            <option value="Nacional">Nacional</option>
            <option value="Internacional">Internacional</option>
          </select>
        </label>
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
        {intl ? (
          <>
            <label className="text-xs text-muted">
              Dólar da nota
              <select
                className={campo}
                value={fonteUsd}
                onChange={(e) => setFonteUsd(e.target.value === "nota" ? "nota" : "caixa")}
              >
                <option value="caixa">Já está na conta</option>
                <option value="nota">Comprei o dólar nesta nota</option>
              </select>
            </label>
            {fonteUsd === "caixa" ? (
              <label className="text-xs text-muted sm:col-span-2">
                Saldo no câmbio
                <input
                  className={campo}
                  readOnly
                  value={
                    saldoUsd
                      ? `US$ ${formatNumeroBR(saldoUsd.quantidade, 2)} · médio R$ ${formatNumeroBR(saldoUsd.precoMedio, 4)}`
                      : "—"
                  }
                />
              </label>
            ) : (
              <>
                <label className="text-xs text-muted">
                  Valor investido (R$)
                  <CampoValor className="h-9" value={valorBrl} onChange={setValorBrl} />
                </label>
                <label className="text-xs text-muted">
                  IOF pago (R$)
                  <CampoValor className="h-9" value={iof} onChange={setIof} />
                </label>
                <label className="text-xs text-muted">
                  Spread bancário (R$)
                  <CampoValor className="h-9" value={spread} onChange={setSpread} />
                </label>
              </>
            )}
            <label className="text-xs text-muted">
              {fonteUsd === "caixa" ? "Custo médio usado (R$ / US$)" : "Cotação efetiva (R$ / US$)"}
              <input className={campo} readOnly value={preview?.fx ? formatNumeroBR(preview.fx, 4) : "—"} />
            </label>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
      <div className="overflow-x-auto rounded-[12px] border border-border">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-bg text-muted">
            <tr>
              {["#", "Tipo", "Categoria", "Ticker", "Liquidez", "Qtd", intl ? "Valor USD" : "Valor total", intl ? "" : "Taxas prop.", "%", ""].map(
                (h, i) => (
                  <th key={i} className="px-2 py-2">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {linhas.map((ln, idx) => {
              const prev = preview?.linhas.find(
                (p) =>
                  p.ticker === ln.ticker.trim().toUpperCase() &&
                  Math.abs(p.valor - parseNumeroBR(ln.valorTotal)) < 1e-6,
              );
              return (
                <tr key={`${geracao}-${idx}`} className="border-t border-border/60">
                  <td className="px-2 py-1 text-subtle">{idx + 1}</td>
                  <td className="px-1 py-1">
                    <SelectCadastro opcoes={tipos} value={ln.tipo} onChange={(tipo) => setLinha(idx, { tipo })} />
                  </td>
                  <td className="px-1 py-1">
                    <SelectCadastro
                      opcoes={cats}
                      value={ln.categoria}
                      onChange={(categoria) => setLinha(idx, { categoria })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <TickerCampo
                      value={ln.ticker}
                      onChange={(ticker) => setLinha(idx, { ticker })}
                      onCategoria={(categoria) => setLinha(idx, { categoria })}
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
                  <td className="px-2 py-1 text-muted">{!intl && prev ? formatNumeroBR(prev.taxaProp) : intl ? "" : "—"}</td>
                  <td className="px-2 py-1 text-muted">{prev ? `${formatNumeroBR(prev.pct, 1)}%` : "—"}</td>
                  <td className="px-1 py-1">
                    {linhas.length > 1 ? (
                      <button
                        type="button"
                        aria-label="Remover ordem"
                        className="flex size-8 items-center justify-center rounded-md text-loss hover:bg-loss/15"
                        onClick={() => setLinhas((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="flex items-center gap-2 text-sm text-accent hover:underline disabled:opacity-40"
        disabled={linhas.length >= MAX}
        onClick={adicionar}
      >
        <Plus className="size-4" />
        Adicionar transação
      </button>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void confirmar()}>
          {busy ? "Lançando…" : "Confirmar e lançar nota"}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={limparPainel}>
          Limpar painel
        </Button>
      </div>
      {msg ? <p className="text-[12px] text-gain">{msg}</p> : null}
      {erro ? <p className="text-[12px] text-loss">{erro}</p> : null}
    </div>
  );
}
