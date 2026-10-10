/**
 * Lançamento de imóvel: parcela/aquisição + ITBI/cartório (somam ao custo).
 */
import { type FormEvent, useState } from "react";
import { CampoValor } from "@/components/campo-valor";
import { SelectCadastro } from "@/components/select-cadastro";
import { Button } from "@/components/ui/button";
import { lancarImovel } from "@/services/lancamento-service";

const campo =
  "h-11 w-full rounded-md border border-input-border bg-input px-3 text-sm text-fg";

export function FormImovel({ onOk }: { onOk?: () => void }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [instituicao, setInstituicao] = useState("");
  const [qtd, setQtd] = useState("1");
  const [valor, setValor] = useState("");
  const [itbi, setItbi] = useState("0,00");
  const [cartorio, setCartorio] = useState("0,00");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      await lancarImovel({
        data: String(fd.get("data")),
        ticker: String(fd.get("ticker")),
        quantidade: qtd || "1",
        valor,
        itbi: itbi || "0",
        cartorio: cartorio || "0",
        observacao: String(fd.get("obs") || ""),
        instituicao,
      });
      setMsg("Imóvel lançado (parcela + custos no custo médio).");
      setQtd("1");
      setValor("");
      setItbi("0,00");
      setCartorio("0,00");
      e.currentTarget.reset();
      onOk?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha no imóvel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <p className="text-[12px] text-muted lg:col-span-3">
        Aceita fração (0,055711) e valores 515.000,00. ITBI e cartório entram no custo. Instituição vem da Base de Dados.
      </p>
      <label className="text-xs text-muted">
        Data
        <input name="data" type="date" required defaultValue={hoje} className={campo} />
      </label>
      <label className="text-xs text-muted">
        Nome / identificador
        <input name="ticker" required placeholder="APTO 1203" className={campo} />
      </label>
      <label className="text-xs text-muted">
        Instituição
        <SelectCadastro
          sessao="instituicao"
          value={instituicao}
          onChange={setInstituicao}
          required
          className={campo}
        />
      </label>
      <label className="text-xs text-muted">
        Fração / quantidade
        <CampoValor value={qtd} onChange={setQtd} modo="qtd" placeholder="1 ou 0,055711" />
      </label>
      <label className="text-xs text-muted">
        Valor parcela / aquisição (R$)
        <CampoValor value={valor} onChange={setValor} required placeholder="515.000,00" />
      </label>
      <label className="text-xs text-muted">
        ITBI (R$)
        <CampoValor value={itbi} onChange={setItbi} placeholder="0,00" />
      </label>
      <label className="text-xs text-muted">
        Cartório / outros (R$)
        <CampoValor value={cartorio} onChange={setCartorio} placeholder="0,00" />
      </label>
      <label className="text-xs text-muted lg:col-span-3">
        Observação
        <input name="obs" className={campo} />
      </label>
      <div className="lg:col-span-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Lançando…" : "Lançar imóvel"}
        </Button>
      </div>
      {msg ? <p className="text-[12px] text-gain lg:col-span-3">{msg}</p> : null}
      {erro ? <p className="text-[12px] text-loss lg:col-span-3">{erro}</p> : null}
    </form>
  );
}
