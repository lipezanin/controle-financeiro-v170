/** Saldo de conta em centavos. Não usa float no acumulado. */

export type MovimentoConta = {
  data: string;
  centavos: number;
  futuro: boolean;
  descricao: string;
  origem: string;
};

export type LinhaExtrato = MovimentoConta & { saldo: number };

export type ResultadoSaldo = {
  atual: number;
  previsto: number;
  historico: { data: string; centavos: number }[];
  extrato: LinhaExtrato[];
  negativoEm: string | null;
};

const CREDITO = new Set([
  "Venda",
  "Resgate",
  "Resgate do Principal",
  "Depósito",
  "Venda de imóvel",
]);

const DEBITO = new Set([
  "Compra",
  "Aplicação",
  "Subscrição",
  "Saque",
  "Parcela Imóvel",
  "ITBI / Cartório",
]);

export function paraCentavos(valor: number | null | undefined): number {
  if (valor == null || !Number.isFinite(Number(valor))) return 0;
  return Math.round(Number(valor) * 100);
}

export function sinalOperacao(tipo: string): 1 | -1 | 0 | "transfer" {
  if (tipo === "Transferência") return "transfer";
  if (CREDITO.has(tipo)) return 1;
  if (DEBITO.has(tipo)) return -1;
  return 0;
}

export function calcularSaldo(opts: {
  saldoInicialCentavos: number;
  dataSaldoInicial: string;
  hoje: string;
  movimentos: MovimentoConta[];
}): ResultadoSaldo {
  const inicio = opts.dataSaldoInicial.slice(0, 10);
  const hoje = opts.hoje.slice(0, 10);
  const movimentos = opts.movimentos
    .filter((m) => m.data.slice(0, 10) >= inicio && m.centavos !== 0)
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data) || a.descricao.localeCompare(b.descricao));

  let previsto = opts.saldoInicialCentavos;
  let atual = opts.saldoInicialCentavos;
  let corrido = opts.saldoInicialCentavos;
  let negativoEm: string | null = null;
  const extrato: LinhaExtrato[] = [];
  const historico: { data: string; centavos: number }[] = [{ data: inicio, centavos: opts.saldoInicialCentavos }];

  for (const m of movimentos) {
    const data = m.data.slice(0, 10);
    previsto += m.centavos;
    corrido += m.centavos;
    const futuro = m.futuro || data > hoje;
    if (!futuro) {
      atual += m.centavos;
      historico.push({ data, centavos: atual });
    }
    if (negativoEm == null && corrido < 0) negativoEm = data;
    extrato.push({ ...m, data, futuro, saldo: corrido });
  }

  return { atual, previsto, historico, extrato, negativoEm };
}
