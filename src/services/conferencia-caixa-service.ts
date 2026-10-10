/**
 * Contagem de verificação do caixa físico.
 * A diferença (+/−) só entra no livro se o usuário pedir o ajuste —
 * como Depósito ou Saque com a descrição "Conferência de caixa".
 */

import { consultar, executar, getDb, salvarDb } from "@/lib/financeiro/db";
import { lancarMovimento, saldoAtual } from "@/services/caixa-service";

export type ConferenciaCaixa = {
  id: number;
  data: string;
  saldoSistema: number;
  saldoContado: number;
  diferenca: number;
  observacao: string | null;
  ajustouLivro: boolean;
};

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

function mapear(r: Record<string, unknown>): ConferenciaCaixa {
  return {
    id: num(r.id),
    data: String(r.data ?? ""),
    saldoSistema: num(r.saldo_sistema),
    saldoContado: num(r.saldo_contado),
    diferenca: num(r.diferenca),
    observacao: r.observacao == null ? null : String(r.observacao),
    ajustouLivro: num(r.ajustou_livro) === 1,
  };
}

export async function listarConferencias(): Promise<ConferenciaCaixa[]> {
  const db = await getDb();
  return consultar(
    db,
    `SELECT id, data, saldo_sistema, saldo_contado, diferenca, observacao, ajustou_livro
     FROM caixa_conferencias ORDER BY data DESC, id DESC`,
  ).map(mapear);
}

export async function registrarConferencia(input: {
  data: string;
  saldoContado: number;
  observacao?: string;
  ajustarLivro: boolean;
}): Promise<ConferenciaCaixa> {
  const sistema = await saldoAtual();
  const contado = Math.round(Number(input.saldoContado) * 100) / 100;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.data) || !Number.isFinite(contado) || contado < 0) {
    throw new Error("Informe a data e o valor contado (R$ ≥ 0).");
  }
  const diferenca = Math.round((contado - sistema) * 100) / 100;
  let ajustou = false;
  if (input.ajustarLivro && Math.abs(diferenca) >= 0.005) {
    await lancarMovimento({
      data: input.data,
      tipo: diferenca > 0 ? "Depósito" : "Saque",
      valor: Math.abs(diferenca),
      descricao: "Conferência de caixa",
    });
    ajustou = true;
  }
  const db = await getDb();
  executar(
    db,
    `INSERT INTO caixa_conferencias (data, saldo_sistema, saldo_contado, diferenca, observacao, ajustou_livro)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.data, sistema, contado, diferenca, input.observacao?.trim() || null, ajustou ? 1 : 0],
  );
  await salvarDb();
  const lista = await listarConferencias();
  return lista[0];
}

export async function atualizarConferencia(
  id: number,
  input: { data: string; saldoContado: number; observacao?: string },
): Promise<void> {
  const db = await getDb();
  const atual = consultar(db, `SELECT * FROM caixa_conferencias WHERE id = ?`, [id])[0];
  if (!atual) throw new Error("Conferência não encontrada.");
  const sistema = num(atual.saldo_sistema);
  const contado = Math.round(Number(input.saldoContado) * 100) / 100;
  const diferenca = Math.round((contado - sistema) * 100) / 100;
  executar(
    db,
    `UPDATE caixa_conferencias SET data = ?, saldo_contado = ?, diferenca = ?, observacao = ? WHERE id = ?`,
    [input.data, contado, diferenca, input.observacao?.trim() || null, id],
  );
  await salvarDb();
}

export async function excluirConferencia(id: number): Promise<void> {
  const db = await getDb();
  executar(db, `DELETE FROM caixa_conferencias WHERE id = ?`, [id]);
  await salvarDb();
}
