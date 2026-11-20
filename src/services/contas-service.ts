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

function ehCaixa(conta: { instituicao: string; apelido: string }): boolean {
  return /caixa f[íi]sico/i.test(conta.instituicao) || /caixa f[íi]sico/i.test(conta.apelido);
}

const CORRETORA = /xp|clear|rico|avenue|btg|modal|nu invest|toro|genial|interactive/i;

function contar(db: Awaited<ReturnType<typeof getDb>>, sql: string): number {
  return num(consultar(db, sql)[0]?.n);
}

/** Cria a conta que falta para cada instituição já usada e grava o vínculo, sem alterar valor. */
export function garantirEcossistema(db: Awaited<ReturnType<typeof getDb>>): boolean {
  const antesContas = contar(db, `SELECT COUNT(*) AS n FROM contas`);
  const antesSoltos = contar(
    db,
    `SELECT COUNT(*) AS n FROM transacoes WHERE (conta_id IS NULL OR conta_id = 0) AND TRIM(COALESCE(instituicao,'')) <> ''`,
  );
  const nomes = new Set<string>();
  for (const tabela of ["transacoes", "rendimentos", "despesas", "renda_fixa"]) {
    for (const r of consultar(
      db,
      `SELECT DISTINCT instituicao AS n FROM ${tabela} WHERE instituicao IS NOT NULL AND TRIM(instituicao) <> ''`,
    )) {
      nomes.add(txt(r.n).trim());
    }
  }
  for (const r of consultar(db, `SELECT nome FROM cad_instituicao WHERE COALESCE(ativo, 1) = 1`)) {
    nomes.add(txt(r.nome).trim());
  }
  for (const nome of nomes) {
    if (!nome || nome === "Caixa Físico") continue;
    const ja = consultar(db, `SELECT id FROM contas WHERE instituicao = ? AND moeda = 'BRL' LIMIT 1`, [nome])[0];
    if (!ja) {
      const tipo = CORRETORA.test(nome) ? "CORRETORA" : "BANCARIA";
      executar(
        db,
        `INSERT INTO contas (apelido, instituicao, tipo, praca, moeda, saldo_inicial_centavos, data_saldo_inicial, status)
         VALUES (?, ?, ?, 'Nacional', 'BRL', 0, '2000-01-01', 'ativa')`,
        [nome, nome, tipo],
      );
    }
    executar(db, `INSERT OR IGNORE INTO cad_instituicao (nome, ordem, ativo) VALUES (?, 100, 1)`, [nome]);
  }
  const moedas = new Set<string>();
  for (const r of consultar(db, `SELECT DISTINCT moeda AS m FROM caixa_cambio`)) moedas.add(txt(r.m) || "USD");
  for (const r of consultar(
    db,
    `SELECT DISTINCT moeda AS m FROM transacoes WHERE moeda IS NOT NULL AND TRIM(moeda) <> '' AND moeda <> 'BRL'`,
  )) {
    moedas.add(txt(r.m));
  }
  for (const moeda of moedas) {
    if (!moeda || moeda === "BRL") continue;
    const ja = consultar(db, `SELECT id FROM contas WHERE moeda = ? AND praca = 'Internacional' LIMIT 1`, [moeda])[0];
    if (!ja) {
      const nome = `Câmbio ${moeda}`;
      executar(
        db,
        `INSERT INTO contas (apelido, instituicao, tipo, praca, moeda, saldo_inicial_centavos, data_saldo_inicial, status)
         VALUES (?, ?, 'CORRETORA', 'Internacional', ?, 0, '2000-01-01', 'ativa')`,
        [nome, nome, moeda],
      );
      executar(db, `INSERT OR IGNORE INTO cad_instituicao (nome, ordem, ativo) VALUES (?, 110, 1)`, [nome]);
    }
  }
  const brl = consultar(
    db,
    `SELECT id FROM contas WHERE moeda = 'BRL' AND status = 'ativa' ORDER BY CASE tipo WHEN 'CORRETORA' THEN 0 ELSE 1 END, id LIMIT 1`,
  )[0];
  for (const r of consultar(db, `SELECT DISTINCT moeda AS m FROM caixa_cambio`)) {
    const moeda = txt(r.m) || "USD";
    const fx = consultar(
      db,
      `SELECT id FROM contas WHERE moeda = ? AND praca = 'Internacional' ORDER BY id LIMIT 1`,
      [moeda],
    )[0];
    if (fx) {
      executar(
        db,
        `UPDATE caixa_cambio SET conta_destino_id = ? WHERE moeda = ? AND (conta_destino_id IS NULL OR conta_destino_id = 0)`,
        [num(fx.id), moeda],
      );
    }
    if (brl) {
      executar(
        db,
        `UPDATE caixa_cambio SET conta_origem_id = ? WHERE moeda = ? AND (conta_origem_id IS NULL OR conta_origem_id = 0)`,
        [num(brl.id), moeda],
      );
    }
  }
  for (const tabela of ["transacoes", "rendimentos", "renda_fixa"]) {
    executar(
      db,
      `UPDATE ${tabela} SET conta_id = (
         SELECT c.id FROM contas c
         WHERE c.instituicao = ${tabela}.instituicao
           AND c.moeda = CASE WHEN COALESCE(${tabela}.moeda, '') IN ('', 'BRL') THEN 'BRL' ELSE ${tabela}.moeda END
           AND c.status = 'ativa'
         ORDER BY c.id LIMIT 1
       )
       WHERE TRIM(COALESCE(instituicao, '')) <> '' AND (conta_id IS NULL OR conta_id = 0)`,
    );
  }
  executar(
    db,
    `UPDATE despesas SET conta_id = (
       SELECT c.id FROM contas c
       WHERE c.instituicao = despesas.instituicao AND c.moeda = 'BRL' AND c.status = 'ativa'
       ORDER BY c.id LIMIT 1
     )
     WHERE TRIM(COALESCE(instituicao, '')) <> '' AND (conta_id IS NULL OR conta_id = 0)`,
  );
  executar(
    db,
    `UPDATE transacoes SET conta_destino_id = (
       SELECT c.id FROM contas c
       WHERE c.instituicao = transacoes.instituicao_destino
         AND c.moeda = CASE WHEN COALESCE(transacoes.moeda, '') IN ('', 'BRL') THEN 'BRL' ELSE transacoes.moeda END
       ORDER BY c.id LIMIT 1
     )
     WHERE tipo_operacao = 'Transferência'
       AND TRIM(COALESCE(instituicao_destino, '')) <> ''
       AND (conta_destino_id IS NULL OR conta_destino_id = 0)`,
  );
  const caixaJa = consultar(db, `SELECT id FROM contas WHERE instituicao = 'Caixa Físico' LIMIT 1`)[0];
  if (!caixaJa) {
    executar(
      db,
      `INSERT INTO contas (apelido, instituicao, tipo, praca, moeda, saldo_inicial_centavos, data_saldo_inicial, status)
       VALUES ('Caixa físico', 'Caixa Físico', 'BANCARIA', 'Nacional', 'BRL', 0, '2000-01-01', 'ativa')`,
    );
  }
  executar(db, `INSERT OR IGNORE INTO cad_instituicao (nome, ordem, ativo) VALUES ('Caixa Físico', 0, 1)`);
  executar(
    db,
    `UPDATE caixa_cambio SET conta_origem_id = conta_destino_id, conta_destino_id = conta_origem_id
     WHERE tipo = 'Venda' AND (moeda_origem IS NULL OR TRIM(moeda_origem) = '')`,
  );
  executar(
    db,
    `UPDATE caixa_cambio SET conta_origem_id = NULL
     WHERE tipo IN ('Dividendo', 'Uso') AND (moeda_origem IS NULL OR TRIM(moeda_origem) = '')`,
  );
  executar(
    db,
    `UPDATE caixa_cambio SET conta_destino_id = NULL
     WHERE tipo = 'Uso' AND (moeda_destino IS NULL OR TRIM(moeda_destino) = '')`,
  );
  executar(
    db,
    `UPDATE caixa_cambio SET
       moeda_origem = CASE WHEN tipo IN ('Venda', 'Uso') THEN moeda ELSE 'BRL' END,
       valor_origem = CASE WHEN tipo IN ('Venda', 'Uso') THEN quantidade ELSE custo_brl END,
       moeda_destino = CASE WHEN tipo = 'Venda' THEN 'BRL' WHEN tipo IN ('Compra', 'Dividendo') THEN moeda ELSE '' END,
       valor_destino = CASE
         WHEN tipo = 'Venda' THEN COALESCE(cotacao, 0) * COALESCE(quantidade, 0)
         WHEN tipo IN ('Compra', 'Dividendo') THEN quantidade
         ELSE 0 END
     WHERE moeda_origem IS NULL OR TRIM(moeda_origem) = ''`,
  );
  const depoisContas = contar(db, `SELECT COUNT(*) AS n FROM contas`);
  const depoisSoltos = contar(
    db,
    `SELECT COUNT(*) AS n FROM transacoes WHERE (conta_id IS NULL OR conta_id = 0) AND TRIM(COALESCE(instituicao,'')) <> ''`,
  );
  return depoisContas !== antesContas || depoisSoltos !== antesSoltos;
}

export async function listarContas(): Promise<Conta[]> {
  const db = await getDb();
  if (garantirEcossistema(db)) await salvarDb();
  return consultar(db, `SELECT * FROM contas ORDER BY instituicao, apelido`).map(linhaConta);
}

export async function salvarConta(input: Omit<Conta, "id"> & { id?: number }): Promise<number> {
  if (!input.apelido.trim()) throw new Error("Informe o apelido da conta.");
  if (!input.instituicao.trim()) throw new Error("Escolha a instituição.");
  if (!input.dataSaldoInicial) throw new Error("Informe a data do saldo inicial.");
  const db = await getDb();
  executar(db, `INSERT OR IGNORE INTO cad_instituicao (nome, ordem, ativo) VALUES (?, 50, 1)`, [
    input.instituicao.trim(),
  ]);
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

  if (ehCaixa(conta)) {
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
    return movs;
  }

  const pernasCambio = () => {
    for (const r of consultar(db, `SELECT * FROM caixa_cambio`)) {
      const data = txt(r.data).slice(0, 10);
      const tipo = txt(r.tipo);
      const moedaLinha = txt(r.moeda) || "USD";
      const moedaOrigem = txt(r.moeda_origem) || (tipo === "Venda" || tipo === "Uso" ? moedaLinha : "BRL");
      const moedaDestino = txt(r.moeda_destino) || (tipo === "Venda" ? "BRL" : tipo === "Uso" ? "" : moedaLinha);
      const valorOrigem = num(r.valor_origem) || (tipo === "Venda" || tipo === "Uso" ? num(r.quantidade) : num(r.custo_brl));
      const valorDestino =
        num(r.valor_destino) ||
        (tipo === "Venda" ? num(r.cotacao) * num(r.quantidade) : tipo === "Uso" ? 0 : num(r.quantidade));
      if (num(r.conta_origem_id) === conta.id && moedaOrigem === conta.moeda && valorOrigem) {
        movs.push({
          data,
          centavos: -paraCentavos(valorOrigem),
          futuro: data > hoje,
          descricao: txt(r.descricao) || `${tipo} ${moedaLinha}`,
          origem: "Câmbio",
        });
      }
      if (num(r.conta_destino_id) === conta.id && moedaDestino === conta.moeda && valorDestino) {
        movs.push({
          data,
          centavos: paraCentavos(valorDestino),
          futuro: data > hoje,
          descricao: txt(r.descricao) || `${tipo} ${moedaLinha}`,
          origem: "Câmbio",
        });
      }
    }
  };

  if (conta.moeda !== "BRL") {
    pernasCambio();
    return movs;
  }

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
    const destinoId = num(r.conta_destino_id) || null;
    if (sinal === "transfer") {
      if (contaId === conta.id || (!contaId && casa(conta, txt(r.instituicao), null, donos))) {
        movs.push({ data, centavos: -centavos, futuro: data > hoje, descricao: desc, origem: "Transferência" });
      }
      if (destinoId === conta.id || (!destinoId && casa(conta, txt(r.instituicao_destino), null, donos))) {
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

  pernasCambio();
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

export async function transferirEntreContas(input: {
  data: string;
  origemId: number;
  destinoId: number;
  valor: number;
  descricao?: string;
}): Promise<void> {
  if (!input.data) throw new Error("Informe a data.");
  if (input.valor <= 0) throw new Error("Informe o valor.");
  if (input.origemId === input.destinoId) throw new Error("Escolha contas diferentes.");
  const todas = await listarContas();
  const origem = todas.find((c) => c.id === input.origemId);
  const destino = todas.find((c) => c.id === input.destinoId);
  if (!origem || !destino) throw new Error("Conta não encontrada.");
  if (origem.moeda !== destino.moeda) {
    throw new Error("Transferência só entre contas da mesma moeda. Para trocar de moeda, use Câmbio.");
  }
  if (ehCaixa(origem) && ehCaixa(destino)) throw new Error("Escolha uma conta que não seja o caixa.");
  const db = await getDb();
  if (ehCaixa(origem) || ehCaixa(destino)) {
    executar(db, `INSERT INTO caixa_fisico (data, tipo, valor, descricao) VALUES (?, ?, ?, ?)`, [
      input.data,
      ehCaixa(origem) ? "Saque" : "Depósito",
      input.valor,
      input.descricao?.trim() || `Transferência ${origem.apelido} → ${destino.apelido}`,
    ]);
  }
  const emReais = origem.moeda === "BRL";
  executar(
    db,
    `INSERT INTO transacoes (
       data, tipo_operacao, categoria, instituicao, instituicao_destino, moeda, origem,
       valor_brl, valor_orig, conta_id, conta_destino_id, observacao, sync_status
     ) VALUES (?, 'Transferência', 'Transferência', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      input.data,
      origem.instituicao,
      destino.instituicao,
      origem.moeda,
      origem.praca,
      emReais ? input.valor : 0,
      input.valor,
      origem.id,
      destino.id,
      input.descricao?.trim() || `Transferência ${origem.apelido} → ${destino.apelido}`,
    ],
  );
  await salvarDb();
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
