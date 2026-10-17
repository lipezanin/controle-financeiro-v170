import { useState, type FormEvent } from "react";
import { CampoValor } from "@/components/campo-valor";
import { SelectCadastro } from "@/components/select-cadastro";
import { Button } from "@/components/ui/button";
import { formatNumeroBR, parseNumeroBR } from "@/utils/numeros-br";
import { lancarAplicacaoRfIntl } from "@/services/lancamento-service";

const campo =
  "h-11 w-full rounded-md border border-input-border bg-input px-3 text-sm text-fg";

export function FormRfInternacional({ onOk }: { onOk?: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [usd, setUsd] = useState("");
  const [brl, setBrl] = useState("");
  const [iof, setIof] = useState("");
  const [spread, setSpread] = useState("");
  const [instituicao, setInstituicao] = useState("");
  const [tipoRf, setTipoRf] = useState("Bonds");
  const [indexador, setIndexador] = useState("");
  const [liquidez, setLiquidez] = useState("No Vencimento");
  const [amortizacao, setAmortizacao] = useState("No Vencimento");
  const [taxa, setTaxa] = useState("");

  const fx = parseNumeroBR(usd) > 0 && parseNumeroBR(brl) > 0 ? parseNumeroBR(brl) / parseNumeroBR(usd) : 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      await lancarAplicacaoRfIntl({
        data: String(fd.get("data")),
        nome: String(fd.get("nome")),
        ticker: String(fd.get("ticker")),
        tipoRf,
        emissor: String(fd.get("emissor")),
        instituicao,
        indexador,
        taxa,
        valorUsd: usd,
        valorInvestidoBrl: brl,
        iofBrl: iof,
        spreadBrl: spread,
        vencimento: String(fd.get("vencimento")),
        liquidez,
        amortizacao,
      });
      setMsg("Aplicação internacional lançada.");
      onOk?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-[16px] border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-fg">Renda fixa internacional — Bonds / Treasuries</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-muted">
          Data
          <input className={campo} type="date" name="data" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
        <label className="text-xs text-muted">
          Nome / título
          <input className={campo} name="nome" required />
        </label>
        <label className="text-xs text-muted">
          Ticker
          <input className={campo} name="ticker" />
        </label>
        <label className="text-xs text-muted">
          Tipo
          <SelectCadastro
            sessao="categoria_investimento"
            value={tipoRf}
            onChange={setTipoRf}
            className={campo}
          />
        </label>
        <label className="text-xs text-muted">
          Emissor
          <input className={campo} name="emissor" />
        </label>
        <label className="text-xs text-muted">
          Instituição
          <SelectCadastro sessao="instituicao" value={instituicao} onChange={setInstituicao} className={campo} />
        </label>
        <label className="text-xs text-muted">
          Indexador
          <SelectCadastro sessao="indexador" value={indexador} onChange={setIndexador} className={campo} />
        </label>
        <label className="text-xs text-muted">
          Taxa (ex.: 4,25 ou 104,50)
          <CampoValor modo="qtd" casas={4} value={taxa} onChange={setTaxa} />
        </label>
        <label className="text-xs text-muted">
          Vencimento
          <input className={campo} type="date" name="vencimento" />
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
          IOF (R$)
          <CampoValor value={iof} onChange={setIof} />
        </label>
        <label className="text-xs text-muted">
          Spread (R$)
          <CampoValor value={spread} onChange={setSpread} />
        </label>
        <label className="text-xs text-muted">
          Cotação efetiva
          <input className={campo} readOnly value={fx ? formatNumeroBR(fx, 4) : "—"} />
        </label>
        <label className="text-xs text-muted">
          Liquidez
          <SelectCadastro sessao="liquidez" value={liquidez} onChange={setLiquidez} className={campo} />
        </label>
        <label className="text-xs text-muted">
          Amortização
          <SelectCadastro sessao="amortizacao" value={amortizacao} onChange={setAmortizacao} className={campo} />
        </label>
      </div>
      {erro ? <p className="text-sm text-loss">{erro}</p> : null}
      {msg ? <p className="text-sm text-gain">{msg}</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Salvando…" : "Lançar aplicação"}
      </Button>
    </form>
  );
}
