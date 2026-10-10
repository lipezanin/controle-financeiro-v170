import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCard } from "@/components/kpi-card";
import { SectionTitle } from "@/components/section-title";
import { compararSort, ThSort, type DirSort } from "@/components/th-sort";
import { formatBRL, formatData, formatPct } from "@/lib/financeiro/format";
import { cn } from "@/lib/utils";
import { useMercadoAtualizado } from "@/hooks/use-mercado-atualizado";
import { useRecorteMercado } from "@/hooks/mercado-context";
import { passaRecorte } from "@/lib/financeiro/mercado";
import { listarRendaFixa, type ResumoRf, type TituloRf } from "@/services/renda-fixa-service";

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
              <th className="sticky left-0 bg-surface-2 px-3 py-2.5">Ticker / nome</th>
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
              <th className="px-2 py-2.5 text-right">IR até hoje</th>
              <th className="px-2 py-2.5 text-right">IOF até hoje</th>
              <ThSort label="Líquido hoje" campo="liquido" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="Renta líq." campo="rentLiq" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="Carga trib." campo="carga" atual={campo} dir={dir} onClick={clicar} align="right" />
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
