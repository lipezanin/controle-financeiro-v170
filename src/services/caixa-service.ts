/**
 * Caixa físico — depósitos e saques em espécie (aba CAIXA FÍSICO).
 * Saldo = Σ depósitos − Σ saques. Resumo mensal ignora datas inválidas, como o SUMIFS do Excel.
 */

import { consultar, executar, getDb, salvarDb, type LinhaSql } from "@/lib/financeiro/db";
import { garantirImportacaoInicial } from "@/utils/import-excel";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

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

export type MovimentoCaixa = {
  id: number;
  data: string;
  tipo: "Depósito" | "Saque";
  valor: number;
  descricao: string | null;
  observacao: string | null;
  saldoAcumulado: number;
};

export type ResumoMesCaixa = {
  mes: number;
  nome: string;
  entradas: number;
  saidas: number;
  saldoMes: number;
};

export type ResumoCaixa = {
  ano: number;
  saldoAtual: number;
  depositosAno: number;
  saquesAno: number;
  depositosTotal: number;
  saquesTotal: number;
  lancamentos: number;
  especieConsultorio: number;
  movimentos: MovimentoCaixa[];
  meses: ResumoMesCaixa[];
};

export async function resumirCaixa(anoForcado?: number): Promise<ResumoCaixa> {
  await garantirImportacaoInicial();
  const db = await getDb();
  const agora = new Date();
  const anoCfg = Number(
    consultar(db, "SELECT valor FROM configuracoes WHERE chave = 'ano_corrente'")[0]?.valor,
  );
  const ano = anoForcado ?? (anoCfg || agora.getFullYear());

  const linhas = consultar(
    db,
    `SELECT id, data, tipo, valor, descricao, observacao FROM caixa_fisico ORDER BY id ASC`,
  );

  const movimentos: MovimentoCaixa[] = [];
  let saldo = 0;
  let depositosAno = 0;
  let saquesAno = 0;
  let depositosTotal = 0;
  let saquesTotal = 0;
  const entradas = Array(13).fill(0);
  const saidas = Array(13).fill(0);

  for (const r of linhas) {
    const tipo = str(campo(r, "tipo")) === "Saque" ? "Saque" : "Depósito";
    const valor = Math.abs(num(campo(r, "valor")));
    saldo += tipo === "Depósito" ? valor : -valor;
    if (tipo === "Depósito") depositosTotal += valor;
    else saquesTotal += valor;
    const data = str(campo(r, "data"));
    const dt = parseIso(data);
    if (dt?.ano === ano) {
      if (tipo === "Depósito") {
        depositosAno += valor;
        entradas[dt.mes] += valor;
      } else {
        saquesAno += valor;
        saidas[dt.mes] += valor;
      }
    }
    movimentos.push({
      id: num(campo(r, "id")),
      data,
      tipo,
      valor,
      descricao: str(campo(r, "descricao")) || null,
      observacao: str(campo(r, "observacao")) || null,
      saldoAcumulado: saldo,
    });
  }

  let especieConsultorio = 0;
  for (const r of consultar(db, `SELECT data, tipo, categoria, valor_bruto_brl FROM rendimentos`)) {
    const dt = parseIso(campo(r, "data"));
    if (dt?.ano !== ano) continue;
    if (str(campo(r, "tipo")) === "Espécie") {
      especieConsultorio += num(campo(r, "valor_bruto_brl"));
    }
  }

  const meses: ResumoMesCaixa[] = MESES.map((nome, i) => ({
    mes: i + 1,
    nome,
    entradas: entradas[i + 1],
    saidas: saidas[i + 1],
    saldoMes: entradas[i + 1] - saidas[i + 1],
  }));

  return {
    ano,
    saldoAtual: saldo,
    depositosAno,
    saquesAno,
    depositosTotal,
    saquesTotal,
    lancamentos: movimentos.length,
    especieConsultorio,
    movimentos,
    meses,
  };
}

export async function lancarMovimento(input: {
  data: string;
  tipo: "Depósito" | "Saque";
  valor: number;
  descricao?: string;
}): Promise<void> {
  const db = await getDb();
  const valor = Math.abs(Number(input.valor));
  if (!parseIso(input.data) || !valor) {
    throw new Error("Informe data (AAAA-MM-DD) e um valor maior que zero.");
  }
  executar(db, `INSERT INTO caixa_fisico (data, tipo, valor, descricao) VALUES (?, ?, ?, ?)`, [
    input.data,
    input.tipo,
    valor,
    input.descricao?.trim() || null,
  ]);
  await salvarDb();
}

export async function atualizarMovimento(
  id: number,
  input: { data: string; tipo: "Depósito" | "Saque"; valor: number; descricao?: string },
): Promise<void> {
  const db = await getDb();
  executar(db, `UPDATE caixa_fisico SET data=?, tipo=?, valor=?, descricao=? WHERE id=?`, [
    input.data,
    input.tipo,
    Math.abs(input.valor),
    input.descricao?.trim() || null,
    id,
  ]);
  await salvarDb();
}

export async function excluirMovimentos(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  executar(db, `DELETE FROM caixa_fisico WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
  await salvarDb();
}

export async function excluirTodosMovimentos(): Promise<void> {
  const db = await getDb();
  executar(db, `DELETE FROM caixa_fisico`);
  await salvarDb();
}

export async function saldoAtual(): Promise<number> {
  const r = await resumirCaixa();
  return r.saldoAtual;
}
