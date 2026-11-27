/**
 * Históricos para baixar antes de relançar: espécie e imóveis.
 * CSV com ponto e vírgula, para abrir no Excel.
 */
import { consultar, getDb, type LinhaSql } from "@/lib/financeiro/db";
import { operacaoDeImovel } from "@/lib/financeiro/imovel";

function txt(v: unknown): string {
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

function vivo(row: LinhaSql): boolean {
  return txt(campo(row, "deleted_at")).trim() === "";
}

function csv(linhas: string[][]): string {
  const cel = (v: string) => `"${v.replaceAll('"', '""')}"`;
  return linhas.map((r) => r.map(cel).join(";")).join("\r\n");
}

function baixar(nome: string, corpo: string): void {
  const blob = new Blob([`\uFEFF${corpo}`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

function pareceEspecie(...partes: unknown[]): boolean {
  const t = partes.map(txt).join(" ").toLowerCase();
  return /esp[eé]cie|cofre|caixa f[ií]sico|dinheiro vivo|em esp/.test(t);
}

export async function baixarHistoricoEspecie(): Promise<number> {
  const db = await getDb();
  const contas = consultar(db, `SELECT id, apelido, tipo FROM contas`);
  const nomeConta = new Map<number, string>();
  for (const c of contas) nomeConta.set(Number(campo(c, "id")), txt(campo(c, "apelido")));

  const linhas: string[][] = [[
    "Origem",
    "Data",
    "Tipo",
    "Descrição",
    "Valor",
    "Conta",
    "Instituição",
    "Ticker",
    "Situação",
  ]];

  for (const r of consultar(db, `SELECT * FROM caixa_fisico`)) {
    if (!vivo(r)) continue;
    linhas.push([
      "Caixa físico",
      txt(campo(r, "data")).slice(0, 10),
      txt(campo(r, "tipo")),
      txt(campo(r, "descricao")),
      txt(campo(r, "valor")),
      "Caixa físico",
      "",
      "",
      "",
    ]);
  }

  for (const r of consultar(db, `SELECT * FROM despesas`)) {
    if (!vivo(r)) continue;
    const conta = nomeConta.get(Number(campo(r, "conta_id"))) ?? "";
    if (!pareceEspecie(campo(r, "instituicao"), campo(r, "descricao"), campo(r, "categoria"), conta)) continue;
    linhas.push([
      "Conta paga",
      txt(campo(r, "data_pagamento") || campo(r, "data_vencimento")).slice(0, 10),
      txt(campo(r, "categoria")),
      txt(campo(r, "descricao")),
      txt(campo(r, "valor")),
      conta,
      txt(campo(r, "instituicao")),
      "",
      txt(campo(r, "situacao")),
    ]);
  }

  for (const r of consultar(db, `SELECT * FROM rendimentos`)) {
    if (!vivo(r)) continue;
    const conta = nomeConta.get(Number(campo(r, "conta_id"))) ?? "";
    if (!pareceEspecie(campo(r, "instituicao"), campo(r, "descricao"), campo(r, "tipo"), conta)) continue;
    linhas.push([
      "Recebimento",
      txt(campo(r, "data")).slice(0, 10),
      txt(campo(r, "tipo")),
      txt(campo(r, "descricao")),
      txt(campo(r, "valor_bruto_brl")),
      conta,
      txt(campo(r, "instituicao")),
      txt(campo(r, "ticker")),
      "",
    ]);
  }

  baixar("historico-especie.csv", csv(linhas));
  return Math.max(0, linhas.length - 1);
}

export async function baixarHistoricoImoveis(): Promise<number> {
  const db = await getDb();
  const contas = consultar(db, `SELECT id, apelido FROM contas`);
  const nomeConta = new Map<number, string>();
  for (const c of contas) nomeConta.set(Number(campo(c, "id")), txt(campo(c, "apelido")));

  const linhas: string[][] = [[
    "Data",
    "Tipo",
    "Imóvel",
    "Quantidade",
    "Valor",
    "Conta",
    "Instituição",
    "Nota",
  ]];

  for (const r of consultar(db, `SELECT * FROM transacoes`)) {
    if (!vivo(r)) continue;
    const tipo = txt(campo(r, "tipo_operacao"));
    const categoria = txt(campo(r, "categoria"));
    if (!operacaoDeImovel(categoria, tipo)) continue;
    linhas.push([
      txt(campo(r, "data")).slice(0, 10),
      tipo,
      txt(campo(r, "ticker")),
      txt(campo(r, "quantidade")),
      txt(campo(r, "valor_brl")),
      nomeConta.get(Number(campo(r, "conta_id"))) ?? "",
      txt(campo(r, "instituicao")),
      txt(campo(r, "nota") || campo(r, "observacao")),
    ]);
  }

  baixar("historico-imoveis.csv", csv(linhas));
  return Math.max(0, linhas.length - 1);
}
