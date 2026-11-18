import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CampoValor } from "@/components/campo-valor";
import { KpiCard } from "@/components/kpi-card";
import { SelectCadastro } from "@/components/select-cadastro";
import { SectionTitle } from "@/components/section-title";
import { Button } from "@/components/ui/button";
import { useMercadoAtualizado } from "@/hooks/use-mercado-atualizado";
import { formatBRL, formatData } from "@/lib/financeiro/format";
import { paraCentavos } from "@/lib/financeiro/contas-saldo";
import {
  arquivarConta,
  detalharConta,
  listarContas,
  resumirContas,
  salvarConta,
  type Conta,
  type PracaConta,
  type ResumoConta,
  type StatusConta,
  type TipoConta,
} from "@/services/contas-service";
import { parseNumeroBR } from "@/utils/numeros-br";

export const Route = createFileRoute("/contas")({
  validateSearch: (s: Record<string, unknown>) => ({
    aba: s.aba === "nova" || s.aba === "detalhe" ? (s.aba as "nova" | "detalhe") : ("visao" as const),
    id: Number(s.id) || 0,
  }),
  component: Pagina,
});

const campo = "h-10 w-full rounded-md border border-input-border bg-input px-2 text-sm text-fg";

function dinheiro(centavos: number, moeda: string): string {
  const v = centavos / 100;
  if (moeda === "BRL") return formatBRL(v);
  return `${moeda} ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Pagina() {
  const { aba, id } = Route.useSearch();
  if (aba === "nova") return <FormConta id={id} />;
  if (aba === "detalhe" && id) return <Detalhe id={id} />;
  return <Visao />;
}

function Visao() {
  const [tipo, setTipo] = useState<"" | TipoConta>("");
  const [inst, setInst] = useState("");
  const [status, setStatus] = useState<StatusConta | "todas">("ativa");
  const [linhas, setLinhas] = useState<ResumoConta[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    void resumirContas({ tipo, instituicao: inst, status })
      .then((r) => {
        setLinhas(r);
        setErro(null);
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha ao ler as contas"));
  }, [tipo, inst, status]);

  useEffect(() => {
    carregar();
  }, [carregar]);
  useMercadoAtualizado(carregar);

  const grupos = useMemo(() => {
    const map = new Map<string, ResumoConta[]>();
    for (const l of linhas) {
      const arr = map.get(l.instituicao) ?? [];
      arr.push(l);
      map.set(l.instituicao, arr);
    }
    return [...map.entries()];
  }, [linhas]);

  const totais = useMemo(() => {
    const map = new Map<string, { atual: number; previsto: number }>();
    for (const l of linhas) {
      if (l.status !== "ativa") continue;
      const k = `${l.tipo}|${l.moeda}`;
      const a = map.get(k) ?? { atual: 0, previsto: 0 };
      a.atual += l.atual;
      a.previsto += l.previsto;
      map.set(k, a);
    }
    return [...map.entries()];
  }, [linhas]);

  const alertas = linhas.filter((l) => l.negativoEm);

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Contas"
        title="Bancos e corretoras"
        description="O saldo usa as transações, rendimentos e despesas já lançados na instituição. Com duas contas na mesma instituição, o lançamento precisa apontar a conta."
      />
      {erro ? <p className="mb-4 text-sm text-loss">{erro}</p> : null}
      {alertas.length ? (
        <div className="mb-4 rounded-[16px] border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          {alertas.map((a) => (
            <p key={a.id}>
              {a.apelido} fica negativo em {formatData(a.negativoEm)}.
            </p>
          ))}
        </div>
      ) : null}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {totais.map(([k, v]) => {
          const [tp, moeda] = k.split("|");
          return (
            <KpiCard
              key={k}
              label={`${tp === "BANCARIA" ? "Bancos" : "Corretoras"} · ${moeda}`}
              value={dinheiro(v.atual, moeda)}
              hint={`Previsto ${dinheiro(v.previsto, moeda)}`}
              tom={v.previsto < 0 ? "loss" : "default"}
            />
          );
        })}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <select className={campo + " w-auto"} value={tipo} onChange={(e) => setTipo(e.target.value as "" | TipoConta)}>
          <option value="">Tipo</option>
          <option value="BANCARIA">Bancária</option>
          <option value="CORRETORA">Corretora</option>
        </select>
        <SelectCadastro sessao="instituicao" value={inst} onChange={setInst} permitirVazio placeholder="Instituição" className="w-52" />
        <select className={campo + " w-auto"} value={status} onChange={(e) => setStatus(e.target.value as StatusConta | "todas")}>
          <option value="ativa">Ativas</option>
          <option value="arquivada">Arquivadas</option>
          <option value="todas">Todas</option>
        </select>
        <Link to="/contas" search={{ aba: "nova", id: 0 }}>
          <Button type="button">Nova conta</Button>
        </Link>
      </div>
      {grupos.map(([instituicao, contas]) => (
        <section key={instituicao} className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-fg">{instituicao}</h2>
          <div className="overflow-hidden rounded-[16px] border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Conta</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Praça</th>
                  <th className="px-3 py-2">Moeda</th>
                  <th className="px-3 py-2 text-right">Saldo atual</th>
                  <th className="px-3 py-2 text-right">Previsto</th>
                </tr>
              </thead>
              <tbody>
                {contas.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link to="/contas" search={{ aba: "detalhe", id: c.id }} className="text-accent">
                        {c.apelido}
                      </Link>
                      {c.status === "arquivada" ? <span className="ml-2 text-[11px] text-subtle">arquivada</span> : null}
                    </td>
                    <td className="px-3 py-2">{c.tipo === "BANCARIA" ? "Bancária" : "Corretora"}</td>
                    <td className="px-3 py-2">{c.praca}</td>
                    <td className="px-3 py-2">{c.moeda}</td>
                    <td className="px-3 py-2 text-right font-mono">{dinheiro(c.atual, c.moeda)}</td>
                    <td className={"px-3 py-2 text-right font-mono " + (c.previsto < 0 ? "text-loss" : "")}>{dinheiro(c.previsto, c.moeda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {!linhas.length ? <p className="text-sm text-subtle">Nenhuma conta neste filtro.</p> : null}
    </div>
  );
}

function FormConta({ id }: { id: number }) {
  const navigate = Route.useNavigate();
  const [conta, setConta] = useState<Conta | null>(null);
  const [apelido, setApelido] = useState("");
  const [inst, setInst] = useState("");
  const [tipo, setTipo] = useState<TipoConta>("BANCARIA");
  const [praca, setPraca] = useState<PracaConta>("Nacional");
  const [moeda, setMoeda] = useState("BRL");
  const [saldo, setSaldo] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void listarContas().then((lista) => {
      const c = lista.find((x) => x.id === id);
      if (!c) return;
      setConta(c);
      setApelido(c.apelido);
      setInst(c.instituicao);
      setTipo(c.tipo);
      setPraca(c.praca);
      setMoeda(c.moeda);
      setSaldo((c.saldoInicialCentavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
      setData(c.dataSaldoInicial);
    });
  }, [id]);

  async function salvar() {
    try {
      const novo = await salvarConta({
        id: conta?.id,
        apelido,
        instituicao: inst,
        tipo,
        praca,
        moeda,
        saldoInicialCentavos: paraCentavos(parseNumeroBR(saldo)),
        dataSaldoInicial: data,
        status: conta?.status ?? "ativa",
      });
      await navigate({ search: { aba: "detalhe", id: novo } });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar");
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <SectionTitle kicker="Contas" title={conta ? "Editar conta" : "Nova conta"} description="A instituição vem da base de dados. A moeda é a da própria conta." />
      {erro ? <p className="mb-3 text-sm text-loss">{erro}</p> : null}
      <div className="grid gap-3">
        <label className="text-xs text-muted">
          Apelido
          <input className={campo + " mt-1"} value={apelido} onChange={(e) => setApelido(e.target.value)} />
        </label>
        <label className="text-xs text-muted">
          Instituição
          <SelectCadastro sessao="instituicao" value={inst} onChange={setInst} />
        </label>
        <label className="text-xs text-muted">
          Tipo
          <select className={campo + " mt-1"} value={tipo} onChange={(e) => setTipo(e.target.value as TipoConta)}>
            <option value="BANCARIA">Bancária</option>
            <option value="CORRETORA">Corretora</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Praça
          <select className={campo + " mt-1"} value={praca} onChange={(e) => setPraca(e.target.value as PracaConta)}>
            <option value="Nacional">Nacional</option>
            <option value="Internacional">Internacional</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Moeda
          <SelectCadastro sessao="moeda" value={moeda} onChange={setMoeda} />
        </label>
        <label className="text-xs text-muted">
          Saldo inicial
          <CampoValor value={saldo} onChange={setSaldo} />
        </label>
        <label className="text-xs text-muted">
          Data do saldo inicial
          <input type="date" className={campo + " mt-1"} value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <Button type="button" onClick={() => void salvar()}>
          Salvar
        </Button>
      </div>
    </div>
  );
}

function Detalhe({ id }: { id: number }) {
  const [dados, setDados] = useState<Awaited<ReturnType<typeof detalharConta>>>(null);
  const [corte, setCorte] = useState<"tudo" | "90" | "ano">("tudo");
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    void detalharConta(id)
      .then((d) => {
        setDados(d);
        setErro(d ? null : "Conta não encontrada");
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha ao abrir a conta"));
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);
  useMercadoAtualizado(carregar);

  if (erro) return <p className="text-sm text-loss">{erro}</p>;
  if (!dados) return <p className="text-sm text-subtle">Carregando…</p>;
  const { conta, saldo } = dados;
  const hoje = new Date();
  const limite =
    corte === "90"
      ? new Date(hoje.getTime() - 90 * 86400000).toISOString().slice(0, 10)
      : corte === "ano"
        ? `${hoje.getFullYear()}-01-01`
        : "0000-01-01";
  const linhas = saldo.extrato.filter((l) => l.data >= limite);
  const pontos = saldo.historico.filter((p) => p.data >= limite);
  const max = Math.max(1, ...pontos.map((p) => Math.abs(p.centavos)));

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker={conta.instituicao}
        title={conta.apelido}
        description={`${conta.tipo === "BANCARIA" ? "Bancária" : "Corretora"} · ${conta.praca} · ${conta.moeda}`}
      />
      {conta.tipo === "BANCARIA" && saldo.negativoEm ? (
        <p className="mb-4 text-sm text-warn">Saldo previsto negativo em {formatData(saldo.negativoEm)}.</p>
      ) : null}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Saldo atual" value={dinheiro(saldo.atual, conta.moeda)} hint="Sem lançamentos futuros" />
        <KpiCard label="Saldo previsto" value={dinheiro(saldo.previsto, conta.moeda)} tom={saldo.previsto < 0 ? "loss" : "accent"} />
        <KpiCard label="Saldo inicial" value={dinheiro(conta.saldoInicialCentavos, conta.moeda)} hint={formatData(conta.dataSaldoInicial)} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(["tudo", "90", "ano"] as const).map((c) => (
          <button key={c} type="button" className={"rounded-full px-3 py-1 text-xs " + (corte === c ? "bg-accent text-white" : "bg-surface-2 text-muted")} onClick={() => setCorte(c)}>
            {c === "tudo" ? "Tudo" : c === "90" ? "90 dias" : "Ano"}
          </button>
        ))}
        <Link to="/contas" search={{ aba: "nova", id: conta.id }}>
          <Button type="button" variant="secondary" size="sm">
            Editar
          </Button>
        </Link>
        <Button type="button" variant="ghost" size="sm" onClick={() => void arquivarConta(conta.id, conta.status === "ativa").then(carregar)}>
          {conta.status === "ativa" ? "Arquivar" : "Reativar"}
        </Button>
      </div>
      <div className="mb-6 rounded-[16px] border border-border bg-surface p-4">
        <svg viewBox="0 0 600 140" className="h-36 w-full">
          <polyline
            fill="none"
            stroke="currentColor"
            className="text-accent"
            strokeWidth="2"
            points={pontos
              .map((p, i) => {
                const x = pontos.length <= 1 ? 0 : (i / (pontos.length - 1)) * 600;
                const y = 120 - (p.centavos / max) * 100;
                return `${x},${y}`;
              })
              .join(" ")}
          />
        </svg>
      </div>
      <div className="overflow-auto rounded-[16px] border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-[11px] uppercase text-muted">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Origem</th>
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i} className={"border-t border-border " + (l.futuro ? "text-subtle" : "")}>
                <td className="px-3 py-2">{formatData(l.data)}{l.futuro ? " · previsto" : ""}</td>
                <td className="px-3 py-2">{l.origem}</td>
                <td className="px-3 py-2">{l.descricao}</td>
                <td className={"px-3 py-2 text-right font-mono " + (l.centavos < 0 ? "text-loss" : "text-gain")}>{dinheiro(l.centavos, conta.moeda)}</td>
                <td className="px-3 py-2 text-right font-mono">{dinheiro(l.saldo, conta.moeda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
