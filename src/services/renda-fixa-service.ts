/**
 * Renda fixa — aba RENDA FIXA da planilha.
 * Títulos privados: valor de mercado = principal × fator do indexador oficial (SGS/BCB).
 * Tesouro Direto: tenta preço público; se falhar, usa IPCA+ + cupom cadastrado.
 * Não altera valor_aplicado (custo) — só preenche valor_mercado.
 */

import type { Database } from "sql.js";
import { consultar, executar, getDb, salvarDb, apagarComTombstone, type LinhaSql } from "@/lib/financeiro/db";
import { buscarSerieSgs, atualizarTaxas } from "@/services/taxas-service";
import { casarTesouro, listarHistoricoTesouro, listarPrecosTesouro, serieTesouro, type PrecoTesouro } from "@/services/tesouro-service";
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

export type SimulacaoResgate = {
  fracao: number;
  valorBruto: number;
  principalSai: number;
  principalFica: number;
  rendimento: number;
  iof: number;
  ir: number;
  liquido: number;
  aliquotaIr: number;
  aliquotaIof: number;
  dias: number;
  isento: boolean;
  mercadoFica: number;
};

/**
 * Resgate parcial pelo método proporcional.
 * A parte que sai leva a mesma fração do principal e do rendimento.
 * IR só sobre o rendimento: Lei 11.033/2004 (22,5% até 180 dias, 20% até 360,
 * 17,5% até 720 e 15% depois). IOF só sobre o rendimento nos primeiros 30 dias:
 * Decreto 6.306/2007. LCI, LCA, CRI, CRA, debênture incentivada e poupança não têm IR.
 */
export function simularResgateParcial(input: {
  dataAplicacao: string | null;
  data: string;
  valorAplicado: number;
  valorMercado: number | null;
  valorBruto: number;
  isento: boolean;
}): SimulacaoResgate {
  const aplicado = Math.max(0, input.valorAplicado);
  const mercado = input.valorMercado != null && input.valorMercado > 0 ? input.valorMercado : aplicado;
  const brutoPosicao = Math.max(mercado, aplicado);
  if (!input.data) throw new Error("Informe a data do resgate.");
  if (!(input.valorBruto > 0)) throw new Error("Informe o valor bruto resgatado, antes de IR e IOF.");
  if (!(brutoPosicao > 0)) throw new Error("Este título não tem valor para resgatar.");
  if (input.valorBruto >= brutoPosicao - 0.009) {
    throw new Error("Esse valor cobre o título inteiro. Use Liquidar.");
  }
  const fracao = input.valorBruto / brutoPosicao;
  const principalSai = aplicado * fracao;
  const rendimento = Math.max(0, input.valorBruto - principalSai);
  const dias = input.dataAplicacao ? diasCorridos(input.dataAplicacao, input.data) : 0;
  const aliquotaIofPct = aliquotaIof(dias || 1);
  const aliquotaIrPct = input.isento ? 0 : aliquotaIrRf(dias || 1);
  const iof = rendimento * aliquotaIofPct;
  const ir = Math.max(0, rendimento - iof) * aliquotaIrPct;
  return {
    fracao,
    valorBruto: input.valorBruto,
    principalSai,
    principalFica: aplicado - principalSai,
    rendimento,
    iof,
    ir,
    liquido: input.valorBruto - iof - ir,
    aliquotaIr: aliquotaIrPct,
    aliquotaIof: aliquotaIofPct,
    dias,
    isento: input.isento,
    mercadoFica: mercado * (1 - fracao),
  };
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
  await garantirHistoricoRf();
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
  const isento = num(campo(row, "isencao_ir")) === 1;
  const computavel = isento ? 0 : Math.max(0, lucroBruto);
  executar(
    db,
    `UPDATE renda_fixa
     SET status = 'Resgatado', data_resgate = ?, valor_liq_recebido = ?, valor_resgatado = ?,
         ir_pago = ?, tipo_resgate = 'Vencimento', valor_mercado = 0
     WHERE id = ?`,
    [data, valorLiquido, valorLiquido + ir, ir, id],
  );
  if (lucroBruto > 0.004 || computavel > 0.004) {
    const ticker = str(campo(row, "ticker")) || str(campo(row, "nome")) || null;
    executar(
      db,
      `INSERT INTO rendimentos (
          data, tipo, categoria, origem, moeda, valor_bruto_orig, valor_bruto_brl, valor_liquido,
          valor_computavel_irpfm, ir_retido, ticker, instituicao, descricao
        ) VALUES (?, 'Renda Fixa - Rendimento', 'Renda Fixa', 'Nacional', 'BRL', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data,
        Math.max(0, lucroBruto),
        Math.max(0, lucroBruto),
        Math.max(0, lucroLiquido),
        computavel,
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

/** Resgate de parte do título. O que fica continua aplicado, com custo e mercado reduzidos na mesma fração. */
export async function resgatarParcialTituloRf(
  id: number,
  data: string,
  valorBruto: number,
): Promise<SimulacaoResgate> {
  const db = await getDb();
  const row = consultar(db, `SELECT * FROM renda_fixa WHERE id = ?`, [id])[0];
  if (!row) throw new Error("Título não encontrado.");
  if (str(campo(row, "status")) === "Resgatado") throw new Error("Este título já foi liquidado.");
  if (str(campo(row, "tipo_movimento")) !== "Aplicação") throw new Error("Só dá para resgatar uma aplicação ativa.");
  const sim = simularResgateParcial({
    dataAplicacao: str(campo(row, "data_aplicacao")) || null,
    data,
    valorAplicado: num(campo(row, "valor_aplicado")),
    valorMercado: campo(row, "valor_mercado") == null ? null : num(campo(row, "valor_mercado")),
    valorBruto,
    isento: num(campo(row, "isencao_ir")) === 1,
  });
  const qtd = num(campo(row, "qtd_tesouro"));
  const qtdFica = qtd > 0 ? qtd * (1 - sim.fracao) : null;
  executar(
    db,
    `UPDATE renda_fixa
     SET valor_aplicado = ?, valor_mercado = ?, qtd_tesouro = ?, atualizado_em = ?
     WHERE id = ?`,
    [sim.principalFica, sim.mercadoFica, qtdFica, new Date().toISOString(), id],
  );
  executar(
    db,
    `INSERT INTO renda_fixa (
        nome, ticker, tipo_movimento, tipo_rf, emissor, instituicao, indexador, taxa,
        data_aplicacao, valor_aplicado, data_vencimento, liquidez, amortizacao, isencao_ir,
        status, data_resgate, tipo_resgate, valor_resgatado, ir_pago, valor_liq_recebido,
        lancado_rendimentos, iof_brl, origem, moeda
      ) VALUES (?, ?, 'Resgate parcial', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Histórico', ?, 'Resgate parcial', ?, ?, ?, 1, ?, ?, 'BRL')`,
    [
      str(campo(row, "nome")) || null,
      str(campo(row, "ticker")) || null,
      str(campo(row, "tipo_rf")) || null,
      str(campo(row, "emissor")) || null,
      str(campo(row, "instituicao")) || null,
      str(campo(row, "indexador")) || null,
      campo(row, "taxa") == null ? null : num(campo(row, "taxa")),
      str(campo(row, "data_aplicacao")) || null,
      sim.principalSai,
      str(campo(row, "data_vencimento")) || null,
      str(campo(row, "liquidez")) || null,
      str(campo(row, "amortizacao")) || null,
      num(campo(row, "isencao_ir")),
      data,
      sim.valorBruto,
      sim.ir,
      sim.principalSai,
      sim.iof,
      str(campo(row, "origem")) || "Nacional",
    ],
  );
  if (sim.rendimento > 0.004) {
    const ticker = str(campo(row, "ticker")) || str(campo(row, "nome")) || null;
    const computavel = sim.isento ? 0 : Math.max(0, sim.rendimento - sim.iof);
    executar(
      db,
      `INSERT INTO rendimentos (
          data, tipo, categoria, origem, moeda, valor_bruto_orig, valor_bruto_brl, valor_liquido,
          valor_computavel_irpfm, ir_retido, ticker, instituicao, descricao
        ) VALUES (?, 'Renda Fixa - Rendimento', 'Renda Fixa', 'Nacional', 'BRL', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data,
        sim.rendimento,
        sim.rendimento,
        Math.max(0, sim.rendimento - sim.iof - sim.ir),
        computavel,
        sim.ir,
        ticker,
        str(campo(row, "instituicao")) || null,
        `Liquidação parcial ${ticker ?? "renda fixa"} · bruto ${sim.valorBruto.toFixed(2)} · principal ${sim.principalSai.toFixed(2)} · rendimento ${sim.rendimento.toFixed(2)} · IOF ${sim.iof.toFixed(2)} · IR ${sim.ir.toFixed(2)}`,
      ],
    );
  }
  await salvarDb();
  return sim;
}

export async function excluirTituloRf(id: number): Promise<void> {
  const db = await getDb();
  apagarComTombstone(db, "renda_fixa", [id]);
  await salvarDb();
}

export async function atualizarTituloRf(
  id: number,
  input: { dataAplicacao: string; valorAplicado: number; ticker: string; emissor: string },
): Promise<void> {
  const db = await getDb();
  executar(
    db,
    `UPDATE renda_fixa SET data_aplicacao = ?, valor_aplicado = ?, ticker = ?, emissor = ? WHERE id = ?`,
    [input.dataAplicacao, input.valorAplicado, input.ticker.trim(), input.emissor.trim() || null, id],
  );
  await salvarDb();
}

function somarDia(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function rotuloIndexador(indexador: string): string {
  const tipo = classificar(indexador);
  if (tipo === "ipca") return "IPCA+";
  if (tipo === "pre") return "Prefixado";
  if (tipo === "cdi") return "CDI";
  if (tipo === "selic") return "SELIC";
  return indexador || "Outro";
}

function mapaFator(db: Database, indice: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of consultar(db, `SELECT data, fator FROM historico_indices WHERE indice = ?`, [indice])) {
    const f = num(r.fator);
    if (f) m.set(String(r.data).slice(0, 10), f);
  }
  return m;
}

function guardarIndice(db: Database, indice: string, pts: { iso: string; valor: number }[], unidade: string): void {
  for (const p of pts) {
    const fator = indice === "IPCA_MENSAL" ? p.valor / 100 : p.valor > 2 ? (1 + p.valor / 100) ** (1 / 252) - 1 : p.valor / 100;
    executar(
      db,
      `INSERT OR REPLACE INTO historico_indices (indice, data, valor, fator, unidade, fonte) VALUES (?, ?, ?, ?, ?, ?)`,
      [indice, p.iso, p.valor, fator, unidade, "BCB SGS"],
    );
  }
}

function datasEntre(de: string, ate: string, cdi: Map<string, number>): string[] {
  const uteis = [...cdi.keys()].filter((d) => d >= de && d <= ate).sort();
  if (uteis.length >= 2) return uteis[0] === de ? uteis : [de, ...uteis];
  const out = [de];
  let d = de;
  while (d < ate) {
    d = somarDia(d, 7);
    if (d > ate) d = ate;
    out.push(d);
    if (out.length > 800) break;
  }
  return out;
}

function curvaIndexada(
  aplicado: number,
  taxa: number,
  tipo: ReturnType<typeof classificar>,
  datas: string[],
  cdi: Map<string, number>,
  selic: Map<string, number>,
  ipca: Map<string, number>,
): { data: string; mercado: number }[] {
  let fator = 1;
  let ipcaAcum = 1;
  let mesVisto = "";
  const out: { data: string; mercado: number }[] = [];
  const inicio = datas[0] ?? "";
  for (const data of datas) {
    if (data !== inicio) {
      if (tipo === "cdi" || tipo === "selic") {
        const diario = (tipo === "selic" ? selic.get(data) : cdi.get(data)) ?? cdi.get(data);
        if (diario) fator *= 1 + diario * (taxa || 1);
      } else if (tipo === "pre") {
        const du = diasCorridos(inicio, data) * (252 / 365);
        fator = (1 + (taxa || 0)) ** (du / 252);
      } else if (tipo === "ipca") {
        const mes = data.slice(0, 7);
        if (mes !== mesVisto) {
          const f = ipca.get(mesVisto) ?? ipca.get(`${mesVisto}-01`);
          if (mesVisto && f) ipcaAcum *= 1 + f;
          mesVisto = mes;
        }
        const anos = diasCorridos(inicio, data) / 365;
        fator = ipcaAcum * (1 + (taxa || 0)) ** anos;
      }
    } else if (tipo === "ipca") {
      mesVisto = data.slice(0, 7);
    }
    out.push({ data, mercado: aplicado * (tipo === "outro" ? 1 : fator) });
  }
  return out;
}

async function gravarCurvaDiaria(db: Database): Promise<void> {
  const titulos = consultar(db, `SELECT * FROM renda_fixa WHERE ${RF_ATIVA}`);
  const hoje = hojeIso();
  const pendentes: LinhaSql[] = [];
  for (const r of titulos) {
    const id = num(campo(r, "id"));
    const aplicado = num(campo(r, "valor_aplicado"));
    const ultimo = consultar(
      db,
      `SELECT data, valor_aplicado FROM historico_renda_fixa WHERE titulo_id = ? ORDER BY data DESC LIMIT 1`,
      [id],
    )[0];
    const custoMudou = ultimo && Math.abs(num(ultimo.valor_aplicado) - aplicado) > 0.05;
    if (custoMudou) executar(db, `DELETE FROM historico_renda_fixa WHERE titulo_id = ?`, [id]);
    if (!ultimo || custoMudou || String(ultimo.data).slice(0, 10) < hoje) pendentes.push(r);
  }
  if (!pendentes.length) return;

  let cdi = mapaFator(db, "CDI");
  let selic = mapaFator(db, "SELIC");
  let ipca = mapaFator(db, "IPCA_MENSAL");
  const datasAplic = pendentes.map((r) => str(campo(r, "data_aplicacao"))).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const inicio = datasAplic.sort()[0] ?? "2024-01-01";
  if (cdi.size < 5) {
    guardarIndice(db, "CDI", await buscarSerieSgs(12, inicio, hoje).catch(() => []), "%");
    cdi = mapaFator(db, "CDI");
  }
  if (selic.size < 5) {
    guardarIndice(db, "SELIC", await buscarSerieSgs(11, inicio, hoje).catch(() => []), "%");
    selic = mapaFator(db, "SELIC");
  }
  if (ipca.size < 2) {
    guardarIndice(db, "IPCA_MENSAL", await buscarSerieSgs(433, inicio, hoje).catch(() => []), "% mês");
    ipca = mapaFator(db, "IPCA_MENSAL");
  }

  const precisaTesouro = pendentes.some((r) => {
    if (!ehTesouro(r)) return false;
    const n = consultar(db, `SELECT COUNT(*) AS n FROM historico_renda_fixa WHERE titulo_id = ?`, [num(campo(r, "id"))])[0];
    return num(n?.n) === 0;
  });
  let historico: PrecoTesouro[] = [];
  if (precisaTesouro) historico = await listarHistoricoTesouro().catch(() => []);

  db.run("BEGIN");
  try {
    for (const r of pendentes) {
      const id = num(campo(r, "id"));
      const aplicado = num(campo(r, "valor_aplicado"));
      const de = str(campo(r, "data_aplicacao"));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || aplicado <= 0) continue;
      const ate = hoje < de ? de : hoje;
      const indexador = rotuloIndexador(str(campo(r, "indexador")));
      const tipo = classificar(str(campo(r, "indexador")));
      const ja = new Set(
        consultar(db, `SELECT data FROM historico_renda_fixa WHERE titulo_id = ?`, [id]).map((x) => String(x.data).slice(0, 10)),
      );
      let pontos: { data: string; mercado: number; fonte: string }[] = [];
      if (ehTesouro(r) && historico.length) {
        const serie = serieTesouro(historico, {
          tipoRf: str(campo(r, "tipo_rf")),
          nome: str(campo(r, "nome")),
          vencimento: str(campo(r, "data_vencimento")),
        }).filter((p) => p.dataBase >= de && p.dataBase <= ate);
        const qtdSalva = num(campo(r, "qtd_tesouro"));
        const qtd = qtdSalva > 0 ? qtdSalva : serie[0]?.puVenda ? aplicado / serie[0].puVenda : 0;
        pontos = serie.map((p) => ({
          data: p.dataBase,
          mercado: qtd > 0 ? qtd * p.puVenda : aplicado,
          fonte: `Tesouro Transparente · PU ${p.puVenda}`,
        }));
      }
      if (!pontos.length) {
        pontos = curvaIndexada(aplicado, num(campo(r, "taxa")), tipo, datasEntre(de, ate, cdi.size ? cdi : selic), cdi, selic, ipca).map(
          (p) => ({ ...p, fonte: tipo === "outro" ? "custo" : `indexador ${indexador}` }),
        );
      }
      const mercadoHoje = num(campo(r, "valor_mercado"));
      if (mercadoHoje > 0 && !pontos.some((p) => p.data === hoje)) {
        pontos.push({ data: hoje, mercado: mercadoHoje, fonte: str(campo(r, "fonte_atualizacao")) || "mercado" });
      }
      for (const p of pontos) {
        if (ja.has(p.data)) continue;
        db.run(
          `INSERT OR REPLACE INTO historico_renda_fixa
             (titulo_id, data, valor_aplicado, valor_mercado, rentabilidade, indexador, fonte)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, p.data, aplicado, p.mercado, aplicado ? (p.mercado - aplicado) / aplicado : null, indexador, p.fonte],
        );
      }
    }
    db.run("COMMIT");
  } catch (erro) {
    db.run("ROLLBACK");
    throw erro;
  }
}

let curvaEmCurso: Promise<void> | null = null;

export async function garantirHistoricoRf(): Promise<void> {
  if (curvaEmCurso) return curvaEmCurso;
  curvaEmCurso = (async () => {
    const db = await getDb();
    await gravarCurvaDiaria(db);
    await salvarDb();
  })().finally(() => {
    curvaEmCurso = null;
  });
  return curvaEmCurso;
}

export type PontoCurvaRf = { data: string; aplicado: number; mercado: number; rentabilidade: number | null };

export async function curvaTituloRf(id: number): Promise<{ titulo: TituloRf | null; pontos: PontoCurvaRf[] }> {
  await garantirHistoricoRf();
  const db = await getDb();
  const row = consultar(db, `SELECT * FROM renda_fixa WHERE id = ?`, [id])[0];
  const pontos = consultar(
    db,
    `SELECT data, valor_aplicado, valor_mercado, rentabilidade FROM historico_renda_fixa WHERE titulo_id = ? ORDER BY data`,
    [id],
  ).map((r) => ({
    data: String(r.data).slice(0, 10),
    aplicado: num(r.valor_aplicado),
    mercado: num(r.valor_mercado),
    rentabilidade: r.rentabilidade == null ? null : num(r.rentabilidade),
  }));
  return { titulo: row ? linha(row) : null, pontos };
}

export type PontoPainelRf = { mes: string; rotulo: string; aplicado: number; mercado: number; rentabilidade: number | null };
export type PainelRf = {
  carteira: PontoPainelRf[];
  classes: { classe: string; pontos: { mes: string; rotulo: string; rentabilidade: number }[] }[];
};

export async function painelRendaFixa(internacional: boolean | null): Promise<PainelRf> {
  await garantirHistoricoRf();
  const db = await getDb();
  const linhas = consultar(
    db,
    `SELECT h.data, h.titulo_id, h.valor_aplicado, h.valor_mercado, h.indexador, r.origem
     FROM historico_renda_fixa h JOIN renda_fixa r ON r.id = h.titulo_id ORDER BY h.data`,
  );
  const porMes = new Map<string, Map<number, { aplicado: number; mercado: number; indexador: string }>>();
  for (const r of linhas) {
    const intl = String(r.origem ?? "").toLowerCase().includes("internacional");
    if (internacional === true && !intl) continue;
    if (internacional === false && intl) continue;
    const mes = String(r.data).slice(0, 7);
    const doMes = porMes.get(mes) ?? new Map();
    doMes.set(num(r.titulo_id), {
      aplicado: num(r.valor_aplicado),
      mercado: num(r.valor_mercado),
      indexador: str(r.indexador) || "Outro",
    });
    porMes.set(mes, doMes);
  }
  const carteira: PontoPainelRf[] = [];
  const classes = new Map<string, { mes: string; rotulo: string; rentabilidade: number }[]>();
  for (const mes of [...porMes.keys()].sort()) {
    const itens = [...(porMes.get(mes)?.values() ?? [])];
    const aplicado = itens.reduce((s, i) => s + i.aplicado, 0);
    const mercado = itens.reduce((s, i) => s + i.mercado, 0);
    const [yy, mm] = mes.split("-");
    const rotulo = `${mm}/${yy.slice(2)}`;
    carteira.push({ rotulo, mes, aplicado, mercado, rentabilidade: aplicado ? (mercado - aplicado) / aplicado : null });
    const porClasse = new Map<string, { aplicado: number; mercado: number }>();
    for (const i of itens) {
      const atual = porClasse.get(i.indexador) ?? { aplicado: 0, mercado: 0 };
      atual.aplicado += i.aplicado;
      atual.mercado += i.mercado;
      porClasse.set(i.indexador, atual);
    }
    for (const [classe, v] of porClasse) {
      const lista = classes.get(classe) ?? [];
      lista.push({ rotulo, mes, rentabilidade: v.aplicado ? (v.mercado - v.aplicado) / v.aplicado : 0 });
      classes.set(classe, lista);
    }
  }
  return { carteira, classes: [...classes.entries()].map(([classe, pontos]) => ({ classe, pontos })) };
}
