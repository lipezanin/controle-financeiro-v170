import { useMemo, useState } from "react";
import { compararSort, ThSort, type DirSort } from "@/components/th-sort";
import { formatBRL, formatPct, formatQtd } from "@/lib/financeiro/format";
import { cn } from "@/lib/utils";
import type { Posicao } from "@/services/investimento-service";

type Campo =
  | "ticker"
  | "tipo"
  | "emissor"
  | "liquidez"
  | "quantidade"
  | "precoMedio"
  | "aplicado"
  | "mercado"
  | "yoc"
  | "dy"
  | "renta"
  | "rentaPct";

function valor(p: Posicao, c: Campo): unknown {
  if (c === "ticker") return p.ticker;
  if (c === "tipo") return p.categoria;
  if (c === "emissor") return p.emissor;
  if (c === "liquidez") return p.liquidez;
  if (c === "quantidade") return p.quantidade;
  if (c === "precoMedio") return p.precoMedio;
  if (c === "aplicado") return p.valorInvestido;
  if (c === "mercado") return p.valorMercado ?? p.valorInvestido;
  if (c === "yoc") return p.yieldOnCost;
  if (c === "dy") return p.dividendYield;
  if (c === "rentaPct") return p.valorInvestido > 0 ? p.lucroProventos / p.valorInvestido : null;
  return p.lucroProventos;
}

export function TabelaCarteira({
  grupo,
  posicoes,
  onTicker,
}: {
  grupo: string;
  posicoes: Posicao[];
  onTicker: (ticker: string) => void;
}) {
  const [campo, setCampo] = useState<Campo | null>(null);
  const [dir, setDir] = useState<DirSort>("asc");
  const [aberto, setAberto] = useState(false);
  const ordenadas = useMemo(() => {
    if (!campo) return posicoes;
    return [...posicoes].sort((a, b) => compararSort(valor(a, campo), valor(b, campo), dir));
  }, [posicoes, campo, dir]);

  function clicar(c: string) {
    const k = c as Campo;
    if (campo === k) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setCampo(k);
      setDir("asc");
    }
  }

  return (
    <section className="mb-3">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-left"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
          {aberto ? "▾" : "▸"} {grupo}
        </span>
        <span className="text-xs text-subtle">{posicoes.length} ativos</span>
      </button>
      {aberto ? (
      <div className="mt-2 overflow-x-auto rounded-lg border border-border">
        <table className="zebra min-w-[1100px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <ThSort label="Ticker" campo="ticker" atual={campo} dir={dir} onClick={clicar} />
              <ThSort label="Tipo" campo="tipo" atual={campo} dir={dir} onClick={clicar} />
              <ThSort label="Emissor" campo="emissor" atual={campo} dir={dir} onClick={clicar} />
              <ThSort label="Liquidez" campo="liquidez" atual={campo} dir={dir} onClick={clicar} />
              <ThSort label="Qtd" campo="quantidade" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="Aplicado" campo="aplicado" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="Mercado" campo="mercado" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="YoC" campo="yoc" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="DY atual" campo="dy" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="Renta" campo="renta" atual={campo} dir={dir} onClick={clicar} align="right" />
              <ThSort label="Renta %" campo="rentaPct" atual={campo} dir={dir} onClick={clicar} align="right" />
            </tr>
          </thead>
          <tbody>
            {ordenadas.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-3 text-subtle">
                  (sem posições)
                </td>
              </tr>
            ) : (
              ordenadas.map((p) => (
                <tr key={p.chave}>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="font-medium text-accent hover:underline"
                      onClick={() => onTicker(p.ticker)}
                    >
                      {p.ticker}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-muted">{p.categoria}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-muted">{p.emissor ?? "—"}</td>
                  <td className="px-2 py-2 text-muted">{p.liquidez ?? "—"}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatQtd(p.quantidade)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatBRL(p.valorInvestido)}</td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right font-mono tabular",
                      (p.valorMercado ?? p.valorInvestido) >= p.valorInvestido ? "text-gain" : "text-loss",
                    )}
                  >
                    {formatBRL(p.valorMercado)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular">{formatPct(p.yieldOnCost, 2)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular text-accent">
                    {formatPct(p.dividendYield, 2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular">{formatBRL(p.lucroProventos)}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-mono tabular",
                      p.lucroProventos >= 0 ? "text-gain" : "text-loss",
                    )}
                  >
                    {formatPct(p.valorInvestido > 0 ? p.lucroProventos / p.valorInvestido : null, 2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      ) : null}
    </section>
  );
}
