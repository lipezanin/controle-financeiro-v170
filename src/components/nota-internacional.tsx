import { useEffect, useMemo, useState } from "react";
import { CampoValor } from "@/components/campo-valor";
import { SelectCadastro } from "@/components/select-cadastro";
import { Button } from "@/components/ui/button";
import { useCadastros } from "@/hooks/use-cadastro";
import { formatNumeroBR, parseNumeroBR } from "@/utils/numeros-br";
import { dolarNaData } from "@/services/cambio-service";
import { lancarNotaInternacional } from "@/services/lancamento-service";

const MAX = 20;
const CATS = ["Stocks", "ETF USA", "Reits"];
const campo =
  "h-9 w-full rounded-md border border-input-border bg-input px-2 text-[12px] text-fg";

type Linha = {
  tipo: string;
  categoria: string;
  ticker: string;
  quantidade: string;
  valorUsd: string;
};

export function NotaInternacional({ onOk }: { onOk?: () => void }) {
  const listas = useCadastros(["instituicao", "tipo_movimentacao", "liquidez"]);
  const tipos = listas.tipo_movimentacao?.length ? listas.tipo_movimentacao : ["Compra", "Venda"];
  const vazia = (): Linha => ({
    tipo: "Compra",
    categoria: "Stocks",
    ticker: "",
    quantidade: "",
    valorUsd: "",
  });
  const [numeroNota, setNumeroNota] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [instituicao, setInstituicao] = useState("");
  const [valorBrl, setValorBrl] = useState("");
  const [iof, setIof] = useState("");
  const [spread, setSpread] = useState("");
  const [ptax, setPtax] = useState<number | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>(() => Array.from({ length: MAX }, vazia));
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void dolarNaData(data).then((c) => setPtax(c?.venda ?? null)).catch(() => setPtax(null));
  }, [data]);

  const preview = useMemo(() => {
    const ordens = linhas
      .map((l) => ({
        ticker: l.ticker.trim().toUpperCase(),
        usd: parseNumeroBR(l.valorUsd),
        qtd: parseNumeroBR(l.quantidade),
      }))
      .filter((o) => o.ticker && o.usd > 0 && o.qtd > 0);
    const somaUsd = ordens.reduce((a, o) => a + o.usd, 0);
    const brl = parseNumeroBR(valorBrl);
    const iofN = parseNumeroBR(iof);
    const spr = parseNumeroBR(spread);
    if (!somaUsd || brl <= 0) return null;
    return {
      somaUsd,
      brl,
      iof: iofN,
      spread: spr,
      custo: brl + iofN + spr,
      fx: brl / somaUsd,
      n: ordens.length,
    };
  }, [linhas, valorBrl, iof, spread]);

  async function confirmar() {
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      const r = await lancarNotaInternacional(
        {
          numeroNota,
          data,
          instituicao,
          valorInvestidoBrl: valorBrl,
          iofBrl: iof,
          spreadBrl: spread,
          cotacaoPtax: ptax ?? undefined,
        },
        linhas.filter((l) => l.ticker.trim()),
      );
      setMsg(
        `${r.n} ordem(ns). Cotação efetiva ${formatNumeroBR(r.cotacaoEfetiva, 4)} · custo ${formatNumeroBR(r.custoTotalBrl, 2)}`,
      );
      setLinhas(Array.from({ length: MAX }, vazia));
      onOk?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na nota internacional");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[16px] border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-fg">Nota internacional — Renda variável</h3>
      <p className="text-[12px] text-muted">
        Ordens em USD. No cabeçalho: R$ da conversão, IOF e spread. Cotação efetiva = R$ conversão ÷ USD
        da nota. Custo do ativo = conversão + IOF + spread. IRPFM usa as mesmas regras do tipo.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-muted">
          Nº da nota
          <input className={campo} value={numeroNota} onChange={(e) => setNumeroNota(e.target.value)} />
        </label>
        <label className="text-xs text-muted">
          Data
          <input className={campo} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="text-xs text-muted">
          Instituição
          <SelectCadastro
            sessao="instituicao"
            value={instituicao}
            onChange={setInstituicao}
            className={campo}
          />
        </label>
        <label className="text-xs text-muted">
          PTAX do dia (referência)
          <input className={campo} readOnly value={ptax ? formatNumeroBR(ptax, 4) : "—"} />
        </label>
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
        <label className="text-xs text-muted">
          Cotação efetiva
          <input
            className={campo}
            readOnly
            value={preview ? formatNumeroBR(preview.fx, 4) : "—"}
          />
        </label>
      </div>
      {preview ? (
        <p className="text-[12px] text-subtle">
          {preview.n} ordens · USD {formatNumeroBR(preview.somaUsd, 2)} · custo BRL{" "}
          {formatNumeroBR(preview.custo, 2)}
          {ptax ? ` · spread vs PTAX ${formatNumeroBR(preview.fx - ptax, 4)}` : ""}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.12em] text-muted">
              <th className="px-1 py-1">Tipo</th>
              <th className="px-1 py-1">Categoria</th>
              <th className="px-1 py-1">Ticker</th>
              <th className="px-1 py-1">Qtd</th>
              <th className="px-1 py-1">Valor USD</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                <td className="px-1 py-0.5">
                  <select
                    className={campo}
                    value={l.tipo}
                    onChange={(e) =>
                      setLinhas((p) => p.map((x, idx) => (idx === i ? { ...x, tipo: e.target.value } : x)))
                    }
                  >
                    {tipos.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-0.5">
                  <select
                    className={campo}
                    value={l.categoria}
                    onChange={(e) =>
                      setLinhas((p) => p.map((x, idx) => (idx === i ? { ...x, categoria: e.target.value } : x)))
                    }
                  >
                    {CATS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-0.5">
                  <input
                    className={campo}
                    value={l.ticker}
                    onChange={(e) =>
                      setLinhas((p) =>
                        p.map((x, idx) => (idx === i ? { ...x, ticker: e.target.value.toUpperCase() } : x)),
                      )
                    }
                  />
                </td>
                <td className="px-1 py-0.5">
                  <CampoValor
                    className="h-9"
                    modo="qtd"
                    value={l.quantidade}
                    onChange={(v) =>
                      setLinhas((p) => p.map((x, idx) => (idx === i ? { ...x, quantidade: v } : x)))
                    }
                  />
                </td>
                <td className="px-1 py-0.5">
                  <CampoValor
                    className="h-9"
                    value={l.valorUsd}
                    onChange={(v) =>
                      setLinhas((p) => p.map((x, idx) => (idx === i ? { ...x, valorUsd: v } : x)))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {erro ? <p className="text-sm text-loss">{erro}</p> : null}
      {msg ? <p className="text-sm text-gain">{msg}</p> : null}
      <Button type="button" disabled={busy} onClick={() => void confirmar()}>
        {busy ? "Lançando…" : "Confirmar nota internacional"}
      </Button>
    </div>
  );
}
