/**
 * Financeiro — rendimentos, despesas, fluxo e projeção (aba FINANCEIRO / TABELAS).
 * Compõe o motor IRPFM já existente; não altera as fórmulas do módulo 02.
 */

import { consultar, getDb, type LinhaSql } from "@/lib/financeiro/db";
import { resumirCaixa } from "@/services/caixa-service";
import { calcularMotorMensal, MESES_CURTOS } from "@/services/irpf-service";
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

function parseIso(iso: unknown): { ano: number; mes: number; raw: string } | null {
  const s = str(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return { ano: Number(s.slice(0, 4)), mes: Number(s.slice(5, 7)), raw: s };
}

function situacaoViva(venc: string, pagto: string | null, hoje: string): "Pago" | "Atrasado" | "Aberto" {
  if (pagto) return "Pago";
  return hoje > venc ? "Atrasado" : "Aberto";
}

export type Despesa = {
  vencimento: string;
  categoria: string | null;
  descricao: string | null;
  instituicao: string | null;
  valor: number;
  pagamento: string | null;
  situacao: "Pago" | "Atrasado" | "Aberto";
};

export type LinhaProjecao = {
  mes: number;
  nome: string;
  totalRendimentos: number;
  computaveis: number;
  naoTributaveis: number;
  despesasPagas: number;
  saldoMensal: number;
  escudoFiscal: number;
  darf: number;
  saldoAcumulado: number;
};

export type LinhaComparativo = {
  mes: number;
  nome: string;
  despesasPagas: number;
  deltaReais: number | null;
  deltaPct: number | null;
};

export type ResumoFinanceiro = {
  ano: number;
  mesAtual: number;
  rendimentosTotais: number;
  despesasPagas: number;
  despesasAPagar: number;
  saldoAcumulado: number;
  caixaFisico: number;
  mediaMensalDespesas: number;
  taxaPoupanca: number | null;
  despSobreRend: number | null;
  aportesAno: number;
  resgatesAno: number;
  gcNacionalAno: number;
  saldoLiquidoAportes: number;
  projecao: LinhaProjecao[];
  comparativo: LinhaComparativo[];
  despesas: Despesa[];
};

export async function resumoAnual(anoForcado?: number): Promise<ResumoFinanceiro> {
  await garantirImportacaoInicial();
  const irpf = await calcularMotorMensal(anoForcado);
  const caixa = await resumirCaixa(anoForcado ?? irpf.ano);
  const db = await getDb();
  const ano = irpf.ano;
  const hoje = new Date().toISOString().slice(0, 10);

  const brutoMes = Array(13).fill(0);
  for (const r of consultar(db, `SELECT data, valor_bruto_brl FROM rendimentos`)) {
    const dt = parseIso(campo(r, "data"));
    if (dt?.ano !== ano) continue;
    brutoMes[dt.mes] += num(campo(r, "valor_bruto_brl"));
  }

  const despesas: Despesa[] = [];
  const pagasMes = Array(13).fill(0);
  let despesasPagas = 0;
  let despesasAPagar = 0;

  for (const r of consultar(
    db,
    `SELECT data_vencimento, categoria, descricao, instituicao, valor, data_pagamento FROM despesas`,
  )) {
    const venc = parseIso(campo(r, "data_vencimento"));
    if (!venc) continue;
    const pagtoRaw = str(campo(r, "data_pagamento")) || null;
    const pagto = pagtoRaw && parseIso(pagtoRaw) ? parseIso(pagtoRaw)!.raw : pagtoRaw;
    const sit = situacaoViva(venc.raw, pagto && parseIso(pagto) ? pagto : null, hoje);
    const valor = num(campo(r, "valor"));
    if (sit === "Pago") {
      despesasPagas += valor;
      if (venc.ano === ano) pagasMes[venc.mes] += valor;
    } else {
      despesasAPagar += valor;
    }
    despesas.push({
      vencimento: venc.raw,
      categoria: str(campo(r, "categoria")) || null,
      descricao: str(campo(r, "descricao")) || null,
      instituicao: str(campo(r, "instituicao")) || null,
      valor,
      pagamento: pagto && parseIso(pagto) ? pagto : null,
      situacao: sit,
    });
  }

  despesas.sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  const projecao: LinhaProjecao[] = [];
  let acum = 0;
  for (let mes = 1; mes <= 12; mes++) {
    const motor = irpf.motor[mes - 1];
    const darf = irpf.darf[mes - 1];
    const computaveis = motor.baseMensal;
    const naoTributaveis = brutoMes[mes] - motor.distLucros - motor.demaisComputaveis;
    const totalRendimentos = brutoMes[mes] + motor.gcObrigatorio;
    const desp = pagasMes[mes];
    const saldoMensal = totalRendimentos - desp;
    acum += saldoMensal;
    projecao.push({
      mes,
      nome: MESES_CURTOS[mes - 1],
      totalRendimentos,
      computaveis,
      naoTributaveis,
      despesasPagas: desp,
      saldoMensal,
      escudoFiscal: motor.escudoFiscal,
      darf: darf.darfGerado,
      saldoAcumulado: acum,
    });
  }

  const comparativo: LinhaComparativo[] = projecao.map((l, i) => {
    if (i === 0) {
      return { mes: l.mes, nome: l.nome, despesasPagas: l.despesasPagas, deltaReais: null, deltaPct: null };
    }
    const ant = projecao[i - 1].despesasPagas;
    const delta = l.despesasPagas - ant;
    const deltaPct = ant === 0 ? 0 : delta / ant;
    return { mes: l.mes, nome: l.nome, despesasPagas: l.despesasPagas, deltaReais: delta, deltaPct };
  });

  const rendimentosTotais = irpf.rendimentosTotais;
  const saldoAcumulado = rendimentosTotais - despesasPagas;

  return {
    ano,
    mesAtual: irpf.mesAtual,
    rendimentosTotais,
    despesasPagas,
    despesasAPagar,
    saldoAcumulado,
    caixaFisico: caixa.saldoAtual,
    mediaMensalDespesas: despesasPagas / 12,
    taxaPoupanca: rendimentosTotais ? saldoAcumulado / rendimentosTotais : null,
    despSobreRend: rendimentosTotais ? despesasPagas / rendimentosTotais : null,
    aportesAno: irpf.aportesAno,
    resgatesAno: irpf.resgatesAno,
    gcNacionalAno: irpf.gcNacionalAno,
    saldoLiquidoAportes: irpf.aportesAno - irpf.resgatesAno,
    projecao,
    comparativo,
    despesas,
  };
}
