import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CampoValor } from "@/components/campo-valor";
import { SectionTitle } from "@/components/section-title";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/financeiro/format";
import { criarMeta, excluirMeta, listarMetas, type Meta } from "@/services/metas-service";
import { parseNumeroBR } from "@/utils/numeros-br";

export const Route = createFileRoute("/metas")({
  component: Pagina,
});

const ROTULO: Record<Meta["metrica"], string> = {
  proventos_mes: "Proventos do mês (bolsa)",
  proventos_ano: "Proventos do ano (bolsa)",
  caixa: "Saldo em espécie",
  despesas_mes: "Despesas do mês",
  despesas_ano: "Despesas do ano",
  aluguel_ano: "Aluguéis do ano",
  custo_imoveis: "Custo da carteira de imóveis",
  aportes_ano: "Aportes do ano",
  patrimonio_mercado: "Patrimônio a mercado",
};

function Pagina() {
  const [lista, setLista] = useState<Meta[]>([]);
  const [nome, setNome] = useState("");
  const [metrica, setMetrica] = useState<Meta["metrica"]>("proventos_mes");
  const [alvo, setAlvo] = useState("");
  const [ate, setAte] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLista(await listarMetas());
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar() {
    setErro(null);
    const n = parseNumeroBR(alvo);
    if (!nome.trim() || n <= 0) {
      setErro("Informe o nome e um alvo maior que zero.");
      return;
    }
    await criarMeta({ nome, metrica, alvo: n, ate });
    setNome("");
    setAlvo("");
    setAte("");
    await carregar();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <SectionTitle
        kicker="Módulo"
        title="Metas"
        description="Cada meta lê um número já calculado no app — proventos, caixa, despesas, imóveis, aportes ou patrimônio — e mostra o avanço."
      />
      <div className="mb-6 grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Nome
          <input className="h-9 rounded-md border border-input-border bg-input px-2 text-sm text-fg" value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Dado do app
          <select className="h-9 rounded-md border border-input-border bg-input px-2 text-sm text-fg" value={metrica} onChange={(e) => setMetrica(e.target.value as Meta["metrica"])}>
            <option value="proventos_mes">Proventos do mês (bolsa)</option>
            <option value="proventos_ano">Proventos do ano (bolsa)</option>
            <option value="caixa">Saldo em espécie</option>
            <option value="despesas_mes">Despesas do mês</option>
            <option value="despesas_ano">Despesas do ano</option>
            <option value="aluguel_ano">Aluguéis do ano</option>
            <option value="custo_imoveis">Custo da carteira de imóveis</option>
            <option value="aportes_ano">Aportes do ano</option>
            <option value="patrimonio_mercado">Patrimônio a mercado</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Alvo (R$)
          <CampoValor value={alvo} onChange={setAlvo} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Até
          <input type="date" className="h-9 rounded-md border border-input-border bg-input px-2 text-sm text-fg" value={ate} onChange={(e) => setAte(e.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <Button type="button" onClick={() => void salvar()}>Cadastrar meta</Button>
          {erro ? <p className="mt-2 text-sm text-loss">{erro}</p> : null}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {lista.map((m) => {
          const pct = m.alvo > 0 ? Math.min(1, m.atual / m.alvo) : 0;
          return (
            <article key={m.id} className="rounded-[16px] border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-fg">{m.nome}</h3>
                  <p className="text-xs text-muted">{ROTULO[m.metrica]}{m.ate ? ` · até ${m.ate}` : ""}</p>
                </div>
                <button type="button" className="text-xs text-loss" onClick={() => void excluirMeta(m.id).then(carregar)}>Excluir</button>
              </div>
              <p className="mt-3 font-mono text-sm text-fg">{formatBRL(m.atual)} <span className="text-muted">/ {formatBRL(m.alvo)}</span></p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg">
                <div className="h-full bg-accent" style={{ width: `${pct * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">{(pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
