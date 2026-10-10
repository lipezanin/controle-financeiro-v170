/**
 * Extrato bancário — várias linhas de rendimento em um único confirmar (Excel LANC. EXTRATO).
 * Instituição, origem, moeda e tipo vêm da Base de Dados.
 */
import { useState } from "react";
import { CampoValor } from "@/components/campo-valor";
import { SelectCadastro } from "@/components/select-cadastro";
import { Button } from "@/components/ui/button";
import { useCadastros } from "@/hooks/use-cadastro";
import { lancarExtratoBancario } from "@/services/lancamento-service";

const MAX = 20;
const campo =
  "h-9 w-full rounded-md border border-input-border bg-input px-2 text-[12px] text-fg";

type Row = {
  data: string;
  descricao: string;
  valorBruto: string;
  tipoRendimento: string;
  ticker: string;
  irRetido: string;
};

const vazia = (): Row => ({
  data: "",
  descricao: "",
  valorBruto: "",
  tipoRendimento: "",
  ticker: "",
  irRetido: "0",
});

export function ExtratoBancario({ onOk }: { onOk?: () => void }) {
  const listas = useCadastros(["instituicao", "origem", "moeda", "tipo_rendimento"]);
  const [instituicao, setInstituicao] = useState("");
  const [origem, setOrigem] = useState("Nacional");
  const [moeda, setMoeda] = useState("BRL");
  const [linhas, setLinhas] = useState<Row[]>(() => Array.from({ length: MAX }, vazia));
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setLinha(i: number, patch: Partial<Row>) {
    setLinhas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function confirmar() {
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      const n = await lancarExtratoBancario(
        { instituicao, origem, moeda },
        linhas.filter((l) => l.data && l.valorBruto && l.tipoRendimento),
      );
      setMsg(`Extrato: ${n} rendimento(s) lançado(s) de uma vez.`);
      setLinhas(Array.from({ length: MAX }, vazia));
      onOk?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha no extrato");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[16px] border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-fg">Extrato bancário — Rendimentos (até {MAX} linhas)</h3>
      <p className="text-[12px] text-muted">
        Instituição e tipo de rendimento vêm da Base de Dados. Valores: 1.234,56
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-xs text-muted">
          Instituição
          <SelectCadastro
            sessao="instituicao"
            opcoes={listas.instituicao}
            value={instituicao}
            onChange={setInstituicao}
            required
            placeholder="Selecionar instituição"
          />
        </label>
        <label className="text-xs text-muted">
          Origem
          <SelectCadastro sessao="origem" opcoes={listas.origem} value={origem} onChange={setOrigem} required />
        </label>
        <label className="text-xs text-muted">
          Moeda
          <SelectCadastro sessao="moeda" opcoes={listas.moeda} value={moeda} onChange={setMoeda} required />
        </label>
      </div>
      <div className="overflow-x-auto rounded-[12px] border border-border">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-bg text-muted">
            <tr>
              {["#", "Data", "Descrição", "Valor bruto", "Tipo rendimento", "Ticker", "IR retido"].map((h) => (
                <th key={h} className="px-2 py-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((ln, idx) => (
              <tr key={idx} className="border-t border-border/60">
                <td className="px-2 py-1 text-subtle">{idx + 1}</td>
                <td className="px-1 py-1">
                  <input
                    className={campo}
                    type="date"
                    value={ln.data}
                    onChange={(e) => setLinha(idx, { data: e.target.value })}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    className={campo}
                    value={ln.descricao}
                    onChange={(e) => setLinha(idx, { descricao: e.target.value })}
                  />
                </td>
                <td className="px-1 py-1">
                  <CampoValor
                    className="h-9"
                    value={ln.valorBruto}
                    onChange={(valorBruto) => setLinha(idx, { valorBruto })}
                    placeholder="1.234,56"
                  />
                </td>
                <td className="px-1 py-1">
                  <SelectCadastro
                    sessao="tipo_rendimento"
                    opcoes={listas.tipo_rendimento}
                    value={ln.tipoRendimento}
                    onChange={(tipoRendimento) => setLinha(idx, { tipoRendimento })}
                    permitirVazio
                    placeholder="Tipo…"
                  />
                </td>
                <td className="px-1 py-1">
                  <input className={campo} value={ln.ticker} onChange={(e) => setLinha(idx, { ticker: e.target.value })} />
                </td>
                <td className="px-1 py-1">
                  <CampoValor
                    className="h-9"
                    value={ln.irRetido}
                    onChange={(irRetido) => setLinha(idx, { irRetido })}
                    placeholder="0,00"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void confirmar()}>
          {busy ? "Lançando…" : "Confirmar extrato"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setLinhas(Array.from({ length: MAX }, vazia))}>
          Limpar
        </Button>
      </div>
      {msg ? <p className="text-[12px] text-gain">{msg}</p> : null}
      {erro ? <p className="text-[12px] text-loss">{erro}</p> : null}
    </div>
  );
}
