/**
 * Contas bancárias e de corretora.
 * O saldo sai das transações, rendimentos, despesas e do caixa físico já lançados.
 * Não há um segundo razão.
 */

import { consultar, executar, getDb, salvarDb, type LinhaSql } from "@/lib/financeiro/db";
import {
  calcularSaldo,
  paraCentavos,
  sinalOperacao,
  type MovimentoConta,
  type ResultadoSaldo,
} from "@/lib/financeiro/contas-saldo";

export type TipoConta = "BANCARIA" | "CORRETORA";
export type PracaConta = "Nacional" | "Internacional";
export type StatusConta = "ativa" | "arquivada";

export type Conta = {
  id: number;
  apelido: string;
  instituicao: string;
  tipo: TipoConta;
  praca: PracaConta;
  moeda: string;
  saldoInicialCentavos: number;
  dataSaldoInicial: string;
  status: StatusConta;
};

export type ResumoConta = Conta & {
  atual: number;
  previsto: number;
  negativoEm: string | null;
};

export type FiltroContas = {
  tipo?: TipoConta | "";
  instituicao?: string;
  status?: StatusConta | "" | "todas";
};

function txt(v: string | number | null | undefined): string {
  return v == null ? "" : String(v);
}

function num(v: string | number | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function hojeLocal(): string {
  const d = new Date();
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return z.toISOString().slice(0, 10);
}

function linhaConta(r: LinhaSql): Conta {
  const tipo = txt(r.tipo) === "CORRETORA" ? "CORRETORA" : "BANCARIA";
  const praca = txt(r.praca) === "Internacional" ? "Internacional" : "Nacional";
  const status = txt(r.status) === "arquivada" ? "arquivada" : "ativa";
  return {
    id: num(r.id),
    apelido: txt(r.apelido),
    instituicao: txt(r.instituicao),
    tipo,
    praca,
    moeda: txt(r.moeda) || "BRL",
    saldoInicialCentavos: num(r.saldo_inicial_centavos),
    dataSaldoInicial: txt(r.data_saldo_inicial).slice(0, 10),
    status,
  };
}

function viva(r: LinhaSql): boolean {
  const d = txt(r.deleted_at);
  return d === "";
}

function casa(
  conta: Conta,
  instituicao: string,
  contaId: number | null,
  donos: Map<string, number>,
): boolean {
  if (contaId != null && contaId > 0) return contaId === conta.id;
  if (!instituicao || instituicao !== conta.instituicao) return false;
  return donos.get(instituicao) === 1;
}

function valorNaMoeda(moedaConta: string, moedaMov: string, brl: number, orig: number): number | null {
  const mov = moedaMov || "BRL";
  if (mov !== moedaConta) return null;
  return moedaConta === "BRL" ? brl : orig || brl;
}

export async function listarContas(): Promise<Conta[]> {
  const db = await getDb();
  return consultar(db, `SELECT * FROM contas ORDER BY instituicao, apelido`).map(linhaConta);
}

export async function salvarConta(input: Omit<Conta, "id"> & { id?: number }): Promise<number> {
  if (!input.apelido.trim()) throw new Error("Informe o apelido da conta.");
  if (!input.instituicao.trim()) throw new Error("Escolha a instituição.");
  if (!input.dataSaldoInicial) throw new Error("Informe a data do saldo inicial.");
  const db = await getDb();
  const vals = [
    input.apelido.trim(),
    input.instituicao.trim(),
    input.tipo,
    input.praca,
    input.moeda || "BRL",
    Math.round(input.saldoInicialCentavos),
    input.dataSaldoInicial.slice(0, 10),
    input.status,
  ];
  if (input.id) {
    executar(
      db,
      `UPDATE contas SET apelido=?, instituicao=?, tipo=?, praca=?, moeda=?, saldo_inicial_centavos=?, data_saldo_inicial=?, status=? WHERE id=?`,
      [...vals, input.id],
    );
    await salvarDb();
    return input.id;
  }
  executar(
    db,
    `INSERT INTO contas (apelido, instituicao, tipo, praca, moeda, saldo_inicial_centavos, data_saldo_inicial, status) VALUES (?,?,?,?,?,?,?,?)`,
    vals,
  );
  const id = num(consultar(db, `SELECT last_insert_rowid() AS id`)[0]?.id);
  await salvarDb();
  return id;
}

export async function arquivarConta(id: number, arquivar: boolean): Promise<void> {
  const db = await getDb();
  executar(db, `UPDATE contas SET status=? WHERE id=?`, [arquivar ? "arquivada" : "ativa", id]);
  await salvarDb();
}

function movimentosDaConta(db: Awaited<ReturnType<typeof getDb>>, conta: Conta, todas: Conta[]): MovimentoConta[] {
  const donos = new Map<string, number>();
  for (const c of todas) donos.set(c.instituicao, (donos.get(c.instituicao) ?? 0) + 1);
  const hoje = hojeLocal();
  const movs: MovimentoConta[] = [];

  for (const r of consultar(db, `SELECT * FROM transacoes`)) {
    if (!viva(r)) continue;
    const tipo = txt(r.tipo_operacao);
    const sinal = sinalOperacao(tipo);
    const moeda = txt(r.moeda) || "BRL";
    const brl = num(r.valor_brl);
    const orig = num(r.valor_orig) || num(r.valor_usd);
    const valor = valorNaMoeda(conta.moeda, moeda, brl, orig);
    if (valor == null || valor === 0) continue;
    const centavos = paraCentavos(Math.abs(valor));
    const data = txt(r.data).slice(0, 10);
    const desc = `${tipo} ${txt(r.ticker)}`.trim();
    const contaId = num(r.conta_id) || null;
    if (sinal === "transfer") {
      if (casa(conta, txt(r.instituicao), contaId, donos)) {
        movs.push({ data, centavos: -centavos, futuro: data > hoje, descricao: desc, origem: "Transferência" });
      }
      if (casa(conta, txt(r.instituicao_destino), null, donos)) {
        movs.push({ data, centavos, futuro: data > hoje, descricao: desc, origem: "Transferência" });
      }
      continue;
    }
    if (sinal === 0) continue;
    if (!casa(conta, txt(r.instituicao), contaId, donos)) continue;
    movs.push({ data, centavos: centavos * sinal, futuro: data > hoje, descricao: desc, origem: "Transação" });
  }

  for (const r of consultar(db, `SELECT * FROM rendimentos`)) {
    if (!viva(r)) continue;
    const moeda = txt(r.moeda) || "BRL";
    const bruto = moeda === "BRL" ? num(r.valor_liquido) || num(r.valor_bruto_brl) : num(r.valor_bruto_orig) || num(r.valor_bruto_brl);
    const valor = valorNaMoeda(conta.moeda, moeda, bruto, bruto);
    if (valor == null || valor === 0) continue;
    const contaId = num(r.conta_id) || null;
    if (!casa(conta, txt(r.instituicao), contaId, donos)) continue;
    const data = txt(r.data).slice(0, 10);
    movs.push({
      data,
      centavos: paraCentavos(valor),
      futuro: data > hoje,
      descricao: txt(r.descricao) || txt(r.tipo) || "Rendimento",
      origem: "Rendimento",
    });
  }

  if (conta.moeda === "BRL") {
    for (const r of consultar(db, `SELECT * FROM despesas`)) {
      if (!viva(r)) continue;
      const contaId = num(r.conta_id) || null;
      if (!casa(conta, txt(r.instituicao), contaId, donos)) continue;
      const pago = txt(r.data_pagamento).slice(0, 10);
      const venc = txt(r.data_vencimento).slice(0, 10);
      const data = pago || venc;
      if (!data) continue;
      movs.push({
        data,
        centavos: -paraCentavos(num(r.valor)),
        futuro: !pago || data > hoje,
        descricao: txt(r.descricao) || txt(r.categoria) || "Despesa",
        origem: pago ? "Despesa paga" : "Despesa prevista",
      });
    }
  }

  if (conta.instituicao === "Caixa Físico" && conta.moeda === "BRL") {
    for (const r of consultar(db, `SELECT * FROM caixa_fisico`)) {
      if (!viva(r)) continue;
      const tipo = txt(r.tipo);
      const sinal = tipo === "Depósito" ? 1 : tipo === "Saque" ? -1 : 0;
      if (!sinal) continue;
      const data = txt(r.data).slice(0, 10);
      movs.push({
        data,
        centavos: paraCentavos(num(r.valor)) * sinal,
        futuro: data > hoje,
        descricao: txt(r.descricao) || tipo,
        origem: "Caixa físico",
      });
    }
  }

  return movs;
}

export async function resumirContas(filtro: FiltroContas = {}): Promise<ResumoConta[]> {
  const db = await getDb();
  const todas = await listarContas();
  const hoje = hojeLocal();
  return todas
    .filter((c) => !filtro.tipo || c.tipo === filtro.tipo)
    .filter((c) => !filtro.instituicao || c.instituicao === filtro.instituicao)
    .filter((c) => {
      const st = filtro.status || "ativa";
      if (st === "todas") return true;
      return c.status === st;
    })
    .map((conta) => {
      const saldo: ResultadoSaldo = calcularSaldo({
        saldoInicialCentavos: conta.saldoInicialCentavos,
        dataSaldoInicial: conta.dataSaldoInicial,
        hoje,
        movimentos: movimentosDaConta(db, conta, todas),
      });
      return { ...conta, atual: saldo.atual, previsto: saldo.previsto, negativoEm: conta.tipo === "BANCARIA" ? saldo.negativoEm : null };
    });
}

export async function detalharConta(id: number): Promise<{ conta: Conta; saldo: ResultadoSaldo } | null> {
  const db = await getDb();
  const todas = await listarContas();
  const conta = todas.find((c) => c.id === id);
  if (!conta) return null;
  const saldo = calcularSaldo({
    saldoInicialCentavos: conta.saldoInicialCentavos,
    dataSaldoInicial: conta.dataSaldoInicial,
    hoje: hojeLocal(),
    movimentos: movimentosDaConta(db, conta, todas),
  });
  return { conta, saldo };
}
