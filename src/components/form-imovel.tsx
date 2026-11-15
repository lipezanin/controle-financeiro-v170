/**
 * Lançamentos de imóvel. Vários eventos, um único cadastro, quantidade final 1.
 */
import { type FormEvent, useEffect, useState } from "react";
import { CampoValor } from "@/components/campo-valor";
import { SelectCadastro } from "@/components/select-cadastro";
import { Button } from "@/components/ui/button";
import { lancarTransacao } from "@/services/lancamento-service";
import { listarNomesImoveis } from "@/services/imovel-service";
import { parseNumeroBR } from "@/utils/numeros-br";

const campo =
  "h-11 w-full rounded-md border border-input-border bg-input px-3 text-sm text-fg";

type Base = {
  data: string;
  ticker: string;
  instituicao: string;
  obs: string;
};

async function gravar(
  base: Base,
  linhas: { tipo: string; valor: number | string; nota: string }[],
) {
  const uteis = linhas.filter((l) => parseNumeroBR(l.valor) > 0);
  if (!base.ticker.trim()) throw new Error("Selecione o imóvel já cadastrado.");
  if (!uteis.length) throw new Error("Informe ao menos um valor maior que zero.");
  for (const [i, l] of uteis.entries()) {
    await lancarTransacao({
      data: base.data,
      tipo: l.tipo,
      categoria: "Imóveis",
      ticker: base.ticker,
      quantidade: 1,
      valorBrl: l.valor,
      nota: [l.nota, base.obs].filter(Boolean).join(" · ") || undefined,
      instituicao: base.instituicao,
      _adiar: i < uteis.length - 1,
    });
  }
}

function Cabecalho({
  instituicao,
  setInstituicao,
  ticker,
  setTicker,
  permitirNovo,
}: {
  instituicao: string;
  setInstituicao: (v: string) => void;
  ticker: string;
  setTicker: (v: string) => void;
  permitirNovo?: boolean;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [nomes, setNomes] = useState<string[]>([]);
  const [novo, setNovo] = useState(false);
  useEffect(() => {
    void listarNomesImoveis().then(setNomes).catch(() => setNomes([]));
  }, []);
  return (
    <>
      <label className="text-xs text-muted">
        Data
        <input name="data" type="date" required defaultValue={hoje} className={campo} />
      </label>
      <label className="text-xs text-muted">
        Imóvel
        {novo ? (
          <input
            className={campo}
            value={ticker}
            required
            placeholder="Nome do imóvel novo"
            onChange={(e) => setTicker(e.target.value)}
          />
        ) : (
          <select
            className={campo}
            required
            value={ticker}
            onChange={(e) => {
              if (e.target.value === "__novo__") {
                setNovo(true);
                setTicker("");
                return;
              }
              setTicker(e.target.value);
            }}
          >
            <option value="">Selecionar…</option>
            {nomes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            {permitirNovo ? <option value="__novo__">Novo imóvel…</option> : null}
          </select>
        )}
      </label>
      <label className="text-xs text-muted">
        Instituição
        <SelectCadastro sessao="instituicao" value={instituicao} onChange={setInstituicao} className={campo} />
      </label>
    </>
  );
}

export function FormAquisicaoImovel({ onOk }: { onOk?: () => void }) {
  const [modo, setModo] = useState("parcela");
  const [valor, setValor] = useState("");
  const [juros, setJuros] = useState("");
  const [instituicao, setInstituicao] = useState("");
  const [ticker, setTicker] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      const base = {
        data: String(fd.get("data")),
        ticker,
        instituicao,
        obs: String(fd.get("obs") || ""),
      };
      if (modo === "venda") {
        await gravar(base, [{ tipo: "Venda de imóvel", valor, nota: "Venda do imóvel" }]);
      } else if (modo === "doacao_recebida") {
        await gravar(base, [{ tipo: "Doação recebida", valor, nota: "Custo = valor declarado na doação" }]);
      } else if (modo === "heranca") {
        await gravar(base, [{ tipo: "Herança", valor, nota: "Custo = valor declarado na partilha" }]);
      } else if (modo === "doacao_realizada") {
        await gravar(base, [{ tipo: "Doação de imóvel", valor, nota: "Valor declarado na doação. Ganho = declarado − custo." }]);
      } else {
        await gravar(base, [
          { tipo: "Parcela Imóvel", valor, nota: "Parcela / aquisição" },
          { tipo: "Correção e juros", valor: juros, nota: "Correção e juros" },
        ]);
      }
      setMsg("Lançado no mesmo imóvel. A quantidade permanece 1.");
      setValor("");
      setJuros("");
      onOk?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha no lançamento");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
      <p className="text-[12px] text-muted lg:col-span-3">
        Um imóvel, vários pagamentos. Parcela, correção e juros somam no custo e a quantidade fica 1.
        Doação recebida e herança entram pelo valor declarado na escritura — esse é o custo para o ganho de capital futuro.
        Venda ou doação feita zera a posição e apura o ganho (valor declarado menos o custo). Esse ganho de imóvel fica fora da base mensal do IRPFM.
      </p>
      <label className="text-xs text-muted lg:col-span-3">
        Operação
        <select className={campo} value={modo} onChange={(e) => setModo(e.target.value)}>
          <option value="parcela">Parcela / aquisição</option>
          <option value="venda">Venda</option>
          <option value="doacao_recebida">Doação recebida</option>
          <option value="heranca">Herança</option>
          <option value="doacao_realizada">Doação realizada</option>
        </select>
      </label>
      <Cabecalho
        instituicao={instituicao}
        setInstituicao={setInstituicao}
        ticker={ticker}
        setTicker={setTicker}
        permitirNovo
      />
      <label className="text-xs text-muted">
        {modo === "parcela" ? "Valor da parcela (R$)" : "Valor (R$)"}
        <CampoValor value={valor} onChange={setValor} required placeholder="0,00" />
      </label>
      {modo === "parcela" ? (
        <label className="text-xs text-muted">
          Correção e juros (R$)
          <CampoValor value={juros} onChange={setJuros} placeholder="0,00" />
        </label>
      ) : null}
      <label className="text-xs text-muted lg:col-span-3">
        Observação
        <input name="obs" className={campo} />
      </label>
      <div className="lg:col-span-3">
        <Button type="submit" disabled={busy}>{busy ? "Lançando…" : "Lançar"}</Button>
      </div>
      {msg ? <p className="text-[12px] text-gain lg:col-span-3">{msg}</p> : null}
      {erro ? <p className="text-[12px] text-loss lg:col-span-3">{erro}</p> : null}
    </form>
  );
}

export function FormCustoImovel({ onOk }: { onOk?: () => void }) {
  return (
    <FormCustoSimples
      titulo="Imposto, taxa e corretagem entram no custo do mesmo imóvel. Não criam outro cadastro e não alteram a quantidade."
      campos={[
        ["ITBI / taxa", "Imposto Imóvel"],
        ["Cartório", "ITBI / Cartório"],
        ["Corretagem", "Corretagem Imóvel"],
      ]}
      onOk={onOk}
    />
  );
}

export function FormManutencaoImovel({ onOk }: { onOk?: () => void }) {
  return (
    <FormCustoSimples
      titulo="Reforma e manutenção que compõem o custo do imóvel para o ganho de capital. Quantidade continua 1."
      campos={[
        ["Reforma / benfeitoria", "Reforma Imóvel"],
        ["Manutenção", "Manutenção Imóvel"],
      ]}
      onOk={onOk}
    />
  );
}

function FormCustoSimples({
  titulo,
  campos,
  onOk,
}: {
  titulo: string;
  campos: [string, string][];
  onOk?: () => void;
}) {
  const [valores, setValores] = useState<string[]>(() => campos.map(() => ""));
  const [instituicao, setInstituicao] = useState("");
  const [ticker, setTicker] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      await gravar(
        {
          data: String(fd.get("data")),
          ticker,
          instituicao,
          obs: String(fd.get("obs") || ""),
        },
        campos.map(([, tipo], i) => ({ tipo, valor: valores[i] ?? "", nota: campos[i][0] })),
      );
      setMsg("Custo somado ao imóvel. Quantidade permanece 1.");
      setValores(campos.map(() => ""));
      onOk?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha no lançamento");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
      <p className="text-[12px] text-muted lg:col-span-3">{titulo}</p>
      <Cabecalho instituicao={instituicao} setInstituicao={setInstituicao} ticker={ticker} setTicker={setTicker} />
      {campos.map(([rotulo], i) => (
        <label key={rotulo} className="text-xs text-muted">
          {rotulo} (R$)
          <CampoValor value={valores[i] ?? ""} onChange={(v) => setValores((p) => p.map((x, idx) => (idx === i ? v : x)))} placeholder="0,00" />
        </label>
      ))}
      <label className="text-xs text-muted lg:col-span-3">
        Observação
        <input name="obs" className={campo} />
      </label>
      <div className="lg:col-span-3">
        <Button type="submit" disabled={busy}>{busy ? "Lançando…" : "Lançar custo"}</Button>
      </div>
      {msg ? <p className="text-[12px] text-gain lg:col-span-3">{msg}</p> : null}
      {erro ? <p className="text-[12px] text-loss lg:col-span-3">{erro}</p> : null}
    </form>
  );
}

/** Compatível com a tela antiga de lançamentos. */
export function FormImovel({ onOk }: { onOk?: () => void }) {
  return <FormAquisicaoImovel onOk={onOk} />;
}
