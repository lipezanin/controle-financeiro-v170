import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GraficoPrecoAtivo, GraficoYoc, CardsClasse } from "@/components/graficos-financeiro";
import { KpiCard } from "@/components/kpi-card";
import { SectionTitle } from "@/components/section-title";
import { TabelaCarteira } from "@/components/tabela-carteira";
import { Button } from "@/components/ui/button";
import { formatBRL, formatData, formatPct, formatQtd } from "@/lib/financeiro/format";
import { cn } from "@/lib/utils";
import { usePeriodo } from "@/hooks/periodo-context";
import { useRecorteMercado } from "@/hooks/mercado-context";
import { passaRecorte } from "@/lib/financeiro/mercado";
import { useMercadoAtualizado } from "@/hooks/use-mercado-atualizado";
import { dataNoPeriodo } from "@/lib/financeiro/periodo";
import {
  consultarAtivo,
  listarCarteira,
  type Carteira,
  type ResumoAtivo,
} from "@/services/investimento-service";
import { evolucaoYoc, type PontoYoc } from "@/services/rentabilidade-service";
import { serieCotacao, cicloHistoricoNoturno, type PontoHistorico } from "@/services/historico-mercado-service";

export const Route = createFileRoute("/investimentos")({
  validateSearch: (s: Record<string, unknown>) => ({
    aba: s.aba === "inativa" ? ("inativa" as const) : ("ativa" as const),
  }),
  component: Pagina,
});

function Pagina() {
  const { aba: abaUrl } = Route.useSearch();
  const { periodo } = usePeriodo();
  const { recorte } = useRecorteMercado();
  const [carteira, setCarteira] = useState<Carteira | null>(null);
  const [aba, setAba] = useState<"ativa" | "inativa">(abaUrl);
  const [ticker, setTicker] = useState("BBAS3");
  const [consulta, setConsulta] = useState<ResumoAtivo | null>(null);
  const [yoc, setYoc] = useState<PontoYoc[]>([]);
  const [seriePreco, setSeriePreco] = useState<PontoHistorico[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);

  useEffect(() => {
    setAba(abaUrl);
  }, [abaUrl]);

  const recarregarLista = useCallback(() => {
    void listarCarteira()
      .then((c) => {
        setCarteira(c);
        setErroLista(null);
      })
      .catch((e: unknown) => {
        setErroLista(e instanceof Error ? e.message : "Falha ao ler a carteira");
      });
  }, []);

  useEffect(() => {
    recarregarLista();
  }, [recarregarLista]);

  const atualizar = useCallback(async (t: string) => {
    setTicker(t);
    setMsg(null);
    const r = await consultarAtivo(t);
    setConsulta(r);
    setYoc(r ? await evolucaoYoc(t) : []);
    setSeriePreco(await serieCotacao(t).catch(() => []));
    if (!r) setMsg(`Nenhuma operação encontrada para: ${t}`);
  }, []);

  useEffect(() => {
    void atualizar("BBAS3");
  }, [atualizar]);

  const recarregarMercado = useCallback(() => {
    recarregarLista();
    void atualizar(ticker);
  }, [atualizar, recarregarLista, ticker]);

  useMercadoAtualizado(recarregarMercado);

  const grupos = (aba === "ativa" ? carteira?.ativas : carteira?.inativas)
    ?.map((g) => ({
      ...g,
      posicoes: g.posicoes.filter((p) => passaRecorte(recorte, p.categoria)),
    }))
    .filter((g) => g.posicoes.length > 0);
  const nPos = useMemo(
    () => grupos?.reduce((s, g) => s + g.posicoes.length, 0) ?? 0,
    [grupos],
  );
  const bolsa = (grupos ?? []).filter((g) => g.grupo !== "Imóveis");
  const imoveis = (grupos ?? []).filter((g) => g.grupo === "Imóveis");
  const totBolsa = bolsa.reduce(
    (s, g) => {
      for (const p of g.posicoes) {
        s.custo += p.valorInvestido;
        s.mercado += p.valorMercado ?? p.valorInvestido;
        s.proventos += p.proventosLiq;
      }
      return s;
    },
    { custo: 0, mercado: 0, proventos: 0 },
  );
  const totImoveis = imoveis.reduce((s, g) => s + g.posicoes.reduce((a, p) => a + p.valorInvestido, 0), 0);
  const rentBolsa = totBolsa.custo ? (totBolsa.mercado - totBolsa.custo + totBolsa.proventos) / totBolsa.custo : null;

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Módulo"
        title="01 — Investimentos · Carteira e histórico"
        description="Carteira ativa e inativa por classe. Clique no ticker para abrir o mestre, com yield on cost e o histórico de até 40 operações."
      />
      {erroLista ? <p className="mb-4 text-sm text-loss">{erroLista}</p> : null}

      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        SESSÃO 4 — Histórico do ativo
      </p>
      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void atualizar(ticker);
        }}
      >
        <label className="text-sm text-muted" htmlFor="ticker-mestre">
          Ticker mestre
        </label>
        <input
          id="ticker-mestre"
          list="tickers-carteira"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          className="h-11 min-w-[8rem] rounded-md border border-input-border bg-input px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          autoComplete="off"
        />
        <datalist id="tickers-carteira">
          {(carteira?.tickers ?? []).map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <Button type="submit" size="sm">
          <Search className="size-3.5" />
          Atualizar histórico
        </Button>
        {msg ? <span className="text-sm text-warn">{msg}</span> : null}
      </form>

      {consulta ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Posição atual (qtd)" value={formatQtd(consulta.quantidade)} />
            <KpiCard label="Patrimônio / custo atual" value={formatBRL(consulta.valorInvestido)} />
            <KpiCard label="% na carteira total" value={formatPct(consulta.pctCarteira, 2)} />
            <KpiCard label="Preço médio" value={formatBRL(consulta.precoMedio)} />
            <KpiCard
              label="D.Y. (yield on cost)"
              value={formatPct(consulta.yieldOnCost, 2)}
              tom="gain"
            />
            <KpiCard
              label="Dividend yield atual (mercado)"
              value={formatPct(consulta.dividendYield, 2)}
              hint="Dividendos pagos em 12 meses ÷ cotação (Yahoo)"
            />
            <KpiCard label="Proventos acumulados (líq.)" value={formatBRL(consulta.proventosLiq)} />
            <KpiCard label="Lucro + proventos" value={formatBRL(consulta.lucroProventos)} />
            <KpiCard label="% na categoria" value={formatPct(consulta.pctCategoria, 1)} />
            <KpiCard label="Categoria" value={consulta.grupo} />
            <KpiCard label="Qtd de operações" value={String(consulta.qtdOperacoes)} />
            <KpiCard
              label="Último PM de venda"
              value={consulta.ultimaVendaPm != null ? formatBRL(consulta.ultimaVendaPm) : "—"}
            />
            <KpiCard
              label="Preço atual / mercado"
              value={consulta.precoAtual != null ? formatBRL(consulta.precoAtual) : "—"}
              hint={consulta.valorMercado != null ? formatBRL(consulta.valorMercado) : "Atualize posições no Dashboard"}
            />
            <KpiCard
              label="Dólar na compra (efetivo)"
              value={consulta.cotacaoCompra != null ? consulta.cotacaoCompra.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "—"}
              hint="Média das notas deste ticker"
            />
            <KpiCard
              label="PTAX atual"
              value={consulta.ptaxAtual != null ? consulta.ptaxAtual.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "—"}
              hint={
                consulta.cotacaoCompra && consulta.ptaxAtual
                  ? `Variação ${(((consulta.ptaxAtual - consulta.cotacaoCompra) / consulta.cotacaoCompra) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
                  : "Fechamento guardado no histórico local"
              }
            />
          </div>

          {seriePreco.length ? (
            <>
              <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                Fechamento desde a entrada na carteira
              </p>
              <div className="mb-8 rounded-[16px] border border-border bg-surface p-3">
                <GraficoPrecoAtivo dados={seriePreco.map((p) => ({ data: p.data, preco: p.valor }))} />
              </div>
            </>
          ) : (
            <p className="mb-6 mt-6 text-sm text-subtle">
              Sem série de fechamento ainda. Ela começa na primeira compra e para quando a posição zera.
              <button
                type="button"
                className="ml-2 text-accent underline"
                onClick={() => {
                  setMsg("Gravando fechamentos…");
                  void cicloHistoricoNoturno()
                    .then(async (t) => {
                      setMsg(t);
                      setSeriePreco(await serieCotacao(ticker));
                    })
                    .catch((e: unknown) => setMsg(e instanceof Error ? e.message : "Falha no histórico"));
                }}
              >
                Gravar agora
              </button>
            </p>
          )}

          {yoc.length ? (
            <>
              <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                Evolução do yield on cost
              </p>
              <div className="mb-8 rounded-[16px] border border-border bg-surface p-3">
                <GraficoYoc dados={yoc} />
              </div>
            </>
          ) : null}

          <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
            Histórico de operações (até 40)
          </p>
          <div className="mb-10 overflow-x-auto rounded-lg border border-border">
            <table className="zebra min-w-[640px] w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  <th className="px-3 py-2.5">Data</th>
                  <th className="px-3 py-2.5">Tipo</th>
                  <th className="px-3 py-2.5 text-right">Quantidade</th>
                  <th className="px-3 py-2.5 text-right">Preço da operação</th>
                  <th className="px-3 py-2.5 text-right">Valor total</th>
                </tr>
              </thead>
              <tbody>
                {consulta.historico.filter((h) => dataNoPeriodo(h.data, periodo)).map((h, i) => (
                  <tr key={`${h.data}-${h.tipo}-${i}`}>
                    <td className="px-3 py-2">{formatData(h.data)}</td>
                    <td className="px-3 py-2">{h.tipo}</td>
                    <td className="px-3 py-2 text-right font-mono tabular">{formatQtd(h.quantidade)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular">{formatBRL(h.preco)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular">{formatBRL(h.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Sessão 1 — Bolsa de valores
      </p>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Custo em bolsa" value={formatBRL(totBolsa.custo)} />
        <KpiCard label="Mercado" value={formatBRL(totBolsa.mercado)} />
        <KpiCard label="Proventos" value={formatBRL(totBolsa.proventos)} />
        <KpiCard label="Rentabilidade (mercado + proventos)" value={formatPct(rentBolsa, 2)} />
      </div>
      <div className="mb-8">
        <CardsClasse
          dados={bolsa.map((g) => {
            const valor = g.posicoes.reduce((s, p) => s + (p.valorMercado ?? p.valorInvestido), 0);
            const card = (carteira?.variacaoGrupos ?? []).find((v) => v.grupo === g.grupo);
            return {
              classe: g.grupo,
              valor,
              variacaoPct: card?.variacaoPct,
              variacaoReais: card?.variacaoReais,
            };
          })}
        />
      </div>

      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Sessão 2 — Imóveis
      </p>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiCard label="Custo dos imóveis" value={formatBRL(totImoveis)} hint="A rentabilidade real só aparece na venda." />
        <KpiCard label="Imóveis na carteira" value={String(imoveis.reduce((s, g) => s + g.posicoes.length, 0))} />
      </div>

      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        SESSÃO 3 — Carteira {aba === "ativa" ? "ativa (qtd > 0)" : "inativa / histórico"}
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={aba === "ativa" ? "default" : "secondary"}
          className={cn(aba === "ativa" && "pointer-events-none")}
          onClick={() => setAba("ativa")}
        >
          Ativa
        </Button>
        <Button
          type="button"
          size="sm"
          variant={aba === "inativa" ? "default" : "secondary"}
          onClick={() => setAba("inativa")}
        >
          Inativa
        </Button>
        <span className="self-center text-xs text-subtle">{nPos} posições</span>
      </div>

      <p className="mb-3 mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Bolsa</p>
      {bolsa.map((g) => (
        <TabelaCarteira
          key={g.grupo}
          grupo={g.grupo}
          posicoes={g.posicoes}
          onTicker={(t) => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            void atualizar(t);
          }}
        />
      ))}
      <p className="mb-3 mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Imóveis</p>
      {imoveis.map((g) => (
        <TabelaCarteira
          key={g.grupo}
          grupo={g.grupo}
          posicoes={g.posicoes}
          onTicker={(t) => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            void atualizar(t);
          }}
        />
      ))}
    </div>
  );
}
