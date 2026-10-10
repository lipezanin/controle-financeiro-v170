/**
 * Motor IRPFM (Lei 15.270/2025) e DARF 6015 — mesmas fórmulas da aba IMPOSTO.
 *
 * Alíquota efetiva sobre a base acumulada:
 *   até R$ 600 mil → 0%
 *   de 600 mil a 1,2 milhão → rampa linear 0–10%
 *   acima de R$ 1,2 milhão → 10%
 * Imposto teórico = base_acumulada × alíquota.
 * Escudo fiscal = crédito acumulado (IR retido + DARF pago) − imposto teórico.
 */

import { consultar, getDb, type LinhaSql } from "@/lib/financeiro/db";
import { garantirImportacaoInicial } from "@/utils/import-excel";

export const TIPO_CONSULTORIO = "Distribuição de Lucros - Consultório Médico";

export const MESES_CURTOS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

const EPS = 1e-9;

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

function parseIso(iso: unknown): { ano: number; mes: number } | null {
  const s = str(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return { ano: Number(s.slice(0, 4)), mes: Number(s.slice(5, 7)) };
}

/** Tabela mensal simplificada do carnê-leão (GC internacional), como no Excel. */
export function impostoCarneLeao(gc: number): number {
  if (gc <= 0) return 0;
  let ir = 0;
  if (gc <= 2259.2) ir = 0;
  else if (gc <= 2826.65) ir = gc * 0.075 - 169.44;
  else if (gc <= 3751.05) ir = gc * 0.15 - 381.44;
  else if (gc <= 4664.68) ir = gc * 0.225 - 662.77;
  else ir = gc * 0.275 - 896;
  return Math.max(0, ir - 479);
}

export function aliquotaIrpfm(baseAcum: number, isentoAte: number, rampaAte: number, aliqMax: number): number {
  if (baseAcum <= isentoAte) return 0;
  if (baseAcum >= rampaAte) return aliqMax;
  return ((baseAcum - isentoAte) / (rampaAte - isentoAte)) * aliqMax;
}

export type LinhaMotor = {
  mes: number;
  nome: string;
  distLucros: number;
  demaisComputaveis: number;
  gcObrigatorio: number;
  baseMensal: number;
  baseAcumulada: number;
  creditoRendimentos: number;
  creditoDarfGc: number;
  creditoMensal: number;
  creditoAcumulado: number;
  aliquotaEfetiva: number;
  impostoTeorico: number;
  escudoFiscal: number;
  tetoAdicional: number;
};

export type LinhaDarf = {
  mes: number;
  nome: string;
  gcNacional: number;
  vendasNacionais: number;
  isento20k: boolean;
  darfNacional: number;
  gcFii: number;
  darfFii: number;
  gcInternacional: number;
  darfInternacional: number;
  darfGerado: number;
  darfPago: number;
  aPagar: number;
  prazo: string;
  status: "Não Aplicável" | "Pago" | "Pendente";
};

export type ResumoIrpf = {
  ano: number;
  mesAtual: number;
  mesesRestantes: number;
  isentoAte: number;
  rampaAte: number;
  aliqMax: number;
  darfCodigo: string;
  isencaoMensal: number;
  baseComputavelAcum: number;
  creditoAcumulado: number;
  aliquotaEfetiva: number;
  impostoTeorico: number;
  escudoFiscal: number;
  jaDistribuidoMes: number;
  tetoAdicionalMes: number;
  headroom: number;
  limiteMensalDistribuicao: number;
  rendimentosTotais: number;
  naoTributaveis: number;
  pctComputaveis: number | null;
  aportesAno: number;
  resgatesAno: number;
  gcNacionalAno: number;
  gcInternacionalAno: number;
  darfGeradoAno: number;
  darfPagoAno: number;
  darfPendente: number;
  motor: LinhaMotor[];
  darf: LinhaDarf[];
};

function ultimoDiaProximoMes(ano: number, mes: number): string {
  const d = new Date(ano, mes + 1, 0);
  return d.toLocaleDateString("pt-BR");
}

function lerConfig(db: Awaited<ReturnType<typeof getDb>>): {
  ano: number;
  isentoAte: number;
  rampaAte: number;
  aliqMax: number;
  darfCodigo: string;
  isencaoMensal: number;
} {
  const linhas = consultar(db, "SELECT chave, valor FROM configuracoes");
  const mapa = new Map<string, string>();
  for (const r of linhas) {
    mapa.set(str(campo(r, "chave")), str(campo(r, "valor")));
  }
  const agora = new Date();
  return {
    ano: Number(mapa.get("ano_corrente")) || agora.getFullYear(),
    isentoAte: Number(mapa.get("irpfm_isento_ate")) || 600_000,
    rampaAte: Number(mapa.get("irpfm_rampa_ate")) || 1_200_000,
    aliqMax: Number(mapa.get("irpfm_aliquota_max")) || 0.1,
    darfCodigo: mapa.get("darf_codigo") || "6015",
    isencaoMensal: Number(mapa.get("darf_isencao_mensal")) || 20_000,
  };
}

export async function calcularMotorMensal(anoForcado?: number): Promise<ResumoIrpf> {
  await garantirImportacaoInicial();
  const db = await getDb();
  const cfg = lerConfig(db);
  const ano = anoForcado ?? cfg.ano;
  const agora = new Date();
  const mesAtual = agora.getFullYear() === ano ? agora.getMonth() + 1 : 12;
  const mesesRestantes = Math.max(1, 12 - mesAtual + 1);

  const rendimentos = consultar(
    db,
    `SELECT data, tipo, valor_computavel_irpfm, ir_retido, valor_bruto_brl FROM rendimentos`,
  );
  const transacoes = consultar(
    db,
    `SELECT data, tipo_operacao, categoria, origem, classif_irpfm, ganho_capital_brl, valor_brl
     FROM transacoes`,
  );
  const pagosDarf = consultar(db, `SELECT ano, mes, imposto, pago FROM darf_gc`);

  const pagoPorMes = new Map<number, number>();
  for (const r of pagosDarf) {
    if (num(campo(r, "ano")) !== ano) continue;
    const mes = num(campo(r, "mes"));
    const valor = num(campo(r, "pago")) ? num(campo(r, "imposto")) : 0;
    // A aba IMPOSTO usa a coluna K como valor pago digitado. Se "pago" for flag, soma o imposto.
    pagoPorMes.set(mes, (pagoPorMes.get(mes) ?? 0) + (num(campo(r, "pago")) > 1 ? num(campo(r, "pago")) : valor));
  }

  const dist = Array(13).fill(0);
  const demais = Array(13).fill(0);
  const irRetido = Array(13).fill(0);
  let rendimentosTotais = 0;

  for (const r of rendimentos) {
    const dt = parseIso(campo(r, "data"));
    if (!dt || dt.ano !== ano) continue;
    const t = num(campo(r, "valor_computavel_irpfm"));
    const bruto = num(campo(r, "valor_bruto_brl"));
    rendimentosTotais += bruto;
    if (str(campo(r, "tipo")) === TIPO_CONSULTORIO) dist[dt.mes] += t;
    else demais[dt.mes] += t;
    irRetido[dt.mes] += num(campo(r, "ir_retido"));
  }

  const gcObrig = Array(13).fill(0);
  const gcNac = Array(13).fill(0);
  const vendasNac = Array(13).fill(0);
  const gcFii = Array(13).fill(0);
  const gcIntl = Array(13).fill(0);
  let aportesAno = 0;
  let resgatesAno = 0;
  let gcNacionalAno = 0;
  let gcInternacionalAno = 0;

  for (const r of transacoes) {
    const dt = parseIso(campo(r, "data"));
    if (!dt) continue;
    const tipo = str(campo(r, "tipo_operacao"));
    const origem = str(campo(r, "origem"));
    const categoria = str(campo(r, "categoria"));
    const classif = str(campo(r, "classif_irpfm"));
    const gc = num(campo(r, "ganho_capital_brl"));
    const valor = num(campo(r, "valor_brl"));

    // A aba IMPOSTO DE RENDA soma o livro inteiro nestes três cards (sem filtro de ano).
    if (tipo === "Compra" || tipo === "Parcela Imóvel" || tipo === "ITBI / Cartório") {
      aportesAno += valor;
    }
    if (tipo === "Venda") {
      resgatesAno += valor;
      gcNacionalAno += origem === "Internacional" ? 0 : gc;
      gcInternacionalAno += origem === "Internacional" ? gc : 0;
    }

    if (dt.ano !== ano) continue;
    if (tipo === "Venda") {
      if (classif === "Obrigatório") gcObrig[dt.mes] += gc;
      if (origem === "Nacional") {
        vendasNac[dt.mes] += valor;
        if (classif === "Obrigatório" && categoria !== "Fundos Imobiliários") {
          gcNac[dt.mes] += gc;
        }
      }
      if (categoria === "Fundos Imobiliários") gcFii[dt.mes] += gc;
      if (origem === "Internacional") gcIntl[dt.mes] += gc;
    }
  }

  const motor: LinhaMotor[] = [];
  let baseAcum = 0;
  let credAcum = 0;

  for (let mes = 1; mes <= 12; mes++) {
    const baseMensal = dist[mes] + demais[mes] + gcObrig[mes];
    baseAcum += baseMensal;
    const credDarf = pagoPorMes.get(mes) ?? 0;
    const credMes = irRetido[mes] + credDarf;
    credAcum += credMes;
    const aliq = aliquotaIrpfm(baseAcum, cfg.isentoAte, cfg.rampaAte, cfg.aliqMax);
    const imposto = baseAcum * aliq;
    const escudo = credAcum - imposto;
    // Teto extra de distribuição no mês: headroom até o piso + conversão do escudo a 10%.
    const teto =
      escudo > EPS ? cfg.isentoAte - baseAcum + dist[mes] + escudo / cfg.aliqMax : 0;
    motor.push({
      mes,
      nome: MESES_CURTOS[mes - 1],
      distLucros: dist[mes],
      demaisComputaveis: demais[mes],
      gcObrigatorio: gcObrig[mes],
      baseMensal,
      baseAcumulada: baseAcum,
      creditoRendimentos: irRetido[mes],
      creditoDarfGc: credDarf,
      creditoMensal: credMes,
      creditoAcumulado: credAcum,
      aliquotaEfetiva: aliq,
      impostoTeorico: imposto,
      escudoFiscal: escudo,
      tetoAdicional: teto,
    });
  }

  const darf: LinhaDarf[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const isento20k = vendasNac[mes] <= cfg.isencaoMensal + EPS;
    const darfNacional = isento20k ? 0 : gcNac[mes] * 0.15;
    const darfFii = gcFii[mes] * 0.2;
    const darfInternacional = impostoCarneLeao(gcIntl[mes]);
    const gerado = darfNacional + darfFii + darfInternacional;
    const pago = pagoPorMes.get(mes) ?? 0;
    const aPagar = Math.max(0, gerado - pago);
    let status: LinhaDarf["status"] = "Não Aplicável";
    if (gerado > EPS) status = pago + EPS >= gerado ? "Pago" : "Pendente";
    darf.push({
      mes,
      nome: MESES_CURTOS[mes - 1],
      gcNacional: gcNac[mes],
      vendasNacionais: vendasNac[mes],
      isento20k,
      darfNacional,
      gcFii: gcFii[mes],
      darfFii,
      gcInternacional: gcIntl[mes],
      darfInternacional,
      darfGerado: gerado,
      darfPago: pago,
      aPagar,
      prazo: ultimoDiaProximoMes(ano, mes),
      status,
    });
  }

  const ytd = motor[11];
  const atual = motor[mesAtual - 1];
  const darfGeradoAno = darf.reduce((s, l) => s + l.darfGerado, 0);
  const darfPagoAno = darf.reduce((s, l) => s + l.darfPago, 0);
  const darfPendente = darf.reduce((s, l) => s + l.aPagar, 0);
  const headroom = Math.max(0, cfg.isentoAte - ytd.baseAcumulada);

  return {
    ano,
    mesAtual,
    mesesRestantes,
    isentoAte: cfg.isentoAte,
    rampaAte: cfg.rampaAte,
    aliqMax: cfg.aliqMax,
    darfCodigo: cfg.darfCodigo,
    isencaoMensal: cfg.isencaoMensal,
    baseComputavelAcum: ytd.baseAcumulada,
    creditoAcumulado: ytd.creditoAcumulado,
    aliquotaEfetiva: ytd.aliquotaEfetiva,
    impostoTeorico: ytd.impostoTeorico,
    escudoFiscal: ytd.escudoFiscal,
    jaDistribuidoMes: atual.distLucros,
    tetoAdicionalMes: atual.tetoAdicional,
    headroom,
    limiteMensalDistribuicao: headroom / mesesRestantes,
    rendimentosTotais,
    naoTributaveis: rendimentosTotais - ytd.baseAcumulada,
    pctComputaveis: rendimentosTotais ? ytd.baseAcumulada / rendimentosTotais : null,
    aportesAno,
    resgatesAno,
    gcNacionalAno,
    gcInternacionalAno,
    darfGeradoAno,
    darfPagoAno,
    darfPendente,
    motor,
    darf,
  };
}
