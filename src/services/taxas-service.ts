/**
 * Taxas macro — SGS do Banco Central.
 * SELIC meta 432 · CDI 4389 · IPCA 12m 13522 · IPCA mensal 433.
 */

import { consultar, executar, getDb, salvarDb } from "@/lib/financeiro/db";

const SGS: { chave: string; codigo: number; unidade: string }[] = [
  { chave: "SELIC", codigo: 432, unidade: "% a.a." },
  { chave: "SELIC_252", codigo: 1178, unidade: "% a.a. 252" },
  { chave: "CDI", codigo: 4389, unidade: "% a.a." },
  { chave: "IPCA_12M", codigo: 13522, unidade: "% 12M" },
  { chave: "IPCA_MENSAL", codigo: 433, unidade: "% mês" },
  { chave: "IGPM", codigo: 189, unidade: "% mês" },
];

export type Indicador = {
  chave: string;
  valor: number | null;
  unidade: string | null;
  atualizadoEm: string | null;
};

async function ultimoSgs(codigo: number): Promise<{ data: string; valor: number }> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/1?formato=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`SGS ${codigo} HTTP ${r.status}`);
  const arr = (await r.json()) as { data: string; valor: string }[];
  if (!arr?.length) throw new Error(`SGS ${codigo} vazio`);
  return { data: arr[0].data, valor: Number(String(arr[0].valor).replace(",", ".")) };
}

/** Série SGS (datas em ISO). Usada pela renda fixa para CDI diário e IPCA mensal. */
export async function buscarSerieSgs(
  codigo: number,
  dataInicial: string,
  dataFinal: string,
): Promise<{ iso: string; valor: number }[]> {
  const a = dataInicial.split("-");
  const b = dataFinal.split("-");
  const ini = `${a[2]}/${a[1]}/${a[0]}`;
  const fim = `${b[2]}/${b[1]}/${b[0]}`;
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados?formato=json&dataInicial=${ini}&dataFinal=${fim}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`SGS ${codigo} HTTP ${r.status}`);
  const arr = (await r.json()) as { data: string; valor: string }[];
  return (arr ?? []).map((p) => {
    const [dd, mm, yy] = p.data.split("/");
    return { iso: `${yy}-${mm}-${dd}`, valor: Number(String(p.valor).replace(",", ".")) };
  });
}

export async function atualizarTaxas(): Promise<Indicador[]> {
  const db = await getDb();
  const agora = new Date().toISOString();
  const saida: Indicador[] = [];
  for (const s of SGS) {
    const { valor } = await ultimoSgs(s.codigo);
    executar(
      db,
      `INSERT OR REPLACE INTO indicadores (chave, valor, unidade, atualizado_em)
       VALUES (?, ?, ?, ?)`,
      [s.chave, valor, s.unidade, agora],
    );
    saida.push({ chave: s.chave, valor, unidade: s.unidade, atualizadoEm: agora });
  }
  await salvarDb();
  return saida;
}

export async function listarIndicadores(): Promise<Indicador[]> {
  const db = await getDb();
  return consultar(db, `SELECT chave, valor, unidade, atualizado_em FROM indicadores ORDER BY chave`).map(
    (r) => ({
      chave: String(r.chave),
      valor: r.valor == null ? null : Number(r.valor),
      unidade: r.unidade == null ? null : String(r.unidade),
      atualizadoEm: r.atualizado_em == null ? null : String(r.atualizado_em),
    }),
  );
}
