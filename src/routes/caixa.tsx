import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GraficoCaixa } from "@/components/graficos-financeiro";
import { KpiCard } from "@/components/kpi-card";
import { SectionTitle } from "@/components/section-title";
import { Button } from "@/components/ui/button";
import { CampoValor } from "@/components/campo-valor";
import { formatBRL, formatData } from "@/lib/financeiro/format";
import { useOrdenacao, rotuloOrdem } from "@/hooks/use-ordenacao";
import { cn } from "@/lib/utils";
import { usePeriodo } from "@/hooks/periodo-context";
import { useMercadoAtualizado } from "@/hooks/use-mercado-atualizado";
import { anoDoPeriodo } from "@/lib/financeiro/periodo";
import { atualizarMovimento, excluirMovimentos, resumirCaixa, type MovimentoCaixa, type ResumoCaixa } from "@/services/caixa-service";
import { ConferenciaCaixaPainel } from "@/components/conferencia-caixa";
import { parseNumeroBR, formatNumeroBR } from "@/utils/numeros-br";

export const Route = createFileRoute("/caixa")({
  component: Pagina,
});

function Pagina() {
  const { periodo } = usePeriodo();
  const [r, setR] = useState<ResumoCaixa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [edit, setEdit] = useState<MovimentoCaixa | null>(null);
  const [editValor, setEditValor] = useState("");

  const carregar = useCallback(async () => {
    try {
      setR(await resumirCaixa(anoDoPeriodo(periodo)));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler o caixa");
    }
  }, [periodo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useMercadoAtualizado(() => {
    void carregar();
  });

  const serieCaixa = useMemo(() => {
    const ano = r?.ano ?? new Date().getFullYear();
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const movs = [...(r?.movimentos ?? [])].sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
    const saldoMes: (number | null)[] = Array(13).fill(null);
    let saldo = 0;
    let carry = 0;
    for (const m of movs) {
      saldo += m.tipo === "Saque" ? -m.valor : m.valor;
      const data = String(m.data);
      const iso = data.match(/^(\d{4})-(\d{2})/);
      const br = data.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      const y = iso ? Number(iso[1]) : br ? Number(br[3]) : 0;
      const mes = iso ? Number(iso[2]) : br ? Number(br[2]) : 0;
      if (!y || !mes) continue;
      if (y < ano) {
        carry = saldo;
        continue;
      }
      if (y === ano) saldoMes[mes] = saldo;
    }
    let atual = carry;
    const ate = ano === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;
    const pontos: { rotulo: string; saldo: number }[] = [];
    for (let i = 1; i <= ate; i++) {
      if (saldoMes[i] != null) atual = saldoMes[i] as number;
      pontos.push({ rotulo: meses[i - 1], saldo: atual });
    }
    return pontos;
  }, [r]);

  const mesAtual = new Date().getMonth() + 1;
  const ordem = useOrdenacao<"data" | "tipo" | "descricao" | "valor" | "saldo">("data");
  const ordemMes = useOrdenacao<"mes" | "entradas" | "saidas" | "saldo">("mes");
  const livro = ordem.ordenar(r?.movimentos ?? [], (m, k) => {
    if (k === "data") return m.data;
    if (k === "tipo") return m.tipo;
    if (k === "descricao") return m.descricao ?? "";
    if (k === "valor") return m.valor;
    return m.saldoAcumulado;
  });

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Módulo"
        title="Caixa físico · Depósito e saque em espécie"
        description="Saldo = depósitos − saques, na ordem do livro. O resumo mensal usa só datas válidas, como o SUMIFS da planilha. Rendimentos do tipo Espécie (consultório) aparecem ao lado para conferência."
      />

      {erro ? <p className="mb-4 text-sm text-loss">{erro}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Saldo atual em espécie" value={formatBRL(r?.saldoAtual)} tom="accent" />
        <KpiCard label="Depósitos" value={formatBRL(r?.depositosTotal)} tom="gain" />
        <KpiCard label="Saques" value={formatBRL(r?.saquesTotal)} tom="loss" />
        <KpiCard
          label="Espécie · consultório (ano)"
          value={formatBRL(r?.especieConsultorio)}
          hint="Rendimentos tipo Espécie no ano corrente — não entram no saldo até haver depósito"
        />
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Análise do caixa
      </p>
      <p className="mb-4 text-sm text-subtle">
        Depósitos e saques são lançados em Lançamentos → Caixa físico. Esta tela mostra o extrato e a
        conferência.
      </p>
      <Link
        to="/lancamentos"
        search={{ tipo: "caixa" }}
        className="mb-8 inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
      >
        Lançar depósito ou saque
      </Link>

      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Evolução do saldo em espécie
      </p>
      <div className="mb-8 rounded-[16px] border border-border bg-surface p-3">
        {serieCaixa.length ? (
          <GraficoCaixa dados={serieCaixa} />
        ) : (
          <p className="px-2 py-6 text-sm text-subtle">Sem movimentos para desenhar a evolução.</p>
        )}
      </div>

      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Resumo mensal {r ? `· ${r.ano}` : ""}
      </p>
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="zebra min-w-[520px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2.5"><button type="button" onClick={() => ordemMes.toggle("mes")}>Mês{rotuloOrdem(ordemMes.chave === "mes", ordemMes.dir)}</button></th>
              <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordemMes.toggle("entradas")}>Entradas{rotuloOrdem(ordemMes.chave === "entradas", ordemMes.dir)}</button></th>
              <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordemMes.toggle("saidas")}>Saídas{rotuloOrdem(ordemMes.chave === "saidas", ordemMes.dir)}</button></th>
              <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordemMes.toggle("saldo")}>Saldo do mês{rotuloOrdem(ordemMes.chave === "saldo", ordemMes.dir)}</button></th>
            </tr>
          </thead>
          <tbody>
            {ordemMes
              .ordenar(r?.meses ?? [], (l, k) =>
                k === "mes" ? l.mes : k === "entradas" ? l.entradas : k === "saidas" ? l.saidas : l.saldoMes,
              )
              .map((l) => (
              <tr key={l.mes} className={l.mes === mesAtual ? "bg-accent/10" : undefined}>
                <td className="px-3 py-2 font-medium">{l.nome}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-gain">{formatBRL(l.entradas)}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-loss">{formatBRL(l.saidas)}</td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-mono tabular",
                    l.saldoMes < 0 ? "text-loss" : "text-fg",
                  )}
                >
                  {formatBRL(l.saldoMes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mb-3 mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        Livro de movimentações
      </p>
      <div className="overflow-x-auto rounded-[16px] border border-border">
        <table className="zebra min-w-[640px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-surface-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2.5"><button type="button" onClick={() => ordem.toggle("data")}>Data{rotuloOrdem(ordem.chave === "data", ordem.dir)}</button></th>
              <th className="px-3 py-2.5"><button type="button" onClick={() => ordem.toggle("tipo")}>Tipo{rotuloOrdem(ordem.chave === "tipo", ordem.dir)}</button></th>
              <th className="px-3 py-2.5"><button type="button" onClick={() => ordem.toggle("descricao")}>Descrição{rotuloOrdem(ordem.chave === "descricao", ordem.dir)}</button></th>
              <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordem.toggle("valor")}>Valor{rotuloOrdem(ordem.chave === "valor", ordem.dir)}</button></th>
              <th className="px-3 py-2.5 text-right"><button type="button" onClick={() => ordem.toggle("saldo")}>Saldo acum.{rotuloOrdem(ordem.chave === "saldo", ordem.dir)}</button></th>
            </tr>
          </thead>
          <tbody>
            {livro.map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2 font-mono tabular">{formatData(m.data)}</td>
                <td className={cn("px-3 py-2", m.tipo === "Saque" ? "text-loss" : "text-gain")}>{m.tipo}</td>
                <td className="px-3 py-2 text-muted">{m.descricao ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono tabular">{formatBRL(m.valor)}</td>
                <td className="px-3 py-2 text-right font-mono tabular text-fg">{formatBRL(m.saldoAcumulado)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="mr-2 text-accent"
                    onClick={() => {
                      setEdit(m);
                      setEditValor(formatNumeroBR(m.valor));
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="text-loss"
                    onClick={() => void excluirMovimentos([m.id]).then(carregar)}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit ? (
        <form
          className="mt-4 grid grid-cols-1 gap-3 rounded-[16px] border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void atualizarMovimento(edit.id, {
              data: edit.data.slice(0, 10),
              tipo: edit.tipo,
              valor: parseNumeroBR(editValor),
              descricao: edit.descricao ?? "",
            }).then(async () => {
              setEdit(null);
              await carregar();
            });
          }}
        >
          <label className="text-xs text-muted">Data
            <input type="date" className="mt-1 h-9 w-full rounded-md border border-input-border bg-input px-2 text-sm" value={edit.data.slice(0, 10)} onChange={(e) => setEdit({ ...edit, data: e.target.value })} />
          </label>
          <label className="text-xs text-muted">Tipo
            <select className="mt-1 h-9 w-full rounded-md border border-input-border bg-input px-2 text-sm" value={edit.tipo} onChange={(e) => setEdit({ ...edit, tipo: e.target.value as "Depósito" | "Saque" })}>
              <option>Depósito</option>
              <option>Saque</option>
            </select>
          </label>
          <label className="text-xs text-muted">Valor
            <CampoValor value={editValor} onChange={setEditValor} />
          </label>
          <label className="text-xs text-muted">Descrição
            <input className="mt-1 h-9 w-full rounded-md border border-input-border bg-input px-2 text-sm" value={edit.descricao ?? ""} onChange={(e) => setEdit({ ...edit, descricao: e.target.value })} />
          </label>
          <div className="flex gap-2 lg:col-span-4">
            <Button type="submit">Salvar</Button>
            <Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button>
          </div>
        </form>
      ) : null}

      <ConferenciaCaixaPainel modo="completo" onAjuste={() => void carregar()} />
    </div>
  );
}
