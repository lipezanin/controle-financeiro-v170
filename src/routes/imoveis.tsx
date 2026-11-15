import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useState } from "react";
import { FormAquisicaoImovel, FormCustoImovel, FormManutencaoImovel } from "@/components/form-imovel";
import { GraficoComposicao, GraficoDonut } from "@/components/graficos-financeiro";
import { KpiCard } from "@/components/kpi-card";
import { SectionTitle } from "@/components/section-title";
import { rotuloOrdem, useOrdenacao } from "@/hooks/use-ordenacao";
import { useMercadoAtualizado } from "@/hooks/use-mercado-atualizado";
import { formatBRL, formatPct } from "@/lib/financeiro/format";
import { cn } from "@/lib/utils";
import { listarPainelImoveis, type PainelImovel } from "@/services/imovel-service";

const ABAS = ["painel", "aquisicao", "custo", "manutencao"] as const;
type Aba = (typeof ABAS)[number];

export const Route = createFileRoute("/imoveis")({
  validateSearch: (s: Record<string, unknown>) => ({
    aba: (ABAS.includes(String(s.aba) as Aba) ? s.aba : "painel") as Aba,
  }),
  component: Pagina,
});

function Pagina() {
  const { aba } = Route.useSearch();
  const [linhas, setLinhas] = useState<PainelImovel[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLinhas(await listarPainelImoveis());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler imóveis");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);
  useMercadoAtualizado(() => {
    void carregar();
  });

  const ativos = linhas.filter((l) => l.quantidade === 1);
  const custo = ativos.reduce((s, l) => s + l.custo, 0);
  const ganho = linhas.reduce((s, l) => s + l.ganhoRealizado, 0);
  const [aberto, setAberto] = useState<string | null>(null);
  const ordem = useOrdenacao<"imovel" | "qtd" | "custo" | "pct" | "parcelas" | "juros" | "impostos" | "corretagem" | "reforma" | "manutencao" | "doacao">("imovel");
  const tabela = ordem.ordenar(linhas, (l, k) => {
    if (k === "imovel") return l.ticker;
    if (k === "qtd") return l.quantidade;
    if (k === "custo") return l.custo;
    if (k === "pct") return custo ? l.custo / custo : 0;
    if (k === "parcelas") return l.parcela;
    if (k === "juros") return l.correcao;
    if (k === "impostos") return l.impostos;
    if (k === "corretagem") return l.corretagem;
    if (k === "reforma") return l.reforma;
    if (k === "manutencao") return l.manutencao;
    return l.doacaoHeranca;
  });
  const composicao = ativos.map((l) => ({ classe: l.ticker, valor: l.custo }));
  const partes = [
    { classe: "Parcelas", valor: ativos.reduce((s, l) => s + l.parcela, 0) },
    { classe: "Juros", valor: ativos.reduce((s, l) => s + l.correcao, 0) },
    { classe: "Impostos", valor: ativos.reduce((s, l) => s + l.impostos, 0) },
    { classe: "Corretagem", valor: ativos.reduce((s, l) => s + l.corretagem, 0) },
    { classe: "Reforma", valor: ativos.reduce((s, l) => s + l.reforma, 0) },
    { classe: "Manutenção", valor: ativos.reduce((s, l) => s + l.manutencao, 0) },
    { classe: "Doação / herança", valor: ativos.reduce((s, l) => s + l.doacaoHeranca, 0) },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Módulo"
        title="Imóveis"
        description="Cada identificador é um imóvel só. Parcelas, impostos, corretagem, reforma e manutenção somam no custo. A quantidade fica 1 até a venda ou a doação."
      />
      {erro ? <p className="mb-4 text-sm text-loss">{erro}</p> : null}

      {aba === "painel" ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard label="Imóveis na carteira" value={String(ativos.length)} />
            <KpiCard label="Custo total" value={formatBRL(custo)} hint="Base para o ganho de capital. Não é valor de mercado." />
            <KpiCard label="Ganho realizado" value={formatBRL(ganho)} hint="Vendas e doações já feitas. Fora da base mensal do IRPFM." />
          </div>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[16px] border border-border bg-surface p-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Composição da carteira</p>
              <GraficoDonut dados={composicao} titulo="Custo por imóvel" />
            </div>
            <div className="rounded-[16px] border border-border bg-surface p-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">De onde vem o custo</p>
              <GraficoComposicao dados={partes} />
            </div>
          </div>
          <div className="overflow-x-auto rounded-[16px] border border-border">
            <table className="zebra min-w-[920px] w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  <th className="px-3 py-2.5"><button type="button" onClick={() => ordem.toggle("imovel")}>Imóvel{rotuloOrdem(ordem.chave === "imovel", ordem.dir)}</button></th>
                  <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordem.toggle("qtd")}>Qtd{rotuloOrdem(ordem.chave === "qtd", ordem.dir)}</button></th>
                  <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordem.toggle("custo")}>Custo{rotuloOrdem(ordem.chave === "custo", ordem.dir)}</button></th>
                  <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordem.toggle("pct")}>%{rotuloOrdem(ordem.chave === "pct", ordem.dir)}</button></th>
                  <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordem.toggle("parcelas")}>Parcelas{rotuloOrdem(ordem.chave === "parcelas", ordem.dir)}</button></th>
                  <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordem.toggle("juros")}>Juros{rotuloOrdem(ordem.chave === "juros", ordem.dir)}</button></th>
                  <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordem.toggle("impostos")}>Impostos{rotuloOrdem(ordem.chave === "impostos", ordem.dir)}</button></th>
                  <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordem.toggle("corretagem")}>Corretagem{rotuloOrdem(ordem.chave === "corretagem", ordem.dir)}</button></th>
                  <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordem.toggle("reforma")}>Reforma{rotuloOrdem(ordem.chave === "reforma", ordem.dir)}</button></th>
                  <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordem.toggle("manutencao")}>Manutenção{rotuloOrdem(ordem.chave === "manutencao", ordem.dir)}</button></th>
                  <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordem.toggle("doacao")}>Doação / herança{rotuloOrdem(ordem.chave === "doacao", ordem.dir)}</button></th>
                </tr>
              </thead>
              <tbody>
                {tabela.map((l) => {
                  const abertoEste = aberto === l.ticker;
                  const aquisicao = l.parcela + l.correcao + l.doacaoHeranca;
                  const manutencao = l.reforma + l.manutencao;
                  const taxas = l.impostos + l.corretagem;
                  return (
                    <Fragment key={l.ticker}>
                      <tr key={l.ticker} className={cn(l.quantidade === 0 && "text-subtle")}>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="text-left text-fg"
                            onClick={() => setAberto(abertoEste ? null : l.ticker)}
                          >
                            {abertoEste ? "▾" : "▸"} {l.ticker}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{l.quantidade}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatBRL(l.custo)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatPct(custo ? l.custo / custo : 0)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatBRL(l.parcela)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatBRL(l.correcao)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatBRL(l.impostos)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatBRL(l.corretagem)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatBRL(l.reforma)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatBRL(l.manutencao)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatBRL(l.doacaoHeranca)}</td>
                      </tr>
                      {abertoEste ? (
                        <tr key={`${l.ticker}-comp`} className="bg-surface-2/60">
                          <td colSpan={11} className="px-3 py-3">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                              <p className="text-xs text-muted">Custo de aquisição <span className="ml-2 font-mono text-fg">{formatBRL(aquisicao)}</span></p>
                              <p className="text-xs text-muted">Manutenção <span className="ml-2 font-mono text-fg">{formatBRL(manutencao)}</span></p>
                              <p className="text-xs text-muted">Taxas / impostos <span className="ml-2 font-mono text-fg">{formatBRL(taxas)}</span></p>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {aba === "aquisicao" ? <FormAquisicaoImovel onOk={() => void carregar()} /> : null}
      {aba === "custo" ? <FormCustoImovel onOk={() => void carregar()} /> : null}
      {aba === "manutencao" ? <FormManutencaoImovel onOk={() => void carregar()} /> : null}
    </div>
  );
}
