/**
 * Renda fixa — aba RENDA FIXA da planilha.
 * Títulos privados: valor de mercado = principal × fator do indexador oficial (SGS/BCB).
 * Tesouro Direto: tenta preço público; se falhar, usa IPCA+ + cupom cadastrado.
 * Não altera valor_aplicado (custo) — só preenche valor_mercado.
 */

import type { Database } from "sql.js";
import { consultar, executar, getDb, salvarDb, type LinhaSql } from "@/lib/financeiro/db";
import { buscarSerieSgs, atualizarTaxas } from "@/services/taxas-service";
import { casarTesouro, listarPrecosTesouro, type PrecoTesouro } from "@/services/tesouro-service";
import { garantirImportacaoInicial } from "@/utils/import-excel";

const RF_ATIVA =
  "tipo_movimento = 'Aplicação' AND COALESCE(valor_aplicado, 0) > 0 AND COALESCE(status, 'Ativo') <> 'Resgatado'";

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

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function diasCorridos(de: string, ate: string): number {
  const a = Date.parse(`${de}T12:00:00`);
  const b = Date.parse(`${ate}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** IOF sobre o rendimento, dias 1–29 (tabela regressiva). Dia 30+ = 0. */
const IOF_RENDIMENTO = [
  0.96, 0.93, 0.9, 0.86, 0.83, 0.8, 0.76, 0.73, 0.7, 0.66, 0.63, 0.6, 0.56, 0.53, 0.5, 0.46, 0.43,
  0.4, 0.36, 0.33, 0.3, 0.26, 0.23, 0.2, 0.16, 0.13, 0.1, 0.06, 0.03,
];

function aliquotaIof(dias: number): number {
  if (dias >= 30) return 0;
  if (dias <= 1) return IOF_RENDIMENTO[0];
  return IOF_RENDIMENTO[dias - 1] ?? 0;
}

/** IR regressivo de renda fixa (não isenta). */
function aliquotaIrRf(dias: number): number {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.2;
  if (dias <= 720) return 0.175;
  return 0.15;
}

export type TituloRf = {
  id: number;
  nome: string | null;
  ticker: string | null;
  tipoRf: string | null;
  emissor: string | null;
  instituicao: string | null;
  indexador: string | null;
  taxa: number | null;
  dataAplicacao: string | null;
  valorAplicado: number;
  prazoDias: number | null;
  dataVencimento: string | null;
  liquidez: string | null;
  amortizacao: string | null;
  status: string | null;
  origem: string | null;
  isencaoIr: boolean;
  valorMercado: number | null;
  rentabilidade: number | null;
  diasCorridos: number;
  diasFaltantes: number | null;
  aliquotaIr: number;
  aliquotaIof: number;
  irAteAgora: number;
  iofAteAgora: number;
  valorLiquido: number | null;
  rentabilidadeLiquida: number | null;
  cargaTributaria: number | null;
  fonte: string | null;
  atualizadoEm: string | null;
};

export type ResumoRf = {
  titulos: TituloRf[];
  aplicado: number;
  mercado: number;
  lucro: number;
  rentabilidade: number | null;
  nAtivos: number;
  porIndexador: { indexador: string; aplicado: number; mercado: number }[];
};

function linha(r: LinhaSql): TituloRf {
  const aplicado = num(campo(r, "valor_aplicado"));
  const mercadoRaw = campo(r, "valor_mercado");
  const mercado = mercadoRaw == null ? null : num(mercadoRaw);
  const dataAplicacao = str(campo(r, "data_aplicacao")) || null;
  const dataVencimento = str(campo(r, "data_vencimento")) || null;
  const isencaoIr = num(campo(r, "isencao_ir")) === 1;
  const hoje = hojeIso();
  const corridos = dataAplicacao ? diasCorridos(dataAplicacao, hoje) : 0;
  const faltantes =
    dataVencimento && dataVencimento >= hoje ? diasCorridos(hoje, dataVencimento) : dataVencimento ? 0 : null;
  const base = mercado ?? aplicado;
  const ganho = Math.max(0, base - aplicado);
  const aliqIof = aliquotaIof(corridos);
  const aliqIr = isencaoIr ? 0 : aliquotaIrRf(corridos || 1);
  const iofAteAgora = ganho * aliqIof;
  const irAteAgora = Math.max(0, ganho - iofAteAgora) * aliqIr;
  const valorLiquido = base - iofAteAgora - irAteAgora;
  const rentabilidade = mercado != null && aplicado ? (mercado - aplicado) / aplicado : null;
  const rentabilidadeLiquida = aplicado ? (valorLiquido - aplicado) / aplicado : null;
  return {
    id: num(campo(r, "id")),
    nome: str(campo(r, "nome")) || null,
    ticker: str(campo(r, "ticker")) || null,
    tipoRf: str(campo(r, "tipo_rf")) || null,
    emissor: str(campo(r, "emissor")) || null,
    instituicao: str(campo(r, "instituicao")) || null,
    indexador: str(campo(r, "indexador")) || null,
    taxa: campo(r, "taxa") == null ? null : num(campo(r, "taxa")),
    dataAplicacao,
    valorAplicado: aplicado,
    prazoDias: campo(r, "prazo_dias") == null ? null : num(campo(r, "prazo_dias")),
    dataVencimento,
    liquidez: str(campo(r, "liquidez")) || null,
    amortizacao: str(campo(r, "amortizacao")) || null,
    status: str(campo(r, "status")) || null,
    origem: str(campo(r, "origem")) || null,
    isencaoIr,
    valorMercado: mercado,
    rentabilidade,
    diasCorridos: corridos,
    diasFaltantes: faltantes,
    aliquotaIr: aliqIr,
    aliquotaIof: aliqIof,
    irAteAgora,
    iofAteAgora,
    valorLiquido,
    rentabilidadeLiquida,
    cargaTributaria:
      rentabilidade != null && rentabilidadeLiquida != null ? rentabilidade - rentabilidadeLiquida : null,
    fonte: str(campo(r, "fonte_atualizacao")) || null,
    atualizadoEm: str(campo(r, "atualizado_em")) || null,
  };
}

export async function listarRendaFixa(): Promise<ResumoRf> {
  await garantirImportacaoInicial();
  const db = await getDb();
  const titulos = consultar(
    db,
    `SELECT * FROM renda_fixa WHERE ${RF_ATIVA} ORDER BY data_aplicacao DESC, id DESC`,
  ).map(linha);
  const aplicado = titulos.reduce((s, t) => s + t.valorAplicado, 0);
  const mercado = titulos.reduce((s, t) => s + (t.valorMercado ?? t.valorAplicado), 0);
  const mapa = new Map<string, { aplicado: number; mercado: number }>();
  for (const t of titulos) {
    const k = t.indexador || "—";
    const acc = mapa.get(k) ?? { aplicado: 0, mercado: 0 };
    acc.aplicado += t.valorAplicado;
    acc.mercado += t.valorMercado ?? t.valorAplicado;
    mapa.set(k, acc);
  }
  return {
    titulos,
    aplicado,
    mercado,
    lucro: mercado - aplicado,
    rentabilidade: aplicado ? (mercado - aplicado) / aplicado : null,
    nAtivos: titulos.length,
    porIndexador: [...mapa.entries()].map(([indexador, v]) => ({ indexador, ...v })),
  };
}

function fatorCdiLocal(db: Database, de: string, ate: string, pctCdi: number): number | null {
  const serie = consultar(
    db,
    `SELECT data, fator FROM historico_indices
     WHERE indice = 'CDI' AND data > ? AND data <= ? AND fator IS NOT NULL
     ORDER BY data`,
    [de, ate],
  );
  if (serie.length < 2) return null;
  let f = 1;
  for (const p of serie) f *= 1 + num(p.fator) * pctCdi;
  return f;
}

function fatorCdi(serie: { iso: string; valor: number }[], de: string, ate: string, pctCdi: number): number {
  let f = 1;
  for (const p of serie) {
    if (p.iso > de && p.iso <= ate) f *= 1 + (p.valor / 100) * pctCdi;
  }
  return f;
}

function fatorIpca(serie: { iso: string; valor: number }[], de: string, ate: string): number {
  let f = 1;
  for (const p of serie) {
    if (p.iso > de.slice(0, 7) && p.iso.slice(0, 7) <= ate.slice(0, 7)) f *= 1 + p.valor / 100;
  }
  return f;
}

function classificar(indexador: string | null): "cdi" | "selic" | "ipca" | "pre" | "outro" {
  const s = (indexador ?? "").toUpperCase();
  if (s.includes("CDI") || s === "DI") return "cdi";
  if (s.includes("SELIC")) return "selic";
  if (s.includes("IPCA")) return "ipca";
  if (s.includes("PRE")) return "pre";
  return "outro";
}

function ehTesouro(r: LinhaSql): boolean {
  const blob = `${str(campo(r, "tipo_rf"))} ${str(campo(r, "nome"))} ${str(campo(r, "emissor"))}`.toUpperCase();
  return blob.includes("TESOURO");
}

export async function atualizarRendaFixa(opts?: { pularTaxas?: boolean }): Promise<{ atualizados: number; fonte: string }> {
  await garantirImportacaoInicial();
  if (!opts?.pularTaxas) await atualizarTaxas();
  const db = await getDb();
  const titulos = consultar(db, `SELECT * FROM renda_fixa WHERE ${RF_ATIVA}`);
  const datas = titulos.map((r) => str(campo(r, "data_aplicacao"))).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const inicio = datas.sort()[0] ?? "2025-01-01";
  const hoje = hojeIso();

  let cdiDiario: { iso: string; valor: number }[] = [];
  let ipcaMes: { iso: string; valor: number }[] = [];
  try {
    cdiDiario = await buscarSerieSgs(12, inicio, hoje);
  } catch {
    cdiDiario = [];
  }
  try {
    ipcaMes = await buscarSerieSgs(433, inicio, hoje);
  } catch {
    ipcaMes = [];
  }

  let precosTesouro: PrecoTesouro[] = [];
  try {
    precosTesouro = await listarPrecosTesouro();
  } catch {
    precosTesouro = [];
  }

  const agora = new Date().toISOString();
  let n = 0;
  let nTesouro = 0;
  for (const r of titulos) {
    const aplicado = num(campo(r, "valor_aplicado"));
    const de = str(campo(r, "data_aplicacao"));
    const taxa = num(campo(r, "taxa"));
    const tipo = classificar(str(campo(r, "indexador")));
    let mercado = aplicado;
    let fonte = "custo (sem série)";
    let qtdTesouro: number | null = num(campo(r, "qtd_tesouro")) || null;
    let puAtual: number | null = null;

    const tes = ehTesouro(r) ? casarTesouro(precosTesouro, {
      tipoRf: str(campo(r, "tipo_rf")),
      nome: str(campo(r, "nome")),
      vencimento: str(campo(r, "data_vencimento")),
    }) : null;

    if (tes && tes.puVenda > 0) {
      if (!qtdTesouro) qtdTesouro = aplicado / tes.puVenda;
      puAtual = tes.puVenda;
      mercado = qtdTesouro * tes.puVenda;
      fonte = `Tesouro Transparente · ${tes.tipo} · PU ${tes.puVenda.toLocaleString("pt-BR")} em ${tes.dataBase}`;
      nTesouro += 1;
    } else if (tipo === "cdi" && de) {
      const local = fatorCdiLocal(db, de, hoje, taxa || 1);
      if (local != null) {
        mercado = aplicado * local;
        fonte = "histórico local · fator diário CDI";
      } else if (cdiDiario.length) {
        mercado = aplicado * fatorCdi(cdiDiario, de, hoje, taxa || 1);
        fonte = "BCB SGS 12 · CDI diário × % do título";
      }
    } else if (tipo === "selic" && de) {
      mercado = aplicado * fatorCdi(cdiDiario, de, hoje, taxa || 1);
      fonte = "BCB SGS 12 (proxy SELIC diária) × % do título";
    } else if (tipo === "pre" && de) {
      const du = diasCorridos(de, hoje) * (252 / 365);
      mercado = aplicado * (1 + taxa) ** (du / 252);
      fonte = "prefixado · (1+taxa)^(du/252)";
    } else if (tipo === "ipca" && de) {
      const ipca = ipcaMes.length ? fatorIpca(ipcaMes, de, hoje) : 1;
      const anos = diasCorridos(de, hoje) / 365;
      mercado = aplicado * ipca * (1 + taxa) ** anos;
      fonte = "BCB SGS 433 · IPCA + cupom real cadastrado";
    }

    executar(
      db,
      `UPDATE renda_fixa SET valor_mercado = ?, atualizado_em = ?, fonte_atualizacao = ?, qtd_tesouro = ?, pu_atual = ? WHERE id = ?`,
      [mercado, agora, fonte, qtdTesouro, puAtual, num(campo(r, "id"))],
    );
    n += 1;
  }
  await salvarDb();
  return { atualizados: n, fonte: nTesouro ? `BCB SGS + Tesouro (${nTesouro})` : "BCB SGS" };
}

/** Vencimento ou resgate de CDB/LCA/Tesouro: zera a posição na data do crédito e lança o lucro no IRPFM. */
export async function resgatarTituloRf(
  id: number,
  data: string,
  valorLiquido: number,
  irRetido = 0,
): Promise<{ lucro: number }> {
  const db = await getDb();
  const row = consultar(db, `SELECT * FROM renda_fixa WHERE id = ?`, [id])[0];
  if (!row) throw new Error("Título não encontrado.");
  if (str(campo(row, "status")) === "Resgatado") throw new Error("Este título já foi liquidado.");
  const aplicado = num(campo(row, "valor_aplicado"));
  if (!data || valorLiquido <= 0) {
    throw new Error("Informe a data em que o valor entrou e o líquido recebido.");
  }
  const ir = Math.max(0, irRetido);
  const lucroLiquido = valorLiquido - aplicado;
  const lucroBruto = lucroLiquido + ir;
  executar(
    db,
    `UPDATE renda_fixa
     SET status = 'Resgatado', data_resgate = ?, valor_liq_recebido = ?, valor_resgatado = ?,
         tipo_resgate = 'Vencimento', valor_mercado = 0
     WHERE id = ?`,
    [data, valorLiquido, valorLiquido, id],
  );
  if (lucroBruto > 0.004) {
    const ticker = str(campo(row, "ticker")) || str(campo(row, "nome")) || null;
    executar(
      db,
      `INSERT INTO rendimentos (
          data, tipo, categoria, origem, moeda, valor_bruto_orig, valor_bruto_brl, valor_liquido,
          valor_computavel_irpfm, ir_retido, ticker, instituicao, descricao
        ) VALUES (?, 'Renda Fixa - Rendimento', 'Renda Fixa', 'Nacional', 'BRL', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data,
        lucroBruto,
        lucroBruto,
        Math.max(0, lucroLiquido),
        lucroBruto,
        ir,
        ticker,
        str(campo(row, "instituicao")) || null,
        `Liquidação ${ticker ?? "renda fixa"} · líquido recebido ${valorLiquido.toFixed(2)}`,
      ],
    );
  }
  await salvarDb();
  return { lucro: lucroLiquido };
}
