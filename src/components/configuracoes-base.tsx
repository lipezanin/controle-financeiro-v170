/**
 * Configurações → Base de Dados: uma sessão = uma tabela = itens em linha.
 */
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SelectCadastro } from "@/components/select-cadastro";
import { Button } from "@/components/ui/button";
import { SESSOES_CADASTRO, type SessaoCadastro } from "@/lib/financeiro/cadastros-def";
import {
  atualizarItem,
  atualizarTipoRendimento,
  contarSessoes,
  excluirItem,
  excluirTipoRendimento,
  inserirItem,
  inserirTipoRendimento,
  listarItens,
  listarTiposRendimento,
  moverItem,
  type CadastroItem,
  type TipoRendimentoItem,
} from "@/services/cadastro-service";

const campo =
  "h-9 w-full rounded-md border border-input-border bg-input px-2 text-sm text-fg";

function secoes(): { secao: string; grupos: SessaoCadastro[] }[] {
  const map = new Map<string, SessaoCadastro[]>();
  for (const s of SESSOES_CADASTRO) {
    const arr = map.get(s.secao) ?? [];
    arr.push(s);
    map.set(s.secao, arr);
  }
  return [...map.entries()].map(([secao, grupos]) => ({ secao, grupos }));
}

export function ConfiguracoesBase() {
  const primeiro = SESSOES_CADASTRO[0]!;
  const [sessao, setSessao] = useState<SessaoCadastro>(primeiro);
  const [contagens, setContagens] = useState<Record<string, number>>({});

  const recarregarContagens = useCallback(() => {
    void contarSessoes().then(setContagens);
  }, []);

  useEffect(() => {
    recarregarContagens();
  }, [recarregarContagens, sessao.id]);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <nav className="space-y-3 rounded-[12px] border border-border bg-surface p-3">
        {secoes().map((sec) => (
          <div key={sec.secao}>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">
              {sec.secao}
            </p>
            <ul className="space-y-1">
              {sec.grupos.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className={
                      sessao.id === g.id
                        ? "flex w-full items-center justify-between rounded-[8px] bg-accent px-2 py-1.5 text-left text-[12px] text-accent-fg"
                        : "flex w-full items-center justify-between rounded-[8px] px-2 py-1.5 text-left text-[12px] text-muted hover:bg-surface-2 hover:text-fg"
                    }
                    onClick={() => setSessao(g)}
                  >
                    <span>{g.rotulo}</span>
                    <span className="tabular text-[10px] opacity-80">{contagens[g.id] ?? "—"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {sessao.especial === "tipo_rendimento" ? (
        <PainelTipoRendimento sessao={sessao} onMudou={recarregarContagens} />
      ) : (
        <PainelItens sessao={sessao} onMudou={recarregarContagens} />
      )}
    </div>
  );
}

function PainelItens({ sessao, onMudou }: { sessao: SessaoCadastro; onMudou: () => void }) {
  const [itens, setItens] = useState<CadastroItem[]>([]);
  const [novo, setNovo] = useState("");
  const [filtro, setFiltro] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setItens(await listarItens(sessao.id, true));
  }, [sessao.id]);

  useEffect(() => {
    void carregar();
    setNovo("");
    setFiltro("");
    setMsg(null);
    setErro(null);
    setConfirmId(null);
  }, [carregar]);

  const visiveis = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((i) => i.nome.toLowerCase().includes(q) || i.codigo.toLowerCase().includes(q));
  }, [itens, filtro]);

  async function adicionar() {
    setBusy(true);
    setErro(null);
    try {
      await inserirItem(sessao.id, novo);
      setNovo("");
      setMsg("Item incluído.");
      await carregar();
      onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao incluir");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[12px] border border-border bg-surface p-4">
      <div>
        <h3 className="font-medium text-fg">{sessao.rotulo}</h3>
        <p className="text-[12px] text-muted">{sessao.descricao}</p>
        <p className="mt-1 text-[11px] text-subtle">Usado em: {sessao.usadoEm}</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className={campo}
          placeholder="Buscar item…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
        <div className="flex min-w-0 flex-1 gap-2">
          <input
            className={campo}
            placeholder="Novo item"
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void adicionar();
              }
            }}
          />
          <Button type="button" size="sm" disabled={busy || !novo.trim()} onClick={() => void adicionar()}>
            <Plus className="size-4" />
            Incluir
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-border">
        <table className="min-w-full text-left text-[13px]">
          <thead className="bg-bg text-[11px] uppercase tracking-[0.12em] text-muted">
            <tr>
              <th className="w-10 px-2 py-2">#</th>
              <th className="px-2 py-2">Item</th>
              <th className="w-24 px-2 py-2">Ativo</th>
              <th className="w-36 px-2 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted">
                  Nenhum item nesta sessão. Inclua o primeiro acima.
                </td>
              </tr>
            ) : (
              visiveis.map((it, idx) => (
                <tr key={it.id} className="border-t border-border/60">
                  <td className="px-2 py-1.5 text-subtle">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <input
                      className={campo}
                      defaultValue={it.nome}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== it.nome) {
                          void atualizarItem(sessao.id, it.id, { nome: v }).then(carregar);
                        }
                      }}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      className={
                        it.ativo
                          ? "rounded-full bg-gain/20 px-2 py-0.5 text-[11px] text-gain"
                          : "rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-subtle"
                      }
                      onClick={() => void atualizarItem(sessao.id, it.id, { ativo: !it.ativo }).then(carregar)}
                    >
                      {it.ativo ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        aria-label="Subir"
                        className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2"
                        onClick={() => void moverItem(sessao.id, it.id, -1).then(carregar)}
                      >
                        <ChevronUp className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Descer"
                        className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2"
                        onClick={() => void moverItem(sessao.id, it.id, 1).then(carregar)}
                      >
                        <ChevronDown className="size-4" />
                      </button>
                      {confirmId === it.id ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          className="h-8"
                          onClick={() =>
                            void excluirItem(sessao.id, it.id).then(() => {
                              setConfirmId(null);
                              return carregar();
                            })
                          }
                        >
                          Excluir
                        </Button>
                      ) : (
                        <button
                          type="button"
                          aria-label="Excluir"
                          className="flex size-8 items-center justify-center rounded-md text-loss hover:bg-loss/15"
                          onClick={() => setConfirmId(it.id)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {msg ? <p className="text-[12px] text-gain">{msg}</p> : null}
      {erro ? <p className="text-[12px] text-loss">{erro}</p> : null}
    </div>
  );
}

function PainelTipoRendimento({
  sessao,
  onMudou,
}: {
  sessao: SessaoCadastro;
  onMudou: () => void;
}) {
  const vazio: Omit<TipoRendimentoItem, "id"> = {
    nome: "",
    origem: "Nacional",
    categoria: "Renda Fixa",
    tributacao: "Tributável",
    formaRecolhimento: "Na Fonte",
    classificacaoIrpfm: "Neutro",
    ativo: true,
  };
  const [itens, setItens] = useState<TipoRendimentoItem[]>([]);
  const [novo, setNovo] = useState(vazio);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setItens(await listarTiposRendimento(true));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function incluir() {
    setErro(null);
    try {
      await inserirTipoRendimento(novo);
      setNovo(vazio);
      await carregar();
      onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao incluir");
    }
  }

  return (
    <div className="space-y-3 rounded-[12px] border border-border bg-surface p-4">
      <div>
        <h3 className="font-medium text-fg">{sessao.rotulo}</h3>
        <p className="text-[12px] text-muted">{sessao.descricao}</p>
        <p className="mt-1 text-[11px] text-subtle">Usado em: {sessao.usadoEm}</p>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-[10px] border border-border bg-bg p-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-[11px] text-muted">
          Nome
          <input className={campo} value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
        </label>
        <label className="text-[11px] text-muted">
          Origem
          <SelectCadastro sessao="origem" value={novo.origem} onChange={(origem) => setNovo({ ...novo, origem })} />
        </label>
        <label className="text-[11px] text-muted">
          Categoria
          <SelectCadastro
            sessao="categoria_rendimento"
            value={novo.categoria}
            onChange={(categoria) => setNovo({ ...novo, categoria })}
          />
        </label>
        <label className="text-[11px] text-muted">
          Tributação
          <SelectCadastro
            sessao="tributacao"
            value={novo.tributacao}
            onChange={(tributacao) => setNovo({ ...novo, tributacao })}
          />
        </label>
        <label className="text-[11px] text-muted">
          Recolhimento
          <SelectCadastro
            sessao="forma_recolhimento"
            value={novo.formaRecolhimento}
            onChange={(formaRecolhimento) => setNovo({ ...novo, formaRecolhimento })}
          />
        </label>
        <label className="text-[11px] text-muted">
          IRPFM
          <SelectCadastro
            sessao="classificacao_irpfm"
            value={novo.classificacaoIrpfm}
            onChange={(classificacaoIrpfm) => setNovo({ ...novo, classificacaoIrpfm })}
          />
        </label>
        <div className="flex items-end">
          <Button type="button" size="sm" onClick={() => void incluir()}>
            <Plus className="size-4" />
            Incluir tipo
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-border">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-bg text-[11px] uppercase tracking-[0.12em] text-muted">
            <tr>
              {["Nome", "Origem", "Categoria", "Tributação", "Recolhimento", "IRPFM", "Ativo", ""].map((h) => (
                <th key={h || "a"} className="px-2 py-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map((it) => (
              <tr key={it.id} className="border-t border-border/60">
                <td className="px-1 py-1">
                  <input
                    className={campo}
                    defaultValue={it.nome}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== it.nome) void atualizarTipoRendimento(it.id, { nome: v }).then(carregar);
                    }}
                  />
                </td>
                <td className="px-1 py-1">
                  <SelectCadastro
                    sessao="origem"
                    value={it.origem}
                    onChange={(origem) => void atualizarTipoRendimento(it.id, { origem }).then(carregar)}
                  />
                </td>
                <td className="px-1 py-1">
                  <SelectCadastro
                    sessao="categoria_rendimento"
                    value={it.categoria}
                    onChange={(categoria) => void atualizarTipoRendimento(it.id, { categoria }).then(carregar)}
                  />
                </td>
                <td className="px-1 py-1">
                  <SelectCadastro
                    sessao="tributacao"
                    value={it.tributacao}
                    onChange={(tributacao) => void atualizarTipoRendimento(it.id, { tributacao }).then(carregar)}
                  />
                </td>
                <td className="px-1 py-1">
                  <SelectCadastro
                    sessao="forma_recolhimento"
                    value={it.formaRecolhimento}
                    onChange={(formaRecolhimento) =>
                      void atualizarTipoRendimento(it.id, { formaRecolhimento }).then(carregar)
                    }
                  />
                </td>
                <td className="px-1 py-1">
                  <SelectCadastro
                    sessao="classificacao_irpfm"
                    value={it.classificacaoIrpfm}
                    onChange={(classificacaoIrpfm) =>
                      void atualizarTipoRendimento(it.id, { classificacaoIrpfm }).then(carregar)
                    }
                  />
                </td>
                <td className="px-1 py-1">
                  <button
                    type="button"
                    className={
                      it.ativo
                        ? "rounded-full bg-gain/20 px-2 py-0.5 text-[11px] text-gain"
                        : "rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-subtle"
                    }
                    onClick={() => void atualizarTipoRendimento(it.id, { ativo: !it.ativo }).then(carregar)}
                  >
                    {it.ativo ? "Ativo" : "Inativo"}
                  </button>
                </td>
                <td className="px-1 py-1">
                  {confirmId === it.id ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      className="h-8"
                      onClick={() =>
                        void excluirTipoRendimento(it.id).then(() => {
                          setConfirmId(null);
                          return carregar();
                        })
                      }
                    >
                      Excluir
                    </Button>
                  ) : (
                    <button
                      type="button"
                      aria-label="Excluir"
                      className="flex size-8 items-center justify-center rounded-md text-loss hover:bg-loss/15"
                      onClick={() => setConfirmId(it.id)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {erro ? <p className="text-[12px] text-loss">{erro}</p> : null}
    </div>
  );
}
