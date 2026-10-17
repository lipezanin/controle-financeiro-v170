import { useCallback, useEffect, useState } from "react";
import { useMercadoAtualizado } from "@/hooks/use-mercado-atualizado";
import { CampoValor } from "@/components/campo-valor";
import { Button } from "@/components/ui/button";
import { formatBRL, formatData } from "@/lib/financeiro/format";
import { cn } from "@/lib/utils";
import { saldoAtual } from "@/services/caixa-service";
import {
  atualizarConferencia,
  excluirConferencia,
  listarConferencias,
  registrarConferencia,
  type ConferenciaCaixa,
} from "@/services/conferencia-caixa-service";
import { mascararMoedaBR, parseNumeroBR } from "@/utils/numeros-br";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ConferenciaCaixaPainel({
  onAjuste,
  modo = "completo",
}: {
  onAjuste?: () => void;
  modo?: "completo" | "analise";
}) {
  const [lista, setLista] = useState<ConferenciaCaixa[]>([]);
  const [sistema, setSistema] = useState(0);
  const [data, setData] = useState(hojeIso);
  const [contado, setContado] = useState("");
  const [obs, setObs] = useState("");
  const [ajustar, setAjustar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editData, setEditData] = useState("");
  const [editContado, setEditContado] = useState("");
  const [editObs, setEditObs] = useState("");

  const carregar = useCallback(async () => {
    setLista(await listarConferencias());
    setSistema(await saldoAtual());
  }, []);

  useEffect(() => {
    void carregar().catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha"));
  }, [carregar]);

  useMercadoAtualizado(() => {
    void carregar().catch(() => undefined);
  });

  const valorContado = parseNumeroBR(contado);
  const diff = contado ? valorContado - sistema : 0;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro(null);
    try {
      await registrarConferencia({
        data,
        saldoContado: valorContado,
        observacao: obs,
        ajustarLivro: ajustar,
      });
      setContado("");
      setObs("");
      setAjustar(false);
      await carregar();
      onAjuste?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível registrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="conferencia" className={modo === "analise" ? "mt-10" : undefined}>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        {modo === "analise" ? "Histórico de conferências" : "Contagem de verificação"}
      </p>
      <p className="mb-4 max-w-3xl text-sm text-subtle">
        {modo === "analise"
          ? "Somente leitura. Para registrar, editar ou excluir, use Lançamentos → Conferência de caixa."
          : "Compare o saldo do livro com o dinheiro na gaveta. A diferença só vira lançamento se você marcar o ajuste. Valores no padrão 1.234,56."}
      </p>
      {erro ? <p className="mb-3 text-sm text-loss">{erro}</p> : null}

      {modo === "analise" ? null : (
        <form
          onSubmit={salvar}
          className="mb-6 grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5"
        >
        <label className="flex flex-col gap-1 text-xs text-muted">
          Data da contagem
          <input
            type="date"
            required
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="h-11 rounded-md border border-input-border bg-input px-3 text-sm text-fg"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Saldo no sistema
          <input
            readOnly
            value={formatBRL(sistema)}
            className="h-11 rounded-md border border-input-border bg-surface-2 px-3 font-mono text-sm text-fg"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Valor contado (R$)
          <CampoValor value={contado} onChange={setContado} required placeholder="0,00" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Diferença
          <input
            readOnly
            value={contado ? formatBRL(diff) : "—"}
            className={cn(
              "h-11 rounded-md border border-input-border bg-surface-2 px-3 font-mono text-sm",
              diff < -0.005 ? "text-loss" : diff > 0.005 ? "text-gain" : "text-fg",
            )}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted lg:col-span-4">
          Observação
          <input
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            className="h-11 rounded-md border border-input-border bg-input px-3 text-sm text-fg"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted lg:col-span-3">
          <input type="checkbox" checked={ajustar} onChange={(e) => setAjustar(e.target.checked)} />
          Lançar a diferença no caixa físico
        </label>
        <div className="flex items-end">
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {busy ? "Salvando…" : "Registrar contagem"}
          </Button>
        </div>
      </form>
      )}

      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="zebra min-w-[720px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2.5">Data</th>
              <th className="px-3 py-2.5 text-right">Sistema</th>
              <th className="px-3 py-2.5 text-right">Contado</th>
              <th className="px-3 py-2.5 text-right">Diferença</th>
              <th className="px-3 py-2.5">Ajuste</th>
              <th className="px-3 py-2.5">Obs.</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-subtle">
                  Nenhuma conferência ainda.
                </td>
              </tr>
            ) : (
              lista.map((c) => (
                <tr key={c.id}>
                  {editId === c.id ? (
                    <td colSpan={7} className="px-3 py-2">
                      <div className="flex flex-wrap items-end gap-2">
                        <input
                          type="date"
                          className="h-10 rounded-md border border-input-border bg-input px-2 text-sm"
                          value={editData}
                          onChange={(e) => setEditData(e.target.value)}
                        />
                        <div className="w-40">
                          <CampoValor
                            className="h-10"
                            value={editContado}
                            onChange={setEditContado}
                          />
                        </div>
                        <input
                          className="h-10 min-w-[160px] flex-1 rounded-md border border-input-border bg-input px-2 text-sm"
                          value={editObs}
                          onChange={(e) => setEditObs(e.target.value)}
                          placeholder="Observação"
                        />
                        <Button
                          size="sm"
                          onClick={() =>
                            void atualizarConferencia(c.id, {
                              data: editData,
                              saldoContado: parseNumeroBR(editContado),
                              observacao: editObs,
                            }).then(() => {
                              setEditId(null);
                              return carregar();
                            })
                          }
                        >
                          Salvar
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditId(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-mono tabular">{formatData(c.data)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular">{formatBRL(c.saldoSistema)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular">{formatBRL(c.saldoContado)}</td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-mono tabular",
                          c.diferenca < 0 ? "text-loss" : c.diferenca > 0 ? "text-gain" : "text-fg",
                        )}
                      >
                        {formatBRL(c.diferenca)}
                      </td>
                      <td className="px-3 py-2">{c.ajustouLivro ? "Lançado" : "Só registro"}</td>
                      <td className="px-3 py-2 text-muted">{c.observacao ?? "—"}</td>
                      <td className="px-3 py-2">
                        {modo === "analise" ? (
                          <span className="text-subtle">—</span>
                        ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="text-accent"
                            onClick={() => {
                              setEditId(c.id);
                              setEditData(c.data);
                              setEditContado(mascararMoedaBR(String(Math.round(c.saldoContado * 100)), 2));
                              setEditObs(c.observacao ?? "");
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="text-loss"
                            onClick={() => {
                              if (window.confirm("Excluir esta conferência?")) {
                                void excluirConferencia(c.id).then(carregar);
                              }
                            }}
                          >
                            Excluir
                          </button>
                        </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
