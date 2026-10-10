import { useEffect, useState, type FormEvent } from "react";
import { CampoValor } from "@/components/campo-valor";
import { ExtratoBancario } from "@/components/extrato-bancario";
import { FormImovel } from "@/components/form-imovel";
import { NotaCorretagem } from "@/components/nota-corretagem";
import { SelectCadastro } from "@/components/select-cadastro";
import { Button } from "@/components/ui/button";
import { useCadastros } from "@/hooks/use-cadastro";
import { lancarMovimento } from "@/services/caixa-service";
import { lancarDespesa, lancarRendimento, lancarTransacao } from "@/services/lancamento-service";
import { parseNumeroBR } from "@/utils/numeros-br";

function campoCls(): string {
  return "h-11 rounded-md border border-input-border bg-input px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/70";
}

export type AbaLancamento = "nota" | "extrato" | "imovel" | "tx" | "desp" | "rend" | "caixa";

const TABS: [AbaLancamento, string][] = [
  ["nota", "Nota de corretagem"],
  ["extrato", "Extrato bancário"],
  ["imovel", "Imóvel"],
  ["tx", "Transação avulsa"],
  ["desp", "Conta a pagar"],
  ["rend", "Conta a receber"],
  ["caixa", "Caixa físico"],
];

export function LancamentosRapidos({
  onOk,
  abaFixa,
}: {
  onOk?: () => void;
  abaFixa?: AbaLancamento;
}) {
  const listas = useCadastros([
    "tipo_movimentacao",
    "categoria_investimento",
    "instituicao",
    "moeda",
    "liquidez",
    "origem",
    "categoria_despesa",
    "tipo_rendimento",
  ]);
  const [aba, setAba] = useState<AbaLancamento>(abaFixa ?? "nota");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const hoje = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (abaFixa) setAba(abaFixa);
  }, [abaFixa]);

  const [tipoTx, setTipoTx] = useState("Compra");
  const [catTx, setCatTx] = useState("Ações");
  const [instTx, setInstTx] = useState("");
  const [moedaTx, setMoedaTx] = useState("BRL");
  const [liqTx, setLiqTx] = useState("D+2");
  const [origemTx, setOrigemTx] = useState("Nacional");
  const [qtdTx, setQtdTx] = useState("");
  const [valorTx, setValorTx] = useState("");
  const [catDesp, setCatDesp] = useState("Moradia");
  const [instDesp, setInstDesp] = useState("");
  const [valorDesp, setValorDesp] = useState("");
  const [tipoRend, setTipoRend] = useState("");
  const [instRend, setInstRend] = useState("");
  const [origemRend, setOrigemRend] = useState("Nacional");
  const [valorRend, setValorRend] = useState("");

  async function onTx(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    try {
      await lancarTransacao({
        data: String(fd.get("data")),
        tipo: String(fd.get("tipo")),
        categoria: String(fd.get("categoria")),
        ticker: String(fd.get("ticker")),
        quantidade: qtdTx,
        valorBrl: valorTx,
        nota: String(fd.get("nota") ?? ""),
        instituicao: String(fd.get("instituicao") ?? ""),
        moeda: String(fd.get("moeda") ?? "BRL"),
        liquidez: String(fd.get("liquidez") ?? ""),
        origem: String(fd.get("origem") ?? "Nacional"),
      });
      setMsg("Transação lançada.");
      setQtdTx("");
      setValorTx("");
      e.currentTarget.reset();
      onOk?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha no lançamento");
    }
  }

  async function onDesp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    try {
      await lancarDespesa({
        vencimento: String(fd.get("vencimento")),
        categoria: String(fd.get("categoria")),
        descricao: String(fd.get("descricao")),
        valor: valorDesp,
        pagamento: String(fd.get("pagamento") ?? ""),
        instituicao: String(fd.get("instituicao") ?? ""),
      });
      setMsg("Despesa lançada.");
      setValorDesp("");
      e.currentTarget.reset();
      onOk?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha no lançamento");
    }
  }

  async function onRend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErro(null);
    try {
      await lancarRendimento({
        data: String(fd.get("data")),
        tipo: String(fd.get("tipo")),
        ticker: String(fd.get("ticker") ?? ""),
        valor: valorRend,
        origem: String(fd.get("origem") ?? "Nacional"),
        instituicao: String(fd.get("instituicao") ?? ""),
      });
      setMsg("Rendimento lançado.");
      setValorRend("");
      e.currentTarget.reset();
      onOk?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha no lançamento");
    }
  }

  return (
    <section>
      {abaFixa ? null : (
        <>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Lançamento</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {TABS.map(([id, label]) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={aba === id ? "default" : "secondary"}
                onClick={() => {
                  setAba(id);
                  setMsg(null);
                  setErro(null);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </>
      )}
      {erro ? <p className="mb-2 text-sm text-loss">{erro}</p> : null}
      {msg ? <p className="mb-2 text-sm text-gain">{msg}</p> : null}

      {aba === "nota" ? <NotaCorretagem onOk={onOk} /> : null}
      {aba === "extrato" ? <ExtratoBancario onOk={onOk} /> : null}
      {aba === "imovel" ? <FormImovel onOk={onOk} /> : null}
      {aba === "caixa" ? <FormCaixa onOk={onOk} /> : null}

      {aba === "tx" ? (
        <form
          onSubmit={onTx}
          className="grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            Data
            <input name="data" type="date" required defaultValue={hoje} className={campoCls()} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Tipo
            <SelectCadastro
              name="tipo"
              sessao="tipo_movimentacao"
              opcoes={listas.tipo_movimentacao}
              value={tipoTx}
              onChange={setTipoTx}
              required
              className={campoCls()}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Categoria
            <SelectCadastro
              name="categoria"
              sessao="categoria_investimento"
              opcoes={listas.categoria_investimento}
              value={catTx}
              onChange={setCatTx}
              required
              className={campoCls()}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Instituição
            <SelectCadastro
              name="instituicao"
              sessao="instituicao"
              opcoes={listas.instituicao}
              value={instTx}
              onChange={setInstTx}
              required
              className={campoCls()}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Ticker
            <input name="ticker" required placeholder="BBAS3" className={campoCls()} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Liquidez
            <SelectCadastro
              name="liquidez"
              sessao="liquidez"
              opcoes={listas.liquidez}
              value={liqTx}
              onChange={setLiqTx}
              className={campoCls()}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Moeda
            <SelectCadastro
              name="moeda"
              sessao="moeda"
              opcoes={listas.moeda}
              value={moedaTx}
              onChange={setMoedaTx}
              className={campoCls()}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Origem
            <SelectCadastro
              name="origem"
              sessao="origem"
              opcoes={listas.origem}
              value={origemTx}
              onChange={setOrigemTx}
              className={campoCls()}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Quantidade
            <CampoValor value={qtdTx} onChange={setQtdTx} modo="qtd" required placeholder="100 ou 0,055711" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Valor (R$)
            <CampoValor value={valorTx} onChange={setValorTx} required placeholder="1.234,56" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted lg:col-span-2">
            Nota (opcional)
            <input name="nota" className={campoCls()} />
          </label>
          <div className="lg:col-span-4">
            <Button type="submit">Lançar transação</Button>
          </div>
        </form>
      ) : null}

      {aba === "desp" ? (
        <form
          onSubmit={onDesp}
          className="grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            Vencimento
            <input name="vencimento" type="date" required defaultValue={hoje} className={campoCls()} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Categoria
            <SelectCadastro
              name="categoria"
              sessao="categoria_despesa"
              opcoes={listas.categoria_despesa}
              value={catDesp}
              onChange={setCatDesp}
              required
              className={campoCls()}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Instituição
            <SelectCadastro
              name="instituicao"
              sessao="instituicao"
              opcoes={listas.instituicao}
              value={instDesp}
              onChange={setInstDesp}
              className={campoCls()}
              permitirVazio
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Descrição
            <input name="descricao" className={campoCls()} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Valor (R$)
            <CampoValor value={valorDesp} onChange={setValorDesp} required placeholder="1.234,56" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Pagamento (se já pago)
            <input name="pagamento" type="date" className={campoCls()} />
          </label>
          <div className="flex items-end">
            <Button type="submit">Lançar conta</Button>
          </div>
        </form>
      ) : null}

      {aba === "rend" ? (
        <form
          onSubmit={onRend}
          className="grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            Data
            <input name="data" type="date" required defaultValue={hoje} className={campoCls()} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Tipo
            <SelectCadastro
              name="tipo"
              sessao="tipo_rendimento"
              opcoes={listas.tipo_rendimento}
              value={tipoRend}
              onChange={setTipoRend}
              required
              className={campoCls()}
              placeholder="Tipo de rendimento"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Instituição
            <SelectCadastro
              name="instituicao"
              sessao="instituicao"
              opcoes={listas.instituicao}
              value={instRend}
              onChange={setInstRend}
              className={campoCls()}
              permitirVazio
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Origem
            <SelectCadastro
              name="origem"
              sessao="origem"
              opcoes={listas.origem}
              value={origemRend}
              onChange={setOrigemRend}
              className={campoCls()}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Ticker (se houver)
            <input name="ticker" className={campoCls()} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Valor (R$)
            <CampoValor value={valorRend} onChange={setValorRend} required placeholder="1.234,56" />
          </label>
          <div className="lg:col-span-4">
            <Button type="submit">Lançar recebimento</Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function FormCaixa({ onOk }: { onOk?: () => void }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(hoje);
  const [tipo, setTipo] = useState<"Depósito" | "Saque">("Depósito");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await lancarMovimento({
        data,
        tipo,
        valor: parseNumeroBR(valor),
        descricao,
      });
      setMsg(`${tipo} lançado.`);
      setValor("");
      setDescricao("");
      onOk?.();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha no caixa");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <label className="flex flex-col gap-1 text-xs text-muted">
        Data
        <input
          type="date"
          required
          value={data}
          onChange={(e) => setData(e.target.value)}
          className={campoCls()}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Tipo
        <select
          className={campoCls()}
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "Depósito" | "Saque")}
        >
          <option>Depósito</option>
          <option>Saque</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Valor (R$)
        <CampoValor value={valor} onChange={setValor} required placeholder="1.234,56" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Descrição
        <input className={campoCls()} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </label>
      <div className="lg:col-span-4">
        <Button type="submit">Lançar movimento</Button>
      </div>
      {msg ? <p className="text-sm text-gain lg:col-span-4">{msg}</p> : null}
      {erro ? <p className="text-sm text-loss lg:col-span-4">{erro}</p> : null}
    </form>
  );
}
