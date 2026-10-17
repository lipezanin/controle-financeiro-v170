/**
 * Controle fiscal de crescimento de patrimônio.
 *
 * A Receita cruza rendimentos declarados com o aumento de bens (DIRPF / e-Financeira).
 * Se as compras de ativos no ano superam rendimentos + resgates, sobra um saldo
 * a justificar — “dinheiro frio”, omissão ou doação/herança não informada.
 *
 * Não altera o motor IRPFM (Lei 15.270/2025). Só lê o SQLite já importado.
 */

import { consultar, executar, getDb, salvarDb, type LinhaSql } from "@/lib/financeiro/db";
import { MESES_CURTOS } from "@/services/irpf-service";
import { garantirImportacaoInicial } from "@/utils/import-excel";

const COMPRAS = "('Compra','Parcela Imóvel','ITBI / Cartório')";
const LIMIAR_PADRAO = 0.8;

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

function parseIso(iso: unknown): { ano: number; mes: number; raw: string } | null {
  const s = str(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return { ano: Number(s.slice(0, 4)), mes: Number(s.slice(5, 7)), raw: s };
}

export type LinhaFiscalMes = {
  mes: number;
  nome: string;
  rendimentos: number;
  aportes: number;
  resgates: number;
  proventos: number;
  gcRealizado: number;
  consistencia: number;
  patrimonioAcum: number;
};

export type ResumoFiscal = {
  ano: number;
  rendimentosTotais: number;
  especieExcluida: number;
  aportesAno: number;
  resgatesAno: number;
  proventosAno: number;
  gcRealizadoAno: number;
  patrimonioInicial: number;
  patrimonioFinal: number;
  variacaoPatrimonio: number;
  consistencia: number;
  cobertura: number | null;
  limiar: number;
  alerta: "ok" | "atencao" | "risco";
  meses: LinhaFiscalMes[];
};

/** Só o recebimento EM ESPÉCIE. Distribuição de lucros e demais do consultório entram na soma. */
function ehEspecieConsultorio(tipo: string): boolean {
  const t = tipo.trim().toLowerCase();
  return t === "espécie" || t === "especie";
}

function somarFluxo(
  linhas: { data: unknown; valor: number }[],
  pred: (dt: { ano: number; mes: number; raw: string }) => boolean,
): number {
  let s = 0;
  for (const l of linhas) {
    const dt = parseIso(l.data);
    if (!dt) continue;
    if (pred(dt)) s += l.valor;
  }
  return s;
}

export async function resumirControleFiscal(anoForcado?: number): Promise<ResumoFiscal> {
  await garantirImportacaoInicial();
  const db = await getDb();
  const cfg = consultar(db, "SELECT chave, valor FROM configuracoes");
  const mapa = new Map<string, string>();
  for (const r of cfg) mapa.set(str(campo(r, "chave")), str(campo(r, "valor")));
  const ano = anoForcado ?? (Number(mapa.get("ano_corrente")) || new Date().getFullYear());
  const limiar = Number(mapa.get("cobertura_fiscal_min")) || LIMIAR_PADRAO;
  const corteIni = `${ano}-01-01`;
  const corteFim = `${ano + 1}-01-01`;

  const compras: { data: unknown; valor: number }[] = consultar(
    db,
    `SELECT data, valor_brl AS v FROM transacoes WHERE tipo_operacao IN ${COMPRAS}`,
  ).map((r) => ({ data: campo(r, "data"), valor: num(campo(r, "v")) }));

  const vendas: { data: unknown; valor: number }[] = consultar(
    db,
    `SELECT data, valor_brl AS v FROM transacoes WHERE tipo_operacao = 'Venda'`,
  ).map((r) => ({ data: campo(r, "data"), valor: num(campo(r, "v")) }));

  const rfResgates: { data: unknown; valor: number }[] = consultar(
    db,
    `SELECT COALESCE(NULLIF(TRIM(data_resgate), ''), data_aplicacao) AS data,
            CASE
              WHEN COALESCE(valor_liq_recebido, 0) > 0 THEN valor_liq_recebido
              WHEN COALESCE(valor_resgatado, 0) > 0 THEN valor_resgatado
              ELSE COALESCE(valor_aplicado, 0)
            END AS v
     FROM renda_fixa
     WHERE (
       (data_resgate IS NOT NULL AND TRIM(data_resgate) <> '' AND COALESCE(valor_liq_recebido, valor_resgatado, 0) > 0)
       OR tipo_movimento IN ('Resgate', 'Resgate do Principal')
     )`,
  ).map((r) => ({ data: campo(r, "data"), valor: num(campo(r, "v")) }));

  const rf: { data: unknown; valor: number }[] = consultar(
    db,
    `SELECT data_aplicacao AS data, valor_aplicado AS v FROM renda_fixa
     WHERE tipo_movimento = 'Aplicação' AND COALESCE(valor_aplicado, 0) > 0`,
  ).map((r) => ({ data: campo(r, "data"), valor: num(campo(r, "v")) }));

  const rendRows = consultar(
    db,
    `SELECT data, valor_bruto_brl AS bruto, valor_liquido AS liq, ticker, tipo FROM rendimentos`,
  );
  const gcRows = consultar(db, `SELECT data, ganho_capital_brl AS gc FROM transacoes`);

  const antes = (dt: { raw: string }) => dt.raw < corteIni;
  const noAno = (dt: { ano: number }) => dt.ano === ano;

  const patrimonioInicial =
    somarFluxo(compras, antes) + somarFluxo(rf, antes) - somarFluxo(vendas, antes) - somarFluxo(rfResgates, antes);
  const patrimonioFinal =
    somarFluxo(compras, (d) => d.raw < corteFim) +
    somarFluxo(rf, (d) => d.raw < corteFim) -
    somarFluxo(vendas, (d) => d.raw < corteFim) -
    somarFluxo(rfResgates, (d) => d.raw < corteFim);

  const rendMes = Array(13).fill(0);
  const provMes = Array(13).fill(0);
  const apMes = Array(13).fill(0);
  const resgMes = Array(13).fill(0);
  const gcMes = Array(13).fill(0);
  let especieExcluida = 0;

  for (const r of rendRows) {
    const dt = parseIso(campo(r, "data"));
    if (!dt || !noAno(dt)) continue;
    const bruto = num(campo(r, "bruto"));
    // Só espécie em dinheiro. Distribuição de lucros do consultório permanece nos rendimentos.
    if (ehEspecieConsultorio(str(campo(r, "tipo")))) {
      especieExcluida += bruto;
      continue;
    }
    rendMes[dt.mes] += bruto;
    if (str(campo(r, "ticker"))) provMes[dt.mes] += num(campo(r, "liq")) || bruto;
  }
  for (const l of compras) {
    const dt = parseIso(l.data);
    if (dt && noAno(dt)) apMes[dt.mes] += l.valor;
  }
  for (const l of rf) {
    const dt = parseIso(l.data);
    if (dt && noAno(dt)) apMes[dt.mes] += l.valor;
  }
  for (const l of vendas) {
    const dt = parseIso(l.data);
    if (dt && noAno(dt)) resgMes[dt.mes] += l.valor;
  }
  for (const l of rfResgates) {
    const dt = parseIso(l.data);
    if (dt && noAno(dt)) resgMes[dt.mes] += l.valor;
  }
  for (const r of gcRows) {
    const dt = parseIso(campo(r, "data"));
    if (dt && noAno(dt)) gcMes[dt.mes] += num(campo(r, "gc"));
  }

  const rendimentosTotais = rendMes.reduce((a: number, b: number) => a + b, 0);
  const aportesAno = apMes.reduce((a: number, b: number) => a + b, 0);
  const resgatesAno = resgMes.reduce((a: number, b: number) => a + b, 0);
  const proventosAno = provMes.reduce((a: number, b: number) => a + b, 0);
  const gcRealizadoAno = gcMes.reduce((a: number, b: number) => a + b, 0);

  // (Rendimentos + resgates) − aportes: positivo = sobra; negativo = origem a justificar.
  const consistencia = rendimentosTotais + resgatesAno - aportesAno;
  const cobertura = aportesAno > 0 ? (rendimentosTotais + resgatesAno) / aportesAno : null;
  let alerta: ResumoFiscal["alerta"] = "ok";
  if (cobertura != null) {
    if (cobertura < 0.7) alerta = "risco";
    else if (cobertura < limiar) alerta = "atencao";
  } else if (consistencia < 0) {
    alerta = "risco";
  }

  const meses: LinhaFiscalMes[] = [];
  let pat = patrimonioInicial;
  for (let mes = 1; mes <= 12; mes++) {
    pat += apMes[mes] - resgMes[mes];
    meses.push({
      mes,
      nome: MESES_CURTOS[mes - 1],
      rendimentos: rendMes[mes],
      aportes: apMes[mes],
      resgates: resgMes[mes],
      proventos: provMes[mes],
      gcRealizado: gcMes[mes],
      consistencia: rendMes[mes] + resgMes[mes] - apMes[mes],
      patrimonioAcum: pat,
    });
  }

  return {
    ano,
    rendimentosTotais,
    especieExcluida,
    aportesAno,
    resgatesAno,
    proventosAno,
    gcRealizadoAno,
    patrimonioInicial,
    patrimonioFinal,
    variacaoPatrimonio: patrimonioFinal - patrimonioInicial,
    consistencia,
    cobertura,
    limiar,
    alerta,
    meses,
  };
}

export async function gravarLimiarCobertura(pct: number): Promise<void> {
  const v = Math.min(1, Math.max(0.1, pct));
  const db = await getDb();
  executar(db, `INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('cobertura_fiscal_min', ?)`, [
    String(v),
  ]);
  await salvarDb();
}

export function csvControleFiscal(r: ResumoFiscal): string {
  const linhas = [
    "Mês;Rendimentos;Aportes;Resgates;Proventos;GC realizado;Consistência;Patrimônio acum.",
    ...r.meses.map(
      (m) =>
        `${m.nome};${m.rendimentos};${m.aportes};${m.resgates};${m.proventos};${m.gcRealizado};${m.consistencia};${m.patrimonioAcum}`,
    ),
    "",
    `Ano;${r.ano}`,
    `Rendimentos financeiros;${r.rendimentosTotais}`,
    `Espécie excluída (consultório);${r.especieExcluida}`,
    `Aportes;${r.aportesAno}`,
    `Resgates;${r.resgatesAno}`,
    `Variação patrimônio;${r.variacaoPatrimonio}`,
    `Consistência;(rend+resgates)-aportes;${r.consistencia}`,
    `Cobertura;${r.cobertura ?? ""}`,
  ];
  return linhas.join("\n");
}
