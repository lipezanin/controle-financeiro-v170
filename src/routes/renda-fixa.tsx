import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CampoValor } from "@/components/campo-valor";
import { KpiCard } from "@/components/kpi-card";
import { SectionTitle } from "@/components/section-title";
import { Button } from "@/components/ui/button";
import { compararSort, ThSort, type DirSort } from "@/components/th-sort";
import { formatBRL, formatData, formatPct } from "@/lib/financeiro/format";
import { cn } from "@/lib/utils";
import { useMercadoAtualizado } from "@/hooks/use-mercado-atualizado";
import { useRecorteMercado } from "@/hooks/mercado-context";
import { passaRecorte } from "@/lib/financeiro/mercado";
import { atualizarTituloRf, excluirTituloRf, listarRendaFixa, resgatarParcialTituloRf, resgatarTituloRf, simularResgateParcial, type ResumoRf, type TituloRf } from "@/services/renda-fixa-service";
import { formatNumeroBR, parseNumeroBR } from "@/utils/numeros-br";

export const Route = createFileRoute("/renda-fixa")({
  component: Pagina,
});

function formatTaxa(indexador: string | null, taxa: number | null): string {
  if (taxa == null) return "—";
  const idx = (indexador ?? "").toUpperCase();
  if (idx.includes("CDI") || idx.includes("SELIC") || idx === "DI") {
    return `${(taxa * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% ${indexador}`;
  }
  return `${(taxa * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.a.`;
}

function campoRf(t: TituloRf, c: string): unknown {
  const mapa: Record<string, unknown> = {
    tipo: t.tipoRf,
    ticker: t.ticker ?? t.nome,
    emissor: t.emissor,
    indexador: t.indexador,
    taxa: t.taxa,
    aplicacao: t.dataAplicacao,
    vencimento: t.dataVencimento,
    liquidez: t.liquidez,
    amortizacao: t.amortizacao,
    aplicado: t.valorAplicado,
    mercado: t.valorMercado ?? t.valorAplicado,
    renta: t.rentabilidade,
    dias: t.diasCorridos,
    faltam: t.diasFaltantes,
    ir: t.irAteAgora,
    iof: t.iofAteAgora,
    liquido: t.valorLiquido,
    rentLiq: t.rentabilidadeLiquida,
    carga: t.cargaTributaria,
  };
  return mapa[c];
}

function Pagina() {
  const { recorte } = useRecorteMercado();
  const [r, setR] = useState<ResumoRf | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [campo, setCampo] = useState<string | null>(null);
  const [dir, setDir] = useState<DirSort>("asc");
  const [liqId, setLiqId] = useState<number | null>(null);
  const [liqData, setLiqData] = useState("");
  const [liqValor, setLiqValor] = useState("");
  const [liqIr, setLiqIr] = useState("");
  const [liqMsg, setLiqMsg] = useState<string | null>(null);
  const [resgId, setResgId] = useState<number | null>(null);
  const [resgData, setResgData] = useState("");
  const [resgBruto, setResgBruto] = useState("");
  const [edit, setEdit] = useState<TituloRf | null>(null);
  const [editValor, setEditValor] = useState("");

  const carregar = useCallback(async () => {
    try {
      setR(await listarRendaFixa());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler renda fixa");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useMercadoAtualizado(() => {
    void carregar();
  });

  const titulos = useMemo(() => {
    const lista = (r?.titulos ?? []).filter((t) => passaRecorte(recorte, t.tipoRf, t.origem));
    if (!campo) return lista;
    return [...lista].sort((a, b) => compararSort(campoRf(a, campo), campoRf(b, campo), dir));
  }, [r, campo, dir, recorte]);

  function clicar(c: string) {
    if (campo === c) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setCampo(c);
      setDir("asc");
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Módulo"
        title="Renda fixa · CDB, LCA e Tesouro"
        description="Mesma tabela da aba RENDA FIXA. Valor de mercado é recalculado automaticamente a cada 10 min com CDI diário (SGS 12) e IPCA (SGS 433). Clique no cabeçalho para ordenar."
      />

      {erro ? <p className="mb-4 text-sm text-loss">{erro}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Títulos ativos" value={String(r?.nAtivos ?? "—")} />
        <KpiCard label="Valor aplicado (custo)" value={formatBRL(r?.aplicado)} />
        <KpiCard label="Valor de mercado" value={formatBRL(r?.mercado)} tom="accent" />
        <KpiCard
          label="Rentabilidade (não realizada)"
          value={formatPct(r?.rentabilidade, 2)}
          tom={(r?.lucro ?? 0) >= 0 ? "gain" : "loss"}
          hint={formatBRL(r?.lucro)}
        />
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Por indexador
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(r?.porIndexador ?? []).map((i) => (
          <KpiCard
            key={i.indexador}
            label={i.indexador}
            value={formatBRL(i.mercado)}
            hint={`Custo ${formatBRL(i.aplicado)}`}
          />
        ))}
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Carteira de renda fixa
      </p>
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="zebra min-w-[1680px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <ThSort label="Ticker / nome" campo="ticker" atual={campo} dir={dir} onClick={clicar} className="sticky left-0 bg-surface-2" />
              <ThSort label="Tipo" campo="tipo" atual={campo} dir={dir} onClick={clicar} />
              <ThSort label="Emissor" campo="emissor" atual={campo} dir={dir} onClick={clicar} />
              <ThSort label="Indexador" campo="indexador" atual={campo} dir={dir} onClick={clicar} />
              <ThSort label="Taxa" campo="taxa" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="Aplicação" campo="aplicacao" atual={campo} dir={dir} onClick={clicar} />
              <ThSort label="Vencimento" campo="vencimento" atual={campo} dir={dir} onClick={clicar} />
              <ThSort label="Liquidez" campo="liquidez" atual={campo} dir={dir} onClick={clicar} />
              <ThSort label="Amortização" campo="amortizacao" atual={campo} dir={dir} onClick={clicar} />
              <ThSort label="Aplicado" campo="aplicado" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="Mercado" campo="mercado" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="Renta bruta" campo="renta" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="Dias" campo="dias" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="Faltam" campo="faltam" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="IR até hoje" campo="ir" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="IOF até hoje" campo="iof" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="Líquido hoje" campo="liquido" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="Renta líq." campo="rentLiq" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="Carga trib." campo="carga" atual={campo} dir={dir} onClick={clicar} align="right" />
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {titulos.map((t) => (
              <tr key={t.id}>
                <td className="sticky left-0 bg-surface px-3 py-2 font-medium">
                  {t.ticker ?? t.nome ?? "—"}
                </td>
                <td className="px-2 py-2">{t.tipoRf ?? "—"}</td>
                <td className="max-w-[180px] truncate px-2 py-2 text-muted">{t.emissor ?? "—"}</td>
                <td className="px-2 py-2">{t.indexador ?? "—"}</td>
                <td className="px-2 py-2 text-right font-mono tabular">{formatTaxa(t.indexador, t.taxa)}</td>
                <td className="px-2 py-2 font-mono tabular">{formatData(t.dataAplicacao)}</td>
                <td className="px-2 py-2 font-mono tabular">{formatData(t.dataVencimento)}</td>
                <td className="px-2 py-2 text-muted">{t.liquidez ?? "—"}</td>
                <td className="px-2 py-2">{t.amortizacao ?? "—"}</td>
                <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(t.valorAplicado)}</td>
                <td className="px-2 py-2 text-right font-mono tabular text-accent">
                  {formatBRL(t.valorMercado)}
                </td>
                <td
                  className={cn(
                    "px-2 py-2 text-right font-mono tabular",
                    (t.rentabilidade ?? 0) >= 0 ? "text-gain" : "text-loss",
                  )}
                >
                  {formatPct(t.rentabilidade, 2)}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular">{t.diasCorridos}</td>
                <td className="px-2 py-2 text-right font-mono tabular">{t.diasFaltantes ?? "—"}</td>
                <td className="px-2 py-2 text-right font-mono tabular">
                  {formatBRL(t.irAteAgora)}
                  <span className="block text-[10px] text-subtle">{formatPct(t.aliquotaIr, 1)}</span>
                </td>
                <td className="px-2 py-2 text-right font-mono tabular">
                  {formatBRL(t.iofAteAgora)}
                  <span className="block text-[10px] text-subtle">{formatPct(t.aliquotaIof, 0)}</span>
                </td>
                <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(t.valorLiquido)}</td>
                <td className="px-2 py-2 text-right font-mono tabular">{formatPct(t.rentabilidadeLiquida, 2)}</td>
                <td className="px-2 py-2 text-right font-mono tabular text-warn">{formatPct(t.cargaTributaria, 2)}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <button
                    type="button"
                    className="mr-2 text-accent"
                    onClick={() => {
                      setEdit(t);
                      setEditValor(formatNumeroBR(t.valorAplicado));
                    }}
                  >
                    Editar
                  </button>
                  <button type="button" className="mr-2 text-loss" onClick={() => void excluirTituloRf(t.id).then(carregar)}>
                    Excluir
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setResgId(t.id);
                      setLiqId(null);
                      setResgData(new Date().toISOString().slice(0, 10));
                      setResgBruto("");
                      setLiqMsg(null);
                    }}
                  >
                    Resgate
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setLiqId(t.id);
                      setLiqData(t.dataVencimento ?? new Date().toISOString().slice(0, 10));
                      setLiqValor("");
                      setLiqIr("");
                      setLiqMsg(null);
                      setResgId(null);
                    }}
                  >
                    Liquidar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit ? (
        <form
          className="mt-4 grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void atualizarTituloRf(edit.id, {
              dataAplicacao: (edit.dataAplicacao ?? "").slice(0, 10),
              valorAplicado: parseNumeroBR(editValor),
              ticker: edit.ticker ?? edit.nome ?? "",
              emissor: edit.emissor ?? "",
            }).then(async () => {
              setEdit(null);
              await carregar();
            });
          }}
        >
          <label className="text-xs text-muted">Aplicação
            <input type="date" className="mt-1 h-9 w-full rounded-md border border-input-border bg-input px-2 text-sm" value={(edit.dataAplicacao ?? "").slice(0, 10)} onChange={(e) => setEdit({ ...edit, dataAplicacao: e.target.value })} />
          </label>
          <label className="text-xs text-muted">Ticker
            <input className="mt-1 h-9 w-full rounded-md border border-input-border bg-input px-2 text-sm" value={edit.ticker ?? ""} onChange={(e) => setEdit({ ...edit, ticker: e.target.value })} />
          </label>
          <label className="text-xs text-muted">Emissor
            <input className="mt-1 h-9 w-full rounded-md border border-input-border bg-input px-2 text-sm" value={edit.emissor ?? ""} onChange={(e) => setEdit({ ...edit, emissor: e.target.value })} />
          </label>
          <label className="text-xs text-muted">Valor aplicado
            <CampoValor value={editValor} onChange={setEditValor} />
          </label>
          <div className="flex gap-2 lg:col-span-4">
            <Button type="submit">Salvar</Button>
            <Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button>
          </div>
        </form>
      ) : null}
      {resgId != null ? (
        <form
          className="mt-4 grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const id = resgId;
            void resgatarParcialTituloRf(id, resgData, parseNumeroBR(resgBruto))
              .then(async (s) => {
                setLiqMsg(
                  `Resgate parcial lançado. Líquido ${formatBRL(s.liquido)}. Principal que ficou ${formatBRL(s.principalFica)}.${s.isento ? " Título isento de IR." : " O rendimento entrou no IRPFM."}`,
                );
                setResgId(null);
                await carregar();
              })
              .catch((err: unknown) => setLiqMsg(err instanceof Error ? err.message : "Falha no resgate"));
          }}
        >
          <div className="sm:col-span-2 lg:col-span-4 text-sm text-muted">
            <p>
              Resgate parcial de {titulos.find((t) => t.id === resgId)?.ticker ?? "título"}. Informe o valor bruto
              que saiu do título, antes de IR e IOF.
            </p>
            <p className="mt-1 text-xs">
              A lei não separa “só juros” ou “só principal”. A fração resgatada leva a mesma fração dos dois.
              IR (Lei 11.033/2004) e IOF (Decreto 6.306/2007) incidem só sobre o rendimento. LCI, LCA, CRI, CRA,
              debênture incentivada e poupança não pagam IR.
            </p>
          </div>
          <label className="text-xs text-muted">
            Data do resgate
            <input
              type="date"
              required
              value={resgData}
              onChange={(e) => setResgData(e.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-input-border bg-input px-3 text-sm text-fg"
            />
          </label>
          <label className="text-xs text-muted">
            Valor bruto resgatado
            <CampoValor value={resgBruto} onChange={setResgBruto} />
          </label>
          <PreviaResgate id={resgId} titulos={titulos} data={resgData} bruto={resgBruto} />
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm">
              Confirmar resgate
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setResgId(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}
      {liqId != null ? (
        <form
          className="mt-4 grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const id = liqId;
            void resgatarTituloRf(id, liqData, parseNumeroBR(liqValor), parseNumeroBR(liqIr))
              .then(async (r) => {
                setLiqMsg(
                  `Posição zerada em ${liqData}. Lucro líquido ${formatBRL(r.lucro)} entrou no IRPFM.`,
                );
                setLiqId(null);
                await carregar();
              })
              .catch((err: unknown) => setLiqMsg(err instanceof Error ? err.message : "Falha ao liquidar"));
          }}
        >
          <p className="sm:col-span-2 lg:col-span-4 text-sm text-muted">
            Liquidar {titulos.find((t) => t.id === liqId)?.ticker ?? "título"}. Informe o líquido que caiu na conta
            na data do crédito. O lucro (líquido − aplicado) entra no IRPFM; o principal deixa a carteira.
          </p>
          <label className="text-xs text-muted">
            Data do crédito
            <input
              type="date"
              required
              value={liqData}
              onChange={(e) => setLiqData(e.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-input-border bg-input px-3 text-sm text-fg"
            />
          </label>
          <label className="text-xs text-muted">
            Valor líquido recebido
            <CampoValor value={liqValor} onChange={setLiqValor} />
          </label>
          <label className="text-xs text-muted">
            IR já retido (se houver)
            <CampoValor value={liqIr} onChange={setLiqIr} />
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm">
              Confirmar liquidação
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setLiqId(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}
      {liqMsg ? <p className="mt-3 text-sm text-muted">{liqMsg}</p> : null}
    </div>
  );
}

function PreviaResgate({
  id,
  titulos,
  data,
  bruto,
}: {
  id: number;
  titulos: TituloRf[];
  data: string;
  bruto: string;
}) {
  const titulo = titulos.find((t) => t.id === id);
  const valor = parseNumeroBR(bruto);
  if (!titulo || !(valor > 0) || !data) return null;
  let sim;
  try {
    sim = simularResgateParcial({
      dataAplicacao: titulo.dataAplicacao,
      data,
      valorAplicado: titulo.valorAplicado,
      valorMercado: titulo.valorMercado,
      valorBruto: valor,
      isento: titulo.isencaoIr,
    });
  } catch (e) {
    return (
      <p className="sm:col-span-2 lg:col-span-4 text-xs text-loss">
        {e instanceof Error ? e.message : "Não foi possível calcular o resgate."}
      </p>
    );
  }
  return (
    <div className="sm:col-span-2 lg:col-span-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      <p>Fração: {formatPct(sim.fracao, 2)}</p>
      <p>Principal que sai: {formatBRL(sim.principalSai)}</p>
      <p>Rendimento: {formatBRL(sim.rendimento)}</p>
      <p>IOF ({formatPct(sim.aliquotaIof, 0)}): {formatBRL(sim.iof)}</p>
      <p>IR ({sim.isento ? "isento" : formatPct(sim.aliquotaIr, 1)}): {formatBRL(sim.ir)}</p>
      <p>Líquido: {formatBRL(sim.liquido)}</p>
      <p>Principal que fica: {formatBRL(sim.principalFica)}</p>
      <p>Dias corridos: {sim.dias}</p>
    </div>
  );
}
