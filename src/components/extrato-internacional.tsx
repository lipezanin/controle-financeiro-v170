import { useState } from "react";
import { CampoValor } from "@/components/campo-valor";
import { SelectCadastro } from "@/components/select-cadastro";
import { Button } from "@/components/ui/button";
import { useCadastros } from "@/hooks/use-cadastro";
import { lancarExtratoInternacional } from "@/services/lancamento-service";

const MAX = 20;
const campo =
  "h-9 w-full rounded-md border border-input-border bg-input px-2 text-[12px] text-fg";

type Row = {
  data: string;
  descricao: string;
  valorUsd: string;
  tipoRendimento: string;
  ticker: string;
  withholding: string;
};

const vazia = (): Row => ({
  data: "",
  descricao: "",
  valorUsd: "",
  tipoRendimento: "",
  ticker: "",
  withholding: "",
});

export function ExtratoInternacional({ onOk }: { onOk?: () => void }) {
  const listas = useCadastros(["instituicao", "tipo_rendimento"]);
  const tipos = listas.tipo_rendimento ?? [];
  const [instituicao, setInstituicao] = useState("");
  const [cotacao, setCotacao] = useState("");
  const [linhas, setLinhas] = useState<Row[]>(() => Array.from({ length: MAX }, vazia));
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmar() {
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      const n = await lancarExtratoInternacional(
        { instituicao, cotacao },
        linhas.filter((l) => l.data && l.valorUsd),
      );
      setMsg(`${n} rendimento(s) internacionais lançados (USD × PTAX ou cotação informada).`);
      setLinhas(Array.from({ length: MAX }, vazia));
      onOk?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha no extrato internacional");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[16px] border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-fg">Extrato internacional — dividendos / interest</h3>
      <p className="text-[12px] text-muted">
        Valor em USD. Se a cotação ficar em branco, usa a PTAX do dia de cada linha. Withholding vira IR
        retido em BRL. Tipo de rendimento alimenta o IRPFM.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted">
          Instituição
          <SelectCadastro sessao="instituicao" value={instituicao} onChange={setInstituicao} className={campo} />
        </label>
        <label className="text-xs text-muted">
          Cotação USD (opcional, para todas as linhas)
          <CampoValor className="h-9" value={cotacao} onChange={setCotacao} casas={4} />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.12em] text-muted">
              <th className="px-1 py-1">Data</th>
              <th className="px-1 py-1">Descrição</th>
              <th className="px-1 py-1">USD</th>
              <th className="px-1 py-1">Withholding USD</th>
              <th className="px-1 py-1">Tipo</th>
              <th className="px-1 py-1">Ticker</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                <td className="px-1 py-0.5">
                  <input
                    type="date"
                    className={campo}
                    value={l.data}
                    onChange={(e) =>
                      setLinhas((p) => p.map((x, idx) => (idx === i ? { ...x, data: e.target.value } : x)))
                    }
                  />
                </td>
                <td className="px-1 py-0.5">
                  <input
                    className={campo}
                    value={l.descricao}
                    onChange={(e) =>
                      setLinhas((p) => p.map((x, idx) => (idx === i ? { ...x, descricao: e.target.value } : x)))
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
                <td className="px-1 py-0.5">
                  <CampoValor
                    className="h-9"
                    value={l.withholding}
                    onChange={(v) =>
                      setLinhas((p) => p.map((x, idx) => (idx === i ? { ...x, withholding: v } : x)))
                    }
                  />
                </td>
                <td className="px-1 py-0.5">
                  <select
                    className={campo}
                    value={l.tipoRendimento}
                    onChange={(e) =>
                      setLinhas((p) =>
                        p.map((x, idx) => (idx === i ? { ...x, tipoRendimento: e.target.value } : x)),
                      )
                    }
                  >
                    <option value="">—</option>
                    {tipos.map((t) => (
                      <option key={t}>{t}</option>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {erro ? <p className="text-sm text-loss">{erro}</p> : null}
      {msg ? <p className="text-sm text-gain">{msg}</p> : null}
      <Button type="button" disabled={busy} onClick={() => void confirmar()}>
        {busy ? "Lançando…" : "Confirmar extrato internacional"}
      </Button>
    </div>
  );
}
