/**
 * Relatório IRPF ano-base (guarda de documentação).
 * Inclui rendimentos financeiros, aquisições e patrimônio.
 * EXCLUI caixa físico e recebimentos EM ESPÉCIE. Demais rendimentos do consultório entram.
 * Não altera o motor IRPFM.
 */

import { consultar, getDb, type LinhaSql } from "@/lib/financeiro/db";
import { formatBRL } from "@/lib/financeiro/format";
import { garantirImportacaoInicial } from "@/utils/import-excel";

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}
function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function campo(row: LinhaSql, nome: string): unknown {
  if (row[nome] != null) return row[nome];
  const alvo = nome.toLowerCase();
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase() === alvo) return v;
  }
  return null;
}
function parseIso(iso: unknown): { ano: number; raw: string } | null {
  const s = str(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return { ano: Number(s.slice(0, 4)), raw: s };
}
function ehEspecie(tipo: string): boolean {
  const t = tipo.trim().toLowerCase();
  return t === "espécie" || t === "especie";
}

export type LinhaRelatorio = {
  data: string;
  tipo: string;
  ticker: string;
  descricao: string;
  valor: number;
};

export type RelatorioIrpf = {
  ano: number;
  rendimentosTotais: number;
  especieExcluida: number;
  porTipo: { tipo: string; valor: number }[];
  aquisicoes: number;
  vendas: number;
  proventos: number;
  gcRealizado: number;
  patrimonioInicial: number;
  patrimonioFinal: number;
  linhasRend: LinhaRelatorio[];
  linhasAquisicoes: LinhaRelatorio[];
  linhasVendas: LinhaRelatorio[];
};

export async function montarRelatorioIrpf(anoForcado?: number): Promise<RelatorioIrpf> {
  await garantirImportacaoInicial();
  const db = await getDb();
  const ano = anoForcado ?? new Date().getFullYear();
  const corteIni = `${ano}-01-01`;
  const corteFim = `${ano + 1}-01-01`;

  const rendRows = consultar(
    db,
    `SELECT data, tipo, ticker, descricao, valor_bruto_brl, valor_liquido FROM rendimentos`,
  );
  const tx = consultar(
    db,
    `SELECT data, tipo_operacao, ticker, categoria, valor_brl, ganho_capital_brl FROM transacoes`,
  );
  const rf = consultar(
    db,
    `SELECT data_aplicacao AS data, ticker, nome, valor_aplicado FROM renda_fixa
     WHERE tipo_movimento = 'Aplicação' AND COALESCE(valor_aplicado, 0) > 0`,
  );

  const linhasRend: LinhaRelatorio[] = [];
  const porTipoMap = new Map<string, number>();
  let especieExcluida = 0;
  let proventos = 0;

  for (const r of rendRows) {
    const dt = parseIso(campo(r, "data"));
    if (!dt || dt.ano !== ano) continue;
    const tipo = str(campo(r, "tipo")) || "Outros";
    const bruto = num(campo(r, "valor_bruto_brl"));
    if (ehEspecie(tipo)) {
      especieExcluida += bruto;
      continue;
    }
    porTipoMap.set(tipo, (porTipoMap.get(tipo) ?? 0) + bruto);
    const ticker = str(campo(r, "ticker"));
    if (ticker) proventos += num(campo(r, "valor_liquido")) || bruto;
    linhasRend.push({
      data: dt.raw,
      tipo,
      ticker,
      descricao: str(campo(r, "descricao")),
      valor: bruto,
    });
  }

  const linhasAquisicoes: LinhaRelatorio[] = [];
  const linhasVendas: LinhaRelatorio[] = [];
  let aquisicoes = 0;
  let vendas = 0;
  let gcRealizado = 0;
  let patIni = 0;
  let patFim = 0;

  for (const r of tx) {
    const dt = parseIso(campo(r, "data"));
    if (!dt) continue;
    const tipo = str(campo(r, "tipo_operacao"));
    const valor = num(campo(r, "valor_brl"));
    const compra = tipo === "Compra" || tipo === "Parcela Imóvel" || tipo === "ITBI / Cartório";
    const venda = tipo === "Venda";
    if (compra && dt.raw < corteIni) patIni += valor;
    if (venda && dt.raw < corteIni) patIni -= valor;
    if (compra && dt.raw < corteFim) patFim += valor;
    if (venda && dt.raw < corteFim) patFim -= valor;
    if (dt.ano !== ano) continue;
    if (compra) {
      aquisicoes += valor;
      linhasAquisicoes.push({
        data: dt.raw,
        tipo,
        ticker: str(campo(r, "ticker")),
        descricao: str(campo(r, "categoria")),
        valor,
      });
    }
    if (venda) {
      vendas += valor;
      gcRealizado += num(campo(r, "ganho_capital_brl"));
      linhasVendas.push({
        data: dt.raw,
        tipo,
        ticker: str(campo(r, "ticker")),
        descricao: str(campo(r, "categoria")),
        valor,
      });
    }
  }

  for (const r of rf) {
    const dt = parseIso(campo(r, "data"));
    if (!dt) continue;
    const valor = num(campo(r, "valor_aplicado"));
    if (dt.raw < corteIni) patIni += valor;
    if (dt.raw < corteFim) patFim += valor;
    if (dt.ano !== ano) continue;
    aquisicoes += valor;
    linhasAquisicoes.push({
      data: dt.raw,
      tipo: "Aplicação RF",
      ticker: str(campo(r, "ticker")),
      descricao: str(campo(r, "nome")),
      valor,
    });
  }

  linhasRend.sort((a, b) => a.data.localeCompare(b.data));
  linhasAquisicoes.sort((a, b) => a.data.localeCompare(b.data));
  linhasVendas.sort((a, b) => a.data.localeCompare(b.data));

  const rendimentosTotais = [...porTipoMap.values()].reduce((a, b) => a + b, 0);
  const porTipo = [...porTipoMap.entries()]
    .map(([tipo, valor]) => ({ tipo, valor }))
    .sort((a, b) => b.valor - a.valor);

  return {
    ano,
    rendimentosTotais,
    especieExcluida,
    porTipo,
    aquisicoes,
    vendas,
    proventos,
    gcRealizado,
    patrimonioInicial: patIni,
    patrimonioFinal: patFim,
    linhasRend,
    linhasAquisicoes,
    linhasVendas,
  };
}

function csvEsc(s: string): string {
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRelatorioIrpf(r: RelatorioIrpf): string {
  const linhas = [
    `Relatório IRPF ano-base;${r.ano}`,
    "Exclui caixa físico e recebimento em espécie",
    `Rendimentos financeiros;${r.rendimentosTotais.toFixed(2)}`,
    `Espécie excluída;${r.especieExcluida.toFixed(2)}`,
    `Aquisições;${r.aquisicoes.toFixed(2)}`,
    `Vendas / resgates;${r.vendas.toFixed(2)}`,
    `Proventos;${r.proventos.toFixed(2)}`,
    `GC realizado;${r.gcRealizado.toFixed(2)}`,
    `Patrimônio inicial;${r.patrimonioInicial.toFixed(2)}`,
    `Patrimônio final;${r.patrimonioFinal.toFixed(2)}`,
    "",
    "Rendimentos (sem espécie)",
    "Data;Tipo;Ticker;Descrição;Valor",
    ...r.linhasRend.map(
      (l) => `${l.data};${csvEsc(l.tipo)};${csvEsc(l.ticker)};${csvEsc(l.descricao)};${l.valor.toFixed(2)}`,
    ),
    "",
    "Aquisições",
    "Data;Tipo;Ticker;Descrição;Valor",
    ...r.linhasAquisicoes.map(
      (l) => `${l.data};${csvEsc(l.tipo)};${csvEsc(l.ticker)};${csvEsc(l.descricao)};${l.valor.toFixed(2)}`,
    ),
  ];
  return "\uFEFF" + linhas.join("\n");
}

export function htmlRelatorioIrpf(r: RelatorioIrpf): string {
  const kpi = (k: string, v: number) =>
    `<div class="kpi">${k}<b>${formatBRL(v)}</b></div>`;
  const tab = (titulo: string, linhas: LinhaRelatorio[]) =>
    `<h2>${titulo}</h2><table><thead><tr><th>Data</th><th>Tipo</th><th>Ticker</th><th>Descrição</th><th class="num">Valor</th></tr></thead><tbody>${linhas
      .map(
        (l) =>
          `<tr><td>${l.data}</td><td>${l.tipo}</td><td>${l.ticker}</td><td>${l.descricao}</td><td class="num">${formatBRL(l.valor)}</td></tr>`,
      )
      .join("")}</tbody></table>`;
  return `<h1>Relatório IRPF · ano-base ${r.ano}</h1>
<p class="sub">Rendimentos financeiros, aquisições e patrimônio. Sem caixa físico e sem espécie em dinheiro. Distribuição de lucros do consultório incluída.</p>
<div class="kpis">
${kpi("Rendimentos (sem espécie)", r.rendimentosTotais)}
${kpi("Espécie excluída", r.especieExcluida)}
${kpi("Aquisições", r.aquisicoes)}
${kpi("Vendas / resgates", r.vendas)}
${kpi("Proventos", r.proventos)}
${kpi("GC realizado", r.gcRealizado)}
${kpi("Patrimônio inicial", r.patrimonioInicial)}
${kpi("Patrimônio final", r.patrimonioFinal)}
</div>
<h2>Por tipo de rendimento</h2>
<table><thead><tr><th>Tipo</th><th class="num">Valor</th></tr></thead><tbody>
${r.porTipo.map((t) => `<tr><td>${t.tipo}</td><td class="num">${formatBRL(t.valor)}</td></tr>`).join("")}
</tbody></table>
${tab("Rendimentos do ano", r.linhasRend)}
${tab("Aquisições do ano", r.linhasAquisicoes)}`;
}
