import { useState, type FormEvent } from "react";
import { CampoValor } from "@/components/campo-valor";
import { SelectCadastro } from "@/components/select-cadastro";
import { Button } from "@/components/ui/button";
import { lancarTransacao } from "@/services/lancamento-service";
import { formatNumeroBR, parseNumeroBR } from "@/utils/numeros-br";

const campo = "h-11 w-full rounded-md border border-input-border bg-input px-3 text-sm text-fg";

const CATS = ["Stocks", "ETF USA", "Reits", "Bonds", "Treasuries"];

/** Compra/venda avulsa no exterior. Custo em BRL = conversão + IOF + spread. */
export function FormTxInternacional({ onOk }: { onOk?: () => void }) {
  const [usd, setUsd] = useState("");
  const [brl, setBrl] = useState("");
  const [iof, setIof] = useState("");
  const [spread, setSpread] = useState("");
  const [qtd, setQtd] = useState("");
  const [inst, setInst] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const usdN = parseNumeroBR(usd);
  const brlN = parseNumeroBR(brl);
  const fx = usdN > 0 && brlN > 0 ? brlN / usdN : 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      const iofN = parseNumeroBR(iof);
      const sprN = parseNumeroBR(spread);
      await lancarTransacao({
        data: String(fd.get("data")),
        tipo: String(fd.get("tipo") || "Compra"),
        categoria: String(fd.get("categoria") || "Stocks"),
        ticker: String(fd.get("ticker")),
        quantidade: qtd,
        valorBrl: brlN + iofN + sprN,
        valorUsd: usd,
        iofBrl: iofN,
        spreadBrl: sprN,
        cotacaoEfetiva: fx,
        moeda: "USD",
        origem: "Internacional",
        instituicao: inst,
        liquidez: "D+2",
        nota: String(fd.get("nota") || ""),
      });
      setMsg(`Lançado. Cotação efetiva ${formatNumeroBR(fx, 4)}.`);
      setUsd("");
      setBrl("");
      setIof("");
      setSpread("");
      setQtd("");
      onOk?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-[16px] border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-fg">Transação avulsa internacional</h3>
      <p className="text-xs text-subtle">
        Cotação efetiva = valor em R$ da conversão ÷ USD. IOF e spread entram no custo em reais, não na quantidade.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-muted">
          Data
          <input className={campo} type="date" name="data" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
        <label className="text-xs text-muted">
          Tipo
          <select className={campo} name="tipo" defaultValue="Compra">
            <option>Compra</option>
            <option>Venda</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Categoria
          <select className={campo} name="categoria" defaultValue="Stocks">
            {CATS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Ticker
          <input className={campo} name="ticker" required placeholder="AAPL" />
        </label>
        <label className="text-xs text-muted">
          Quantidade
          <CampoValor modo="qtd" casas={8} value={qtd} onChange={setQtd} required />
        </label>
        <label className="text-xs text-muted">
          Valor USD
          <CampoValor value={usd} onChange={setUsd} required />
        </label>
        <label className="text-xs text-muted">
          Valor investido R$
          <CampoValor value={brl} onChange={setBrl} required />
        </label>
        <label className="text-xs text-muted">
          IOF pago (R$)
          <CampoValor value={iof} onChange={setIof} />
        </label>
        <label className="text-xs text-muted">
          Spread bancário (R$)
          <CampoValor value={spread} onChange={setSpread} />
        </label>
        <label className="text-xs text-muted">
          Instituição
          <SelectCadastro sessao="instituicao" value={inst} onChange={setInst} />
        </label>
        <label className="text-xs text-muted lg:col-span-2">
          Nota
          <input className={campo} name="nota" />
        </label>
      </div>
      <p className="font-mono text-sm text-accent">
        Cotação efetiva: {fx ? formatNumeroBR(fx, 4) : "—"}
      </p>
      {erro ? <p className="text-sm text-loss">{erro}</p> : null}
      {msg ? <p className="text-sm text-gain">{msg}</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Lançando…" : "Confirmar transação internacional"}
      </Button>
    </form>
  );
}
