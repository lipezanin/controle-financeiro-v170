import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CampoValor } from "@/components/campo-valor";
import { SelectCadastro } from "@/components/select-cadastro";
import { ConferenciaCaixaPainel } from "@/components/conferencia-caixa";
import { ExtratoInternacional } from "@/components/extrato-internacional";
import { FormRfInternacional } from "@/components/form-rf-internacional";
import { FormTxInternacional } from "@/components/form-tx-internacional";
import { LancamentosRapidos, type AbaLancamento } from "@/components/lancamentos";
import { NotaInternacional } from "@/components/nota-internacional";
import { SectionTitle } from "@/components/section-title";
import { Button } from "@/components/ui/button";
import { usePeriodo } from "@/hooks/periodo-context";
import { useMercadoAtualizado } from "@/hooks/use-mercado-atualizado";
import { formatBRL, formatData } from "@/lib/financeiro/format";
import { dataNoPeriodo } from "@/lib/financeiro/periodo";
import { cn } from "@/lib/utils";
import {
  atualizarDespesa,
  atualizarRendimento,
  atualizarTransacao,
  excluirDespesas,
  excluirRendimentos,
  excluirTodasDespesas,
  excluirTodasTransacoes,
  excluirTodosRendimentos,
  excluirTransacoes,
  listarDespesas,
  listarRendimentos,
  listarTransacoes,
  type LinhaDespesa,
  type LinhaRendimento,
  type LinhaTransacao,
} from "@/services/lancamento-service";
import {
  atualizarMovimento,
  excluirMovimentos,
  excluirTodosMovimentos,
  resumirCaixa,
  type MovimentoCaixa,
} from "@/services/caixa-service";
import { formatNumeroBR, parseNumeroBR } from "@/utils/numeros-br";

const TIPOS = [
  "nota",
  "extrato",
  "imovel",
  "tx",
  "desp",
  "rend",
  "caixa",
  "conferencia",
  "nota_int",
  "extrato_int",
  "rf_int",
  "tx_int",
] as const;
type TipoAba = (typeof TIPOS)[number];

const META: Record<TipoAba, { title: string; desc: string }> = {
  nota: { title: "Nota de corretagem", desc: "Ordens da nota com taxas proporcionais, em um único confirmar." },
  extrato: { title: "Extrato bancário", desc: "Várias linhas de rendimento da mesma instituição, em um único confirmar." },
  imovel: { title: "Lançar imóvel", desc: "Parcela ou aquisição. ITBI e cartório entram no custo médio." },
  tx: { title: "Transação avulsa", desc: "Compra, venda e demais movimentações da carteira." },
  desp: { title: "Conta a pagar", desc: "Despesas do fluxo financeiro." },
  rend: { title: "Conta a receber", desc: "Rendimentos, aluguéis e demais entradas." },
  caixa: { title: "Caixa físico", desc: "Depósito e saque em espécie." },
  conferencia: { title: "Conferência de caixa", desc: "Contagem da gaveta. A diferença só vira lançamento se você pedir o ajuste." },
  nota_int: {
    title: "Nota internacional",
    desc: "Ordens em USD. Cabeçalho em R$, IOF e spread definem a cotação efetiva da remessa.",
  },
  extrato_int: {
    title: "Extrato internacional",
    desc: "Dividendos e interest em USD, convertidos pela cotação informada. Entram no IRPFM pelo tipo de rendimento.",
  },
  rf_int: {
    title: "Renda fixa internacional",
    desc: "Bonds e Treasuries. Custo em reais = conversão + IOF + spread.",
  },
  tx_int: {
    title: "Transação avulsa internacional",
    desc: "Compra ou venda fora da nota, com a mesma regra de câmbio efetivo.",
  },
};

export const Route = createFileRoute("/lancamentos")({
  validateSearch: (s: Record<string, unknown>) => ({
    tipo: (TIPOS.includes(String(s.tipo) as TipoAba) ? s.tipo : "nota") as TipoAba,
  }),
  component: Pagina,
});

const campo = "h-10 w-full rounded-md border border-input-border bg-input px-2 text-sm text-fg";

function Pagina() {
  const { tipo } = Route.useSearch();
  const { periodo } = usePeriodo();
  const [txs, setTxs] = useState<LinhaTransacao[]>([]);
  const [desps, setDesps] = useState<LinhaDespesa[]>([]);
  const [rends, setRends] = useState<LinhaRendimento[]>([]);
  const [cx, setCx] = useState<MovimentoCaixa[]>([]);
  const [sel, setSel] = useState<number[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    const [t, d, r, c] = await Promise.all([
      listarTransacoes(),
      listarDespesas(),
      listarRendimentos(),
      resumirCaixa(),
    ]);
    setTxs(t);
    setDesps(d);
    setRends(r);
    setCx(c.movimentos);
    setSel([]);
  }, []);

  useEffect(() => {
    void carregar().catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha"));
  }, [carregar]);

  useMercadoAtualizado(() => {
    void carregar().catch(() => undefined);
  });

  const linhasTx = useMemo(() => txs.filter((x) => dataNoPeriodo(x.data, periodo)), [txs, periodo]);
  const linhasDesp = useMemo(
    () => desps.filter((x) => dataNoPeriodo(x.vencimento, periodo)),
    [desps, periodo],
  );
  const linhasRend = useMemo(() => rends.filter((x) => dataNoPeriodo(x.data, periodo)), [rends, periodo]);
  const linhasCx = useMemo(() => cx.filter((x) => dataNoPeriodo(x.data, periodo)), [cx, periodo]);

  async function onExcluirSel() {
    if (!sel.length) return;
    if (!window.confirm(`Excluir ${sel.length} registro(s)?`)) return;
    if (tipo === "tx") await excluirTransacoes(sel);
    if (tipo === "desp") await excluirDespesas(sel);
    if (tipo === "rend") await excluirRendimentos(sel);
    if (tipo === "caixa") await excluirMovimentos(sel);
    setMsg("Excluídos.");
    await carregar();
  }

  async function onExcluirTudo() {
    if (confirmar !== "EXCLUIR") {
      setErro("Digite EXCLUIR para apagar a tabela inteira.");
      return;
    }
    if (tipo === "tx") await excluirTodasTransacoes();
    if (tipo === "desp") await excluirTodasDespesas();
    if (tipo === "rend") await excluirTodosRendimentos();
    if (tipo === "caixa") await excluirTodosMovimentos();
    setConfirmar("");
    setMsg("Tabela esvaziada.");
    await carregar();
  }

  const mostraDiario = tipo === "tx" || tipo === "desp" || tipo === "rend" || tipo === "caixa";
  const abaForm =
    tipo === "conferencia" || tipo === "nota_int" || tipo === "extrato_int" || tipo === "rf_int" || tipo === "tx_int"
      ? null
      : (tipo as AbaLancamento);
  const meta = META[tipo];

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle kicker="Lançamentos" title={meta.title} description={meta.desc} />
      {erro ? <p className="mb-2 text-sm text-loss">{erro}</p> : null}
      {msg ? <p className="mb-2 text-sm text-gain">{msg}</p> : null}

      {tipo === "conferencia" ? (
        <ConferenciaCaixaPainel onAjuste={() => void carregar()} />
      ) : tipo === "nota_int" ? (
        <NotaInternacional onOk={() => void carregar()} />
      ) : tipo === "extrato_int" ? (
        <ExtratoInternacional onOk={() => void carregar()} />
      ) : tipo === "rf_int" ? (
        <FormRfInternacional onOk={() => void carregar()} />
      ) : tipo === "tx_int" ? (
        <FormTxInternacional onOk={() => void carregar()} />
      ) : (
        <LancamentosRapidos abaFixa={abaForm ?? "tx"} onOk={() => void carregar()} />
      )}

      {mostraDiario ? (
        <>
          <div className="mt-6 flex flex-wrap items-end gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={!sel.length} onClick={() => void onExcluirSel()}>
              Excluir selecionados ({sel.length})
            </Button>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Apagar tabela (digite EXCLUIR)
              <input className={campo} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
            </label>
            <Button type="button" size="sm" variant="secondary" onClick={() => void onExcluirTudo()}>
              Excluir todos
            </Button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-[16px] border border-border">
            {tipo === "tx" ? (
              <table className="zebra min-w-[860px] w-full text-left text-xs">
                <thead>
                  <tr className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted">
                    <th className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={sel.length === linhasTx.length && linhasTx.length > 0}
                        onChange={(e) => setSel(e.target.checked ? linhasTx.map((x) => x.id) : [])}
                      />
                    </th>
                    <th className="px-2 py-2">Data</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2">Ticker</th>
                    <th className="px-2 py-2">Categoria</th>
                    <th className="px-2 py-2 text-right">Qtd</th>
                    <th className="px-2 py-2 text-right">Valor</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {linhasTx.map((x) => (
                    <tr key={x.id}>
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={sel.includes(x.id)}
                          onChange={(e) =>
                            setSel(e.target.checked ? [...sel, x.id] : sel.filter((i) => i !== x.id))
                          }
                        />
                      </td>
                      {editId === x.id ? (
                        <EditorTx
                          linha={x}
                          onCancel={() => setEditId(null)}
                          onOk={async (v) => {
                            await atualizarTransacao(x.id, v);
                            setEditId(null);
                            await carregar();
                          }}
                        />
                      ) : (
                        <>
                          <td className="px-2 py-1.5 font-mono">{formatData(x.data)}</td>
                          <td className="px-2 py-1.5">{x.tipo}</td>
                          <td className="px-2 py-1.5 font-medium">{x.ticker}</td>
                          <td className="px-2 py-1.5 text-muted">{x.categoria}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{x.quantidade}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{formatBRL(x.valorBrl)}</td>
                          <td className="px-2 py-1.5">
                            <button type="button" className="text-accent" onClick={() => setEditId(x.id)}>
                              Editar
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {tipo === "desp" ? (
              <TabelaSimples
                cols={["Venc.", "Cat.", "Descrição", "Valor", "Sit."]}
                rows={linhasDesp.map((x) => [x.id, formatData(x.vencimento), x.categoria, x.descricao, formatBRL(x.valor), x.situacao])}
                sel={sel}
                setSel={setSel}
                editId={editId}
                onEdit={setEditId}
                editor={
                  editId
                    ? (id) => {
                        const x = linhasDesp.find((d) => d.id === id);
                        if (!x) return null;
                        return (
                          <EditorDesp
                            linha={x}
                            onCancel={() => setEditId(null)}
                            onOk={async (v) => {
                              await atualizarDespesa(x.id, v);
                              setEditId(null);
                              await carregar();
                            }}
                          />
                        );
                      }
                    : undefined
                }
              />
            ) : null}

            {tipo === "rend" ? (
              <TabelaSimples
                cols={["Data", "Tipo", "Ticker", "Valor"]}
                rows={linhasRend.map((x) => [x.id, formatData(x.data), x.tipo, x.ticker, formatBRL(x.valor)])}
                sel={sel}
                setSel={setSel}
                editId={editId}
                onEdit={setEditId}
                editor={
                  editId
                    ? (id) => {
                        const x = linhasRend.find((d) => d.id === id);
                        if (!x) return null;
                        return (
                          <EditorRend
                            linha={x}
                            onCancel={() => setEditId(null)}
                            onOk={async (v) => {
                              await atualizarRendimento(x.id, v);
                              setEditId(null);
                              await carregar();
                            }}
                          />
                        );
                      }
                    : undefined
                }
              />
            ) : null}

            {tipo === "caixa" ? (
              <TabelaSimples
                cols={["Data", "Tipo", "Valor", "Descrição"]}
                rows={linhasCx.map((x) => [x.id, formatData(x.data), x.tipo, formatBRL(x.valor), x.descricao])}
                sel={sel}
                setSel={setSel}
                editId={editId}
                onEdit={setEditId}
                editor={
                  editId
                    ? (id) => {
                        const x = linhasCx.find((d) => d.id === id);
                        if (!x) return null;
                        return (
                          <EditorCx
                            linha={x}
                            onCancel={() => setEditId(null)}
                            onOk={async (v) => {
                              await atualizarMovimento(x.id, v);
                              setEditId(null);
                              await carregar();
                            }}
                          />
                        );
                      }
                    : undefined
                }
              />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function TabelaSimples({
  cols,
  rows,
  sel,
  setSel,
  editId,
  onEdit,
  editor,
}: {
  cols: string[];
  rows: (string | number | null | undefined)[][];
  sel: number[];
  setSel: (n: number[]) => void;
  editId: number | null;
  onEdit: (id: number) => void;
  editor?: (id: number) => React.ReactNode;
}) {
  const ids = rows.map((r) => Number(r[0]));
  return (
    <table className="zebra min-w-[720px] w-full text-left text-xs">
      <thead>
        <tr className="bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-muted">
          <th className="px-2 py-2">
            <input
              type="checkbox"
              checked={sel.length === ids.length && ids.length > 0}
              onChange={(e) => setSel(e.target.checked ? ids : [])}
            />
          </th>
          {cols.map((c) => (
            <th key={c} className="px-2 py-2">
              {c}
            </th>
          ))}
          <th className="px-2 py-2" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const id = Number(r[0]);
          return (
            <tr key={id}>
              <td className="px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={sel.includes(id)}
                  onChange={(e) => setSel(e.target.checked ? [...sel, id] : sel.filter((i) => i !== id))}
                />
              </td>
              {editId === id && editor ? (
                editor(id)
              ) : (
                <>
                  {r.slice(1).map((c, i) => (
                    <td key={i} className={cn("px-2 py-1.5", i === 0 && "font-mono")}>
                      {c ?? "—"}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <button type="button" className="text-accent" onClick={() => onEdit(id)}>
                      Editar
                    </button>
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function EditorTx({
  linha,
  onCancel,
  onOk,
}: {
  linha: LinhaTransacao;
  onCancel: () => void;
  onOk: (v: {
    data: string;
    tipo: string;
    categoria: string;
    ticker: string;
    quantidade: number;
    valorBrl: number;
  }) => Promise<void>;
}) {
  const [data, setData] = useState(linha.data);
  const [tipo, setTipo] = useState(linha.tipo);
  const [categoria, setCategoria] = useState(linha.categoria ?? "");
  const [ticker, setTicker] = useState(linha.ticker ?? "");
  const [qtd, setQtd] = useState(formatNumeroBR(linha.quantidade ?? 0, 6).replace(/,?0+$/, "") || String(linha.quantidade ?? ""));
  const [valor, setValor] = useState(formatNumeroBR(linha.valorBrl ?? 0));
  return (
    <>
      <td className="px-1 py-1" colSpan={7}>
        <div className="flex flex-wrap gap-1">
          <input className={campo} type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <div className="w-40">
            <SelectCadastro sessao="tipo_movimentacao" value={tipo} onChange={setTipo} className={campo} />
          </div>
          <input className={campo} value={ticker} onChange={(e) => setTicker(e.target.value)} />
          <div className="w-48">
            <SelectCadastro sessao="categoria_investimento" value={categoria} onChange={setCategoria} className={campo} />
          </div>
          <div className="w-28">
            <CampoValor className="h-10" modo="qtd" value={qtd} onChange={setQtd} />
          </div>
          <div className="w-36">
            <CampoValor className="h-10" value={valor} onChange={setValor} />
          </div>
          <Button
            size="sm"
            onClick={() =>
              void onOk({
                data,
                tipo,
                categoria,
                ticker,
                quantidade: parseNumeroBR(qtd),
                valorBrl: parseNumeroBR(valor),
              })
            }
          >
            Salvar
          </Button>
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </td>
    </>
  );
}

function EditorDesp({
  linha,
  onCancel,
  onOk,
}: {
  linha: LinhaDespesa;
  onCancel: () => void;
  onOk: (v: {
    vencimento: string;
    categoria: string;
    descricao: string;
    valor: number;
    pagamento?: string;
  }) => Promise<void>;
}) {
  const [vencimento, setV] = useState(linha.vencimento);
  const [categoria, setC] = useState(linha.categoria ?? "");
  const [descricao, setD] = useState(linha.descricao ?? "");
  const [valor, setValor] = useState(formatNumeroBR(linha.valor));
  const [pagamento, setP] = useState(linha.pagamento ?? "");
  return (
    <td className="px-1 py-1" colSpan={6}>
      <div className="flex flex-wrap gap-1">
        <input className={campo} type="date" value={vencimento} onChange={(e) => setV(e.target.value)} />
        <div className="w-48">
          <SelectCadastro sessao="categoria_despesa" value={categoria} onChange={setC} className={campo} />
        </div>
        <input className={campo} value={descricao} onChange={(e) => setD(e.target.value)} />
        <div className="w-36">
          <CampoValor className="h-10" value={valor} onChange={setValor} />
        </div>
        <input className={campo} type="date" value={pagamento} onChange={(e) => setP(e.target.value)} />
        <Button
          size="sm"
          onClick={() =>
            void onOk({
              vencimento,
              categoria,
              descricao,
              valor: parseNumeroBR(valor),
              pagamento,
            })
          }
        >
          Salvar
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </td>
  );
}

function EditorRend({
  linha,
  onCancel,
  onOk,
}: {
  linha: LinhaRendimento;
  onCancel: () => void;
  onOk: (v: { data: string; tipo: string; ticker: string; valor: number }) => Promise<void>;
}) {
  const [data, setData] = useState(linha.data);
  const [tipo, setTipo] = useState(linha.tipo ?? "");
  const [ticker, setTicker] = useState(linha.ticker ?? "");
  const [valor, setValor] = useState(formatNumeroBR(linha.valor));
  return (
    <td className="px-1 py-1" colSpan={5}>
      <div className="flex flex-wrap gap-1">
        <input className={campo} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <div className="w-56">
          <SelectCadastro sessao="tipo_rendimento" value={tipo} onChange={setTipo} className={campo} />
        </div>
        <input className={campo} value={ticker} onChange={(e) => setTicker(e.target.value)} />
        <div className="w-36">
          <CampoValor className="h-10" value={valor} onChange={setValor} />
        </div>
        <Button
          size="sm"
          onClick={() => void onOk({ data, tipo, ticker, valor: parseNumeroBR(valor) })}
        >
          Salvar
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </td>
  );
}

function EditorCx({
  linha,
  onCancel,
  onOk,
}: {
  linha: MovimentoCaixa;
  onCancel: () => void;
  onOk: (v: { data: string; tipo: "Depósito" | "Saque"; valor: number; descricao?: string }) => Promise<void>;
}) {
  const [data, setData] = useState(linha.data);
  const [tipo, setTipo] = useState(linha.tipo);
  const [valor, setValor] = useState(formatNumeroBR(linha.valor));
  const [descricao, setD] = useState(linha.descricao ?? "");
  return (
    <td className="px-1 py-1" colSpan={5}>
      <div className="flex flex-wrap gap-1">
        <input className={campo} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as "Depósito" | "Saque")}>
          <option>Depósito</option>
          <option>Saque</option>
        </select>
        <div className="w-36">
          <CampoValor className="h-10" value={valor} onChange={setValor} />
        </div>
        <input className={campo} value={descricao} onChange={(e) => setD(e.target.value)} />
        <Button
          size="sm"
          onClick={() =>
            void onOk({
              data,
              tipo,
              valor: parseNumeroBR(valor),
              descricao,
            })
          }
        >
          Salvar
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </td>
  );
}
